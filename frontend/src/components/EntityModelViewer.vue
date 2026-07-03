<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import {
  AmbientLight,
  Box3,
  BufferAttribute,
  BufferGeometry,
  Color,
  DirectionalLight,
  DoubleSide,
  Group,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
  Texture,
  TextureLoader,
  Vector3,
  WebGLRenderer,
  SRGBColorSpace,
  NearestFilter,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { BACKEND_BASE_URL } from '../services/api';

interface Props {
  modelUrl: string;
  height?: number;
}

interface Emits {
  (e: 'ready'): void;
  (e: 'error', message: string): void;
}

interface EntityModelVertex {
  x?: number;
  y?: number;
  z?: number;
  u?: number;
  v?: number;
}

interface EntityModelQuad {
  vertices?: EntityModelVertex[];
}

interface EntityModelNode {
  name?: string;
  pivot?: number[];
  rotation?: number[];
  offset?: number[];
  quads?: EntityModelQuad[];
  children?: EntityModelNode[];
}

interface EntityModelComponent {
  name?: string;
  texturePath?: string | null;
  textureWidth?: number;
  textureHeight?: number;
  translation?: number[];
  rotation?: number[];
  nodes?: EntityModelNode[];
}

interface EntityModelContract {
  schemaVersion?: string;
  mobName?: string;
  localizedName?: string;
  modId?: string;
  unitScale?: number;
  components?: EntityModelComponent[];
}

interface NodeBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
}

const props = withDefaults(defineProps<Props>(), {
  height: 320,
});
const emit = defineEmits<Emits>();

const containerRef = ref<HTMLElement | null>(null);
const isLoading = ref(false);
const errorMessage = ref('');

let scene: Scene | null = null;
let camera: PerspectiveCamera | null = null;
let renderer: WebGLRenderer | null = null;
let controls: OrbitControls | null = null;
let resizeObserver: ResizeObserver | null = null;
let rafId = 0;
let modelGroup: Group | null = null;
let loadToken = 0;

const textureLoader = new TextureLoader();
const textureCache = new Map<string, Texture>();
const backendOrigin = BACKEND_BASE_URL.replace(/\/api\/?$/i, '');
const stageHeight = computed(() => Math.max(220, props.height));

function resolveAssetUrl(input: string | null | undefined, family = ''): string | null {
  const raw = `${input ?? ''}`.trim();
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith('/')) return `${backendOrigin}${raw}`;
  if (family) return `${backendOrigin}/${family}/${raw.replace(/^\/+/, '')}`;
  return `${backendOrigin}/${raw.replace(/^\/+/, '')}`;
}

function getTexture(texturePath: string | null | undefined): Texture | null {
  const url = resolveAssetUrl(texturePath, 'images');
  if (!url) return null;
  const cached = textureCache.get(url);
  if (cached) return cached;
  try {
    const texture = textureLoader.load(url);
    texture.magFilter = NearestFilter;
    texture.minFilter = NearestFilter;
    texture.generateMipmaps = false;
    texture.colorSpace = SRGBColorSpace;
    textureCache.set(url, texture);
    return texture;
  } catch {
    return null;
  }
}

function toVec3(values: number[] | undefined, defaultValue = 0): [number, number, number] {
  return [
    Number.isFinite(values?.[0]) ? Number(values?.[0]) : defaultValue,
    Number.isFinite(values?.[1]) ? Number(values?.[1]) : defaultValue,
    Number.isFinite(values?.[2]) ? Number(values?.[2]) : defaultValue,
  ];
}

function normalizeTextureUv(rawValue: number, textureAxisSize: number): number {
  if (!Number.isFinite(rawValue)) return 0;
  const axisSize = Math.max(1, textureAxisSize || 1);
  // NESQL++ entity model contracts from the current exporter store UVs one extra
  // texture-axis normalization deep (normalized UV / textureAxisSize). Recover the
  // actual normalized UV when the value is in that tiny range. Keep already-normalized
  // UVs as-is, and only divide when an older export emits pixel-space coordinates.
  const exporterDoubleNormalizedUpperBound = 1.0005 / axisSize;
  if (rawValue >= -0.0005 && rawValue <= exporterDoubleNormalizedUpperBound) {
    return rawValue * axisSize;
  }

  if (rawValue >= -0.0005 && rawValue <= 1.0005) {
    return rawValue;
  }

  if (rawValue > 1 || rawValue < 0) {
    return rawValue / axisSize;
  }

  return rawValue;
}

function getNodeBounds(node: EntityModelNode): NodeBounds | null {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;

  const quads = Array.isArray(node.quads) ? node.quads : [];
  for (const quad of quads) {
    const vertices = Array.isArray(quad.vertices) ? quad.vertices : [];
    for (const vertex of vertices) {
      const x = Number(vertex?.x ?? NaN);
      const y = Number(vertex?.y ?? NaN);
      const z = Number(vertex?.z ?? NaN);
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
        continue;
      }
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      minZ = Math.min(minZ, z);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      maxZ = Math.max(maxZ, z);
    }
  }

  if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(minZ)) {
    return null;
  }

  return { minX, minY, minZ, maxX, maxY, maxZ };
}

function isNearZeroTriple(values: number[] | undefined, tolerance = 0.0001): boolean {
  const [x, y, z] = toVec3(values);
  return Math.abs(x) <= tolerance && Math.abs(y) <= tolerance && Math.abs(z) <= tolerance;
}

function shouldSuppressRootPlane(node: EntityModelNode, siblingCount: number): boolean {
  if (siblingCount < 8) return false;
  if ((Array.isArray(node.children) ? node.children.length : 0) > 0) return false;
  if (!isNearZeroTriple(node.pivot) || !isNearZeroTriple(node.rotation) || !isNearZeroTriple(node.offset)) {
    return false;
  }

  const bounds = getNodeBounds(node);
  if (!bounds) return false;

  const spanX = bounds.maxX - bounds.minX;
  const spanY = bounds.maxY - bounds.minY;
  const spanZ = bounds.maxZ - bounds.minZ;
  const minSpan = Math.min(spanX, spanY, spanZ);
  const maxSpan = Math.max(spanX, spanY, spanZ);
  return minSpan <= 1.01 && maxSpan >= 6;
}

function buildNode(
  node: EntityModelNode,
  texture: Texture | null,
  textureWidth: number,
  textureHeight: number,
): Group {
  const group = new Group();
  group.name = `${node.name ?? 'node'}`;

  const [pivotX, pivotY, pivotZ] = toVec3(node.pivot);
  const [rotationX, rotationY, rotationZ] = toVec3(node.rotation);
  const [offsetX, offsetY, offsetZ] = toVec3(node.offset);

  group.position.set(pivotX + offsetX, pivotY + offsetY, pivotZ + offsetZ);
  group.rotation.set(rotationX, rotationY, rotationZ);

  const quads = Array.isArray(node.quads) ? node.quads : [];
  if (quads.length > 0) {
    const positions: number[] = [];
    const uvs: number[] = [];

    for (const quad of quads) {
      const vertices = Array.isArray(quad.vertices) ? quad.vertices.slice(0, 4) : [];
      if (vertices.length < 4) continue;
      const triangleOrder = [0, 1, 2, 0, 2, 3];
      for (const index of triangleOrder) {
        const vertex = vertices[index];
        const rawU = Number(vertex?.u ?? 0);
        const rawV = Number(vertex?.v ?? 0);
        positions.push(
          Number(vertex?.x ?? 0),
          Number(vertex?.y ?? 0),
          Number(vertex?.z ?? 0),
        );
        uvs.push(
          normalizeTextureUv(rawU, textureWidth),
          1 - normalizeTextureUv(rawV, textureHeight),
        );
      }
    }

    if (positions.length > 0) {
      const geometry = new BufferGeometry();
      geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
      geometry.setAttribute('uv', new BufferAttribute(new Float32Array(uvs), 2));
      geometry.computeVertexNormals();
      const material = new MeshStandardMaterial({
        map: texture,
        transparent: true,
        alphaTest: 0.08,
        side: DoubleSide,
        color: 0xffffff,
        emissive: new Color('#10202f'),
        emissiveIntensity: 0.18,
        roughness: 0.88,
        metalness: 0.02,
        toneMapped: false,
      });
      const mesh = new Mesh(geometry, material);
      group.add(mesh);
    }
  }

  for (const child of Array.isArray(node.children) ? node.children : []) {
    group.add(buildNode(child, texture, textureWidth, textureHeight));
  }

  return group;
}

function disposeObject(root: Group | null): void {
  if (!root) return;
  root.traverse((object) => {
    const mesh = object as Mesh;
    if (mesh.geometry) {
      mesh.geometry.dispose();
    }
    const material = mesh.material;
    if (Array.isArray(material)) {
      material.forEach((entry) => entry.dispose());
    } else if (material) {
      material.dispose();
    }
  });
}

function clearModel(): void {
  if (!scene || !modelGroup) return;
  scene.remove(modelGroup);
  disposeObject(modelGroup);
  modelGroup = null;
}

function fitCamera(): void {
  if (!camera || !controls || !modelGroup) return;
  const box = new Box3().setFromObject(modelGroup);
  if (box.isEmpty()) {
    controls.target.set(0, 0, 0);
    camera.position.set(4, 3, 4);
    controls.update();
    return;
  }

  const center = new Vector3();
  const size = new Vector3();
  box.getCenter(center);
  box.getSize(size);

  const maxDim = Math.max(size.x, size.y, size.z, 1);
  const distance = maxDim * 1.8;
  controls.target.copy(center);
  camera.position.set(center.x + distance, center.y + distance * 0.6, center.z + distance);
  camera.near = Math.max(0.01, distance / 400);
  camera.far = Math.max(200, distance * 12);
  camera.updateProjectionMatrix();
  controls.update();
}

async function loadModel(): Promise<void> {
  const requestId = ++loadToken;
  errorMessage.value = '';
  isLoading.value = true;

  try {
    const url = resolveAssetUrl(props.modelUrl);
    if (!url) {
      throw new Error('Missing entity model URL');
    }

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Entity model request failed (${response.status})`);
    }

    const contract = await response.json() as EntityModelContract;
    if (requestId !== loadToken || !scene) {
      return;
    }

    const components = Array.isArray(contract.components) ? contract.components : [];
    if (components.length === 0) {
      throw new Error('Entity model has no components');
    }

    clearModel();

    const group = new Group();
    const unitScale = Number(contract.unitScale ?? 16) || 16;
    const sceneUnit = 1 / Math.max(1, unitScale);
    // Minecraft 1.7 entity ModelRenderer space is rendered under the living-entity
    // renderer's root GL transform that flips X/Y before the model boxes hit the
    // world. Reapply that root-space conversion here so exported quads land in the
    // same upright orientation as in-game NEI/entity renders.
    group.scale.set(-sceneUnit, -sceneUnit, sceneUnit);

    for (const component of components) {
      const componentGroup = new Group();
      componentGroup.name = `${component.name ?? 'component'}`;
      const [tx, ty, tz] = toVec3(component.translation);
      const [rx, ry, rz] = toVec3(component.rotation);
      const textureWidth = Number(component.textureWidth ?? 64) || 64;
      const textureHeight = Number(component.textureHeight ?? 32) || 32;
      componentGroup.position.set(tx, ty, tz);
      componentGroup.rotation.set(rx, ry, rz);
      const texture = getTexture(component.texturePath ?? null);

      const rootNodes = (Array.isArray(component.nodes) ? component.nodes : [])
        .filter((node) => !shouldSuppressRootPlane(node, Array.isArray(component.nodes) ? component.nodes.length : 0));

      for (const node of rootNodes) {
        componentGroup.add(buildNode(node, texture, textureWidth, textureHeight));
      }

      if (componentGroup.children.length > 0) {
        group.add(componentGroup);
      }
    }

    if (group.children.length === 0) {
      throw new Error('Entity model produced no renderable geometry');
    }

    modelGroup = group;
    scene.add(group);
    fitCamera();
    emit('ready');
  } catch (error) {
    if (requestId !== loadToken) {
      return;
    }
    clearModel();
    errorMessage.value = error instanceof Error ? error.message : 'Entity model load failed';
    emit('error', errorMessage.value);
  } finally {
    if (requestId === loadToken) {
      isLoading.value = false;
    }
  }
}

function animate(): void {
  if (!renderer || !scene || !camera) return;
  rafId = window.requestAnimationFrame(animate);
  controls?.update();
  renderer.render(scene, camera);
}

function setupScene(): void {
  const container = containerRef.value;
  if (!container) return;

  scene = new Scene();
  scene.background = new Color('#071018');

  camera = new PerspectiveCamera(34, 1, 0.01, 500);
  camera.position.set(4, 3, 4);

  renderer = new WebGLRenderer({
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(container.clientWidth || 1, container.clientHeight || stageHeight.value);
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.setClearColor('#071018', 1);
  container.innerHTML = '';
  container.appendChild(renderer.domElement);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enablePan = false;
  controls.minDistance = 0.8;
  controls.maxDistance = 14;

  scene.add(new AmbientLight(0xdde7ff, 1.7));

  const keyLight = new DirectionalLight(0xe9fbff, 1.85);
  keyLight.position.set(4, 7, 5);
  scene.add(keyLight);

  const rimLight = new DirectionalLight(0x87d2ff, 0.95);
  rimLight.position.set(-5, 2.5, -4);
  scene.add(rimLight);

  const fillLight = new DirectionalLight(0xffcda0, 0.5);
  fillLight.position.set(0, -2, 4);
  scene.add(fillLight);

  resizeObserver = new ResizeObserver(() => {
    if (!containerRef.value || !renderer || !camera) return;
    const width = Math.max(1, containerRef.value.clientWidth);
    const height = Math.max(1, containerRef.value.clientHeight);
    renderer.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  });
  resizeObserver.observe(container);

  animate();
}

watch(
  () => props.modelUrl,
  () => {
    if (!scene) return;
    void loadModel();
  },
  { immediate: false },
);

onMounted(async () => {
  await nextTick();
  setupScene();
  await loadModel();
});

onBeforeUnmount(() => {
  loadToken += 1;
  if (rafId) {
    window.cancelAnimationFrame(rafId);
  }
  resizeObserver?.disconnect();
  resizeObserver = null;
  clearModel();
  controls?.dispose();
  renderer?.dispose();
  renderer = null;
  controls = null;
  camera = null;
  scene = null;
});
</script>

<template>
  <div class="entity-model-viewer" :style="{ height: `${stageHeight}px` }">
    <div ref="containerRef" class="entity-model-viewer__canvas"></div>
    <div v-if="isLoading" class="entity-model-viewer__overlay">
      <span>加载实体模型中…</span>
    </div>
    <div v-else-if="errorMessage" class="entity-model-viewer__overlay entity-model-viewer__overlay--error">
      <span>{{ errorMessage }}</span>
    </div>
  </div>
</template>

<style scoped>
.entity-model-viewer {
  position: relative;
  width: 100%;
  min-height: 220px;
  border-radius: 20px;
  overflow: hidden;
  background:
    radial-gradient(circle at 50% 22%, rgba(123, 214, 255, 0.1), transparent 34%),
    radial-gradient(circle at 50% 100%, rgba(255, 95, 117, 0.08), transparent 36%),
    linear-gradient(180deg, rgba(10, 18, 28, 0.98), rgba(5, 9, 15, 1));
  border: 1px solid rgba(164, 190, 214, 0.14);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.04),
    0 18px 48px rgba(0, 0, 0, 0.28);
}

.entity-model-viewer__canvas {
  position: absolute;
  inset: 0;
}

.entity-model-viewer__overlay {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 16px;
  background: linear-gradient(180deg, rgba(5, 9, 15, 0.42), rgba(5, 9, 15, 0.58));
  color: rgba(229, 239, 253, 0.86);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.05em;
}

.entity-model-viewer__overlay--error {
  color: rgba(255, 184, 184, 0.92);
}
</style>


