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
  appendIndexedRecipes(recipesById, indexedCrafting);
  appendIndexedRecipes(recipesById, indexedUsage);

  const recipeIndex: RecipeIndex = {
    usedInRecipes: Array.isArray(bootstrap.recipeIndex?.usedInRecipes) ? bootstrap.recipeIndex.usedInRecipes : [],
    producedByRecipes: Array.isArray(bootstrap.recipeIndex?.producedByRecipes) ? bootstrap.recipeIndex.producedByRecipes : [],
  };

  const missingRecipeIds = Array.from(
    new Set(
      [...recipeIndex.producedByRecipes, ...recipeIndex.usedInRecipes].filter((recipeId) => !recipesById.has(recipeId)),
    ),
  );

  if (missingRecipeIds.length > 0) {
    const missingRecipes = await api.getIndexedRecipesByIds(missingRecipeIds);
    appendIndexedRecipes(recipesById, missingRecipes);
  }

  return {
    item,
    recipeIndex,
    recipes: {
      usedIn: orderRecipes(recipeIndex.usedInRecipes, recipesById),
      producedBy: orderRecipes(recipeIndex.producedByRecipes, recipesById),
    },
  };
}
