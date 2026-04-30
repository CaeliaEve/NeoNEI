import { computed, type Ref } from 'vue';
import type { Recipe, RecipeVariantGroup, indexedItemRecipeSummaryResponse } from '../../services/api';
import { resolveRecipePresentationProfile } from '../../services/uiTypeMapping';
import type { RecipeGraph } from '../../domain/recipeGraph';
import type { RecipeIndexes } from '../../utils/recipeIndexing';
import {
  applySelectedVariants,
  buildCategorySkeletonsFromSummary,
  buildMachineCategories,
  buildMachineCategorySkeletonsFromSummary,
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
  searchMatchedRecipeIds: Ref<Set<string> | null>;
  indexedSummary: Ref<indexedItemRecipeSummaryResponse | null>;
  tabRecipeTotals: Ref<{ usedIn: number; producedBy: number }>;
  categoryRecipeIdsByKey: Ref<Record<string, string[]>>;
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
  searchMatchedRecipeIds,
  indexedSummary,
  tabRecipeTotals,
  categoryRecipeIdsByKey,
  selectedMachineIndex,
  currentPage,
  detailRequestsInFlight,
  detailedRecipes,
  detailFailedRecipeIds,
  getSelectedVariant,
  getImagePath,
}: RecipeBrowserSelectorsOptions) => {
  const normalizeSummaryMachineKey = (
    entry: {
      machineKey?: string | null;
      categoryKey?: string;
      name?: string;
      voltageTier?: string | null;
    },
  ): string => {
    const machineKey = `${entry.machineKey ?? ''}`.trim();
    if (machineKey) {
      return machineKey;
    }

    const categoryKey = `${entry.categoryKey ?? ''}`.trim();
    if (categoryKey.startsWith('machine:')) {
      return categoryKey.slice('machine:'.length);
    }

    const name = `${entry.name ?? ''}`.trim();
    if (!name) {
      return '';
    }

    return `${name}::${entry.voltageTier ?? ''}`;
  };

  const shouldPreferMachineSummaryGroups = (
    summaryCategoryGroups: Array<{
      type?: string;
      categoryKey?: string;
      machineKey?: string | null;
      name?: string;
      voltageTier?: string | null;
      recipeCount?: number;
    }>,
    summaryMachineGroups: Array<{
      machineType?: string;
      machineKey?: string | null;
      voltageTier?: string | null;
      recipeCount?: number;
    }>,
  ): boolean => {
    if (!summaryMachineGroups.length || !summaryCategoryGroups.length) {
      return false;
    }

    if (!summaryCategoryGroups.every((group) => group.type === 'machine')) {
      return false;
    }

    const machineCounts = new Map<string, number>();
    for (const group of summaryMachineGroups) {
      const key = normalizeSummaryMachineKey({
        machineKey: group.machineKey ?? null,
        name: group.machineType,
        voltageTier: group.voltageTier ?? null,
      });
      if (!key) continue;
      machineCounts.set(key, Math.max(0, Number(group.recipeCount ?? 0)));
    }

    const categoryCounts = new Map<string, number>();
    for (const group of summaryCategoryGroups) {
      const key = normalizeSummaryMachineKey(group);
      if (!key) continue;
      categoryCounts.set(key, Math.max(0, Number(group.recipeCount ?? 0)));
    }

    if (machineCounts.size !== categoryCounts.size) {
      return true;
    }

    for (const [key, recipeCount] of machineCounts.entries()) {
      if (categoryCounts.get(key) !== recipeCount) {
        return true;
      }
    }

    return false;
  };

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

  const currentRecipesById = computed(() => {
    const map = new Map<string, Recipe>();
    for (const recipe of currentRecipesInTab.value) {
      map.set(recipe.recipeId, recipe);
    }
    return map;
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

    const matchedRecipeIds = searchMatchedRecipeIds.value;
    if (matchedRecipeIds) {
      return base.filter((recipe) => matchedRecipeIds.has(recipe.recipeId));
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
    const loadedCategories = buildMachineCategories(filteredRecipes.value, getImagePath);
    const summary = indexedSummary.value;
    const rawSummaryCategoryGroups = currentTab.value === 'producedBy'
      ? (summary?.producedByCategoryGroups ?? [])
      : (summary?.usedInCategoryGroups ?? []);
    const summaryGroups = currentTab.value === 'producedBy'
      ? (summary?.producedByMachineGroups ?? summary?.machineGroups ?? [])
      : (summary?.usedInMachineGroups ?? []);
    const loadedRecipeCount = currentRecipesInTab.value.length;
    const expectedRecipeCount = currentTab.value === 'producedBy'
      ? (summary?.counts?.producedBy ?? 0)
      : (summary?.counts?.usedIn ?? 0);
    if (!recipeSearchQuery.value.trim() && expectedRecipeCount > 0 && loadedRecipeCount >= expectedRecipeCount) {
      return loadedCategories;
    }
    const preferMachineSummaryCategories = shouldPreferMachineSummaryGroups(rawSummaryCategoryGroups, summaryGroups);
    const summaryCategoryGroups = preferMachineSummaryCategories
      ? []
      : rawSummaryCategoryGroups;

    if ((!summaryGroups.length && !summaryCategoryGroups.length) || recipeSearchQuery.value.trim()) {
      return loadedCategories;
    }

    const machineSummaryByKey = new Map(
      summaryGroups
        .map((group) => {
          const key = normalizeSummaryMachineKey({
            machineKey: group.machineKey ?? null,
            name: group.machineType,
            voltageTier: group.voltageTier ?? null,
          });
          return key ? [key, group] as const : null;
        })
        .filter((entry): entry is readonly [string, typeof summaryGroups[number]] => Boolean(entry)),
    );

    let summaryCategories = summaryCategoryGroups.length > 0
      ? buildCategorySkeletonsFromSummary(summaryCategoryGroups, getImagePath)
      : buildMachineCategorySkeletonsFromSummary(summaryGroups, getImagePath);
    if (machineSummaryByKey.size > 0 && summaryCategories.length > 0) {
      const remainingMachineSummaries = new Map(machineSummaryByKey);
      summaryCategories = summaryCategories.map((category) => {
        if (category.type !== 'machine') {
          return category;
        }

        const summaryKey = normalizeSummaryMachineKey({
          categoryKey: category.categoryKey,
          machineKey: category.machineKey,
          name: category.name,
          voltageTier: category.voltageTier,
        });
        const machineSummary = summaryKey ? remainingMachineSummaries.get(summaryKey) : null;
        if (!machineSummary) {
          return category;
        }

        remainingMachineSummaries.delete(summaryKey);
        return {
          ...category,
          machineKey: machineSummary.machineKey ?? category.machineKey ?? null,
          voltageTier: machineSummary.voltageTier ?? category.voltageTier ?? null,
          recipeCount: Math.max(0, Number(machineSummary.recipeCount ?? category.recipeCount ?? 0)),
        };
      });

      if (remainingMachineSummaries.size > 0) {
        summaryCategories = [
          ...summaryCategories,
          ...buildMachineCategorySkeletonsFromSummary(Array.from(remainingMachineSummaries.values()), getImagePath),
        ];
      }
    }
    if (summaryCategories.length === 0) {
      return loadedCategories;
    }

    const getCategoryKey = (category: MachineCategory) =>
      category.categoryKey?.trim() || category.machineKey?.trim() || `${category.type}:${category.name.trim().toLowerCase()}`;
    const getCategoryMatchKey = (category: MachineCategory) =>
      normalizeSummaryMachineKey({
        categoryKey: category.categoryKey,
        machineKey: category.machineKey,
        name: category.name,
        voltageTier: category.voltageTier,
      }) || getCategoryKey(category);

    const loadedByKey = new Map<string, MachineCategory>();
    for (const category of loadedCategories) {
      loadedByKey.set(getCategoryMatchKey(category), category);
    }

    if (preferMachineSummaryCategories) {
      return summaryCategories.map((summaryCategory) => {
        const loaded = loadedByKey.get(getCategoryMatchKey(summaryCategory));
        if (!loaded) {
          return summaryCategory;
        }

        return {
          ...loaded,
          name: summaryCategory.name,
          categoryKey: summaryCategory.categoryKey,
          machineKey: summaryCategory.machineKey ?? loaded.machineKey ?? null,
          voltageTier: summaryCategory.voltageTier ?? loaded.voltageTier ?? null,
          machineIcon: loaded.machineIcon || summaryCategory.machineIcon,
          recipeCount: summaryCategory.recipeCount ?? loaded.recipeCount ?? loaded.recipes.length,
        };
      });
    }

    const usedKeys = new Set<string>();
    const merged: MachineCategory[] = [];
    for (const summaryCategory of summaryCategories) {
      const key = getCategoryMatchKey(summaryCategory);
      const loaded = loadedByKey.get(key);
      if (loaded) {
        merged.push({
          ...loaded,
          machineKey: loaded.machineKey ?? summaryCategory.machineKey ?? null,
          voltageTier: loaded.voltageTier ?? summaryCategory.voltageTier ?? null,
          machineIcon: loaded.machineIcon || summaryCategory.machineIcon,
          recipeCount: summaryCategory.machineKey
            ? (summaryCategory.recipeCount ?? loaded.recipeCount ?? loaded.recipes.length)
            : Math.max(loaded.recipeCount ?? loaded.recipes.length, summaryCategory.recipeCount ?? 0),
        });
      } else {
        merged.push(summaryCategory);
      }
      usedKeys.add(key);
    }

    for (const category of loadedCategories) {
      const key = getCategoryMatchKey(category);
      if (usedKeys.has(key)) continue;
      merged.push(category);
    }

    return merged;
  });

  const currentCategory = computed(() => machineCategories.value[selectedMachineIndex.value] || null);

  const currentCategoryLookupKey = computed(() => {
    if (!currentCategory.value) return '';
    const categoryKey = currentCategory.value.categoryKey?.trim();
    if (!categoryKey) return '';
    return `${currentTab.value}:${categoryKey}`;
  });

  const currentCategoryOrderedRecipeIds = computed(() => {
    const lookupKey = currentCategoryLookupKey.value;
    if (!lookupKey) return [] as string[];
    const orderedRecipeIds = categoryRecipeIdsByKey.value[lookupKey];
    if (Array.isArray(orderedRecipeIds) && orderedRecipeIds.length > 0) {
      return orderedRecipeIds;
    }
    return currentCategory.value?.recipes.map((recipe) => recipe.recipeId) ?? [];
  });

  const currentCategoryPages = computed(() => {
    if (!currentCategory.value) return [];
    return Array.from(currentCategory.value.recipeVariants.values()).map((group) => group[0]);
  });

  const recipesPerPage = computed(() => {
    const recipe = currentCategoryPages.value[0];
    if (!recipe) return 1;
    const profile = resolveRecipePresentationProfile({
      machineType: recipe.machineInfo?.machineType,
      recipeType: recipe.recipeType,
      recipeTypeData: recipe.recipeTypeData,
      inputs: recipe.inputs,
      additionalData: recipe.additionalData as Record<string, unknown> | undefined,
      metadata: recipe.metadata as Record<string, unknown> | undefined,
      preferDetailedCrafting: false,
    });
    return profile.component === 'FurnaceUI' ? 2 : 1;
  });

  const currentBaseRecipe = computed(() => {
    if (!currentCategory.value || totalPages.value <= 0) return null;
    const recipeIndex = (currentPage.value % totalPages.value) * recipesPerPage.value;
    const orderedRecipeIds = currentCategoryOrderedRecipeIds.value;
    if (orderedRecipeIds.length > 0) {
      const recipeId = orderedRecipeIds[recipeIndex];
      return recipeId ? currentRecipesById.value.get(recipeId) ?? null : null;
    }
    return currentCategoryPages.value[recipeIndex] || null;
  });

  const currentPageRecipes = computed(() => {
    if (!currentCategory.value || totalPages.value <= 0) return [];
    const startIndex = (currentPage.value % totalPages.value) * recipesPerPage.value;
    const orderedRecipeIds = currentCategoryOrderedRecipeIds.value;
    if (orderedRecipeIds.length > 0) {
      return orderedRecipeIds
        .slice(startIndex, startIndex + recipesPerPage.value)
        .map((recipeId) => currentRecipesById.value.get(recipeId) ?? null)
        .filter((recipe): recipe is Recipe => Boolean(recipe))
        .map((recipe) => applySelectedVariants(recipe, getSelectedVariant));
    }
    return currentCategoryPages.value
      .slice(startIndex, startIndex + recipesPerPage.value)
      .map((recipe) => applySelectedVariants(recipe, getSelectedVariant));
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
    const orderedRecipeIds = currentCategoryOrderedRecipeIds.value;
    if (orderedRecipeIds.length > 0) {
      return Math.ceil(orderedRecipeIds.length / recipesPerPage.value);
    }
    const categoryCount = Math.max(currentCategory.value.recipeCount ?? 0, currentCategory.value.recipeVariants.size);
    return Math.ceil(categoryCount / recipesPerPage.value);
  });

  const totalRecipeCount = computed(() => {
    const totalFromBootstrap = currentTab.value === 'usedIn'
      ? tabRecipeTotals.value.usedIn
      : tabRecipeTotals.value.producedBy;
    return Math.max(totalFromBootstrap, currentRecipesInTab.value.length);
  });
  const filteredRecipeCount = computed(() => {
    if (!recipeSearchQuery.value.trim()) {
      return totalRecipeCount.value;
    }
    return filteredRecipes.value.length;
  });

  return {
    currentRecipesInTab,
    filteredRecipes,
    machineCategories,
    currentCategory,
    currentCategoryOrderedRecipeIds,
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
