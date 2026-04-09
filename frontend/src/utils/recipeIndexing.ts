import type { Recipe } from '../services/api';

export interface RecipeIndexes {
  byInput: Map<string, Recipe[]>;
  byOutput: Map<string, Recipe[]>;
  byType: Map<string, Recipe[]>;
}

const pushIndexed = (index: Map<string, Recipe[]>, key: string, recipe: Recipe) => {
  const bucket = index.get(key);
  if (bucket) {
    bucket.push(recipe);
    return;
  }
  index.set(key, [recipe]);
};

const collectInputIds = (recipe: Recipe): Set<string> => {
  const ids = new Set<string>();

  for (const row of recipe.inputs || []) {
    if (!Array.isArray(row)) continue;
    for (const cell of row) {
      if (!cell) continue;

      if (Array.isArray(cell)) {
        for (const item of cell) {
          if (item?.itemId) {
            ids.add(item.itemId);
          }
        }
        continue;
      }

      if (typeof cell === 'object' && 'itemId' in cell) {
        const itemId = (cell as { itemId?: unknown }).itemId;
        if (typeof itemId === 'string' && itemId.length > 0) {
          ids.add(itemId);
        }
      }
    }
  }

  return ids;
};

const collectOutputIds = (recipe: Recipe): Set<string> => {
  const ids = new Set<string>();

  for (const output of recipe.outputs || []) {
    if (output?.itemId) {
      ids.add(output.itemId);
    }
  }

  return ids;
};

export const buildRecipeIndexes = (recipes: Recipe[]): RecipeIndexes => {
  const indexes: RecipeIndexes = {
    byInput: new Map<string, Recipe[]>(),
    byOutput: new Map<string, Recipe[]>(),
    byType: new Map<string, Recipe[]>(),
  };

  for (const recipe of recipes) {
    pushIndexed(indexes.byType, recipe.recipeType || 'unknown', recipe);

    for (const inputId of collectInputIds(recipe)) {
      pushIndexed(indexes.byInput, inputId, recipe);
    }

    for (const outputId of collectOutputIds(recipe)) {
      pushIndexed(indexes.byOutput, outputId, recipe);
    }
  }

  return indexes;
};
