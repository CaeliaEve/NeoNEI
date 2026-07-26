import type { ComputedRef, Ref } from 'vue';
import type { Recipe } from '../../services/api';
import { markPerfEvent } from '../../services/perfMarks';
import { getCategoryRecipesPerPage } from './recipeCategoryState';
import type { MachineCategory } from './helpers';
import type { RecipeTab } from '../../domain/recipeQuery';

type RecipePageSwitchSource = 'page-next' | 'page-prev' | 'page-set';

type CreateRecipeNavigationControllerOptions = {
  itemIdRef: Ref<string | undefined>;
  selectedMachineIndex: Ref<number>;
  currentPage: Ref<number>;
  totalPages: ComputedRef<number>;
  currentCategory: ComputedRef<MachineCategory | null>;
  currentCategoryPages: ComputedRef<Recipe[]>;
  currentCategoryOrderedRecipeIds: ComputedRef<string[]>;
  machineCategories: ComputedRef<MachineCategory[]>;
  currentTab: Ref<RecipeTab>;
  categoryRecipeIdsByKey: Ref<Record<string, string[]>>;
  playClick: () => void;
  markRecipeSwitch: (source: string) => void;
  getNow: () => number;
  getLoadRequestSeq: () => number;
  ensureCategoryPageReady: (
    itemId: string,
    requestSeq: number,
    category: NonNullable<MachineCategory>,
    page: number,
    mode: 'visible' | 'prefetch',
  ) => Promise<void>;
};

export function createRecipeNavigationController({
  itemIdRef,
  selectedMachineIndex,
  currentPage,
  totalPages,
  currentCategory,
  currentCategoryPages,
  currentCategoryOrderedRecipeIds,
  machineCategories,
  currentTab,
  categoryRecipeIdsByKey,
  playClick,
  markRecipeSwitch,
  getNow,
  getLoadRequestSeq,
  ensureCategoryPageReady,
}: CreateRecipeNavigationControllerOptions) {
  const selectMachine = (index: number) => {
    if (index === selectedMachineIndex.value) return;
    markRecipeSwitch('machine-select');
    playClick();
    selectedMachineIndex.value = index;
    currentPage.value = 0;
  };

  const navigateToPage = (targetPage: number, source: RecipePageSwitchSource) => {
    if (targetPage < 0 || targetPage >= totalPages.value || targetPage === currentPage.value) {
      return;
    }
    markRecipeSwitch(source);
    playClick();
    currentPage.value = targetPage;
    const itemId = itemIdRef.value;
    const category = currentCategory.value;
    if (itemId && category) {
      const startedAt = getNow();
      void ensureCategoryPageReady(itemId, getLoadRequestSeq(), category, targetPage, 'visible')
        .then(() => {
          markPerfEvent('recipe-page-hydration-complete', {
            itemId,
            categoryKey: category.categoryKey,
            machineKey: category.machineKey ?? null,
            page: targetPage,
            source,
            durationMs: getNow() - startedAt,
          });
        })
        .catch((error) => {
          markPerfEvent('recipe-page-hydration-failed', {
            itemId,
            categoryKey: category.categoryKey,
            machineKey: category.machineKey ?? null,
            page: targetPage,
            source,
            error: error instanceof Error ? error.message : String(error),
          });
        });
    }
    markPerfEvent('recipe-page-switched-immediate', {
      itemId: itemId ?? null,
      categoryKey: category?.categoryKey ?? null,
      machineKey: category?.machineKey ?? null,
      page: targetPage,
      source,
    });
  };

  const nextPage = () => {
    if (totalPages.value <= 0) return;
    void navigateToPage((currentPage.value + 1) % totalPages.value, 'page-next');
  };

  const prevPage = () => {
    if (totalPages.value <= 0) return;
    void navigateToPage((currentPage.value - 1 + totalPages.value) % totalPages.value, 'page-prev');
  };

  const setPage = (page: number) => {
    if (page < 0 || page >= totalPages.value || page === currentPage.value) {
      return;
    }
    void navigateToPage(page, 'page-set');
  };

  const selectRecipeById = (recipeId: string): boolean => {
    if (!recipeId) return false;
    let orderedRecipeIds = currentCategoryOrderedRecipeIds.value;
    let categoryIndex = selectedMachineIndex.value;
    let index = orderedRecipeIds.length > 0
      ? orderedRecipeIds.findIndex((id) => id === recipeId)
      : currentCategoryPages.value.findIndex((recipe) => recipe.recipeId === recipeId);
    if (index < 0) {
      for (let candidateIndex = 0; candidateIndex < machineCategories.value.length; candidateIndex += 1) {
        const category = machineCategories.value[candidateIndex];
        const lookupKey = `${currentTab.value}:${category.categoryKey?.trim() ?? ''}:${category.machineKey?.trim() ?? ''}`;
        const candidateIds = categoryRecipeIdsByKey.value[lookupKey] ?? category.recipes.map((recipe) => recipe.recipeId);
        const candidateRecipeIndex = candidateIds.findIndex((id) => id === recipeId);
        if (candidateRecipeIndex < 0) continue;
        categoryIndex = candidateIndex;
        orderedRecipeIds = candidateIds;
        index = candidateRecipeIndex;
        break;
      }
    }
    if (index < 0) return false;
    const targetCategory = machineCategories.value[categoryIndex] ?? currentCategory.value;
    const targetPage = Math.floor(index / Math.max(1, getCategoryRecipesPerPage(targetCategory)));
    if (categoryIndex !== selectedMachineIndex.value) selectedMachineIndex.value = categoryIndex;
    if (targetPage !== currentPage.value) currentPage.value = targetPage;
    return true;
  };

  return {
    selectMachine,
    navigateToPage,
    nextPage,
    prevPage,
    setPage,
    selectRecipeById,
  };
}
