import type { Item } from './api';

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

export function peekPageAtlas(_items: Pick<Item, 'itemId'>[], _itemSize: number): PageAtlasResult | null {
  // Runtime V3 renders the homepage browser from the global atlas only.
  // Page-scoped atlases are intentionally not hydrated here because they
  // reintroduce per-page texture work and hide NESQL++ atlas coverage gaps.
  return null;
}
