import { getLabPayload } from './devCompatClient';
import type { AnimatedAtlasAssetEntry, RenderContractAssetEntry } from './types';

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
};
