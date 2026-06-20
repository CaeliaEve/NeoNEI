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
import { resolveManifestRelativeUrl } from '../native-surface/runtimeLoader.ts';
import {
  WebGl2NativeRenderer,
  type NativeTextureSpriteCommand,
} from '../renderers/native/WebGl2NativeRenderer';
import RecipeItemTooltip from './RecipeItemTooltip.vue';

interface NativeSlotFact {
  role?: string;
  startIndex?: number;
  columns?: number;
  rows?: number;
  x?: number;
  y?: number;
}

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

interface CanvasCell {
  key: string;
  role: string;
  x: number;
  y: number;
  entry: CanvasRenderable | null;
}

interface NativeTextOverlayFact {
  text?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}

interface NativeDynamicPrimitiveFact {
  kind?: string;
  role?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  fill?: number;
  value?: number;
  ratio?: number;
  orientation?: 'horizontal' | 'vertical';
  trackColor?: string;
  fillColor?: string;
  borderColor?: string;
}

interface NativeImageRegionFact {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}

interface NativeRectFact extends NativeImageRegionFact {
  id?: string;
  kind?: string;
  role?: string;
  label?: string;
  tooltip?: string;
  action?: string;
  itemId?: string;
  payloadKey?: string;
}

interface NativeLayoutSurface {
  width?: number;
  height?: number;
  imageResource?: string;
  imageRegion?: NativeImageRegionFact;
  slots?: NativeSlotFact[];
  textOverlays?: NativeTextOverlayFact[];
  dynamicPrimitives?: NativeDynamicPrimitiveFact[];
  progressBars?: NativeDynamicPrimitiveFact[];
  fluidBars?: NativeDynamicPrimitiveFact[];
  energyBars?: NativeDynamicPrimitiveFact[];
  hotspots?: NativeRectFact[];
  viewports?: NativeRectFact[];
}

type PreparedAtlasSource = {
  atlasFile: string;
  staticSource: { x: number; y: number; width: number; height: number } | null;
  frames: Array<{ index: number; x: number; y: number; width: number; height: number }>;
  timeline: Array<{ frameIndex: number; durationMs: number }>;
};

type PreparedBackgroundSource = {
  textureKey: string;
  image: HTMLImageElement;
  sourceX: number;
  sourceY: number;
  sourceWidth: number;
  sourceHeight: number;
  width: number;
  height: number;
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
const DYNAMIC_TRACK_COLOR = 'rgba(5, 9, 14, 0.72)';
const DYNAMIC_PROGRESS_FILL_COLOR = 'rgba(247, 182, 72, 0.86)';
const DYNAMIC_FLUID_FILL_COLOR = 'rgba(82, 189, 255, 0.78)';
const DYNAMIC_ENERGY_FILL_COLOR = 'rgba(118, 232, 147, 0.78)';
const DYNAMIC_BORDER_COLOR = 'rgba(238, 244, 252, 0.22)';

const canvasRef = ref<HTMLCanvasElement | null>(null);
const shellRef = ref<HTMLElement | null>(null);
const renderer = ref<WebGl2NativeRenderer | null>(null);
const renderError = ref<string | null>(null);
const renderReady = ref(false);
const missingTextureCount = ref(0);
const currentDpr = ref(1);
const uiPackRuntime = ref<UiPackRuntime | null>(null);
const preparedSources = new Map<string, PreparedAtlasSource>();
const registeredTextureKeys = new Set<string>();
const backgroundSource = ref<PreparedBackgroundSource | null>(null);
const backgroundLoadError = ref<string | null>(null);
let loadSequence = 0;
let animationFrameId: number | null = null;
let resizeObserver: ResizeObserver | null = null;
let mounted = false;
let hasAnimatedSprites = false;
const shellWidth = ref(0);
const shellHeight = ref(0);

const nativeLayout = computed<NativeLayoutSurface | null>(() => {
  const layout = props.uiPayload?.nativeLayout;
  return layout && typeof layout === 'object' ? layout as NativeLayoutSurface : null;
});

const resolvedTemplate = computed(() => {
  const binding = uiPackRuntime.value?.bindingsByRecipeId.get(props.recipe.recipeId);
  return binding?.templateKey
    ? uiPackRuntime.value?.templatesByKey.get(binding.templateKey) ?? null
    : null;
});

const resolvedNativeLayout = computed<NativeLayoutSurface | null>(() => {
  const template = resolvedTemplate.value;
  if (template) {
    const inlineLayout = nativeLayout.value;
    return {
      width: template.width,
      height: template.height,
      imageResource: template.imageResource,
      imageRegion: inlineLayout?.imageRegion,
      slots: template.slots,
      textOverlays: template.textOverlays,
      dynamicPrimitives: inlineLayout?.dynamicPrimitives,
      progressBars: inlineLayout?.progressBars,
      fluidBars: inlineLayout?.fluidBars,
      energyBars: inlineLayout?.energyBars,
      hotspots: inlineLayout?.hotspots ?? template.hotspots,
      viewports: inlineLayout?.viewports ?? template.viewports,
    };
  }
  return nativeLayout.value;
});

const slots = computed<NativeSlotFact[]>(() => {
  const raw = resolvedNativeLayout.value?.slots;
  return Array.isArray(raw) ? raw as NativeSlotFact[] : [];
});

const textOverlays = computed<NativeTextOverlayFact[]>(() => {
  const raw = resolvedNativeLayout.value?.textOverlays;
  return Array.isArray(raw) ? raw as NativeTextOverlayFact[] : [];
});

const hotspots = computed<NativeRectFact[]>(() => {
  const raw = resolvedNativeLayout.value?.hotspots;
  return Array.isArray(raw) ? raw as NativeRectFact[] : [];
});

const viewports = computed<NativeRectFact[]>(() => {
  const raw = resolvedNativeLayout.value?.viewports;
  return Array.isArray(raw) ? raw as NativeRectFact[] : [];
});

const dynamicPrimitives = computed<NativeDynamicPrimitiveFact[]>(() => {
  const layout = resolvedNativeLayout.value;
  const primitives: NativeDynamicPrimitiveFact[] = [];
  const append = (raw: unknown, kind: string) => {
    if (!Array.isArray(raw)) return;
    for (const primitive of raw) {
      if (!primitive || typeof primitive !== 'object') continue;
      primitives.push({
        kind,
        ...(primitive as NativeDynamicPrimitiveFact),
      });
    }
  };
  append(layout?.dynamicPrimitives, '');
  append(layout?.progressBars, 'progress-bar');
  append(layout?.fluidBars, 'fluid-bar');
  append(layout?.energyBars, 'energy-bar');
  return primitives;
});

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

const backgroundState = computed(() => {
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

const layoutWidth = computed(() => Math.max(1, Number(resolvedNativeLayout.value?.width ?? 166)));
const layoutHeight = computed(() => Math.max(1, Number(resolvedNativeLayout.value?.height ?? 65)));
const displayWidth = computed(() => Math.ceil(layoutWidth.value));
const displayHeight = computed(() => Math.ceil(layoutHeight.value));
const fitScale = computed(() => {
  const availableWidth = shellWidth.value > 0 ? shellWidth.value : displayWidth.value;
  const availableHeight = shellHeight.value > 0 ? shellHeight.value : displayHeight.value;
  return Math.max(0.05, Math.min(availableWidth / displayWidth.value, availableHeight / displayHeight.value));
});
const fittedWidth = computed(() => Math.max(1, Math.round(displayWidth.value * fitScale.value)));
const fittedHeight = computed(() => Math.max(1, Math.round(displayHeight.value * fitScale.value)));
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

const slotCells = computed<CanvasCell[]>(() => {
  const cells: CanvasCell[] = [];
  slots.value.forEach((slot, groupIndex) => {
    const role = String(slot.role ?? 'item-input');
    const columns = Math.max(1, Number(slot.columns ?? 1));
    const rows = Math.max(1, Number(slot.rows ?? 1));
    const x0 = Math.max(0, Number(slot.x ?? 0));
    const y0 = Math.max(0, Number(slot.y ?? 0));
    const entries = renderablesForRole(role);
    const rawStart = Math.max(0, Number(slot.startIndex ?? 0));
    const start = rawStart >= entries.length ? 0 : rawStart;
    const count = columns * rows;
    for (let index = 0; index < count; index += 1) {
      const col = index % columns;
      const row = Math.floor(index / columns);
      cells.push({
        key: `${role}:${groupIndex}:${index}`,
        role,
        x: x0 + col * NATIVE_SLOT_SIZE,
        y: y0 + row * NATIVE_SLOT_SIZE,
        entry: entries[start + index] ?? null,
      });
    }
  });
  return cells;
});

const renderSignature = computed(() => JSON.stringify({
  recipeId: props.recipe.recipeId,
  familyKey: props.uiPayload?.familyKey ?? '',
  uiPackStatus: uiPackRuntime.value?.status ?? 'loading',
  uiPackTemplateKey: uiPackRuntime.value?.bindingsByRecipeId.get(props.recipe.recipeId)?.templateKey ?? '',
  layoutWidth: layoutWidth.value,
  layoutHeight: layoutHeight.value,
  backgroundAssetRef: backgroundAssetRef.value ?? '',
  backgroundImageRegion: backgroundImageRegion.value,
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

function cellStyle(cell: CanvasCell) {
  return {
    left: `${cell.x}px`,
    top: `${cell.y}px`,
    width: `${NATIVE_SLOT_SIZE}px`,
    height: `${NATIVE_SLOT_SIZE}px`,
  };
}

function textOverlayStyle(overlay: NativeTextOverlayFact) {
  return {
    left: `${Math.max(0, Number(overlay.x ?? 0))}px`,
    top: `${Math.max(0, Number(overlay.y ?? 0))}px`,
    width: `${Math.max(0, Number(overlay.width ?? 0))}px`,
    height: `${Math.max(0, Number(overlay.height ?? 0))}px`,
  };
}

function rectFactStyle(rect: NativeRectFact) {
  return {
    left: `${Math.max(0, Number(rect.x ?? 0))}px`,
    top: `${Math.max(0, Number(rect.y ?? 0))}px`,
    width: `${Math.max(0, Number(rect.width ?? 0))}px`,
    height: `${Math.max(0, Number(rect.height ?? 0))}px`,
  };
}

function rectFactLabel(rect: NativeRectFact, fallback: string): string {
  return `${rect.label ?? rect.tooltip ?? rect.role ?? rect.kind ?? rect.id ?? fallback}`.trim() || fallback;
}

function normalizedHotspotAction(rect: NativeRectFact): string {
  return `${rect.action ?? rect.kind ?? rect.role ?? ''}`.trim().toLowerCase();
}

function hotspotIsInteractive(rect: NativeRectFact): boolean {
  return normalizedHotspotAction(rect) === 'item-click' && `${rect.itemId ?? ''}`.trim().length > 0;
}

function handleHotspotClick(rect: NativeRectFact) {
  if (!hotspotIsInteractive(rect)) return;
  emit('item-click', `${rect.itemId}`.trim());
}

function labelForEntry(entry: CanvasRenderable): string {
  const base = entry.localizedName || entry.itemId;
  return entry.count > 1 ? `${base} x${entry.count}` : base;
}

function textureKindForRole(role: string): 'item-input' | 'item-output' | 'fluid-input' | 'fluid-output' {
  const normalized = role.toLowerCase();
  if (normalized.includes('fluid') && normalized.includes('output')) return 'fluid-output';
  if (normalized.includes('fluid')) return 'fluid-input';
  if (normalized.includes('output')) return 'item-output';
  return 'item-input';
}

function slotTextureKey(role: string): string {
  return `recipe-slot:${textureKindForRole(role)}:${currentDpr.value}`;
}

function drawRoundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function createSlotTexture(kind: ReturnType<typeof textureKindForRole>, dpr: number): HTMLCanvasElement {
  const size = Math.max(1, Math.round(NATIVE_SLOT_SIZE * dpr));
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  ctx.scale(dpr, dpr);
  const accent = kind.includes('fluid')
    ? 'rgba(90, 203, 255, 0.62)'
    : kind.includes('output')
      ? 'rgba(248, 181, 92, 0.66)'
      : 'rgba(160, 178, 198, 0.34)';
  const fill = kind.includes('fluid')
    ? 'rgba(10, 25, 38, 0.92)'
    : 'rgba(13, 18, 25, 0.94)';
  drawRoundedRect(ctx, 1, 1, NATIVE_SLOT_SIZE - 2, NATIVE_SLOT_SIZE - 2, 4);
  ctx.fillStyle = fill;
  ctx.fill();
  const gradient = ctx.createLinearGradient(0, 0, NATIVE_SLOT_SIZE, NATIVE_SLOT_SIZE);
  gradient.addColorStop(0, 'rgba(255, 255, 255, 0.09)');
  gradient.addColorStop(0.52, 'rgba(255, 255, 255, 0.015)');
  gradient.addColorStop(1, 'rgba(0, 0, 0, 0.26)');
  ctx.fillStyle = gradient;
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = accent;
  ctx.stroke();
  if (kind.includes('fluid')) {
    ctx.fillStyle = 'rgba(90, 203, 255, 0.18)';
    drawRoundedRect(ctx, 4, 5, 3, NATIVE_SLOT_SIZE - 10, 1.5);
    ctx.fill();
  }
  if (kind.includes('output')) {
    ctx.fillStyle = 'rgba(248, 181, 92, 0.16)';
    drawRoundedRect(ctx, NATIVE_SLOT_SIZE - 7, 5, 3, NATIVE_SLOT_SIZE - 10, 1.5);
    ctx.fill();
  }
  return canvas;
}

function ensureSlotTextures(activeRenderer: WebGl2NativeRenderer) {
  const kinds: Array<ReturnType<typeof textureKindForRole>> = ['item-input', 'item-output', 'fluid-input', 'fluid-output'];
  for (const kind of kinds) {
    const key = `recipe-slot:${kind}:${currentDpr.value}`;
    if (registeredTextureKeys.has(key)) continue;
    if (activeRenderer.registerTexture(key, createSlotTexture(kind, currentDpr.value))) {
      registeredTextureKeys.add(key);
    }
  }
}

function createSolidColorTexture(color: string): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 1, 1);
  return canvas;
}

function solidTextureKey(color: string): string {
  return `native-dynamic-solid:${color}`;
}

function normalizeDynamicPrimitiveKind(primitive: NativeDynamicPrimitiveFact): string {
  const kind = `${primitive.kind ?? primitive.role ?? ''}`.trim().toLowerCase();
  if (kind.includes('fluid')) return 'fluid-bar';
  if (kind.includes('energy') || kind.includes('eu')) return 'energy-bar';
  if (kind.includes('progress') || kind.includes('arrow')) return 'progress-bar';
  return kind || 'indicator';
}

function defaultDynamicFillColor(primitive: NativeDynamicPrimitiveFact): string {
  const kind = normalizeDynamicPrimitiveKind(primitive);
  if (kind === 'fluid-bar') return DYNAMIC_FLUID_FILL_COLOR;
  if (kind === 'energy-bar') return DYNAMIC_ENERGY_FILL_COLOR;
  return DYNAMIC_PROGRESS_FILL_COLOR;
}

function dynamicPrimitiveColors(primitive: NativeDynamicPrimitiveFact): string[] {
  return [
    `${primitive.trackColor ?? DYNAMIC_TRACK_COLOR}`,
    `${primitive.fillColor ?? defaultDynamicFillColor(primitive)}`,
    `${primitive.borderColor ?? DYNAMIC_BORDER_COLOR}`,
  ];
}

function ensureSolidColorTexture(activeRenderer: WebGl2NativeRenderer, color: string) {
  const key = solidTextureKey(color);
  if (registeredTextureKeys.has(key)) return;
  if (activeRenderer.registerTexture(key, createSolidColorTexture(color))) {
    registeredTextureKeys.add(key);
  }
}

function ensureDynamicPrimitiveTextures(activeRenderer: WebGl2NativeRenderer) {
  for (const primitive of dynamicPrimitives.value) {
    for (const color of dynamicPrimitiveColors(primitive)) {
      ensureSolidColorTexture(activeRenderer, color);
    }
  }
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

async function ensureBackgroundTexture(activeRenderer: WebGl2NativeRenderer) {
  backgroundSource.value = null;
  backgroundLoadError.value = null;
  const textureKey = backgroundTextureKey.value;
  const backgroundUrl = resolveBackgroundAssetUrl();
  if (!textureKey || !backgroundUrl) {
    return;
  }
  try {
    const image = await loadImageAsset(backgroundUrl);
    if (!mounted) return;
    if (activeRenderer.registerTexture(textureKey, image)) {
      registeredTextureKeys.add(textureKey);
    }
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

function resolveAtlasSource(entry: CanvasRenderable, nowMs: number): { atlasFile: string; x: number; y: number; width: number; height: number } | null {
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

function clamp01(value: unknown, fallback = 1): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.min(1, parsed));
}

function primitiveFillRatio(primitive: NativeDynamicPrimitiveFact): number {
  return clamp01(primitive.fill ?? primitive.ratio ?? primitive.value, 1);
}

function pushSolidSpriteRect(
  commands: NativeTextureSpriteCommand[],
  color: string,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  if (width <= 0 || height <= 0) return;
  const dpr = currentDpr.value;
  commands.push({
    textureKey: solidTextureKey(color),
    sourceX: 0,
    sourceY: 0,
    sourceWidth: 1,
    sourceHeight: 1,
    destX: Math.round(x * dpr),
    destY: Math.round(y * dpr),
    destWidth: Math.max(1, Math.round(width * dpr)),
    destHeight: Math.max(1, Math.round(height * dpr)),
  });
}

function pushDynamicPrimitiveCommands(commands: NativeTextureSpriteCommand[], primitive: NativeDynamicPrimitiveFact) {
  const x = Math.max(0, Number(primitive.x ?? 0));
  const y = Math.max(0, Number(primitive.y ?? 0));
  const width = Math.max(0, Number(primitive.width ?? 0));
  const height = Math.max(0, Number(primitive.height ?? 0));
  if (width <= 0 || height <= 0) return;

  const trackColor = `${primitive.trackColor ?? DYNAMIC_TRACK_COLOR}`;
  const fillColor = `${primitive.fillColor ?? defaultDynamicFillColor(primitive)}`;
  const borderColor = `${primitive.borderColor ?? DYNAMIC_BORDER_COLOR}`;
  const borderSize = Math.min(1, Math.floor(Math.min(width, height) / 2));
  const innerX = x + borderSize;
  const innerY = y + borderSize;
  const innerWidth = Math.max(0, width - borderSize * 2);
  const innerHeight = Math.max(0, height - borderSize * 2);
  const fillRatio = primitiveFillRatio(primitive);
  const orientation = primitive.orientation ?? (height > width ? 'vertical' : 'horizontal');

  pushSolidSpriteRect(commands, trackColor, innerX, innerY, innerWidth, innerHeight);
  if (orientation === 'vertical') {
    const fillHeight = innerHeight * fillRatio;
    pushSolidSpriteRect(commands, fillColor, innerX, innerY + innerHeight - fillHeight, innerWidth, fillHeight);
  } else {
    pushSolidSpriteRect(commands, fillColor, innerX, innerY, innerWidth * fillRatio, innerHeight);
  }

  if (borderSize > 0) {
    pushSolidSpriteRect(commands, borderColor, x, y, width, borderSize);
    pushSolidSpriteRect(commands, borderColor, x, y + height - borderSize, width, borderSize);
    pushSolidSpriteRect(commands, borderColor, x, y, borderSize, height);
    pushSolidSpriteRect(commands, borderColor, x + width - borderSize, y, borderSize, height);
  }
}

function buildSpriteCommands(nowMs: number): NativeTextureSpriteCommand[] {
  const dpr = currentDpr.value;
  const commands: NativeTextureSpriteCommand[] = [];
  const background = backgroundSource.value;
  if (background) {
    commands.push({
      textureKey: background.textureKey,
      sourceX: background.sourceX,
      sourceY: background.sourceY,
      sourceWidth: background.sourceWidth,
      sourceHeight: background.sourceHeight,
      destX: 0,
      destY: 0,
      destWidth: Math.round(layoutWidth.value * dpr),
      destHeight: Math.round(layoutHeight.value * dpr),
    });
  }
  for (const primitive of dynamicPrimitives.value) {
    pushDynamicPrimitiveCommands(commands, primitive);
  }
  for (const cell of slotCells.value) {
    if (!background) {
      const key = slotTextureKey(cell.role);
      const slotPixels = Math.round(NATIVE_SLOT_SIZE * dpr);
      commands.push({
        textureKey: key,
        sourceX: 0,
        sourceY: 0,
        sourceWidth: slotPixels,
        sourceHeight: slotPixels,
        destX: Math.round(cell.x * dpr),
        destY: Math.round(cell.y * dpr),
        destWidth: slotPixels,
        destHeight: slotPixels,
      });
    }

    if (!cell.entry) continue;
    const source = resolveAtlasSource(cell.entry, nowMs);
    if (!source) continue;
    commands.push({
      textureKey: source.atlasFile,
      sourceX: source.x,
      sourceY: source.y,
      sourceWidth: source.width,
      sourceHeight: source.height,
      destX: Math.round((cell.x + NATIVE_ICON_INSET) * dpr),
      destY: Math.round((cell.y + NATIVE_ICON_INSET) * dpr),
      destWidth: Math.round(NATIVE_ICON_SIZE * dpr),
      destHeight: Math.round(NATIVE_ICON_SIZE * dpr),
    });
  }
  return commands;
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
    if (activeRenderer.registerTexture(prepared.atlasFile, image)) {
      registeredTextureKeys.add(prepared.atlasFile);
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
  registeredTextureKeys.clear();
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
              :style="textOverlayStyle(overlay)"
            >
              {{ overlay.text }}
            </div>
          </div>
          <div v-if="viewports.length > 0" class="native-nei-viewport-layer" :style="canvasStyle" aria-hidden="true">
            <div
              v-for="(viewport, index) in viewports"
              :key="`${viewport.id ?? index}:${viewport.x ?? 0}:${viewport.y ?? 0}`"
              class="native-nei-viewport-region"
              :style="rectFactStyle(viewport)"
            >
              <span>{{ rectFactLabel(viewport, 'Captured viewport') }}</span>
            </div>
          </div>
          <div class="native-nei-hit-layer" :style="canvasStyle">
            <div
              v-for="(hotspot, index) in hotspots"
              :key="`${hotspot.id ?? index}:${hotspot.x ?? 0}:${hotspot.y ?? 0}`"
              class="native-nei-hotspot-cell"
              :style="rectFactStyle(hotspot)"
            >
              <button
                type="button"
              class="native-nei-hotspot-target"
              :aria-label="rectFactLabel(hotspot, 'Captured NEI hotspot')"
              :title="rectFactLabel(hotspot, 'Captured NEI hotspot')"
              :disabled="!hotspotIsInteractive(hotspot)"
              @click="handleHotspotClick(hotspot)"
            />
            </div>
            <div
              v-for="cell in slotCells.filter((candidate) => candidate.entry)"
              :key="cell.key"
              class="native-nei-hit-cell"
              :style="cellStyle(cell)"
            >
              <RecipeItemTooltip
                :item-id="cell.entry!.itemId"
                :count="cell.entry!.count"
                :localized-name="cell.entry!.localizedName"
                :render-asset-ref="cell.entry!.renderAssetRef"
                :image-file-name="cell.entry!.imageFileName"
                :extra-lines="cell.entry!.extraLines || []"
                size-mode="compact"
                @click="emit('item-click', cell.entry!.itemId)"
              >
                <button
                  type="button"
                  class="native-nei-hit-target"
                  :aria-label="labelForEntry(cell.entry!)"
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
