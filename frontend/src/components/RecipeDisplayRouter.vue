<script setup lang="ts">
import {
  computed,
  ref,
  watch,
} from 'vue';
import NEIRecipeDisplay from './NEIRecipeDisplay.vue';
import { type Recipe } from '../services/api';
import type { RecipeDisplayHandle, RecipeOverlayUiState } from '../domain/recipeDisplayContract';
import {
  ThaumcraftArcaneUI,
  ThaumcraftAspectUI,
  ThaumcraftCrucibleUI,
  ThaumcraftInfusionUI,
  NeiNativeLayoutRenderer,
} from './recipe-display/recipeComponentRegistry';
import { useRecipeDebugPanel } from '../composables/recipe-display/useRecipeDebugPanel';
import { useRecipePresentation } from '../composables/recipe-display/useRecipePresentation';
import { useRecipeScale } from '../composables/recipe-display/useRecipeScale';

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

const detailedCraftingRef = ref<RecipeDisplayHandle | null>(null);
const shouldUseRouterScale = computed(() => props.scaleToFit);
const {
  currentComponent,
  displayedComponentName,
  neiHandlerMetadata,
  presentationProfile,
  resolvedRecipeUiPayload,
  shouldUseDetailedCrafting,
  shouldUseNativeLayoutRenderer,
  uiConfig,
} = useRecipePresentation(props);

const {
  containerRef,
  contentRef,
  scaleValue,
} = useRecipeScale(shouldUseRouterScale, () => [
  shouldUseRouterScale.value,
  props.recipe.recipeId,
  uiConfig.value.uiType,
  presentationProfile.value.renderMode,
]);

const {
  closeDebugPanel,
  debugCloseRef,
  debugPanelRef,
  debugToggleRef,
  handleDebugPanelKeydown,
  isDev,
  openDebugPanel,
  showDebugInfo,
} = useRecipeDebugPanel();

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

if (isDev && typeof window !== 'undefined') {
  watch(
    () => [
      props.recipe.recipeId,
      uiConfig.value.uiType,
      presentationProfile.value.sourceUiType,
      displayedComponentName.value,
    ],
    () => {
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
    },
    { immediate: true },
  );
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
      <NeiNativeLayoutRenderer
        v-else-if="shouldUseNativeLayoutRenderer"
        :recipe="recipe"
        :ui-payload="resolvedRecipeUiPayload"
        @item-click="(itemId: string) => emit('item-click', itemId)"
      />
      <component
        v-else
        :is="currentComponent"
        :recipe="recipe"
        :ui-config="uiConfig"
        :ui-payload="resolvedRecipeUiPayload"
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
