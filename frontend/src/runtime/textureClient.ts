import type { BrowserAtlasIndexResponse } from './types';
import { getDistDataBrowserAtlasIndex } from '../services/distDataRuntime';
import { reportMissingRuntimeAsset } from './diagnostics';

export function createTextureRuntimeClient(options: {
  getCachedAtlasIndex: () => BrowserAtlasIndexResponse | null;
  setCachedAtlasIndex: (index: BrowserAtlasIndexResponse) => void;
  getAtlasIndexInFlight: () => Promise<BrowserAtlasIndexResponse | null> | null;
  setAtlasIndexInFlight: (request: Promise<BrowserAtlasIndexResponse | null> | null) => void;
  getAtlasEntriesInFlight: (key: string) => Promise<BrowserAtlasIndexResponse | null> | undefined;
  setAtlasEntriesInFlight: (key: string, request: Promise<BrowserAtlasIndexResponse | null>) => void;
  deleteAtlasEntriesInFlight: (key: string) => void;
  getDiagnosticIdentity?: () => { sourceSignature?: string | null; runtimeCacheKey?: string | null };
}) {
  async function getBrowserAtlasIndex(): Promise<BrowserAtlasIndexResponse | null> {
    const distDataAtlasIndex = await getDistDataBrowserAtlasIndex();
    if (distDataAtlasIndex?.items?.length) {
      options.setCachedAtlasIndex(distDataAtlasIndex);
      return distDataAtlasIndex;
    }

    const cached = options.getCachedAtlasIndex();
    if (cached) {
      return cached;
    }

    const existing = options.getAtlasIndexInFlight();
    if (existing) {
      return existing;
    }

    const request = Promise.resolve(null).then(() => {
      reportMissingRuntimeAsset({
        assetId: 'browser-atlas-index',
        path: 'dist-data:textures/browser-atlas-index',
        message: 'Browser atlas index is unavailable',
        ...options.getDiagnosticIdentity?.(),
      });
      return null;
    }).finally(() => {
      options.setAtlasIndexInFlight(null);
    });
    options.setAtlasIndexInFlight(request);
    return request;
  }

  async function getBrowserAtlasEntries(itemIds: string[]): Promise<BrowserAtlasIndexResponse | null> {
    const uniqueItemIds = Array.from(new Set(itemIds.map((itemId) => `${itemId ?? ''}`.trim()).filter(Boolean)));
    if (uniqueItemIds.length === 0) {
      return {
        schemaVersion: 'browser-atlas-entries',
        items: [],
      };
    }

    const cacheKey = uniqueItemIds.slice().sort().join('\n');
    const existing = options.getAtlasEntriesInFlight(cacheKey);
    if (existing) {
      return existing;
    }

    const request = (async () => {
      const index = await getBrowserAtlasIndex();
      if (!index?.items?.length) {
        return null;
      }
      const wanted = new Set(uniqueItemIds);
      const items = index.items.filter((entry) => wanted.has(entry.itemId));
      const found = new Set(items.map((entry) => entry.itemId));
      for (const itemId of uniqueItemIds) {
        if (!found.has(itemId)) {
          reportMissingRuntimeAsset({
            assetId: itemId,
            itemId,
            path: 'dist-data:textures/browser-atlas-index',
            message: 'Browser atlas entry is unavailable for item',
            ...options.getDiagnosticIdentity?.(),
          });
        }
      }
      return {
        ...index,
        schemaVersion: 'browser-atlas-entries',
        items,
      };
    })().finally(() => {
      options.deleteAtlasEntriesInFlight(cacheKey);
    });

    options.setAtlasEntriesInFlight(cacheKey, request);
    return request;
  }

  return { getBrowserAtlasIndex, getBrowserAtlasEntries };
}

