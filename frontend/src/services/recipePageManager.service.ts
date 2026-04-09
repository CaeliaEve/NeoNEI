import { ref, computed, type ComputedRef } from 'vue';
import type { Recipe } from './api';

/**
 * RecipePageManager - Manages pagination and layout of recipe widgets
 * Based on NEI's RecipePageManager.java
 */

export interface PageLayout {
  widgets: Recipe[];
  startIndex: number;
  endIndex: number;
}

export function useRecipePageManager(
  recipes: ComputedRef<Recipe[]>,
  containerHeight: ComputedRef<number>,
  recipeHeight: number = 74 // Default recipe height in pixels
) {
  const currentPageIndex = ref(0);
  const currentRecipeIndex = ref(0);
  const pageLayouts = ref<PageLayout[]>([]);

  // Calculate total number of pages
  const numPages = computed(() => {
    return pageLayouts.value.length;
  });

  // Get current page recipes
  const currentPageRecipes = computed(() => {
    if (pageLayouts.value.length === 0) return [];
    const layout = pageLayouts.value[currentPageIndex.value];
    return layout ? layout.widgets : [];
  });

  // Build page layouts based on available height and recipes
  const buildPages = () => {
    if (recipes.value.length === 0) {
      pageLayouts.value = [];
      currentPageIndex.value = 0;
      return;
    }

    const layouts: PageLayout[] = [];
    const availableHeight = containerHeight.value;
    let currentPage: Recipe[] = [];
    let currentHeight = 0;
    let startIndex = 0;

    recipes.value.forEach((recipe, index) => {
      const recipeH = getRecipeHeight(recipe);

      // Check if adding this recipe would exceed available height
      if (currentPage.length > 0 && currentHeight + recipeH > availableHeight) {
        // Finish current page
        layouts.push({
          widgets: currentPage,
          startIndex,
          endIndex: index - 1
        });
        currentPage = [recipe];
        currentHeight = recipeH;
        startIndex = index;
      } else {
        currentPage.push(recipe);
        currentHeight += recipeH;
      }
    });

    // Add last page if it has recipes
    if (currentPage.length > 0) {
      layouts.push({
        widgets: currentPage,
        startIndex,
        endIndex: recipes.value.length - 1
      });
    }

    // Check if current page index is still valid
    if (currentPageIndex.value >= layouts.length) {
      currentPageIndex.value = Math.max(0, layouts.length - 1);
    }

    pageLayouts.value = layouts;
  };

  // Get recipe height (could be dynamic based on recipe type)
  const getRecipeHeight = (recipe: Recipe): number => {
    // Calculate based on number of input/output rows
    const inputRows = Math.ceil(
      recipe.inputs.reduce((sum, row) => sum + row.length, 0) / 3
    );
    const outputRows = Math.ceil(recipe.outputs.length / 3);
    const maxRows = Math.max(inputRows, outputRows);
    return maxRows * 18 + 16; // 18px per row + padding
  };

  // Navigate pages
  const nextPage = () => {
    if (currentPageIndex.value < numPages.value - 1) {
      currentPageIndex.value++;
    } else {
      currentPageIndex.value = 0; // Wrap around
    }
  };

  const prevPage = () => {
    if (currentPageIndex.value > 0) {
      currentPageIndex.value--;
    } else {
      currentPageIndex.value = Math.max(0, numPages.value - 1); // Wrap around
    }
  };

  const goToPage = (pageIndex: number) => {
    if (pageIndex >= 0 && pageIndex < numPages.value) {
      currentPageIndex.value = pageIndex;
    }
  };

  const goToRecipe = (recipeIndex: number) => {
    // Find which page contains this recipe
    for (let i = 0; i < pageLayouts.value.length; i++) {
      const layout = pageLayouts.value[i];
      if (recipeIndex >= layout.startIndex && recipeIndex <= layout.endIndex) {
        currentPageIndex.value = i;
        currentRecipeIndex.value = recipeIndex - layout.startIndex;
        return;
      }
    }
  };

  // Get page info text
  const pageInfo = computed(() => {
    if (numPages.value === 0) return '0/0';
    return `${currentPageIndex.value + 1}/${numPages.value}`;
  });

  // Get recipe indices on current page
  const getCurrentRecipeIndices = () => {
    const layout = pageLayouts.value[currentPageIndex.value];
    if (!layout) return [];
    const indices: number[] = [];
    for (let i = layout.startIndex; i <= layout.endIndex; i++) {
      indices.push(i);
    }
    return indices;
  };

  return {
    currentPageIndex,
    currentRecipeIndex,
    numPages,
    currentPageRecipes,
    pageInfo,
    buildPages,
    nextPage,
    prevPage,
    goToPage,
    goToRecipe,
    getCurrentRecipeIndices,
    getRecipeHeight
  };
}
