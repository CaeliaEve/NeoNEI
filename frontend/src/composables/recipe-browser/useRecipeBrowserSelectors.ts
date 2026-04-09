import { computed, type Ref } from 'vue';
import type { Recipe, RecipeVariantGroup } from '../../services/api';
import type { RecipeGraph } from '../../domain/recipeGraph';
import type { RecipeIndexes } from '../../utils/recipeIndexing';
import {
  applySelectedVariants,
  buildMachineCategories,
  extractVariantGroups,
  recipeMatchesTextQuery,
  type MachineCategory,
} from './helpers';

interface RecipeBrowserSelectorsOptions {
  currentTab: Ref<'usedIn' | 'producedBy'>;
  recipes: Ref<{ usedIn: Recipe[]; producedBy: Recipe[] }>;
  producedByIndexes: Ref<RecipeIndexes>;
  usedInIndexes: Ref<RecipeIndexes>;
  producedByGraph: Ref<RecipeGraph>;
  usedInGraph: Ref<RecipeGraph>;
  recipeSearchQuery: Ref<string>;
  searchMatchedItemIds: Ref<Set<string>>;
  selectedMachineIndex: Ref<number>;
  currentPage: Ref<number>;
  detailRequestsInFlight: Ref<Set<string>>;
  detailedRecipes: Ref<Map<string, Recipe>>;
  detailFailedRecipeIds: Ref<Set<string>>;
  getSelectedVariant: (recipeId: string, slotKey: string) => number;
  getImagePath: (itemId: string) => string;
}

export const useRecipeBrowserSelectors = ({
  currentTab,
  recipes,
  producedByIndexes,
  usedInIndexes,
  producedByGraph,
  usedInGraph,
  recipeSearchQuery,
  searchMatchedItemIds,
  selectedMachineIndex,
  currentPage,
  detailRequestsInFlight,
  detailedRecipes,
  detailFailedRecipeIds,
  getSelectedVariant,
  getImagePath,
}: RecipeBrowserSelectorsOptions) => {
  const hasBootstrapRichData = (recipe: Recipe | null | undefined) => {
    if (!recipe) return false;
    const additionalData =
      recipe.additionalData && typeof recipe.additionalData === 'object'
        ? (recipe.additionalData as Record<string, unknown>)
        : null;
    return Boolean(
      recipe.machineInfo?.machineType ||
      recipe.recipeTypeData?.machineType ||
      additionalData?.rawIndexedInputs ||
      additionalData?.rawIndexedOutputs
    );
  };

  const currentRecipesInTab = computed(() => {
    return currentTab.value === 'usedIn' ? recipes.value.usedIn : recipes.value.producedBy;
  });

  const currentTabIndexes = computed(() => {
    return currentTab.value === 'usedIn' ? usedInIndexes.value : producedByIndexes.value;
  });

  const currentGraph = computed(() => {
    return currentTab.value === 'usedIn' ? usedInGraph.value : producedByGraph.value;
  });

  const filteredRecipes = computed(() => {
    const base = currentRecipesInTab.value;
    const query = recipeSearchQuery.value.trim();
    if (!query) {
      return base;
    }

    const normalizedQuery = query.toLowerCase();
    const typePrefix = 'type:';
    if (normalizedQuery.startsWith(typePrefix)) {
      const typeQuery = normalizedQuery.slice(typePrefix.length).trim();
      if (!typeQuery) return base;

      const matchedRecipeIds = new Set<string>();
      for (const [type, list] of currentTabIndexes.value.byType.entries()) {
        if (!type.toLowerCase().includes(typeQuery)) continue;
        for (const recipe of list) {
          matchedRecipeIds.add(recipe.recipeId);
        }
      }

      if (matchedRecipeIds.size === 0) {
        return [];
      }
      return base.filter((recipe) => matchedRecipeIds.has(recipe.recipeId));
    }

    const candidateItemIds = new Set(searchMatchedItemIds.value);
    if (query.includes('~')) {
      candidateItemIds.add(query);
    }

    if (candidateItemIds.size > 0) {
      const matchedRecipeIds = new Set<string>();
      for (const itemId of candidateItemIds) {
        for (const recipe of currentTabIndexes.value.byInput.get(itemId) || []) {
          matchedRecipeIds.add(recipe.recipeId);
        }
        for (const recipe of currentTabIndexes.value.byOutput.get(itemId) || []) {
          matchedRecipeIds.add(recipe.recipeId);
        }
        for (const recipeId of currentGraph.value.usedInIndex.get(itemId) || []) {
          matchedRecipeIds.add(recipeId);
        }
        for (const recipeId of currentGraph.value.producedByIndex.get(itemId) || []) {
          matchedRecipeIds.add(recipeId);
        }
      }

      if (matchedRecipeIds.size > 0) {
        return base.filter((recipe) => matchedRecipeIds.has(recipe.recipeId));
      }
    }

    return base.filter((recipe) => recipeMatchesTextQuery(recipe, normalizedQuery));
  });

  const machineCategories = computed<MachineCategory[]>(() => {
    return buildMachineCategories(filteredRecipes.value, getImagePath);
  });

  const currentCategory = computed(() => machineCategories.value[selectedMachineIndex.value] || null);

  const currentCategoryPages = computed(() => {
    if (!currentCategory.value) return [];
    return Array.from(currentCategory.value.recipeVariants.values()).map((group) => group[0]);
  });

  const currentBaseRecipe = computed(() => {
    if (!currentCategory.value || currentCategoryPages.value.length === 0) return null;
    const recipeIndex = currentPage.value % currentCategoryPages.value.length;
    return currentCategoryPages.value[recipeIndex] || null;
  });

  const currentPageRecipes = computed(() => {
    if (!currentBaseRecipe.value) return [];
    return [applySelectedVariants(currentBaseRecipe.value, getSelectedVariant)];
  });

  const currentRecipeVariantGroups = computed<RecipeVariantGroup[]>(() => {
    const recipe = currentBaseRecipe.value;
    if (!recipe) {
      return [];
    }
    return extractVariantGroups(recipe);
  });

  const currentRecipeVariantSelections = computed<Record<string, number>>(() => {
    const recipe = currentBaseRecipe.value;
    if (!recipe) return {};
    const entries = currentRecipeVariantGroups.value.map((group) => [
      group.slotKey,
      getSelectedVariant(recipe.recipeId, group.slotKey),
    ]);
    return Object.fromEntries(entries);
  });

  const currentRecipeId = computed(() => currentBaseRecipe.value?.recipeId || null);

  const isCurrentRecipeDetailLoading = computed(() => {
    if (!currentRecipeId.value) return false;
    return detailRequestsInFlight.value.has(currentRecipeId.value);
  });

  const hasCurrentRecipeDetailedData = computed(() => {
    if (!currentRecipeId.value) return false;
    return detailedRecipes.value.has(currentRecipeId.value) || hasBootstrapRichData(currentBaseRecipe.value);
  });

  const isCurrentRecipeUsingFallback = computed(() => {
    return Boolean(currentRecipeId.value) && !hasCurrentRecipeDetailedData.value;
  });

  const isCurrentRecipeDetailFailed = computed(() => {
    if (!currentRecipeId.value) return false;
    return detailFailedRecipeIds.value.has(currentRecipeId.value);
  });

  const totalPages = computed(() => {
    if (!currentCategory.value) return 0;
    return currentCategory.value.recipeVariants.size;
  });

  const filteredRecipeCount = computed(() => filteredRecipes.value.length);
  const totalRecipeCount = computed(() => currentRecipesInTab.value.length);

  return {
    currentRecipesInTab,
    filteredRecipes,
    machineCategories,
    currentCategory,
    currentCategoryPages,
    currentBaseRecipe,
    currentPageRecipes,
    currentRecipeVariantGroups,
    currentRecipeVariantSelections,
    currentRecipeId,
    isCurrentRecipeDetailLoading,
    isCurrentRecipeUsingFallback,
    isCurrentRecipeDetailFailed,
    totalPages,
    filteredRecipeCount,
    totalRecipeCount,
  };
};
