<script setup lang="ts">
import {
  computed,
  defineAsyncComponent,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
  type Component,
} from 'vue';
import NEIRecipeDisplay from './NEIRecipeDisplay.vue';
import StandardCraftingUI from './StandardCraftingUI.vue';
import { api, type Recipe, type RecipeUiPayload } from '../services/api';
import type { RecipeDisplayHandle, RecipeOverlayUiState } from '../domain/recipeDisplayContract';
import {
  resolveRecipePresentationProfile,
  resolveRecipePresentationProfileFromUiPayload,
  type RecipePresentationProfile,
  type UITypeConfig,
} from '../services/uiTypeMapping';

const AvaritiaExtremeCraftingUI = defineAsyncComponent(() => import('./AvaritiaExtremeCraftingUI.vue'));
const FurnaceUI = defineAsyncComponent(() => import('./FurnaceUI.vue'));
const GTUniversalMachineUI = defineAsyncComponent(() => import('./GTUniversalMachineUI.vue'));
const GTResearchStationUI = defineAsyncComponent(() => import('./GTResearchStationUI.vue'));
const GTAssemblerUI = defineAsyncComponent(() => import('./GTAssemblerUI.vue'));
const GTAssemblyLineUI = defineAsyncComponent(() => import('./GTAssemblyLineUI.vue'));
const GTAlloySmelterUI = defineAsyncComponent(() => import('./GTAlloySmelterUI.vue'));
const GTMolecularUI = defineAsyncComponent(() => import('./GTMolecularUI.vue'));
const GTElectrolyzerUI = defineAsyncComponent(() => import('./GTElectrolyzerUI.vue'));
const GTBlastFurnaceUI = defineAsyncComponent(() => import('./GTBlastFurnaceUI.vue'));
const GTElectricFurnaceUI = defineAsyncComponent(() => import('./GTElectricFurnaceUI.vue'));
const BotaniaPoolUI = defineAsyncComponent(() => import('./BotaniaPoolUI.vue'));
const BotaniaPureDaisyUI = defineAsyncComponent(() => import('./BotaniaPureDaisyUI.vue'));
const BotaniaTerraPlateUI = defineAsyncComponent(() => import('./BotaniaTerraPlateUI.vue'));
const BotaniaRuneAltarUI = defineAsyncComponent(() => import('./BotaniaRuneAltarUI.vue'));
const BotaniaElvenTradeUI = defineAsyncComponent(() => import('./BotaniaElvenTradeUI.vue'));
const ThaumcraftArcaneUI = defineAsyncComponent(() => import('./ThaumcraftArcaneUI.vue'));
const ThaumcraftInfusionUI = defineAsyncComponent(() => import('./ThaumcraftInfusionUI.vue'));
const ThaumcraftCrucibleUI = defineAsyncComponent(() => import('./ThaumcraftCrucibleUI.vue'));
const ThaumcraftAspectUI = defineAsyncComponent(() => import('./ThaumcraftAspectUI.vue'));
const ThaumcraftResearchUI = defineAsyncComponent(() => import('./ThaumcraftResearchUI.vue'));
const BloodMagicAltarUI = defineAsyncComponent(() => import('./BloodMagicAltarUI.vue'));
const BloodAlchemyTableUI = defineAsyncComponent(() => import('./BloodAlchemyTableUI.vue'));
const BloodBindingRitualUI = defineAsyncComponent(() => import('./BloodBindingRitualUI.vue'));
const BloodOrbCraftingUI = defineAsyncComponent(() => import('./BloodOrbCraftingUI.vue'));
const MultiblockBlueprintUI = defineAsyncComponent(() => import('./MultiblockBlueprintUI.vue'));

interface Props {
  recipe: Recipe;
  scaleToFit?: boolean;
  preferDetailedCrafting?: boolean;
}

interface Emits {
  (e: 'item-click', itemId: string, options?: { tab?: 'usedIn' | 'producedBy' }): void;
  (e: 'overlay-state-change', state: RecipeOverlayUiState): void;
}

const props = withDefaults(defineProps<Props>(), {
  preferDetailedCrafting: false,
  scaleToFit: false,
});
const emit = defineEmits<Emits>();

const containerRef = ref<HTMLElement | null>(null);
const contentRef = ref<HTMLElement | null>(null);
const detailedCraftingRef = ref<RecipeDisplayHandle | null>(null);
const scaleValue = ref(1);
const showDebugInfo = ref(false);
const isDev = import.meta.env.DEV;
const debugPanelRef = ref<HTMLElement | null>(null);
const debugToggleRef = ref<HTMLElement | null>(null);
const debugCloseRef = ref<HTMLElement | null>(null);
const lastFocusedElementBeforeDebug = ref<HTMLElement | null>(null);
const recipeUiPayload = ref<RecipeUiPayload | null>(null);
let resizeObserver: ResizeObserver | null = null;
let rafId: number | null = null;
let uiPayloadRequestSeq = 0;

const componentRegistry: Record<string, Component> = {
  StandardCraftingUI,
  AvaritiaExtremeCraftingUI,
  FurnaceUI,
  GTUniversalMachineUI,
  GTResearchStationUI,
  GTAssemblerUI,
  GTAssemblyLineUI,
  GTAlloySmelterUI,
  GTMolecularUI,
  GTElectrolyzerUI,
  GTBlastFurnaceUI,
  GTElectricFurnaceUI,
  BotaniaPoolUI,
  BotaniaPureDaisyUI,
  BotaniaTerraPlateUI,
  BotaniaRuneAltarUI,
  BotaniaElvenTradeUI,
  ThaumcraftArcaneUI,
  ThaumcraftInfusionUI,
  ThaumcraftCrucibleUI,
  ThaumcraftAspectUI,
  ThaumcraftResearchUI,
  BloodMagicAltarUI,
  BloodAlchemyTableUI,
  BloodBindingRitualUI,
  BloodOrbCraftingUI,
  MultiblockBlueprintUI,
};

const detectedPresentationProfile = computed<RecipePresentationProfile>(() => resolveRecipePresentationProfile({
  machineType: props.recipe.machineInfo?.machineType,
  recipeType: props.recipe.recipeType,
  recipeTypeData: props.recipe.recipeTypeData,
  inputs: props.recipe.inputs,
  additionalData: props.recipe.additionalData as Record<string, unknown> | undefined,
  metadata: props.recipe.metadata as Record<string, unknown> | undefined,
  preferDetailedCrafting: props.preferDetailedCrafting,
}));

const inlineRecipeUiPayload = computed<RecipeUiPayload | null>(() => {
  const additionalData =
    props.recipe.additionalData && typeof props.recipe.additionalData === 'object'
      ? props.recipe.additionalData as Record<string, unknown>
      : null;
  const candidate =
    additionalData?.uiPayload && typeof additionalData.uiPayload === 'object'
      ? additionalData.uiPayload as Record<string, unknown>
      : null;
  if (!candidate || typeof candidate.recipeId !== 'string' || typeof candidate.familyKey !== 'string') {
    return null;
  }
  return candidate as unknown as RecipeUiPayload;
});

const resolvedRecipeUiPayload = computed<RecipeUiPayload | null>(() => inlineRecipeUiPayload.value ?? recipeUiPayload.value);

const presentationProfile = computed<RecipePresentationProfile>(() => {
  const payloadProfile = resolveRecipePresentationProfileFromUiPayload(resolvedRecipeUiPayload.value);
  return payloadProfile ?? detectedPresentationProfile.value;
});

const uiConfig = computed<UITypeConfig>(() => presentationProfile.value.uiConfig);
const shouldUseDetailedCrafting = computed(() => presentationProfile.value.renderMode === 'detailed_crafting');
const shouldUseRouterScale = computed(() => props.scaleToFit);
const neiHandlerMetadata = computed(() => {
  const metadata = props.recipe.metadata && typeof props.recipe.metadata === 'object'
    ? (props.recipe.metadata as Record<string, unknown>)
    : {};
  const additionalData = props.recipe.additionalData && typeof props.recipe.additionalData === 'object'
    ? (props.recipe.additionalData as Record<string, unknown>)
    : {};
  if (metadata.specialRecipeType !== 'NEI_Handler' && additionalData.specialRecipeType !== 'NEI_Handler') {
    return null;
  }
  return {
    handler: String(additionalData.handler ?? ''),
    handlerClass: String(additionalData.handlerClass ?? ''),
    modName: String(additionalData.modName ?? ''),
    modId: String(additionalData.modId ?? ''),
    handlerIcon: String(additionalData.handlerIcon ?? ''),
    size: [
      additionalData.handlerWidth ? `w=${additionalData.handlerWidth}` : '',
      additionalData.handlerHeight ? `h=${additionalData.handlerHeight}` : '',
      additionalData.maxRecipesPerPage ? `page=${additionalData.maxRecipesPerPage}` : '',
      additionalData.yShift !== null && additionalData.yShift !== undefined ? `y=${additionalData.yShift}` : '',
    ].filter(Boolean).join(' '),
  };
});

const calculateScale = () => {
  if (!shouldUseRouterScale.value || !containerRef.value || !contentRef.value) {
    return;
  }

  const container = containerRef.value;
  const content = contentRef.value;

  const contentWidth = content.scrollWidth;
  const contentHeight = content.scrollHeight;
  if (contentWidth <= 0 || contentHeight <= 0) return;

  const scaleX = container.clientWidth / contentWidth;
  const scaleY = container.clientHeight / contentHeight;
  scaleValue.value = Math.min(scaleX, scaleY, 1);
};

const scheduleScale = () => {
  if (!shouldUseRouterScale.value) return;
  if (rafId !== null) {
    cancelAnimationFrame(rafId);
  }
  rafId = requestAnimationFrame(() => {
    void nextTick(() => {
      calculateScale();
    });
  });
};

onMounted(() => {
  void refreshRecipeUiPayload();
  scheduleScale();
  window.addEventListener('resize', scheduleScale);

  if (typeof ResizeObserver !== 'undefined' && containerRef.value) {
    resizeObserver = new ResizeObserver(() => {
      scheduleScale();
    });
    resizeObserver.observe(containerRef.value);
    if (contentRef.value) {
      resizeObserver.observe(contentRef.value);
    }
  }
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', scheduleScale);
  if (resizeObserver) {
    resizeObserver.disconnect();
    resizeObserver = null;
  }
  if (rafId !== null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
});

const currentComponent = computed<Component>(() => {
  return componentRegistry[presentationProfile.value.component] || StandardCraftingUI;
});

const displayedComponentName = computed(() => {
  if (shouldUseDetailedCrafting.value) {
    return 'NEIRecipeDisplay';
  }

  if (!componentRegistry[presentationProfile.value.component]) {
    return 'StandardCraftingUI (fallback)';
  }

  return presentationProfile.value.component;
});

const refreshRecipeUiPayload = async () => {
  if (inlineRecipeUiPayload.value) {
    recipeUiPayload.value = inlineRecipeUiPayload.value;
    return;
  }

  const uiType = detectedPresentationProfile.value.uiConfig.uiType;
  const shouldFetch = [
    'botania_terra_plate',
    'botania_rune_altar',
    'botania_mana_pool',
    'thaumcraft_infusion',
    'blood_magic_altar',
  ].includes(uiType);

  if (!shouldFetch || !props.recipe.recipeId) {
    recipeUiPayload.value = null;
    return;
  }

  const requestSeq = ++uiPayloadRequestSeq;
  try {
    const payload = await api.getOptionalRecipeUiPayload(props.recipe.recipeId);
    if (requestSeq !== uiPayloadRequestSeq) return;
    recipeUiPayload.value = payload;
  } catch {
    if (requestSeq !== uiPayloadRequestSeq) return;
    recipeUiPayload.value = null;
  }
};

const handleOverlayStateChange = (state: RecipeOverlayUiState) => {
  emit('overlay-state-change', state);
};

const handleRecipeOverlay = async () => {
  const detailedCraftingDisplay = detailedCraftingRef.value;
  if (!shouldUseDetailedCrafting.value || !detailedCraftingDisplay) {
    return;
  }

  if (typeof detailedCraftingDisplay.handleRecipeOverlay === 'function') {
    await detailedCraftingDisplay.handleRecipeOverlay();
  }
};

defineExpose<RecipeDisplayHandle>({
  handleRecipeOverlay,
});

const openDebugPanel = async () => {
  if (showDebugInfo.value) return;
  lastFocusedElementBeforeDebug.value = document.activeElement instanceof HTMLElement
    ? document.activeElement
    : null;
  showDebugInfo.value = true;
  await nextTick();
  (debugCloseRef.value ?? debugPanelRef.value)?.focus();
};

const closeDebugPanel = async () => {
  if (!showDebugInfo.value) return;
  showDebugInfo.value = false;
  await nextTick();
  const target = lastFocusedElementBeforeDebug.value;
  if (target && document.contains(target)) {
    target.focus();
  } else {
    debugToggleRef.value?.focus();
  }
  lastFocusedElementBeforeDebug.value = null;
};

const handleDebugPanelKeydown = (event: KeyboardEvent) => {
  if (event.key === 'Escape') {
    event.preventDefault();
    void closeDebugPanel();
  }
};

watch(
  () => [
    shouldUseRouterScale.value,
    props.recipe.recipeId,
    uiConfig.value.uiType,
    presentationProfile.value.renderMode,
  ],
  () => {
    scheduleScale();
  },
  { immediate: true },
);

watch(
  () => [props.recipe.recipeId, inlineRecipeUiPayload.value?.familyKey ?? ''],
  () => {
    void refreshRecipeUiPayload();
  },
  { immediate: true },
);

if (isDev && typeof window !== 'undefined') {
  (window as Window & { __lastRecipeRouterDebug?: unknown }).__lastRecipeRouterDebug = {
    recipeId: props.recipe.recipeId,
    recipeType: props.recipe.recipeType,
    machineType: props.recipe.machineInfo?.machineType,
    detectedUIType: uiConfig.value.uiType,
    sourceUiType: presentationProfile.value.sourceUiType,
    presentationFamily: uiConfig.value.presentation?.family,
    presentationSurface: uiConfig.value.presentation?.surface,
    presentationDensity: uiConfig.value.presentation?.density,
    reason: presentationProfile.value.reason,
    component: displayedComponentName.value,
  };
}
</script>

<template>
  <div ref="containerRef" class="recipe-display-wrapper" :class="{ 'scale-to-fit': shouldUseRouterScale }">
    <div
      v-if="showDebugInfo && isDev"
      id="recipe-display-debug-panel"
      ref="debugPanelRef"
      class="debug-panel"
      role="dialog"
      aria-modal="false"
      tabindex="-1"
      @keydown="handleDebugPanelKeydown"
    >
      <div class="debug-header">
        <strong>Recipe Debug Info</strong>
        <button ref="debugCloseRef" @click="closeDebugPanel" class="debug-close" aria-label="Close debug panel">X</button>
      </div>
      <div class="debug-content">
        <div class="debug-row">
          <span class="debug-label">Recipe ID:</span>
          <span class="debug-value">{{ recipe.recipeId }}</span>
        </div>
        <div class="debug-row">
          <span class="debug-label">Recipe Type:</span>
          <span class="debug-value">{{ recipe.recipeType }}</span>
        </div>
        <div class="debug-row">
          <span class="debug-label">Machine Type:</span>
          <span class="debug-value">{{ recipe.machineInfo?.machineType || 'N/A' }}</span>
        </div>
        <div class="debug-row">
          <span class="debug-label">Detected UI:</span>
          <span class="debug-value">{{ uiConfig.uiType }}</span>
        </div>
        <div class="debug-row">
          <span class="debug-label">Source UI:</span>
          <span class="debug-value">{{ presentationProfile.sourceUiType }}</span>
        </div>
        <div class="debug-row">
          <span class="debug-label">Family:</span>
          <span class="debug-value">{{ uiConfig.presentation?.family || 'unknown' }}</span>
        </div>
        <div class="debug-row">
          <span class="debug-label">Surface:</span>
          <span class="debug-value">{{ uiConfig.presentation?.surface || 'unknown' }}</span>
        </div>
        <div class="debug-row">
          <span class="debug-label">Density:</span>
          <span class="debug-value">{{ uiConfig.presentation?.density || 'unknown' }}</span>
        </div>
        <div class="debug-row">
          <span class="debug-label">Reason:</span>
          <span class="debug-value">{{ presentationProfile.reason }}</span>
        </div>
        <div class="debug-row">
          <span class="debug-label">Component:</span>
          <span class="debug-value">{{ displayedComponentName }}</span>
        </div>
        <template v-if="neiHandlerMetadata">
          <div class="debug-section-title">NEI Handler</div>
          <div class="debug-row">
            <span class="debug-label">Handler:</span>
            <span class="debug-value">{{ neiHandlerMetadata.handler || neiHandlerMetadata.handlerClass }}</span>
          </div>
          <div class="debug-row">
            <span class="debug-label">Mod:</span>
            <span class="debug-value">{{ neiHandlerMetadata.modName || neiHandlerMetadata.modId }}</span>
          </div>
          <div class="debug-row">
            <span class="debug-label">Icon:</span>
            <span class="debug-value">{{ neiHandlerMetadata.handlerIcon || 'N/A' }}</span>
          </div>
          <div class="debug-row">
            <span class="debug-label">Layout:</span>
            <span class="debug-value">{{ neiHandlerMetadata.size || 'N/A' }}</span>
          </div>
        </template>
      </div>
    </div>

    <button
      v-if="isDev"
      ref="debugToggleRef"
      class="debug-toggle"
      :aria-expanded="showDebugInfo"
      aria-controls="recipe-display-debug-panel"
      @click="showDebugInfo ? closeDebugPanel() : openDebugPanel()"
    >
      {{ showDebugInfo ? 'Hide Debug' : 'Show Debug' }}
    </button>

    <div
      ref="contentRef"
      class="recipe-display-content"
      :style="{ transform: shouldUseRouterScale ? `scale(${scaleValue})` : 'none' }"
    >
      <NEIRecipeDisplay
        v-if="shouldUseDetailedCrafting"
        ref="detailedCraftingRef"
        :recipe="recipe"
        :recipe-id="recipe.recipeId"
        @item-click="(itemId: string) => emit('item-click', itemId)"
        @overlay-state-change="handleOverlayStateChange"
      />
      <ThaumcraftArcaneUI
        v-else-if="uiConfig.uiType === 'thaumcraft_arcane'"
        :recipe="recipe"
        :ui-config="uiConfig"
        @item-click="(itemId: string, options?: { tab?: 'usedIn' | 'producedBy' }) => emit('item-click', itemId, options)"
      />
      <ThaumcraftInfusionUI
        v-else-if="uiConfig.uiType === 'thaumcraft_infusion'"
        :recipe="recipe"
        :ui-config="uiConfig"
        @item-click="(itemId: string, options?: { tab?: 'usedIn' | 'producedBy' }) => emit('item-click', itemId, options)"
      />
      <ThaumcraftCrucibleUI
        v-else-if="uiConfig.uiType === 'thaumcraft_crucible'"
        :recipe="recipe"
        :ui-config="uiConfig"
        @item-click="(itemId: string, options?: { tab?: 'usedIn' | 'producedBy' }) => emit('item-click', itemId, options)"
      />
      <ThaumcraftAspectUI
        v-else-if="uiConfig.uiType === 'thaumcraft_aspect'"
        :recipe="recipe"
        :ui-config="uiConfig"
        @item-click="(itemId: string) => emit('item-click', itemId)"
      />
      <component
        v-else
        :is="currentComponent"
        :recipe="recipe"
        :ui-config="uiConfig"
        @item-click="(itemId: string) => emit('item-click', itemId)"
      />
    </div>

  </div>
</template>

<style scoped>
.recipe-display-wrapper {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.recipe-display-content {
  transition: transform 280ms cubic-bezier(0.22, 0.61, 0.36, 1);
  transform-origin: center center;
  will-change: transform;
}

.scale-to-fit .recipe-display-content {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.debug-toggle {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 1000;
  padding: 5px 12px;
  background: rgba(15, 23, 42, 0.88);
  color: #dbe8f6;
  border: 1px solid rgba(148, 163, 184, 0.24);
  border-radius: 8px;
  font-size: 11px;
  cursor: pointer;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.06),
    0 6px 14px rgba(2, 8, 23, 0.22);
  transition: background 0.2s ease, border-color 0.2s ease, color 0.2s ease, transform 0.2s ease;
}

.debug-toggle:hover {
  background: rgba(30, 41, 59, 0.94);
  border-color: rgba(125, 211, 252, 0.36);
  color: #f8fafc;
  transform: translateY(-1px);
}

.debug-panel {
  position: absolute;
  top: 40px;
  right: 8px;
  z-index: 999;
  background:
    linear-gradient(180deg, rgba(11, 16, 24, 0.97), rgba(7, 11, 17, 0.99)),
    url('/textures/nei/recipebg.png');
  background-repeat: repeat;
  background-size: auto, 96px 96px;
  border: 1px solid rgba(148, 163, 184, 0.24);
  border-radius: 12px;
  padding: 12px;
  min-width: 300px;
  max-width: 400px;
  box-shadow:
    0 16px 36px rgba(2, 8, 23, 0.42),
    inset 0 1px 0 rgba(255, 255, 255, 0.06);
}

.debug-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.16);
  color: #f3f7fb;
  font-size: 12px;
}

.debug-close {
  background: none;
  border: none;
  color: #fca5a5;
  font-size: 14px;
  cursor: pointer;
  padding: 0;
  line-height: 1;
}

.debug-close:hover {
  color: #fecaca;
}

.debug-content {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.debug-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 11px;
  gap: 12px;
  padding: 6px 8px;
  background: rgba(148, 163, 184, 0.06);
  border: 1px solid rgba(148, 163, 184, 0.08);
  border-radius: 8px;
}

.debug-section-title {
  margin-top: 8px;
  padding: 4px 2px 2px;
  color: #f8d084;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.18em;
  text-transform: uppercase;
}

.debug-label {
  color: #a9bed6;
  font-weight: 500;
  flex-shrink: 0;
}

.debug-value {
  color: #f3f7fb;
  font-family: 'Courier New', monospace;
  font-weight: bold;
  word-break: break-all;
  text-align: right;
  margin-left: auto;
}
</style>
