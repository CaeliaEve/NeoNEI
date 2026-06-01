import { getLabPayload, postLabPayload } from './devCompatClient';
import type {
  SearchItemsFastOptions,
  indexedItemMachinesResponse,
  indexedItemRecipeSummaryResponse,
  indexedRecipe,
} from './types';
import { setCacheWithLimit } from './cacheUtils';

export type IndexedMachineRecipesResponse = {
  machineType: string;
  voltageTier: string;
  recipeCount: number;
  recipes: indexedRecipe[];
};

const CACHE_LIMITS = {
  crafting: 3000,
  usage: 3000,
  summary: 3000,
};

const craftingCache = new Map<string, indexedRecipe[]>();
const usageCache = new Map<string, indexedRecipe[]>();
const summaryCache = new Map<string, indexedItemRecipeSummaryResponse>();
const craftingInFlight = new Map<string, Promise<indexedRecipe[]>>();
const usageInFlight = new Map<string, Promise<indexedRecipe[]>>();
const summaryInFlight = new Map<string, Promise<indexedItemRecipeSummaryResponse>>();

function cachedRequest<T>(
  cache: Map<string, T>,
  inFlight: Map<string, Promise<T>>,
  cacheKey: string,
  limit: number,
  loader: () => Promise<T>,
): Promise<T> {
  const cached = cache.get(cacheKey);
  if (cached) {
    return Promise.resolve(cached);
  }
  const existingRequest = inFlight.get(cacheKey);
  if (existingRequest) {
    return existingRequest;
  }
  const request = loader()
    .then((payload) => {
      setCacheWithLimit(cache, cacheKey, payload, limit);
      return payload;
    })
    .finally(() => {
      inFlight.delete(cacheKey);
    });
  inFlight.set(cacheKey, request);
  return request;
}

export const indexedRecipeRuntimeClient = {
  clearCaches(): void {
    craftingCache.clear();
    usageCache.clear();
    summaryCache.clear();
    craftingInFlight.clear();
    usageInFlight.clear();
    summaryInFlight.clear();
  },

  getItemSummary(itemId: string): Promise<indexedItemRecipeSummaryResponse> {
    return cachedRequest(
      summaryCache,
      summaryInFlight,
      itemId,
      CACHE_LIMITS.summary,
      () => getLabPayload<indexedItemRecipeSummaryResponse>(
        `/recipes/item/${encodeURIComponent(itemId)}/summary`,
      ),
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
    return cachedRequest(
      craftingCache,
      craftingInFlight,
      itemId,
      CACHE_LIMITS.crafting,
      () => getLabPayload<indexedRecipe[]>(`/recipes/${itemId}/crafting`),
    );
  },

  getUsageRecipes(itemId: string): Promise<indexedRecipe[]> {
    return cachedRequest(
      usageCache,
      usageInFlight,
      itemId,
      CACHE_LIMITS.usage,
      () => getLabPayload<indexedRecipe[]>(`/recipes/${itemId}/usage`),
    );
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
