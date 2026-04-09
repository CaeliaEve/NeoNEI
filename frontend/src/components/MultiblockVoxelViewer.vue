<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import {
  AmbientLight,
  Box3,
  BoxGeometry,
  ClampToEdgeWrapping,
  Color,
  DirectionalLight,
  Group,
  Mesh,
  MeshPhongMaterial,
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
import { BACKEND_BASE_URL, type MultiblockVoxelBlueprint } from '../services/api';

interface Props {
  blueprint?: MultiblockVoxelBlueprint | null;
  height?: number;
}

type OrientationKind = 'none' | 'facing_meta' | 'furnace_meta' | 'axis_meta' | 'stairs_meta';

const props = withDefaults(defineProps<Props>(), {
  height: 420,
});

const containerRef = ref<HTMLElement | null>(null);
const currentLayer = ref(0);
const showAllLayers = ref(true);

let scene: Scene | null = null;
let camera: PerspectiveCamera | null = null;
let renderer: WebGLRenderer | null = null;
let controls: OrbitControls | null = null;
let voxelGroup: Group | null = null;
let resizeObserver: ResizeObserver | null = null;
let raf = 0;
let initialCameraPos: Vector3 | null = null;
let initialTargetPos: Vector3 | null = null;

const textureLoader = new TextureLoader();
const textureCache = new Map<string, Texture>();
const uvTextureCache = new Map<string, Texture>();

const size = computed(() => props.blueprint?.size ?? { x: 0, y: 0, z: 0 });

watch(
  () => props.blueprint,
  (bp) => {
    if (!bp) return;
    currentLayer.value = Math.max(0, bp.size.y - 1);
  },
  { immediate: true },
);

const legendEntries = computed(() => {
  const bp = props.blueprint;
  if (!bp) return [];
  return Object.entries(bp.legend).map(([token, meta]) => ({
    token,
    label: meta.label,
    color: meta.color || '#60a5fa',
    textureUrl: resolveTextureUrl(meta.textureUrl),
    orientationKind: meta.orientationKind,
    hasFaceIcons: Boolean(meta.faceIcons),
  }));
});

function resolveTextureUrl(textureUrl?: string): string {
  if (!textureUrl) return '';
  if (/^https?:\/\//i.test(textureUrl)) return textureUrl;
  if (textureUrl.startsWith('/')) return `${BACKEND_BASE_URL}${textureUrl}`;
  return `${BACKEND_BASE_URL}/${textureUrl}`;
}

function resolveIconTextureUrl(icon?: string): string {
  if (!icon) return '';
  if (/^https?:\/\//i.test(icon)) return icon;
  if (icon.startsWith('/')) return `${BACKEND_BASE_URL}${icon}`;
  if (icon.endsWith('.png')) {
    if (icon.includes('/')) return `${BACKEND_BASE_URL}/${icon}`;
    return `${BACKEND_BASE_URL}/images/blockface/minecraft/${icon}`;
  }
  if (icon.includes(':')) {
    const [mod, name] = icon.split(':');
    if (mod && name) return `${BACKEND_BASE_URL}/images/blockface/${mod}/${name}.png`;
  }
  return `${BACKEND_BASE_URL}/images/blockface/minecraft/${icon}.png`;
}

function getFaceUvTexture(url: string, uv?: { minU: number; maxU: number; minV: number; maxV: number }): Texture | null {
  if (!url || !uv) return null;
  const base = getOrLoadTexture(url);
  if (!base) return null;
  const key = `${url}|${uv.minU},${uv.maxU},${uv.minV},${uv.maxV}`;
  const cached = uvTextureCache.get(key);
  if (cached) return cached;
  const t = base.clone();
  t.needsUpdate = true;
  t.wrapS = ClampToEdgeWrapping;
  t.wrapT = ClampToEdgeWrapping;
  t.repeat.set(Math.max(0.0001, uv.maxU - uv.minU), Math.max(0.0001, uv.maxV - uv.minV));
  t.offset.set(uv.minU, 1 - uv.maxV);
  uvTextureCache.set(key, t);
  return t;
}

function getOrLoadTexture(url: string): Texture | null {
  if (!url) return null;
  const cached = textureCache.get(url);
  if (cached) return cached;
  try {
    const t = textureLoader.load(url);
    t.magFilter = NearestFilter;
    t.minFilter = NearestFilter;
    t.colorSpace = SRGBColorSpace;
    textureCache.set(url, t);
    return t;
  } catch {
    return null;
  }
}

function tokenMeta(token: string) {
  const meta = props.blueprint?.legend?.[token];
  const blockMeta = parseMetaFromBlockId(meta?.blockId);
  return {
    color: meta?.color || '#60a5fa',
    textureUrl: resolveTextureUrl(meta?.textureUrl),
    faceTextureUrls: meta?.faceTextureUrls || undefined,
    faceUv: meta?.faceUv || undefined,
    faceIcons: meta?.faceIcons || undefined,
    orientationKind: (meta?.orientationKind as OrientationKind | undefined) || 'none',
    blockMeta,
  };
}

function parseMetaFromBlockId(blockId?: string): number {
  if (!blockId) return 0;
  const parts = blockId.split('~');
  if (parts.length < 4) return 0;
  const parsed = Number(parts[3]);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getRotationForMeta(kind: OrientationKind, meta: number): { x: number; y: number; z: number } {
  switch (kind) {
    case 'facing_meta':
    case 'furnace_meta': {
      // 1.7.10 common facing: 2=north, 3=south, 4=west, 5=east
      if (meta === 2) return { x: 0, y: Math.PI, z: 0 };
      if (meta === 3) return { x: 0, y: 0, z: 0 };
      if (meta === 4) return { x: 0, y: Math.PI / 2, z: 0 };
      if (meta === 5) return { x: 0, y: -Math.PI / 2, z: 0 };
      return { x: 0, y: 0, z: 0 };
    }
    case 'axis_meta': {
      // Logs/pillars axis bits: 0=y, 4=x, 8=z
      if ((meta & 0xC) === 0x4) return { x: 0, y: 0, z: Math.PI / 2 };
      if ((meta & 0xC) === 0x8) return { x: Math.PI / 2, y: 0, z: 0 };
      return { x: 0, y: 0, z: 0 };
    }
    case 'stairs_meta': {
      // Lower 2 bits are horizontal facing for most stairs in 1.7.10
      const dir = meta & 0x3;
      const upsideDown = (meta & 0x4) !== 0;
      const x = upsideDown ? Math.PI : 0;
      if (dir === 0) return { x, y: Math.PI / 2, z: 0 };
      if (dir === 1) return { x, y: -Math.PI / 2, z: 0 };
      if (dir === 2) return { x, y: 0, z: 0 };
      return { x, y: Math.PI, z: 0 };
    }
    case 'none':
    default:
      return { x: 0, y: 0, z: 0 };
  }
}

function clearVoxelGroup() {
  if (!voxelGroup) return;
  while (voxelGroup.children.length > 0) {
    const child = voxelGroup.children.pop() as Mesh | undefined;
    if (!child) continue;
    if (child.geometry) child.geometry.dispose();
    if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose());
    else child.material?.dispose();
  }
}

function buildMaterials(
  colorHex: string,
  textureUrl: string,
  faceTextureUrls?: Record<string, string>,
  faceUv?: Record<string, { minU: number; maxU: number; minV: number; maxV: number }>,
  faceIcons?: Record<string, string>,
): MeshPhongMaterial[] {
  const c = new Color(colorHex);
  const defaultTexture = getOrLoadTexture(textureUrl);
  const resolveFaceTexture = (face: 'east' | 'west' | 'up' | 'down' | 'south' | 'north') => {
    const direct = getOrLoadTexture(resolveTextureUrl(faceTextureUrls?.[face]));
    if (direct) return direct;
    const byIcon = getOrLoadTexture(resolveIconTextureUrl(faceIcons?.[face]));
    if (byIcon) return byIcon;
    const uvCrop = getFaceUvTexture(textureUrl, faceUv?.[face]);
    return uvCrop || defaultTexture;
  };
  const directionalTextures = {
    east: resolveFaceTexture('east'),
    west: resolveFaceTexture('west'),
    up: resolveFaceTexture('up'),
    down: resolveFaceTexture('down'),
    south: resolveFaceTexture('south'),
    north: resolveFaceTexture('north'),
  };
  const sideColors = [0.80, 0.80, 0.72, 0.72, 0.64, 0.64];
  const perFaceTexture: Array<Texture | null> = [
    directionalTextures.east,
    directionalTextures.west,
    directionalTextures.up,
    directionalTextures.down,
    directionalTextures.south,
    directionalTextures.north,
  ];
  return sideColors.map((mul, idx) => {
    const m = new MeshPhongMaterial({ color: c.clone().multiplyScalar(mul) });
    const map = perFaceTexture[idx] || null;
    if (map) {
      m.map = map;
      m.needsUpdate = true;
    }
    return m;
  });
}

function rebuildVoxelMeshes() {
  const bp = props.blueprint;
  if (!bp || !voxelGroup) return;

  clearVoxelGroup();

  const sx = bp.size.x;
  const sy = bp.size.y;
  const sz = bp.size.z;
  const minY = 0;
  const maxY = showAllLayers.value ? sy - 1 : currentLayer.value;

  const xOffset = (sx - 1) / 2;
  const yOffset = (sy - 1) / 2;
  const zOffset = (sz - 1) / 2;

  type Cell = { x: number; y: number; z: number; token: string };
  const cellMap = new Map<string, Cell>();
  const keyOf = (x: number, y: number, z: number) => `${x},${y},${z}`;

  for (let y = minY; y <= maxY; y++) {
    const rows = bp.layers[y] || [];
    for (let z = 0; z < sz; z++) {
      const row = rows[z] || '';
      for (let x = 0; x < sx; x++) {
        const token = row[x] || 'A';
        if (token === 'A' || token === '.' || token === ' ') continue;
        cellMap.set(keyOf(x, y, z), { x, y, z, token });
      }
    }
  }

  const neighbors = [
    [1, 0, 0],
    [-1, 0, 0],
    [0, 1, 0],
    [0, -1, 0],
    [0, 0, 1],
    [0, 0, -1],
  ] as const;

  cellMap.forEach((cell) => {
    // Remove fully hidden internal cubes for cleaner structure view.
    const fullyCovered = neighbors.every(([dx, dy, dz]) => cellMap.has(keyOf(cell.x + dx, cell.y + dy, cell.z + dz)));
    if (fullyCovered) return;

    const meta = tokenMeta(cell.token);
    const materials = buildMaterials(
      meta.color,
      meta.textureUrl,
      meta.faceTextureUrls,
      meta.faceUv,
      meta.faceIcons,
    );
    const mesh = new Mesh(new BoxGeometry(1, 1, 1), materials);
    const rot = getRotationForMeta(meta.orientationKind, meta.blockMeta);
    mesh.rotation.set(rot.x, rot.y, rot.z);
    mesh.position.set(cell.x - xOffset, cell.y - yOffset, zOffset - cell.z);
    voxelGroup.add(mesh);
  });
}

function fitCameraToContent() {
  if (!camera || !controls || !voxelGroup) return;
  const bbox = new Box3().setFromObject(voxelGroup);
  if (bbox.isEmpty()) {
    controls.target.set(0, 0, 0);
    camera.position.set(7, 7, 7);
    controls.update();
    return;
  }

  const center = new Vector3();
  const size3 = new Vector3();
  bbox.getCenter(center);
  bbox.getSize(size3);
  const maxDim = Math.max(size3.x, size3.y, size3.z, 1);
  const fov = (camera.fov * Math.PI) / 180;
  const dist = (maxDim / (2 * Math.tan(fov / 2))) * 1.35;

  controls.target.copy(center);
  camera.position.set(center.x + dist, center.y + dist * 0.85, center.z + dist);
  camera.near = Math.max(0.05, dist / 200);
  camera.far = Math.max(200, dist * 12);
  camera.updateProjectionMatrix();
  controls.update();

  initialCameraPos = camera.position.clone();
  initialTargetPos = controls.target.clone();
}

function setupScene() {
  const container = containerRef.value;
  if (!container) return;

  scene = new Scene();
  scene.background = new Color('#07111c');

  camera = new PerspectiveCamera(55, 1, 0.1, 200);
  camera.position.set(7, 7, 7);

  renderer = new WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(window.devicePixelRatio || 1);
  renderer.outputColorSpace = SRGBColorSpace;
  container.innerHTML = '';
  container.appendChild(renderer.domElement);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.target.set(0, 0, 0);
  controls.update();

  scene.add(new AmbientLight(0xffffff, 0.72));
  const key = new DirectionalLight(0xffffff, 0.92);
  key.position.set(6, 10, 6);
  scene.add(key);
  const fill = new DirectionalLight(0x77bbff, 0.42);
  fill.position.set(-6, 4, -4);
  scene.add(fill);

  voxelGroup = new Group();
  scene.add(voxelGroup);

  const resize = () => {
    if (!container || !renderer || !camera) return;
    const w = Math.max(320, container.clientWidth);
    const h = Math.max(240, props.height);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };

  resizeObserver = new ResizeObserver(() => resize());
  resizeObserver.observe(container);
  resize();

  const tick = () => {
    if (!renderer || !scene || !camera || !controls) return;
    controls.update();
    renderer.render(scene, camera);
    raf = window.requestAnimationFrame(tick);
  };
  raf = window.requestAnimationFrame(tick);
}

function rotateLeft() {
  if (!voxelGroup) return;
  voxelGroup.rotation.y += Math.PI / 2;
}

function rotateRight() {
  if (!voxelGroup) return;
  voxelGroup.rotation.y -= Math.PI / 2;
}

function resetView() {
  if (!camera || !controls || !initialCameraPos || !initialTargetPos) return;
  camera.position.copy(initialCameraPos);
  controls.target.copy(initialTargetPos);
  controls.update();
}

watch([() => props.blueprint, showAllLayers, currentLayer], () => {
  rebuildVoxelMeshes();
  fitCameraToContent();
});

onMounted(async () => {
  await nextTick();
  setupScene();
  rebuildVoxelMeshes();
});

onBeforeUnmount(() => {
  if (raf) window.cancelAnimationFrame(raf);
  clearVoxelGroup();
  textureCache.forEach((t) => t.dispose());
  textureCache.clear();
  uvTextureCache.forEach((t) => t.dispose());
  uvTextureCache.clear();
  controls?.dispose();
  renderer?.dispose();
  resizeObserver?.disconnect();
  scene = null;
  camera = null;
  renderer = null;
  controls = null;
  voxelGroup = null;
  resizeObserver = null;
});
</script>

<template>
  <div class="voxel-viewer">
    <template v-if="blueprint">
      <div class="viewer-toolbar">
        <button class="tool-btn" @click="rotateLeft">Rotate Left</button>
        <button class="tool-btn" @click="rotateRight">Rotate Right</button>
        <button class="tool-btn" @click="resetView">Reset View</button>
        <span class="drag-hint">拖拽可旋转，滚轮可缩放</span>
        <label class="layer-toggle">
          <input v-model="showAllLayers" type="checkbox" />
          <span>Show All Layers</span>
        </label>
        <div class="layer-wrap">
          <span class="layer-label">Y Layer</span>
          <input
            v-model.number="currentLayer"
            type="range"
            :min="0"
            :max="Math.max(0, size.y - 1)"
            :disabled="showAllLayers || size.y <= 1"
          />
          <span class="layer-value">{{ currentLayer + 1 }} / {{ size.y }}</span>
        </div>
      </div>

      <div ref="containerRef" class="viewer-stage" :style="{ height: `${height}px` }" />

      <div class="legend">
        <div v-for="entry in legendEntries" :key="entry.token" class="legend-item">
          <span class="swatch" :style="{ background: entry.color }"></span>
          <span class="token">{{ entry.token }}</span>
          <span class="name">{{ entry.label }}</span>
          <span v-if="entry.hasFaceIcons" class="meta-chip">faces</span>
          <span v-if="entry.orientationKind && entry.orientationKind !== 'none'" class="meta-chip">{{ entry.orientationKind }}</span>
        </div>
      </div>
    </template>

    <div v-else class="empty">No voxel structure data.</div>
  </div>
</template>

<style scoped>
.voxel-viewer {
  border: 1px solid rgba(0, 224, 255, 0.22);
  border-radius: 12px;
  padding: 12px;
  background: linear-gradient(160deg, rgba(3, 12, 24, 0.76), rgba(8, 18, 34, 0.72));
}

.viewer-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 12px;
  align-items: center;
  margin-bottom: 10px;
}

.tool-btn {
  border: 1px solid rgba(0, 224, 255, 0.32);
  background: rgba(0, 224, 255, 0.08);
  color: #d9fbff;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 600;
  padding: 6px 10px;
  cursor: pointer;
}

.drag-hint {
  font-size: 12px;
  color: rgba(220, 248, 255, 0.72);
}

.layer-toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: #bceeff;
  font-size: 12px;
}

.layer-wrap {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: #bceeff;
  font-size: 12px;
  min-width: 260px;
}

.layer-wrap input[type='range'] {
  flex: 1;
  min-width: 120px;
}

.layer-label,
.layer-value {
  color: rgba(197, 241, 255, 0.88);
}

.viewer-stage {
  border: 1px solid rgba(0, 224, 255, 0.2);
  border-radius: 10px;
  overflow: hidden;
  background:
    radial-gradient(circle at 50% 10%, rgba(0, 224, 255, 0.08), transparent 60%),
    linear-gradient(180deg, rgba(4, 14, 28, 0.8), rgba(2, 10, 20, 0.9));
}

.legend {
  margin-top: 10px;
  display: flex;
  flex-wrap: wrap;
  gap: 8px 12px;
}

.legend-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.25);
  border: 1px solid rgba(0, 224, 255, 0.18);
}

.swatch {
  width: 12px;
  height: 12px;
  border-radius: 3px;
  border: 1px solid rgba(255, 255, 255, 0.45);
}

.token {
  color: #defaff;
  font-family: Consolas, monospace;
  font-size: 12px;
  font-weight: 700;
}

.name {
  color: rgba(210, 244, 255, 0.88);
  font-size: 12px;
}

.meta-chip {
  color: #9fdfff;
  border: 1px solid rgba(0, 224, 255, 0.35);
  border-radius: 999px;
  padding: 0 6px;
  font-size: 10px;
  line-height: 16px;
}

.empty {
  text-align: center;
  color: rgba(195, 227, 242, 0.72);
  padding: 14px;
}
</style>

