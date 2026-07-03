import { computed, ref, watch, type Component } from 'vue';
import { api, type Recipe, type RecipeUiPayload } from '../../services/api';
import {
  resolveRecipePresentationProfile,
  resolveRecipePresentationProfileFromUiPayload,
  type RecipePresentationProfile,
  type UITypeConfig,
} from '../../services/uiTypeMapping';
import {
  isRegisteredRecipeComponent,
  resolveRegisteredRecipeComponent,
} from '../../components/recipe-display/recipeComponentRegistry';
import { isNativeLayoutRendererEligible } from './nativeLayoutRendering';

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

  const inlineRecipeUiPayload = computed<RecipeUiPayload | null>(() => {
    const additionalData =
      source.recipe.additionalData && typeof source.recipe.additionalData === 'object'
        ? source.recipe.additionalData as Record<string, unknown>
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
  const shouldUseNativeLayoutRenderer = computed(() => {
    const layout = resolvedRecipeUiPayload.value?.nativeLayout;
    return Boolean(layout) && isNativeLayoutRendererEligible(presentationProfile.value.component, layout);
  });
  const hasRegisteredComponent = computed(() => isRegisteredRecipeComponent(presentationProfile.value.component));
  const componentRegistrationError = computed<string | null>(() => {
    if (shouldUseDetailedCrafting.value || shouldUseNativeLayoutRenderer.value || hasRegisteredComponent.value) {
      return null;
    }
    return `Recipe display component "${presentationProfile.value.component}" is not registered `
      + `for UI type "${uiConfig.value.uiType}".`;
  });
  const currentComponent = computed<Component | null>(() => (
    hasRegisteredComponent.value
      ? resolveRegisteredRecipeComponent(presentationProfile.value.component)
      : null
  ));
  const displayedComponentName = computed(() => {
    if (shouldUseDetailedCrafting.value) {
      return 'NEIRecipeDisplay';
    }

    if (shouldUseNativeLayoutRenderer.value) {
      return 'NativeNeiRecipeCanvas';
    }

    if (!hasRegisteredComponent.value) {
      return `Unregistered:${presentationProfile.value.component}`;
    }

    return presentationProfile.value.component;
  });

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
    presentationProfile,
    recipeUiPayload,
    refreshRecipeUiPayload,
    resolvedRecipeUiPayload,
    shouldUseDetailedCrafting,
    shouldUseNativeLayoutRenderer,
    uiConfig,
  };
}
