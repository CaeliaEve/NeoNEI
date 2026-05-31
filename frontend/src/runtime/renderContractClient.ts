import { getLabPayload } from './devCompatClient';
import type { AnimatedAtlasAssetEntry, RenderContractAssetEntry, RecipeUiPayload } from './types';

export const renderContractRuntimeClient = {
  getAnimatedAtlasEntry(assetId: string): Promise<AnimatedAtlasAssetEntry> {
    return getLabPayload<AnimatedAtlasAssetEntry>('/render-contract/animated-atlas', {
      params: { assetId },
    });
  },

  getAsset(assetId: string): Promise<RenderContractAssetEntry> {
    return getLabPayload<RenderContractAssetEntry>('/render-contract/asset', {
      params: { assetId },
    });
  },

  getRecipeUiPayload(recipeId: string): Promise<RecipeUiPayload> {
    return getLabPayload<RecipeUiPayload>('/render-contract/ui-payload', {
      params: { recipeId },
    });
  },
};
