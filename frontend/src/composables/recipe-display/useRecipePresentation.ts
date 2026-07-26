import { computed, ref, watch, type Component } from 'vue';
import { api, type Recipe, type RecipeUiPayload } from '../../services/api';
import {
  type RecipePresentationProfile,
  type UITypeConfig,
} from '../../services/uiTypeMapping';
import {
  resolveInlineRecipeUiPayload,
  resolveRecipePresentationDecision,
  resolveRecipePresentationRoute,
} from './recipePresentationPolicyCatalog';
import { loadUiPackRuntime, type UiPackBinding } from '../../services/uiPackRuntime.ts';
import { UI_PACK_RUNTIME_STATUS } from '../../services/uiPackRuntimeAbi.ts';

interface RecipePresentationSource {
  recipe: Recipe;
  preferDetailedCrafting: boolean;
}

export function useRecipePresentation(source: RecipePresentationSource) {
  const recipeUiPayload = ref<RecipeUiPayload | null>(null);
  const recipeUiBinding = ref<UiPackBinding | null>(null);
  const recipeUiBindingError = ref<string | null>('UI binding v2 is loading');
  let uiPayloadRequestSeq = 0;
  let uiBindingRequestSeq = 0;

  const inlineRecipeUiPayload = computed<RecipeUiPayload | null>(() => resolveInlineRecipeUiPayload(source.recipe));

  const resolvedRecipeUiPayload = computed<RecipeUiPayload | null>(() => inlineRecipeUiPayload.value ?? recipeUiPayload.value);

  const presentationDecision = computed(() => resolveRecipePresentationDecision({
    uiBinding: recipeUiBinding.value,
    uiBindingError: recipeUiBindingError.value,
    preferDetailedCrafting: source.preferDetailedCrafting,
  }));

  const presentationProfile = computed<RecipePresentationProfile>(() => presentationDecision.value.profile);
  const presentationRoute = computed(() => resolveRecipePresentationRoute({
    profile: presentationProfile.value,
    uiPayload: resolvedRecipeUiPayload.value,
    payloadError: presentationDecision.value.payloadError,
  }));

  const uiConfig = computed<UITypeConfig>(() => presentationProfile.value.uiConfig);
  const shouldUseDetailedCrafting = computed(() => presentationRoute.value.kind === 'detailed-crafting');
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

  const refreshRecipeUiBinding = async () => {
    const recipeId = source.recipe.recipeId?.trim() ?? '';
    if (!recipeId) {
      recipeUiBinding.value = null;
      recipeUiBindingError.value = 'Recipe presentation requires a recipeId before resolving UiPackBinding v2';
      return;
    }
    const requestSeq = ++uiBindingRequestSeq;
    recipeUiBinding.value = null;
    recipeUiBindingError.value = `UI binding v2 is loading for recipeId: ${recipeId}`;
    const runtime = await loadUiPackRuntime();
    if (requestSeq !== uiBindingRequestSeq) return;
    if (runtime.status !== UI_PACK_RUNTIME_STATUS.ready) {
      recipeUiBinding.value = null;
      recipeUiBindingError.value = `UI binding v2 runtime failed: ${runtime.error || '<missing error detail>'}`;
      return;
    }
    const binding = runtime.bindingsByRecipeId.get(recipeId) ?? null;
    recipeUiBinding.value = binding;
    recipeUiBindingError.value = binding
      ? null
      : `UI binding v2 is missing for recipeId: ${recipeId}`;
  };

  watch(
    () => [source.recipe.recipeId, inlineRecipeUiPayload.value?.captureKey ?? ''],
    () => {
      void refreshRecipeUiPayload();
      void refreshRecipeUiBinding();
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
    recipeUiBinding,
    recipeUiBindingError,
    refreshRecipeUiBinding,
    refreshRecipeUiPayload,
    resolvedRecipeUiPayload,
    shouldUseDetailedCrafting,
    uiConfig,
  };
}
