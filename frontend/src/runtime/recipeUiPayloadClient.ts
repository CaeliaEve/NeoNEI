import type { RecipeUiPayload } from './types';
import { getRuntimeRecipeUiPayload } from './recipeClient';
import { setCacheWithLimit } from './cacheUtils';

type RecipeUiPayloadClientOptions = {
  resolveRuntimeSignature: () => Promise<string | null>;
  reportMissing: (payload: {
    recipeId: string;
    runtimeCacheKey?: string | null;
    message: string;
    details?: Record<string, unknown>;
  }) => void;
};

export function createRecipeUiPayloadClient(options: RecipeUiPayloadClientOptions) {
  const uiPayloadCache = new Map<string, RecipeUiPayload>();
  const uiPayloadInFlight = new Map<string, Promise<RecipeUiPayload | null>>();
  const missingUiPayloadCache = new Set<string>();

  function clearCaches(): void {
    uiPayloadCache.clear();
    uiPayloadInFlight.clear();
    missingUiPayloadCache.clear();
  }

  async function getOptionalRecipeUiPayload(recipeId: string): Promise<RecipeUiPayload | null> {
    const cached = uiPayloadCache.get(recipeId);
    if (cached) {
      return cached;
    }
    if (missingUiPayloadCache.has(recipeId)) {
      return null;
    }
    const existingRequest = uiPayloadInFlight.get(recipeId);
    if (existingRequest) {
      return existingRequest;
    }

    const request = (async () => {
      const distDataPayload = await getRuntimeRecipeUiPayload(recipeId);
      if (distDataPayload) {
        missingUiPayloadCache.delete(recipeId);
        setCacheWithLimit(uiPayloadCache, recipeId, distDataPayload, 256);
        return distDataPayload;
      }
      const runtimeSignature = await options.resolveRuntimeSignature();
      missingUiPayloadCache.add(recipeId);
      options.reportMissing({
        recipeId,
        runtimeCacheKey: runtimeSignature,
        message: 'Recipe UI payload is missing from compiled runtime artifacts',
        details: {
          authority: 'dist-data recipe UI payload index',
        },
      });
      return null;
    })().finally(() => {
      uiPayloadInFlight.delete(recipeId);
    });
    uiPayloadInFlight.set(recipeId, request);
    return request;
  }

  async function getRecipeUiPayload(recipeId: string): Promise<RecipeUiPayload> {
    const payload = await getOptionalRecipeUiPayload(recipeId);
    if (!payload) {
      throw new Error(`Missing recipe UI payload for ${recipeId}`);
    }
    return payload;
  }

  return {
    clearCaches,
    getOptionalRecipeUiPayload,
    getRecipeUiPayload,
  };
}
