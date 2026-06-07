import { computed, type ComputedRef, type Ref } from "vue";
import type { Recipe, RecipeTypeDTO } from "../../services/api";
import { resolveRecipePresentationProfile } from "../../services/uiTypeMapping";

type RecipeLike = {
  recipeId?: string;
  machineInfo?: { machineType?: string | null } | null;
  recipeType?: string | null;
  recipeTypeData?: RecipeTypeDTO | null;
  inputs?: Recipe["inputs"];
  additionalData?: unknown;
  metadata?: unknown;
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
  const currentRecipePresentation = computed(() => {
    const recipe = currentPageRecipes.value[0];
    if (!recipe) return null;
    return resolveRecipePresentationProfile({
      machineType: recipe.machineInfo?.machineType,
      recipeType: recipe.recipeType,
      recipeTypeData: recipe.recipeTypeData,
      inputs: recipe.inputs,
      additionalData: recipe.additionalData as Record<string, unknown> | undefined,
      metadata: recipe.metadata as Record<string, unknown> | undefined,
      preferDetailedCrafting: false,
    });
  });

  const isRecipeModalWorkbenchCanvas = computed(() => {
    const categoryName = `${currentCategory.value?.name || ""}`.toLowerCase();
    const isNamedWorkbench =
      categoryName === "crafting table"
      || categoryName === "crafting (shaped)"
      || categoryName === "crafting (shapeless)"
      || categoryName === "有序合成"
      || categoryName === "无序合成";
    return currentCategory.value?.type === "crafting" || isNamedWorkbench;
  });

  const isRecipeModalWideCanvas = computed(() => (
    isRecipeModalWorkbenchCanvas.value || currentRecipePresentation.value?.component === "FurnaceUI"
  ));

  const isRecipeModalFurnaceCanvas = computed(() => currentRecipePresentation.value?.component === "FurnaceUI");

  const recipeModalScaleToFit = computed(() => {
    if (isRecipeModalWideCanvas.value) return false;
    const surface = currentRecipePresentation.value?.uiConfig.presentation?.surface;
    const density = currentRecipePresentation.value?.uiConfig.presentation?.density;
    const family = currentRecipePresentation.value?.uiConfig.presentation?.family;
    if (surface === "ritual" || surface === "research") return false;
    if (density === "oversized") return false;
    if (family === "thaumcraft" || family === "blood_magic" || family === "multiblock") return false;
    return true;
  });

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
