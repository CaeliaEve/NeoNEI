import { getLabPayload, postLabPayload } from './devCompatClient';
import type {
  SearchItemsFastOptions,
  indexedItemMachinesResponse,
  indexedItemRecipeSummaryResponse,
  indexedRecipe,
} from './types';

export type IndexedMachineRecipesResponse = {
  machineType: string;
  voltageTier: string;
  recipeCount: number;
  recipes: indexedRecipe[];
};

export const indexedRecipeRuntimeClient = {
  getItemSummary(itemId: string): Promise<indexedItemRecipeSummaryResponse> {
    return getLabPayload<indexedItemRecipeSummaryResponse>(
      `/recipes/item/${encodeURIComponent(itemId)}/summary`,
    );
  },

  getRecipe(recipeId: string): Promise<indexedRecipe> {
    return getLabPayload<indexedRecipe>(`/recipes/${recipeId}`);
  },

  getRecipesByIds(recipeIds: string[], options?: SearchItemsFastOptions): Promise<indexedRecipe[]> {
    return postLabPayload<indexedRecipe[], { recipeIds: string[] }>('/recipes/batch', { recipeIds }, {
      signal: options?.signal,
    });
  },

  getCraftingRecipes(itemId: string): Promise<indexedRecipe[]> {
    return getLabPayload<indexedRecipe[]>(`/recipes/${itemId}/crafting`);
  },

  getUsageRecipes(itemId: string): Promise<indexedRecipe[]> {
    return getLabPayload<indexedRecipe[]>(`/recipes/${itemId}/usage`);
  },

  getMachinesForItem(itemId: string): Promise<indexedItemMachinesResponse> {
    return getLabPayload<indexedItemMachinesResponse>(`/recipes/${itemId}/machines`);
  },

  getMachineTypes(): Promise<string[]> {
    return getLabPayload<string[]>('/recipes/machines/list');
  },

  getRecipesByMachine(machineType: string, voltageTier?: string): Promise<IndexedMachineRecipesResponse> {
    const params = voltageTier ? { voltageTier } : {};
    return getLabPayload<IndexedMachineRecipesResponse>(
      `/recipes/machines/${encodeURIComponent(machineType)}/recipes`,
      { params },
    );
  },
};
