<script setup lang="ts">
import {
  computed,
  ref,
  watch,
} from 'vue';
import NEIRecipeDisplay from './NEIRecipeDisplay.vue';
import { type Recipe } from '../services/api';
import type { RecipeDisplayHandle, RecipeOverlayUiState } from '../domain/recipeDisplayContract';
import { useRecipeDebugPanel } from '../composables/recipe-display/useRecipeDebugPanel';
import { useRecipePresentation } from '../composables/recipe-display/useRecipePresentation';
import { useRecipeScale } from '../composables/recipe-display/useRecipeScale';
import '../styles/recipe-display/recipeDisplayRouter.css';

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
const {
  componentRegistrationError,
  currentComponent,
  displayedComponentName,
  hasRegisteredComponent,
  neiHandlerMetadata,
  presentationProfile,
  resolvedRecipeUiPayload,
  shouldUseDetailedCrafting,
  uiConfig,
} = useRecipePresentation(props);
const shouldUseRouterScale = computed(() => props.scaleToFit);

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

const handleItemClick = (itemId: string, options?: { tab?: 'usedIn' | 'producedBy' }) => {
  emit('item-click', itemId, options);
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
        @item-click="handleItemClick"
        @overlay-state-change="handleOverlayStateChange"
      />
      <component
        v-else-if="hasRegisteredComponent && currentComponent"
        :is="currentComponent"
        :recipe="recipe"
        :ui-config="uiConfig"
        :ui-payload="resolvedRecipeUiPayload"
        @item-click="handleItemClick"
      />
      <div
        v-else
        class="recipe-display-error"
        role="alert"
        data-testid="recipe-display-component-error"
      >
        <div class="recipe-display-error-title">
          Recipe display component unavailable
        </div>
        <div class="recipe-display-error-message">
          {{ componentRegistrationError || 'Recipe presentation could not be resolved.' }}
        </div>
        <div class="recipe-display-error-meta">
          <span>recipe={{ recipe.recipeId }}</span>
          <span>component={{ presentationProfile.component }}</span>
          <span>uiType={{ uiConfig.uiType }}</span>
          <span>reason={{ presentationProfile.reason }}</span>
        </div>
      </div>
    </div>

  </div>
</template>
