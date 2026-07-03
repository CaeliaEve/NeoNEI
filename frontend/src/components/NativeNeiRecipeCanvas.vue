<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { Recipe, RecipeUiPayload } from '../services/api';
import { loadUiPackRuntime, type UiPackRuntime } from '../services/uiPackRuntime';
import {
  buildNativeUiSlotCells,
  createNativeUiFitMatrix,
  normalizeNativeUiLayoutSurface,
  resolveNativeUiRuntimeSurface,
  type NativeUiFitMatrix,
  type NativeUiLayoutSurface,
  type NativeUiResolvedSurface,
  type NativeUiRect,
  type NativeUiSlotCell,
} from '../services/nativeUiRuntimeRegistry';
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
import {
  nativeUiBackgroundState,
  nativeUiIsSemanticGtBackground,
  nativeUiNativeBackground,
  nativeUiNativeBackgroundAssetRef,
  nativeUiNativeBackgroundTextureKey,
} from '../services/nativeUiBackgroundResourceLoader.ts';
import {
  NativeUiCanvasRenderPipeline,
  type NativeUiCanvasRenderPipelineState,
} from '../services/nativeUiCanvasRenderPipeline.ts';
import {
  projectNativeUiRecipeRenderables,
  resolveNativeUiRenderablesForRole,
  type NativeUiRecipeRenderable,
} from '../services/nativeUiRecipeRenderableProjection.ts';
import RecipeItemTooltip from './RecipeItemTooltip.vue';

type CanvasRenderable = NativeUiRecipeRenderable;
type CanvasCell = NativeUiSlotCell<CanvasRenderable>;
type NativeUiSurfaceResolution = Readonly<{
  surface: NativeUiResolvedSurface | null;
  error: string | null;
}>;


const props = defineProps<{
  recipe: Recipe;
  uiPayload?: RecipeUiPayload | null;
}>();

const emit = defineEmits<{
  (e: 'item-click', itemId: string): void;
}>();

const canvasRef = ref<HTMLCanvasElement | null>(null);
const shellRef = ref<HTMLElement | null>(null);
const renderError = ref<string | null>(null);
const renderReady = ref(false);
const missingTextureCount = ref(0);
const currentDpr = ref(1);
const uiPackRuntime = ref<UiPackRuntime | null>(null);
const backgroundSource = ref<NativeUiCanvasRenderPipelineState['backgroundSource']>(null);
const backgroundLoadError = ref<string | null>(null);
let resizeObserver: ResizeObserver | null = null;
let mounted = false;
const renderPipeline = new NativeUiCanvasRenderPipeline<CanvasRenderable>({
  nextTick,
  onStateChange: syncRenderPipelineState,
});
const shellWidth = ref(0);
const shellHeight = ref(0);

const nativeLayout = computed<NativeUiLayoutSurface | null>(() => (
  normalizeNativeUiLayoutSurface(props.uiPayload?.nativeLayout)
));

const nativeUiSurfaceResolution = computed<NativeUiSurfaceResolution>(() => {
  try {
    return {
      surface: resolveNativeUiRuntimeSurface({
        runtime: uiPackRuntime.value,
        recipeId: props.recipe.recipeId,
        inlineLayout: nativeLayout.value,
      }),
      error: null,
    };
  } catch (error) {
    return {
      surface: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
});
const nativeUiSurfaceError = computed(() => nativeUiSurfaceResolution.value.error);
const nativeUiSurface = computed(() => nativeUiSurfaceResolution.value.surface);

const resolvedNativeLayout = computed<NativeUiLayoutSurface | null>(() => nativeUiSurface.value?.layout ?? null);
const slots = computed(() => nativeUiSurface.value?.slots ?? []);
const textOverlays = computed(() => nativeUiSurface.value?.textOverlays ?? []);
const hotspots = computed(() => nativeUiSurface.value?.hotspots ?? []);
const viewports = computed(() => nativeUiSurface.value?.viewports ?? []);
const dynamicPrimitives = computed(() => nativeUiSurface.value?.dynamicPrimitives ?? []);

const nativeBackground = computed(() => nativeUiNativeBackground(resolvedNativeLayout.value));
const semanticGtBackground = computed(() => nativeUiIsSemanticGtBackground(nativeBackground.value));
const nativeBackgroundAssetRef = computed(() => nativeUiNativeBackgroundAssetRef(nativeBackground.value));
const nativeBackgroundTextureKey = computed(() => nativeUiNativeBackgroundTextureKey(nativeBackground.value));
const backgroundState = computed(() => nativeUiBackgroundState({
  nativeAssetRef: nativeBackgroundAssetRef.value,
  nativeTextureKey: nativeBackgroundTextureKey.value,
  semanticGtBackground: semanticGtBackground.value,
  source: backgroundSource.value,
  error: backgroundLoadError.value,
}));

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

const layoutWidth = computed(() => nativeUiSurface.value?.width ?? 0);
const layoutHeight = computed(() => nativeUiSurface.value?.height ?? 0);
const displayWidth = computed(() => Math.ceil(layoutWidth.value));
const displayHeight = computed(() => Math.ceil(layoutHeight.value));
const fitMatrix = computed<NativeUiFitMatrix>(() => createNativeUiFitMatrix({
  sourceWidth: displayWidth.value,
  sourceHeight: displayHeight.value,
  availableWidth: shellWidth.value,
  availableHeight: shellHeight.value,
  scaleMode: nativeUiSurface.value?.scaleMode ?? 'uniform-scale',
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

const recipeRenderables = computed(() => projectNativeUiRecipeRenderables(props.recipe));

const slotCells = computed<CanvasCell[]>(() => buildNativeUiSlotCells({
  slots: slots.value,
  resolveRoleEntries: (role) => resolveNativeUiRenderablesForRole(role, recipeRenderables.value),
}));
const hitCells = computed<NativeUiHitCell<CanvasRenderable>[]>(() => projectNativeUiHitCells(slotCells.value));

const renderSignature = computed(() => JSON.stringify({
  recipeId: props.recipe.recipeId,
  familyKey: props.uiPayload?.familyKey ?? '',
  uiPackStatus: uiPackRuntime.value?.status ?? 'loading',
  uiPackTemplateKey: nativeUiSurface.value?.binding?.templateKey ?? '',
  nativeUiSurfaceSource: nativeUiSurface.value?.source ?? 'error',
  nativeUiSurfaceError: nativeUiSurfaceError.value ?? '',
  layoutWidth: layoutWidth.value,
  layoutHeight: layoutHeight.value,
  nativeBackground: nativeBackground.value,
  slots: slots.value,
  textOverlays: textOverlays.value,
  dynamicPrimitives: dynamicPrimitives.value,
  hotspots: hotspots.value,
  viewports: viewports.value,
  entries: slotCells.value.map((cell) => [cell.key, cell.entry?.atlasLookupId, cell.entry?.count]),
}));

function handleHotspotClick(rect: NativeUiRect) {
  const itemId = nativeUiHotspotItemId(rect);
  if (!itemId) return;
  emit('item-click', itemId);
}

function handleHitCellClick(cell: NativeUiHitCell<CanvasRenderable>) {
  emit('item-click', cell.entry.itemId);
}


function syncRenderPipelineState(state: NativeUiCanvasRenderPipelineState) {
  currentDpr.value = state.currentDpr;
  renderError.value = state.renderError;
  renderReady.value = state.renderReady;
  missingTextureCount.value = state.missingTextureCount;
  backgroundSource.value = state.backgroundSource;
  backgroundLoadError.value = state.backgroundLoadError;
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
  if (nativeUiSurfaceError.value) {
    renderPipeline.dispose();
    return;
  }
  await renderPipeline.rebuild({
    mounted,
    canvas: canvasRef.value,
    displayWidth: displayWidth.value,
    displayHeight: displayHeight.value,
    devicePixelRatio: window.devicePixelRatio,
    layout: resolvedNativeLayout.value,
    manifestUrl: uiPackRuntime.value?.manifestUrl ?? null,
    layoutWidth: layoutWidth.value,
    layoutHeight: layoutHeight.value,
    dynamicPrimitives: dynamicPrimitives.value,
    slotCells: slotCells.value,
  });
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
  window.removeEventListener('resize', handleResize);
  resizeObserver?.disconnect();
  resizeObserver = null;
  renderPipeline.dispose();
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
      <div v-if="nativeUiSurfaceError || renderError" class="native-nei-error">{{ nativeUiSurfaceError || renderError }}</div>
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
              :style="nativeUiSlotCellStyle(cell)"
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
