import { api, type Item } from './api';

export interface PageAtlasSpriteEntry {
  atlasUrl: string;
  atlasWidth: number;
  atlasHeight: number;
  slotSize: number;
  x: number;
  y: number;
}

export interface PageAtlasResult {
  atlasUrl: string;
  atlasWidth: number;
  atlasHeight: number;
  slotSize: number;
  entries: Record<string, PageAtlasSpriteEntry>;
}

const atlasCache = new Map<string, PageAtlasResult | null>();
const atlasInFlight = new Map<string, Promise<PageAtlasResult | null>>();

function createAtlasKey(items: Pick<Item, 'itemId'>[], itemSize: number): string {
  return `${itemSize}:${items.map((item) => item.itemId).join('|')}`;
}

export async function buildPageAtlas(items: Item[], itemSize: number): Promise<PageAtlasResult | null> {
  if (items.length === 0) return null;

  const slotSize = Math.max(32, Math.ceil(itemSize * 0.9));
  const key = createAtlasKey(items, slotSize);
  const cached = atlasCache.get(key);
  if (cached !== undefined) {
    return cached;
  }

  const inFlight = atlasInFlight.get(key);
  if (inFlight) {
    return inFlight;
  }

  const request = api
    .postPageAtlas(items.map((item) => item.itemId), slotSize)
    .then((result) => {
      atlasCache.set(key, result);
      return result;
    })
    .catch(() => {
      atlasCache.set(key, null);
      return null;
    })
    .finally(() => {
      atlasInFlight.delete(key);
    });

  atlasInFlight.set(key, request);
  return request;
}

export async function primePageAtlas(items: Item[], itemSize: number): Promise<void> {
  await buildPageAtlas(items, itemSize);
}
