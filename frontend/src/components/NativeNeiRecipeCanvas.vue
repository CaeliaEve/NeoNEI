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
import { getSharedAnimationNowMs, resolveTimelineFrameIndex } from '../services/animationBudget';
import { loadUiPackRuntime, type UiPackRuntime } from '../services/uiPackRuntime';
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
const VIEW_SLOT_SIZE = 34;
const VIEW_ICON_SIZE = 28;
const VIEW_ICON_INSET = Math.floor((VIEW_SLOT_SIZE - VIEW_ICON_SIZE) / 2);
const NATIVE_SCALE = VIEW_SLOT_SIZE / NATIVE_SLOT_SIZE;

const canvasRef = ref<HTMLCanvasElement | null>(null);
const renderer = ref<WebGl2NativeRenderer | null>(null);
const renderError = ref<string | null>(null);
const renderReady = ref(false);
const missingTextureCount = ref(0);
const currentDpr = ref(1);
const uiPackRuntime = ref<UiPackRuntime | null>(null);
const preparedSources = new Map<string, PreparedAtlasSource>();
const registeredTextureKeys = new Set<string>();
let loadSequence = 0;
let animationFrameId: number | null = null;
let mounted = false;
let hasAnimatedSprites = false;

const nativeLayout = computed(() => {
  const layout = props.uiPayload?.nativeLayout;
  return layout && typeof layout === 'object' ? layout as Record<string, unknown> : null;
});

const resolvedNativeLayout = computed(() => {
  const binding = uiPackRuntime.value?.bindingsByRecipeId.get(props.recipe.recipeId);
  const template = binding?.templateKey
    ? uiPackRuntime.value?.templatesByKey.get(binding.templateKey) ?? null
    : null;
  if (!template) {
    return nativeLayout.value;
  }
  return {
    width: template.width,
    height: template.height,
    slots: template.slots,
    textOverlays: template.textOverlays,
  };
});

const slots = computed<NativeSlotFact[]>(() => {
  const raw = resolvedNativeLayout.value?.slots;
  return Array.isArray(raw) ? raw as NativeSlotFact[] : [];
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

const layoutWidth = computed(() => Math.max(166, Number(resolvedNativeLayout.value?.width ?? 166)));
const layoutHeight = computed(() => Math.max(65, Number(resolvedNativeLayout.value?.height ?? 65)));
const displayWidth = computed(() => Math.ceil(layoutWidth.value * NATIVE_SCALE));
const displayHeight = computed(() => Math.ceil(layoutHeight.value * NATIVE_SCALE));
const canvasStyle = computed(() => ({
  width: `${displayWidth.value}px`,
  height: `${displayHeight.value}px`,
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
    const x0 = Math.max(0, Number(slot.x ?? 0)) * NATIVE_SCALE;
    const y0 = Math.max(0, Number(slot.y ?? 0)) * NATIVE_SCALE;
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
        x: x0 + col * VIEW_SLOT_SIZE,
        y: y0 + row * VIEW_SLOT_SIZE,
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
  slots: slots.value,
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
    width: `${VIEW_SLOT_SIZE}px`,
    height: `${VIEW_SLOT_SIZE}px`,
  };
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
  const size = Math.max(1, Math.round(VIEW_SLOT_SIZE * dpr));
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
  drawRoundedRect(ctx, 1, 1, VIEW_SLOT_SIZE - 2, VIEW_SLOT_SIZE - 2, 7);
  ctx.fillStyle = fill;
  ctx.fill();
  const gradient = ctx.createLinearGradient(0, 0, VIEW_SLOT_SIZE, VIEW_SLOT_SIZE);
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
    drawRoundedRect(ctx, 5, 7, 4, VIEW_SLOT_SIZE - 14, 2);
    ctx.fill();
  }
  if (kind.includes('output')) {
    ctx.fillStyle = 'rgba(248, 181, 92, 0.16)';
    drawRoundedRect(ctx, VIEW_SLOT_SIZE - 10, 7, 4, VIEW_SLOT_SIZE - 14, 2);
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

function buildSpriteCommands(nowMs: number): NativeTextureSpriteCommand[] {
  const dpr = currentDpr.value;
  const commands: NativeTextureSpriteCommand[] = [];
  for (const cell of slotCells.value) {
    const key = slotTextureKey(cell.role);
    const slotPixels = Math.round(VIEW_SLOT_SIZE * dpr);
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

    if (!cell.entry) continue;
    const source = resolveAtlasSource(cell.entry, nowMs);
    if (!source) continue;
    commands.push({
      textureKey: source.atlasFile,
      sourceX: source.x,
      sourceY: source.y,
      sourceWidth: source.width,
      sourceHeight: source.height,
      destX: Math.round((cell.x + VIEW_ICON_INSET) * dpr),
      destY: Math.round((cell.y + VIEW_ICON_INSET) * dpr),
      destWidth: Math.round(VIEW_ICON_SIZE * dpr),
      destHeight: Math.round(VIEW_ICON_SIZE * dpr),
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
  renderReady.value = false;
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

  const lookupIds = Array.from(new Set(slotCells.value
    .map((cell) => cell.entry?.atlasLookupId ?? '')
    .filter(Boolean)));
  await warmGlobalBrowserAtlasForItemsDetailed(lookupIds);
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
  void rebuildRenderer();
}

onMounted(() => {
  mounted = true;
  window.addEventListener('resize', handleResize, { passive: true });
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
      <div v-else class="native-nei-canvas-shell" :style="canvasStyle">
        <canvas
          ref="canvasRef"
          class="native-nei-canvas"
          :style="canvasStyle"
          aria-hidden="true"
        />
        <div class="native-nei-hit-layer" :style="canvasStyle">
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
        <div v-if="slots.length === 0" class="native-nei-empty">Captured NEI template slots are unavailable.</div>
      </div>
    </div>

    <footer class="native-nei-footer">
      <span>{{ slotCells.length }} slots</span>
      <span>UI pack: {{ uiPackRuntime?.status ?? 'loading' }}</span>
      <span v-if="renderReady">WebGL2 atlas path active</span>
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
  display: flex;
  align-items: center;
  justify-content: center;
}

.native-nei-canvas-shell {
  position: relative;
  isolation: isolate;
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

.native-nei-canvas {
  display: block;
  image-rendering: pixelated;
}

.native-nei-hit-layer {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.native-nei-hit-cell {
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

.native-nei-hit-target:focus-visible {
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
