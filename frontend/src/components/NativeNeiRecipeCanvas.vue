<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { FluidStack, Recipe, RecipeItem, RecipeUiPayload } from '../services/api';
import {
  getGlobalBrowserAtlasEntry,
  getLoadedGlobalAtlasImage,
  getStaticPlacement,
  normalizeFrames,
  normalizeTimeline,
  selectAtlasFrameByTimelineIndex,
  warmGlobalBrowserAtlasForItemsDetailed,
  type BrowserAtlasItemEntry,
} from '../services/globalBrowserAtlas';
import { getSharedAnimationNowMs, loadImageAsset, resolveTimelineFrameIndex } from '../services/animationBudget';
import { loadUiPackRuntime, type UiPackRuntime } from '../services/uiPackRuntime';
import {
  buildNativeUiSlotCells,
  createNativeUiFitMatrix,
  normalizeNativeUiLayoutSurface,
  resolveNativeUiRuntimeSurface,
  type NativeUiFitMatrix,
  type NativeUiLayoutSurface,
  type NativeUiRect,
  type NativeUiSlotCell,
} from '../services/nativeUiRuntimeRegistry';
import {
  buildNativeUiSpriteCommands,
  type NativeUiAtlasSpriteSource,
  type NativeUiPreparedBackgroundSource,
} from '../services/nativeUiRenderCommandBuilder.ts';
import {
  createNativeUiGtModularBackgroundTexture,
  nativeUiSlotTextureKey,
  NativeUiTextureRegistry,
} from '../services/nativeUiTextureRegistry.ts';
import {
  isNativeUiHotspotInteractive,
  nativeUiHitCellEntryLabel,
  nativeUiHotspotItemId,
  nativeUiRectLabel,
  nativeUiRectStyle,
  nativeUiSlotCellStyle,
  nativeUiTextOverlayStyle,
  projectNativeUiHitCells,
  type NativeUiHitCell,
} from '../services/nativeUiInteractionProjection.ts';
import { resolveManifestRelativeUrl } from '../native-surface/runtimeLoader.ts';
import { WebGl2NativeRenderer } from '../renderers/native/WebGl2NativeRenderer';
import type { NativeRendererBackend } from '../renderers/native/NativeRendererBackend';
import RecipeItemTooltip from './RecipeItemTooltip.vue';


interface CanvasRenderable {
  kind: 'item' | 'fluid';
  itemId: string;
  atlasLookupId: string;
  count: number;
  localizedName?: string | null;
  renderAssetRef?: string | null;
  imageFileName?: string | null;
  extraLines?: string[];
}

type CanvasCell = NativeUiSlotCell<CanvasRenderable>;

type PreparedAtlasSource = {
  atlasFile: string;
  staticSource: { x: number; y: number; width: number; height: number } | null;
  frames: Array<{ index: number; x: number; y: number; width: number; height: number }>;
  timeline: Array<{ frameIndex: number; durationMs: number }>;
};


const props = defineProps<{
  recipe: Recipe;
  uiPayload?: RecipeUiPayload | null;
}>();

const emit = defineEmits<{
  (e: 'item-click', itemId: string): void;
}>();

const NATIVE_SLOT_SIZE = 18;
const NATIVE_ICON_SIZE = 16;
const NATIVE_ICON_INSET = Math.floor((NATIVE_SLOT_SIZE - NATIVE_ICON_SIZE) / 2);

const canvasRef = ref<HTMLCanvasElement | null>(null);
const shellRef = ref<HTMLElement | null>(null);
const renderer = ref<NativeRendererBackend | null>(null);
const renderError = ref<string | null>(null);
const renderReady = ref(false);
const missingTextureCount = ref(0);
const currentDpr = ref(1);
const uiPackRuntime = ref<UiPackRuntime | null>(null);
const preparedSources = new Map<string, PreparedAtlasSource>();
const textureRegistry = new NativeUiTextureRegistry();
const backgroundSource = ref<NativeUiPreparedBackgroundSource | null>(null);
const backgroundLoadError = ref<string | null>(null);
let loadSequence = 0;
let animationFrameId: number | null = null;
let resizeObserver: ResizeObserver | null = null;
let mounted = false;
let hasAnimatedSprites = false;
const shellWidth = ref(0);
const shellHeight = ref(0);

const nativeLayout = computed<NativeUiLayoutSurface | null>(() => (
  normalizeNativeUiLayoutSurface(props.uiPayload?.nativeLayout)
));

const nativeUiSurface = computed(() => resolveNativeUiRuntimeSurface({
  runtime: uiPackRuntime.value,
  recipeId: props.recipe.recipeId,
  inlineLayout: nativeLayout.value,
}));

const resolvedNativeLayout = computed<NativeUiLayoutSurface | null>(() => nativeUiSurface.value.layout);
const slots = computed(() => nativeUiSurface.value.slots);
const textOverlays = computed(() => nativeUiSurface.value.textOverlays);
const hotspots = computed(() => nativeUiSurface.value.hotspots);
const viewports = computed(() => nativeUiSurface.value.viewports);
const dynamicPrimitives = computed(() => nativeUiSurface.value.dynamicPrimitives);

const backgroundAssetRef = computed(() => {
  const resource = `${resolvedNativeLayout.value?.imageResource ?? ''}`.trim();
  return resource.length > 0 ? resource : null;
});

const backgroundTextureKey = computed(() => {
  const resource = backgroundAssetRef.value;
  return resource ? `ui-background:${resource}` : null;
});

const backgroundImageRegion = computed(() => {
  const region = resolvedNativeLayout.value?.imageRegion;
  if (!region || typeof region !== 'object') return null;
  const width = Number(region.width ?? 0);
  const height = Number(region.height ?? 0);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
  const x = Number(region.x ?? 0);
  const y = Number(region.y ?? 0);
  return {
    x: Number.isFinite(x) ? Math.max(0, x) : 0,
    y: Number.isFinite(y) ? Math.max(0, y) : 0,
    width,
    height,
  };
});

const nativeBackground = computed<Record<string, unknown> | null>(() => {
  const background = resolvedNativeLayout.value?.nativeBackground;
  return background && typeof background === 'object' ? background as Record<string, unknown> : null;
});

const semanticGtBackground = computed(() => (
  `${nativeBackground.value?.kind ?? ''}` === 'gt-modular-ui'
  && ['semantic', 'captured'].includes(`${nativeBackground.value?.status ?? ''}`)
));

const semanticBackgroundTextureKey = computed(() => (
  semanticGtBackground.value ? `ui-background:gt-modular-ui:${layoutWidth.value}x${layoutHeight.value}:${currentDpr.value}` : null
));

const nativeBackgroundAssetRef = computed(() => {
  const assetRef = `${nativeBackground.value?.assetRef ?? ''}`.trim();
  return assetRef.length > 0 ? assetRef : null;
});

const nativeBackgroundTextureKey = computed(() => {
  const assetRef = nativeBackgroundAssetRef.value;
  return assetRef ? `ui-background:${assetRef}` : null;
});

function nativeBackgroundRect(name: 'recipeBackgroundOffset' | 'recipeBackgroundSize'): Record<string, unknown> | null {
  const value = nativeBackground.value?.[name];
  return value && typeof value === 'object' ? value as Record<string, unknown> : null;
}

function nativeBackgroundTextureSpec(): { width: number; height: number; borderU: number; borderV: number } {
  const texture = nativeBackground.value?.texture;
  const object = texture && typeof texture === 'object' ? texture as Record<string, unknown> : {};
  const width = Math.max(1, Number(object.width ?? 64) || 64);
  const height = Math.max(1, Number(object.height ?? 64) || 64);
  const borderU = Math.max(0, Number(object.borderU ?? object.border ?? 0) || 0);
  const borderV = Math.max(0, Number(object.borderV ?? object.border ?? borderU) || borderU);
  return { width, height, borderU, borderV };
}

function nativeBackgroundTargetRect() {
  const offset = nativeBackgroundRect('recipeBackgroundOffset');
  const size = nativeBackgroundRect('recipeBackgroundSize');
  const x = Math.max(0, Number(offset?.x ?? 0) || 0);
  const y = Math.max(0, Number(offset?.y ?? 0) || 0);
  const width = Math.max(1, Number(size?.width ?? layoutWidth.value) || layoutWidth.value);
  const height = Math.max(1, Number(size?.height ?? layoutHeight.value) || layoutHeight.value);
  return { x, y, width, height };
}

const backgroundState = computed(() => {
  if (nativeBackgroundAssetRef.value) {
    if (backgroundLoadError.value) return 'error';
    if (!backgroundSource.value) return 'loading';
    return backgroundSource.value.textureKey === nativeBackgroundTextureKey.value ? 'captured' : 'error';
  }
  if (semanticGtBackground.value) return backgroundSource.value ? 'semantic' : 'loading';
  if (!backgroundAssetRef.value) return 'none';
  if (backgroundSource.value) return 'ready';
  if (backgroundLoadError.value) return 'error';
  return 'loading';
});

const title = computed(() => String(
  props.uiPayload?.machineType
    ?? props.recipe.machineInfo?.machineType
    ?? props.recipe.recipeType
    ?? 'NEI Recipe',
));

const subtitle = computed(() => String(
  (props.uiPayload?.handler as Record<string, unknown> | undefined)?.displayName
    ?? (props.uiPayload?.handler as Record<string, unknown> | undefined)?.canonicalMachineFamily
    ?? props.uiPayload?.familyKey
    ?? 'native-nei',
));

const layoutWidth = computed(() => nativeUiSurface.value.width);
const layoutHeight = computed(() => nativeUiSurface.value.height);
const displayWidth = computed(() => Math.ceil(layoutWidth.value));
const displayHeight = computed(() => Math.ceil(layoutHeight.value));
const fitMatrix = computed<NativeUiFitMatrix>(() => createNativeUiFitMatrix({
  sourceWidth: displayWidth.value,
  sourceHeight: displayHeight.value,
  availableWidth: shellWidth.value,
  availableHeight: shellHeight.value,
}));
const fitScale = computed(() => fitMatrix.value.scale);
const fittedWidth = computed(() => fitMatrix.value.fittedWidth);
const fittedHeight = computed(() => fitMatrix.value.fittedHeight);
const canvasStyle = computed(() => ({
  width: `${displayWidth.value}px`,
  height: `${displayHeight.value}px`,
}));
const shellStyle = computed(() => ({
  '--native-nei-source-width': `${displayWidth.value}px`,
  '--native-nei-source-height': `${displayHeight.value}px`,
  '--native-nei-fit-width': `${fittedWidth.value}px`,
  '--native-nei-fit-height': `${fittedHeight.value}px`,
}));
const sourceSurfaceStyle = computed(() => ({
  width: `${displayWidth.value}px`,
  height: `${displayHeight.value}px`,
  transform: `translate(-50%, -50%) scale(${fitScale.value})`,
}));

const inputItems = computed<CanvasRenderable[]>(() => {
  const out: CanvasRenderable[] = [];
  for (const row of props.recipe.inputs ?? []) {
    if (!Array.isArray(row)) continue;
    for (const cell of row) {
      const item = Array.isArray(cell) ? cell[0] : cell;
      if (item?.itemId) out.push(toItemRenderable(item));
    }
  }
  return out;
});

const outputItems = computed<CanvasRenderable[]>(() => (
  (props.recipe.outputs ?? [])
    .filter((item): item is RecipeItem => Boolean(item?.itemId))
    .map(toItemRenderable)
));

const inputFluids = computed<CanvasRenderable[]>(() => {
  const groups = [...(props.recipe.fluidInputs ?? [])].sort((left, right) => Number(left.slotIndex ?? 0) - Number(right.slotIndex ?? 0));
  return groups
    .map((group) => group.fluids?.[0] ?? null)
    .filter((entry): entry is FluidStack => Boolean(entry?.fluid))
    .map(toFluidRenderable);
});

const outputFluids = computed<CanvasRenderable[]>(() => (
  (props.recipe.fluidOutputs ?? [])
    .filter((entry): entry is FluidStack => Boolean(entry?.fluid))
    .map(toFluidRenderable)
));

const slotCells = computed<CanvasCell[]>(() => buildNativeUiSlotCells({
  slots: slots.value,
  slotSize: NATIVE_SLOT_SIZE,
  resolveRoleEntries: renderablesForRole,
}));
const hitCells = computed<NativeUiHitCell<CanvasRenderable>[]>(() => projectNativeUiHitCells(slotCells.value));

const renderSignature = computed(() => JSON.stringify({
  recipeId: props.recipe.recipeId,
  familyKey: props.uiPayload?.familyKey ?? '',
  uiPackStatus: uiPackRuntime.value?.status ?? 'loading',
  uiPackTemplateKey: nativeUiSurface.value.binding?.templateKey ?? '',
  nativeUiSurfaceSource: nativeUiSurface.value.source,
  layoutWidth: layoutWidth.value,
  layoutHeight: layoutHeight.value,
  backgroundAssetRef: backgroundAssetRef.value ?? '',
  backgroundImageRegion: backgroundImageRegion.value,
  nativeBackground: nativeBackground.value,
  slots: slots.value,
  textOverlays: textOverlays.value,
  dynamicPrimitives: dynamicPrimitives.value,
  hotspots: hotspots.value,
  viewports: viewports.value,
  entries: slotCells.value.map((cell) => [cell.key, cell.entry?.atlasLookupId, cell.entry?.count]),
}));

function renderAssetLookupId(renderAssetRef?: string | null): string | null {
  const normalized = `${renderAssetRef ?? ''}`.trim();
  const match = normalized.match(/^nesqlpp:(?:item|fluid)\/(.+)$/);
  return match?.[1]?.trim() || null;
}

function resolveAtlasLookupId(itemId?: string | null, renderAssetRef?: string | null): string {
  const direct = `${itemId ?? ''}`.trim();
  if (direct) return direct;
  return renderAssetLookupId(renderAssetRef) ?? '';
}

function toItemRenderable(item: RecipeItem): CanvasRenderable {
  const renderAssetRef = `${item.renderAssetRef ?? ''}`.trim() || null;
  const atlasLookupId = resolveAtlasLookupId(item.itemId, renderAssetRef);
  return {
    kind: 'item',
    itemId: item.itemId,
    atlasLookupId: atlasLookupId || item.itemId,
    count: Math.max(1, Number(item.count ?? 1) || 1),
    localizedName: item.localizedName ?? null,
    renderAssetRef,
    imageFileName: item.imageFileName ?? null,
  };
}

function toFluidRenderable(stack: FluidStack): CanvasRenderable {
  const renderAssetRef = `${stack.fluid.renderAssetRef ?? ''}`.trim() || null;
  const atlasLookupId = resolveAtlasLookupId('', renderAssetRef) || `${stack.fluid.fluidId ?? ''}`.trim();
  const itemId = atlasLookupId || `${stack.fluid.fluidId ?? stack.fluid.internalName ?? ''}`.trim();
  return {
    kind: 'fluid',
    itemId,
    atlasLookupId: itemId,
    count: Math.max(1, Number(stack.amount ?? 0) || 1),
    localizedName: stack.fluid.localizedName ?? stack.fluid.internalName ?? itemId,
    renderAssetRef,
    imageFileName: null,
    extraLines: [`${Math.max(0, Number(stack.amount ?? 0) || 0)} mB`],
  };
}

function renderablesForRole(role?: string): CanvasRenderable[] {
  const normalized = String(role ?? '').toLowerCase();
  if (normalized.includes('fluid')) {
    return normalized.includes('output') ? outputFluids.value : inputFluids.value;
  }
  if (normalized.includes('output')) return outputItems.value;
  return inputItems.value;
}

function handleHotspotClick(rect: NativeUiRect) {
  const itemId = nativeUiHotspotItemId(rect);
  if (!itemId) return;
  emit('item-click', itemId);
}

function handleHitCellClick(cell: NativeUiHitCell<CanvasRenderable>) {
  emit('item-click', cell.entry.itemId);
}


function slotTextureKey(role: string): string {
  return nativeUiSlotTextureKey(role, currentDpr.value);
}


function ensureSlotTextures(activeRenderer: NativeRendererBackend) {
  textureRegistry.registerSlotTextures(activeRenderer, currentDpr.value, NATIVE_SLOT_SIZE);
}

function ensureDynamicPrimitiveTextures(activeRenderer: NativeRendererBackend) {
  textureRegistry.registerDynamicPrimitiveTextures(activeRenderer, dynamicPrimitives.value);
}

function resolveBackgroundAssetUrl(): string | null {
  const assetRef = backgroundAssetRef.value;
  const manifestUrl = uiPackRuntime.value?.manifestUrl;
  if (!assetRef || !manifestUrl) {
    return null;
  }
  try {
    return resolveManifestRelativeUrl(manifestUrl, assetRef);
  } catch {
    return null;
  }
}

function resolveNativeBackgroundAssetUrl(): string | null {
  const assetRef = nativeBackgroundAssetRef.value;
  const manifestUrl = uiPackRuntime.value?.manifestUrl;
  if (!assetRef || !manifestUrl) {
    return null;
  }
  try {
    return resolveManifestRelativeUrl(manifestUrl, assetRef);
  } catch {
    return null;
  }
}

async function ensureBackgroundTexture(activeRenderer: NativeRendererBackend) {
  backgroundSource.value = null;
  backgroundLoadError.value = null;
  const nativeAssetKey = nativeBackgroundTextureKey.value;
  const nativeAssetUrl = resolveNativeBackgroundAssetUrl();
  if (nativeAssetKey && nativeAssetUrl) {
    try {
      const image = await loadImageAsset(nativeAssetUrl);
      if (!mounted) return;
      textureRegistry.register(activeRenderer, nativeAssetKey, image);
      const texture = nativeBackgroundTextureSpec();
      const target = nativeBackgroundTargetRect();
      backgroundSource.value = {
        textureKey: nativeAssetKey,
        image,
        sourceX: 0,
        sourceY: 0,
        sourceWidth: Math.max(1, Math.min(texture.width, image.width)),
        sourceHeight: Math.max(1, Math.min(texture.height, image.height)),
        destX: target.x,
        destY: target.y,
        width: target.width,
        height: target.height,
        nineSlice: `${nativeBackground.value?.scaling ?? ''}` === 'nine-slice'
          ? { borderU: texture.borderU, borderV: texture.borderV }
          : undefined,
      };
      return;
    } catch (error) {
      backgroundLoadError.value = error instanceof Error ? error.message : String(error);
      if (`${nativeBackground.value?.status ?? ''}` === 'captured') {
        return;
      }
      // Semantic GT backgrounds without a captured asset may use the procedural fallback.
    }
  }
  const semanticKey = semanticBackgroundTextureKey.value;
  if (semanticGtBackground.value && semanticKey) {
    const texture = createNativeUiGtModularBackgroundTexture(layoutWidth.value, layoutHeight.value, currentDpr.value);
    textureRegistry.register(activeRenderer, semanticKey, texture);
    backgroundSource.value = {
      textureKey: semanticKey,
      image: texture,
      sourceX: 0,
      sourceY: 0,
      sourceWidth: texture.width,
      sourceHeight: texture.height,
      destX: 0,
      destY: 0,
      width: layoutWidth.value,
      height: layoutHeight.value,
    };
    return;
  }
  const textureKey = backgroundTextureKey.value;
  const backgroundUrl = resolveBackgroundAssetUrl();
  if (!textureKey || !backgroundUrl) {
    return;
  }
  try {
    const image = await loadImageAsset(backgroundUrl);
    if (!mounted) return;
    textureRegistry.register(activeRenderer, textureKey, image);
    const region = backgroundImageRegion.value;
    const sourceX = region ? Math.min(region.x, Math.max(0, image.width - 1)) : 0;
    const sourceY = region ? Math.min(region.y, Math.max(0, image.height - 1)) : 0;
    const sourceWidth = region
      ? Math.max(1, Math.min(region.width, image.width - sourceX))
      : Math.max(1, image.width || layoutWidth.value);
    const sourceHeight = region
      ? Math.max(1, Math.min(region.height, image.height - sourceY))
      : Math.max(1, image.height || layoutHeight.value);
    backgroundSource.value = {
      textureKey,
      image,
      sourceX,
      sourceY,
      sourceWidth,
      sourceHeight,
      width: sourceWidth,
      height: sourceHeight,
    };
  } catch (error) {
    backgroundLoadError.value = error instanceof Error ? error.message : String(error);
  }
}

function prepareAtlasSource(entry: BrowserAtlasItemEntry | null): PreparedAtlasSource | null {
  if (!entry) return null;
  const preparedAnimation = entry.animatedAtlas?.atlasFile
    ? {
      atlasFile: entry.animatedAtlas.atlasFile,
      frames: normalizeFrames(entry.animatedAtlas.frames),
      timeline: normalizeTimeline(entry.animatedAtlas.timeline, entry.animatedAtlas.frameDurationMs),
    }
    : null;
  if (preparedAnimation && preparedAnimation.frames.length > 0 && preparedAnimation.timeline.length > 0) {
    return {
      atlasFile: preparedAnimation.atlasFile,
      staticSource: null,
      frames: preparedAnimation.frames,
      timeline: preparedAnimation.timeline,
    };
  }
  const staticPlacement = getStaticPlacement(entry);
  if (!staticPlacement?.atlasFile || !staticPlacement.width || !staticPlacement.height) return null;
  return {
    atlasFile: staticPlacement.atlasFile,
    staticSource: {
      x: staticPlacement.x,
      y: staticPlacement.y,
      width: staticPlacement.width,
      height: staticPlacement.height,
    },
    frames: [],
    timeline: [],
  };
}

function resolveAtlasSource(entry: CanvasRenderable, nowMs: number): NativeUiAtlasSpriteSource | null {
  const prepared = preparedSources.get(entry.atlasLookupId);
  if (!prepared) return null;
  if (prepared.frames.length > 0 && prepared.timeline.length > 0) {
    const frameIndex = resolveTimelineFrameIndex(prepared.timeline, nowMs);
    const frame = selectAtlasFrameByTimelineIndex(prepared.frames, frameIndex);
    if (!frame) return null;
    return {
      atlasFile: prepared.atlasFile,
      x: frame.x,
      y: frame.y,
      width: frame.width,
      height: frame.height,
    };
  }
  if (!prepared.staticSource) return null;
  return {
    atlasFile: prepared.atlasFile,
    x: prepared.staticSource.x,
    y: prepared.staticSource.y,
    width: prepared.staticSource.width,
    height: prepared.staticSource.height,
  };
}


function buildSpriteCommands(nowMs: number) {
  return buildNativeUiSpriteCommands({
    dpr: currentDpr.value,
    nowMs,
    background: backgroundSource.value,
    dynamicPrimitives: dynamicPrimitives.value,
    slotCells: slotCells.value,
    slotSize: NATIVE_SLOT_SIZE,
    iconInset: NATIVE_ICON_INSET,
    iconSize: NATIVE_ICON_SIZE,
    slotTextureKey,
    resolveAtlasSource,
  });
}

function renderFrame(nowMs: number = getSharedAnimationNowMs()) {
  const activeRenderer = renderer.value;
  const canvas = canvasRef.value;
  if (!activeRenderer || !canvas) return;
  activeRenderer.render(canvas.width, canvas.height, [], buildSpriteCommands(nowMs));
}

function stopAnimationLoop() {
  if (animationFrameId !== null) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }
}

function scheduleAnimationLoop() {
  stopAnimationLoop();
  if (!hasAnimatedSprites) return;
  const tick = (timestamp: number) => {
    renderFrame(timestamp);
    animationFrameId = requestAnimationFrame(tick);
  };
  animationFrameId = requestAnimationFrame(tick);
}

function resetRendererState() {
  preparedSources.clear();
  missingTextureCount.value = 0;
  hasAnimatedSprites = false;
  backgroundSource.value = null;
  backgroundLoadError.value = null;
  renderReady.value = false;
}

function measureShell() {
  const shell = shellRef.value;
  if (!shell) {
    shellWidth.value = 0;
    shellHeight.value = 0;
    return;
  }
  const rect = shell.getBoundingClientRect();
  shellWidth.value = Math.max(0, rect.width);
  shellHeight.value = Math.max(0, rect.height);
}

async function hydrateUiPackRuntime() {
  uiPackRuntime.value = await loadUiPackRuntime('/api/runtime/current/manifest');
}

async function rebuildRenderer() {
  if (!mounted) return;
  const sequence = ++loadSequence;
  stopAnimationLoop();
  resetRendererState();
  await nextTick();
  if (sequence !== loadSequence) return;

  const canvas = canvasRef.value;
  if (!canvas) return;
  currentDpr.value = Math.min(2, Math.max(1, Number(window.devicePixelRatio || 1)));
  canvas.width = Math.max(1, Math.round(displayWidth.value * currentDpr.value));
  canvas.height = Math.max(1, Math.round(displayHeight.value * currentDpr.value));

  const activeRenderer = renderer.value ?? WebGl2NativeRenderer.create(canvas);
  if (!activeRenderer) {
    renderError.value = 'WebGL2 native recipe renderer is unavailable.';
    return;
  }
  renderer.value = activeRenderer;
  renderError.value = null;
  ensureSlotTextures(activeRenderer);
  ensureDynamicPrimitiveTextures(activeRenderer);
  const backgroundReady = ensureBackgroundTexture(activeRenderer);

  const lookupIds = Array.from(new Set(slotCells.value
    .map((cell) => cell.entry?.atlasLookupId ?? '')
    .filter(Boolean)));
  await Promise.allSettled([
    warmGlobalBrowserAtlasForItemsDetailed(lookupIds),
    backgroundReady,
  ]);
  if (sequence !== loadSequence) return;

  let missing = 0;
  for (const lookupId of lookupIds) {
    const prepared = prepareAtlasSource(getGlobalBrowserAtlasEntry(lookupId));
    const image = prepared?.atlasFile ? getLoadedGlobalAtlasImage(prepared.atlasFile) : null;
    if (!prepared || !image) {
      missing += 1;
      continue;
    }
    if (textureRegistry.register(activeRenderer, prepared.atlasFile, image)) {
      preparedSources.set(lookupId, prepared);
      hasAnimatedSprites = hasAnimatedSprites || prepared.frames.length > 0;
    } else {
      missing += 1;
    }
  }

  missingTextureCount.value = missing;
  renderReady.value = true;
  renderFrame();
  scheduleAnimationLoop();
}

function handleResize() {
  measureShell();
  void rebuildRenderer();
}

onMounted(() => {
  mounted = true;
  nextTick(() => measureShell());
  window.addEventListener('resize', handleResize, { passive: true });
  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(() => {
      measureShell();
    });
    if (shellRef.value) resizeObserver.observe(shellRef.value);
  }
  void hydrateUiPackRuntime();
  void rebuildRenderer();
});

watch(renderSignature, () => {
  void rebuildRenderer();
}, { flush: 'post' });

onBeforeUnmount(() => {
  mounted = false;
  loadSequence += 1;
  window.removeEventListener('resize', handleResize);
  resizeObserver?.disconnect();
  resizeObserver = null;
  stopAnimationLoop();
  renderer.value?.dispose();
  renderer.value = null;
  textureRegistry.clear();
  preparedSources.clear();
});
</script>

<template>
  <section class="native-nei-card" aria-label="Native NEI recipe canvas">
    <header class="native-nei-header">
      <div>
        <div class="native-eyebrow">NATIVE NEI CANVAS</div>
        <h3>{{ title }}</h3>
      </div>
      <code>{{ subtitle }}</code>
    </header>

    <div class="native-nei-body">
      <div v-if="renderError" class="native-nei-error">{{ renderError }}</div>
      <div v-else ref="shellRef" class="native-nei-canvas-shell" :style="shellStyle">
        <div class="native-nei-source-surface" :style="sourceSurfaceStyle">
          <canvas
            ref="canvasRef"
            class="native-nei-canvas"
            :style="canvasStyle"
            aria-hidden="true"
          />
          <div v-if="textOverlays.length > 0" class="native-nei-text-layer" :style="canvasStyle">
            <div
              v-for="(overlay, index) in textOverlays"
              :key="`${index}:${overlay.x ?? 0}:${overlay.y ?? 0}:${overlay.text ?? ''}`"
              class="native-nei-text-overlay"
              :style="nativeUiTextOverlayStyle(overlay)"
            >
              {{ overlay.text }}
            </div>
          </div>
          <div v-if="viewports.length > 0" class="native-nei-viewport-layer" :style="canvasStyle" aria-hidden="true">
            <div
              v-for="(viewport, index) in viewports"
              :key="`${viewport.id ?? index}:${viewport.x ?? 0}:${viewport.y ?? 0}`"
              class="native-nei-viewport-region"
              :style="nativeUiRectStyle(viewport)"
            >
              <span>{{ nativeUiRectLabel(viewport, 'Captured viewport') }}</span>
            </div>
          </div>
          <div class="native-nei-hit-layer" :style="canvasStyle">
            <div
              v-for="(hotspot, index) in hotspots"
              :key="`${hotspot.id ?? index}:${hotspot.x ?? 0}:${hotspot.y ?? 0}`"
              class="native-nei-hotspot-cell"
              :style="nativeUiRectStyle(hotspot)"
            >
              <button
                type="button"
                class="native-nei-hotspot-target"
                :aria-label="nativeUiRectLabel(hotspot, 'Captured NEI hotspot')"
                :title="nativeUiRectLabel(hotspot, 'Captured NEI hotspot')"
                :disabled="!isNativeUiHotspotInteractive(hotspot)"
                @click="handleHotspotClick(hotspot)"
              />
            </div>
            <div
              v-for="cell in hitCells"
              :key="cell.key"
              class="native-nei-hit-cell"
              :style="nativeUiSlotCellStyle(cell, NATIVE_SLOT_SIZE)"
            >
              <RecipeItemTooltip
                :item-id="cell.entry.itemId"
                :count="cell.entry.count"
                :localized-name="cell.entry.localizedName"
                :render-asset-ref="cell.entry.renderAssetRef"
                :image-file-name="cell.entry.imageFileName"
                :extra-lines="cell.entry.extraLines || []"
                size-mode="compact"
                @click="handleHitCellClick(cell)"
              >
                <button
                  type="button"
                  class="native-nei-hit-target"
                  :aria-label="nativeUiHitCellEntryLabel(cell.entry)"
                />
              </RecipeItemTooltip>
            </div>
          </div>
        </div>
        <div v-if="slots.length === 0" class="native-nei-empty">Captured NEI template slots are unavailable.</div>
      </div>
    </div>

    <footer class="native-nei-footer">
      <span>{{ slotCells.length }} slots</span>
      <span v-if="dynamicPrimitives.length > 0">{{ dynamicPrimitives.length }} dynamic primitives</span>
      <span v-if="hotspots.length > 0">{{ hotspots.length }} hotspots</span>
      <span v-if="viewports.length > 0">{{ viewports.length }} viewports</span>
      <span>UI pack: {{ uiPackRuntime?.status ?? 'loading' }}</span>
      <span>Background: {{ backgroundState }}</span>
      <span v-if="renderReady">WebGL2 atlas path active</span>
      <span v-if="backgroundLoadError" class="native-nei-warning">{{ backgroundLoadError }}</span>
      <span v-if="missingTextureCount > 0" class="native-nei-warning">{{ missingTextureCount }} atlas entries missing</span>
    </footer>
  </section>
</template>

<style scoped>
.native-nei-card {
  width: min(720px, 100%);
  min-height: 330px;
  padding: 22px;
  border-radius: 22px;
  border: 1px solid rgba(142, 166, 190, 0.2);
  background:
    radial-gradient(circle at 50% 42%, rgba(74, 136, 160, 0.18), transparent 38%),
    linear-gradient(145deg, rgba(12, 17, 24, 0.94), rgba(20, 25, 33, 0.9));
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.05), 0 24px 70px rgba(0, 0, 0, 0.42);
}

.native-nei-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
  margin-bottom: 22px;
}

.native-eyebrow {
  font-size: 10px;
  letter-spacing: 0.22em;
  color: rgba(128, 213, 226, 0.78);
}

h3 {
  margin: 4px 0 0;
  color: rgba(237, 245, 252, 0.96);
  font-size: 19px;
  font-weight: 700;
}

code {
  color: rgba(177, 190, 205, 0.76);
  font-size: 11px;
}

.native-nei-body {
  min-height: 230px;
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.native-nei-canvas-shell {
  position: relative;
  isolation: isolate;
  width: 100%;
  min-width: min(100%, var(--native-nei-source-width));
  height: clamp(180px, 32vh, 360px);
  min-height: var(--native-nei-fit-height);
  border-radius: 18px;
  border: 1px solid rgba(132, 158, 186, 0.18);
  background:
    radial-gradient(circle at 50% 50%, rgba(119, 191, 210, 0.12), transparent 42%),
    linear-gradient(135deg, rgba(8, 13, 19, 0.42), rgba(22, 27, 36, 0.52));
  overflow: hidden;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.035),
    inset 0 0 34px rgba(0, 0, 0, 0.18);
}

.native-nei-source-surface {
  position: absolute;
  left: 50%;
  top: 50%;
  transform-origin: center center;
  will-change: transform;
}

.native-nei-canvas {
  display: block;
  image-rendering: pixelated;
}

.native-nei-hit-layer {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.native-nei-text-layer {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.native-nei-viewport-layer {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.native-nei-viewport-region {
  position: absolute;
  overflow: hidden;
  border: 1px solid rgba(142, 227, 255, 0.36);
  background: linear-gradient(135deg, rgba(92, 196, 255, 0.08), rgba(255, 255, 255, 0.015));
  box-shadow: inset 0 0 12px rgba(92, 196, 255, 0.1);
}

.native-nei-viewport-region span {
  position: absolute;
  left: 2px;
  top: 1px;
  max-width: calc(100% - 4px);
  overflow: hidden;
  color: rgba(204, 237, 255, 0.76);
  font-size: 8px;
  line-height: 1.1;
  text-overflow: ellipsis;
  text-shadow: 0 1px 0 rgba(0, 0, 0, 0.72);
  white-space: nowrap;
}

.native-nei-text-overlay {
  position: absolute;
  overflow: hidden;
  padding: 1px 2px;
  color: rgba(248, 243, 229, 0.92);
  font-size: 10px;
  line-height: 1.15;
  white-space: pre-wrap;
  text-shadow: 0 1px 0 rgba(0, 0, 0, 0.72), 0 0 6px rgba(0, 0, 0, 0.32);
  pointer-events: none;
}

.native-nei-hit-cell {
  position: absolute;
  pointer-events: auto;
}

.native-nei-hotspot-cell {
  position: absolute;
  pointer-events: auto;
}

.native-nei-hit-cell :deep(.recipe-item-tooltip-container) {
  width: 100%;
  height: 100%;
}

.native-nei-hit-target {
  width: 100%;
  height: 100%;
  margin: 0;
  padding: 0;
  border: 0;
  border-radius: 8px;
  background: transparent;
  cursor: pointer;
  outline: none;
}

.native-nei-hotspot-target {
  width: 100%;
  height: 100%;
  margin: 0;
  padding: 0;
  border: 1px solid rgba(128, 213, 226, 0.16);
  border-radius: 5px;
  background: rgba(128, 213, 226, 0.035);
  cursor: help;
  opacity: 0;
  outline: none;
  transition: opacity 120ms ease, border-color 120ms ease, background 120ms ease;
}

.native-nei-hotspot-target:disabled {
  cursor: default;
}

.native-nei-hotspot-cell:hover .native-nei-hotspot-target,
.native-nei-hotspot-target:focus-visible {
  opacity: 1;
  border-color: rgba(128, 213, 226, 0.56);
  background: rgba(128, 213, 226, 0.12);
}

.native-nei-hit-target:focus-visible {
  box-shadow: 0 0 0 2px rgba(128, 213, 226, 0.76), 0 0 18px rgba(128, 213, 226, 0.28);
}

.native-nei-hotspot-target:focus-visible {
  box-shadow: 0 0 0 2px rgba(128, 213, 226, 0.76), 0 0 18px rgba(128, 213, 226, 0.28);
}

.native-nei-empty,
.native-nei-error {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  color: rgba(180, 194, 210, 0.72);
  font-size: 13px;
  text-align: center;
}

.native-nei-footer {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 14px;
  color: rgba(169, 186, 204, 0.62);
  font-size: 11px;
}

.native-nei-warning {
  color: rgba(248, 181, 92, 0.86);
}
</style>
