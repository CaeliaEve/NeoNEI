import { computed, type ComputedRef, type Ref } from "vue";

type RecipeLike = {
  recipeId?: string;
};

type CategoryLike = {
  name?: string | null;
  type?: string | null;
} | null | undefined;

type UseHomeRecipePresentationOptions = {
  currentPageRecipes: Ref<RecipeLike[]> | ComputedRef<RecipeLike[]>;
  currentCategory: Ref<CategoryLike> | ComputedRef<CategoryLike>;
  recipeModalLoading: Ref<boolean> | ComputedRef<boolean>;
  recipeModalError: Ref<unknown> | ComputedRef<unknown>;
  recipeModalMode: Ref<string> | ComputedRef<string>;
};

export function useHomeRecipePresentation({
  currentPageRecipes,
  currentCategory,
  recipeModalLoading,
  recipeModalError,
  recipeModalMode,
}: UseHomeRecipePresentationOptions) {
  // The modal shell does not choose a renderer. RecipeDisplayRouter resolves the
  // versioned UiPackBinding v2 and owns all presentation semantics.
  const currentRecipePresentation = computed(() => null);
  const isRecipeModalWorkbenchCanvas = computed(() => currentCategory.value?.type === "crafting");
  const isRecipeModalWideCanvas = computed(() => isRecipeModalWorkbenchCanvas.value);
  const isRecipeModalFurnaceCanvas = computed(() => false);
  const recipeModalScaleToFit = computed(() => !isRecipeModalWideCanvas.value);

  const recipeStageIsStateView = computed(() => (
    recipeModalLoading.value || Boolean(recipeModalError.value) || currentPageRecipes.value.length === 0
  ));

  const recipePreviewNeedsWideStage = computed(() => recipeStageIsStateView.value || !recipeModalScaleToFit.value);

  const recipeStageKey = computed(() => {
    if (recipeModalLoading.value) return "loading";
    if (recipeModalError.value) return `error-${recipeModalMode.value}`;
    const recipe = currentPageRecipes.value[0];
    if (!recipe) return `empty-${recipeModalMode.value}-${currentCategory.value?.name || "none"}`;
    return `${currentCategory.value?.name || "unknown"}-${recipe.recipeId}`;
  });

  return {
    currentRecipePresentation,
    isRecipeModalWorkbenchCanvas,
    isRecipeModalWideCanvas,
    isRecipeModalFurnaceCanvas,
    recipeModalScaleToFit,
    recipeStageIsStateView,
    recipePreviewNeedsWideStage,
    recipeStageKey,
  };
}
