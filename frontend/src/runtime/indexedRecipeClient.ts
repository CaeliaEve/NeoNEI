import type {
  SearchItemsFastOptions,
  RecipeUiPayload,
  indexedRecipe,
} from './types';
import { setCacheWithLimit } from './cacheUtils';
import { http } from '../services/api/core/http';

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
  page: 3000,
};

const pageCache = new Map<string, CurrentRecipePageResponse>();
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
    pageCache.clear();
    pageInFlight.clear();
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

  async getRecipesByIds(recipeIds: string[], options?: SearchItemsFastOptions): Promise<indexedRecipe[]> {
    const uniqueIds = Array.from(new Set(recipeIds.map((id) => `${id ?? ''}`.trim()).filter(Boolean)));
    if (uniqueIds.length === 0) {
      return [];
    }
    const pages = await Promise.all(uniqueIds.map((recipeId) => this.getCurrentRecipePage(recipeId, options)));
    const byId = new Map(pages.map((page) => [page.recipe.id, page.recipe]));
    return recipeIds
      .map((recipeId) => byId.get(`${recipeId ?? ''}`.trim()))
      .filter((recipe): recipe is indexedRecipe => Boolean(recipe));
  },
};
