import type { Ref } from 'vue';
import type { Recipe } from '../../services/api';
import { convertIndexedRecipe } from '../../domain/recipeNormalization';

type RecipeLists = {
  producedBy: Recipe[];
  usedIn: Recipe[];
};

type BootstrapRecipeIndex = {
  usedInRecipes: string[];
  producedByRecipes: string[];
};

export function createRecipeMergeState(options: {
  recipes: Ref<RecipeLists>;
  bootstrapRecipeIndex: Ref<BootstrapRecipeIndex>;
  pendingProducedByRecipeIds: Ref<string[]>;
  pendingUsageRecipeIds: Ref<string[]>;
  rebuildIndexesAndGraphs: () => void;
}) {
  const applyMergedRecipes = (mergedById: Map<string, Recipe>) => {
    const producedBy = options.bootstrapRecipeIndex.value.producedByRecipes
      .map((recipeId) => mergedById.get(recipeId))
      .filter((recipe): recipe is Recipe => Boolean(recipe));
    const usedIn = options.bootstrapRecipeIndex.value.usedInRecipes
      .map((recipeId) => mergedById.get(recipeId))
      .filter((recipe): recipe is Recipe => Boolean(recipe));

    options.recipes.value = { producedBy, usedIn };
    options.rebuildIndexesAndGraphs();
  };

  const mergeIndexedRecipesIntoState = (indexedRecipes: Array<{ id: string } & Record<string, unknown>>) => {
    const mergedById = new Map<string, Recipe>();
    for (const recipe of [...options.recipes.value.producedBy, ...options.recipes.value.usedIn]) {
      mergedById.set(recipe.recipeId, recipe);
    }
    for (const indexedRecipe of indexedRecipes) {
      const normalizedRecipe = convertIndexedRecipe(indexedRecipe as never);
      mergedById.set(normalizedRecipe.recipeId, normalizedRecipe);
    }
    applyMergedRecipes(mergedById);
  };

  const removePendingRecipeIds = (kind: 'producedBy' | 'usedIn', recipeIds: string[]) => {
    if (recipeIds.length === 0) return;
    const next = new Set(recipeIds.map((recipeId) => recipeId.trim()).filter(Boolean));
    if (kind === 'producedBy') {
      options.pendingProducedByRecipeIds.value = options.pendingProducedByRecipeIds.value.filter((recipeId) => !next.has(recipeId));
      return;
    }
    options.pendingUsageRecipeIds.value = options.pendingUsageRecipeIds.value.filter((recipeId) => !next.has(recipeId));
  };

  const removePendingRecipeIdsFromAll = (recipeIds: string[]) => {
    removePendingRecipeIds('producedBy', recipeIds);
    removePendingRecipeIds('usedIn', recipeIds);
  };

  return {
    applyMergedRecipes,
    mergeIndexedRecipesIntoState,
    removePendingRecipeIds,
    removePendingRecipeIdsFromAll,
  };
}
