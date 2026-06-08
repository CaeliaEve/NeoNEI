import { getLabPayload, postLabPayload } from './devCompatClient';
import type {
  SearchItemsFastOptions,
  RecipeUiPayload,
  indexedItemMachinesResponse,
  indexedItemRecipeSummaryResponse,
  indexedRecipe,
} from './types';
import { setCacheWithLimit } from './cacheUtils';
import { http } from '../services/api/core/http';

export type IndexedMachineRecipesResponse = {
  machineType: string;
  voltageTier: string;
  recipeCount: number;
  recipes: indexedRecipe[];
};

export type CurrentRecipePageResponse = {
  recipePageId: string;
  recipe: indexedRecipe;
  uiPayload: RecipeUiPayload | null;
};

type CurrentApiEnvelope<T> = {
  ok?: boolean;
  data?: T;
};

const CACHE_LIMITS = {
  crafting: 3000,
  usage: 3000,
  summary: 3000,
  page: 3000,
};

const craftingCache = new Map<string, indexedRecipe[]>();
const usageCache = new Map<string, indexedRecipe[]>();
const summaryCache = new Map<string, indexedItemRecipeSummaryResponse>();
const pageCache = new Map<string, CurrentRecipePageResponse>();
const craftingInFlight = new Map<string, Promise<indexedRecipe[]>>();
const usageInFlight = new Map<string, Promise<indexedRecipe[]>>();
const summaryInFlight = new Map<string, Promise<indexedItemRecipeSummaryResponse>>();
const pageInFlight = new Map<string, Promise<CurrentRecipePageResponse>>();

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
    pageCache.clear();
    craftingInFlight.clear();
    usageInFlight.clear();
    summaryInFlight.clear();
    pageInFlight.clear();
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

  getCurrentRecipePage(recipePageId: string, options?: SearchItemsFastOptions): Promise<CurrentRecipePageResponse> {
    const normalizedRecipePageId = `${recipePageId ?? ''}`.trim();
    return cachedRequest(
      pageCache,
      pageInFlight,
      normalizedRecipePageId,
      CACHE_LIMITS.page,
      async () => {
        const response = await http.get<CurrentApiEnvelope<CurrentRecipePageResponse>>(
          `/recipes/page/${encodeURIComponent(normalizedRecipePageId)}`,
          { signal: options?.signal },
        );
        const payload = response.data?.data;
        if (!payload?.recipe) {
          throw new Error(`Current recipe page API returned no recipe for ${normalizedRecipePageId}`);
        }
        return payload;
      },
    );
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
