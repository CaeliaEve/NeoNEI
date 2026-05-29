import type { BrowserAtlasIndexResponse } from './types';
import { getDistDataBrowserAtlasIndex } from '../services/distDataRuntime';

export function createTextureRuntimeClient(options: {
  getCachedAtlasIndex: () => BrowserAtlasIndexResponse | null;
  setCachedAtlasIndex: (index: BrowserAtlasIndexResponse) => void;
  getAtlasIndexInFlight: () => Promise<BrowserAtlasIndexResponse | null> | null;
  setAtlasIndexInFlight: (request: Promise<BrowserAtlasIndexResponse | null> | null) => void;
  getAtlasEntriesInFlight: (key: string) => Promise<BrowserAtlasIndexResponse | null> | undefined;
  setAtlasEntriesInFlight: (key: string, request: Promise<BrowserAtlasIndexResponse | null>) => void;
  deleteAtlasEntriesInFlight: (key: string) => void;
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

    const request = Promise.resolve(null).finally(() => {
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
      return {
        ...index,
        schemaVersion: 'browser-atlas-entries',
        items: index.items.filter((entry) => wanted.has(entry.itemId)),
      };
    })().finally(() => {
      options.deleteAtlasEntriesInFlight(cacheKey);
    });

    options.setAtlasEntriesInFlight(cacheKey, request);
    return request;
  }

  return { getBrowserAtlasIndex, getBrowserAtlasEntries };
}

