import { computed, ref, watch, type Component } from 'vue';
import { api, type Recipe, type RecipeUiPayload } from '../../services/api';
import {
  resolveRecipePresentationProfile,
  type RecipePresentationProfile,
  type UITypeConfig,
} from '../../services/uiTypeMapping';
import {
  resolveInlineRecipeUiPayload,
  resolveRecipePresentationDecision,
  resolveRecipePresentationRoute,
} from './recipePresentationPolicyCatalog';

interface RecipePresentationSource {
  recipe: Recipe;
  preferDetailedCrafting: boolean;
}

export function useRecipePresentation(source: RecipePresentationSource) {
  const recipeUiPayload = ref<RecipeUiPayload | null>(null);
  let uiPayloadRequestSeq = 0;

  const detectedPresentationProfile = computed<RecipePresentationProfile>(() => resolveRecipePresentationProfile({
    machineType: source.recipe.machineInfo?.machineType,
    recipeType: source.recipe.recipeType,
    recipeTypeData: source.recipe.recipeTypeData,
    inputs: source.recipe.inputs,
    additionalData: source.recipe.additionalData as Record<string, unknown> | undefined,
    metadata: source.recipe.metadata as Record<string, unknown> | undefined,
    preferDetailedCrafting: source.preferDetailedCrafting,
  }));

  const inlineRecipeUiPayload = computed<RecipeUiPayload | null>(() => resolveInlineRecipeUiPayload(source.recipe));

  const resolvedRecipeUiPayload = computed<RecipeUiPayload | null>(() => inlineRecipeUiPayload.value ?? recipeUiPayload.value);

  const presentationDecision = computed(() => resolveRecipePresentationDecision({
    detectedProfile: detectedPresentationProfile.value,
    uiPayload: resolvedRecipeUiPayload.value,
  }));

  const presentationProfile = computed<RecipePresentationProfile>(() => presentationDecision.value.profile);
  const presentationRoute = computed(() => resolveRecipePresentationRoute({
    profile: presentationProfile.value,
    uiPayload: resolvedRecipeUiPayload.value,
    payloadError: presentationDecision.value.payloadError,
  }));

  const uiConfig = computed<UITypeConfig>(() => presentationProfile.value.uiConfig);
  const shouldUseDetailedCrafting = computed(() => presentationRoute.value.kind === 'detailed-crafting');
  const shouldUseNativeLayoutRenderer = computed(() => presentationRoute.value.kind === 'native-layout');
  const hasRegisteredComponent = computed(() => presentationRoute.value.hasRegisteredComponent);
  const componentRegistrationError = computed<string | null>(() => presentationRoute.value.error);
  const currentComponent = computed<Component | null>(() => presentationRoute.value.currentComponent);
  const displayedComponentName = computed(() => presentationRoute.value.displayedComponentName);

  const neiHandlerMetadata = computed(() => {
    const metadata = source.recipe.metadata && typeof source.recipe.metadata === 'object'
      ? (source.recipe.metadata as Record<string, unknown>)
      : {};
    const additionalData = source.recipe.additionalData && typeof source.recipe.additionalData === 'object'
      ? (source.recipe.additionalData as Record<string, unknown>)
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

  const refreshRecipeUiPayload = async () => {
    if (inlineRecipeUiPayload.value) {
      recipeUiPayload.value = inlineRecipeUiPayload.value;
      return;
    }

    if (!source.recipe.recipeId) {
      recipeUiPayload.value = null;
      return;
    }

    const requestSeq = ++uiPayloadRequestSeq;
    try {
      const payload = await api.getOptionalRecipeUiPayload(source.recipe.recipeId);
      if (requestSeq !== uiPayloadRequestSeq) return;
      recipeUiPayload.value = payload;
    } catch {
      if (requestSeq !== uiPayloadRequestSeq) return;
      recipeUiPayload.value = null;
    }
  };

  watch(
    () => [source.recipe.recipeId, inlineRecipeUiPayload.value?.familyKey ?? ''],
    () => {
      void refreshRecipeUiPayload();
    },
    { immediate: true },
  );

  return {
    componentRegistrationError,
    currentComponent,
    displayedComponentName,
    hasRegisteredComponent,
    inlineRecipeUiPayload,
    neiHandlerMetadata,
    presentationDecision,
    presentationProfile,
    presentationRoute,
    recipeUiPayload,
    refreshRecipeUiPayload,
    resolvedRecipeUiPayload,
    shouldUseDetailedCrafting,
    shouldUseNativeLayoutRenderer,
    uiConfig,
  };
}
