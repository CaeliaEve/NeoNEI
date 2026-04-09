import {
  api,
  type Item,
  type Recipe,
  type RecipeBootstrapPayload,
  type indexedRecipe,
} from '../services/api';
import { convertIndexedRecipe } from '../domain/recipeNormalization';

type RecipeIndex = {
  usedInRecipes: string[];
  producedByRecipes: string[];
};

export interface RecipeBootstrapResult {
  item: Item;
  recipeIndex: RecipeIndex;
  recipes: {
    usedIn: Recipe[];
    producedBy: Recipe[];
  };
}

const appendIndexedRecipes = (target: Map<string, Recipe>, indexedRecipes: indexedRecipe[]): string[] => {
  const recipeIds: string[] = [];

  for (const indexedRecipe of indexedRecipes) {
    const recipe = convertIndexedRecipe(indexedRecipe);
    target.set(recipe.recipeId, recipe);
    recipeIds.push(recipe.recipeId);
  }

  return recipeIds;
};

const buildRecipeIndex = (
  indexedCraftingRecipeIds: string[],
  indexedUsageRecipeIds: string[],
): RecipeIndex => ({
  usedInRecipes: indexedUsageRecipeIds,
  producedByRecipes: indexedCraftingRecipeIds,
});

const orderRecipes = (recipeIds: string[], recipesById: Map<string, Recipe>): Recipe[] => {
  const ordered: Recipe[] = [];
  for (const recipeId of recipeIds) {
    const recipe = recipesById.get(recipeId);
    if (recipe) ordered.push(recipe);
  }
  return ordered;
};

export async function loadRecipeBootstrap(itemId: string): Promise<RecipeBootstrapResult> {
  const bootstrap: RecipeBootstrapPayload = await api.getRecipeBootstrap(itemId);
  const item = bootstrap.item;
  const indexedCrafting = bootstrap.indexedCrafting;
  const indexedUsage = bootstrap.indexedUsage;

  const recipesById = new Map<string, Recipe>();
  const indexedCraftingRecipeIds = appendIndexedRecipes(recipesById, indexedCrafting);
  const indexedUsageRecipeIds = appendIndexedRecipes(recipesById, indexedUsage);
  const recipeIndex = buildRecipeIndex(indexedCraftingRecipeIds, indexedUsageRecipeIds);

  return {
    item,
    recipeIndex,
    recipes: {
      usedIn: orderRecipes(recipeIndex.usedInRecipes, recipesById),
      producedBy: orderRecipes(recipeIndex.producedByRecipes, recipesById),
    },
  };
}
