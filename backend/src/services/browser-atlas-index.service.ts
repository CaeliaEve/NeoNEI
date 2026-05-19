import fs from 'fs';
import { NESQL_BROWSER_ATLAS_INDEX_FILE } from '../config/runtime-paths';
import { notFound } from '../utils/http';

export interface BrowserAtlasStaticPlacement {
  atlasGroup?: string | null;
  atlasFile?: string | null;
  atlasWidth?: number | null;
  atlasHeight?: number | null;
  x?: number | null;
  y?: number | null;
  width?: number | null;
  height?: number | null;
  sourcePath?: string | null;
}

export interface BrowserAtlasAnimatedFrame {
  index?: number;
  frameIndex?: number;
  timelineIndex?: number;
  durationMs?: number;
  sourcePath?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}

export interface BrowserAtlasAnimatedPlacement {
  atlasGroup?: string | null;
  atlasFile?: string | null;
  atlasWidth?: number | null;
  atlasHeight?: number | null;
  variantKey?: string | null;
  frameDurationMs?: number | null;
  loopMode?: string | null;
  frameCount?: number | null;
  frames?: BrowserAtlasAnimatedFrame[] | null;
  timeline?: BrowserAtlasAnimatedFrame[] | null;
}

export interface BrowserAtlasItemEntry {
  itemId: string;
  assetId?: string | null;
  variantKey?: string | null;
  mode?: string | null;
  renderMode?: string | null;
  resolutionMode?: string | null;
  rendererFamily?: string | null;
  playbackHint?: string | null;
  hasStaticAtlas?: boolean;
  hasAnimatedAtlas?: boolean;
  staticAtlas?: BrowserAtlasStaticPlacement | null;
  animatedAtlas?: BrowserAtlasAnimatedPlacement | null;
}

export interface BrowserAtlasIndexResponse {
  schemaVersion?: string;
  generatedAt?: number;
  staticAtlasManifest?: string | null;
  animatedAtlasManifest?: string | null;
  renderIndex?: string | null;
  itemCount?: number;
  animatedItemCount?: number;
  missingAtlasCount?: number;
  items: BrowserAtlasItemEntry[];
}

export class BrowserAtlasIndexService {
  private cache: { mtimeMs: number; payload: BrowserAtlasIndexResponse } | null = null;

  getIndex(): BrowserAtlasIndexResponse {
    const filePath = NESQL_BROWSER_ATLAS_INDEX_FILE;
    if (!filePath || !fs.existsSync(filePath)) {
      throw notFound('NESQL++ browser atlas index is not available. Re-export with a build that writes canonical/browser-atlas-index.json.');
    }

    const stat = fs.statSync(filePath);
    if (this.cache && this.cache.mtimeMs === stat.mtimeMs) {
      return this.cache.payload;
    }

    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as Partial<BrowserAtlasIndexResponse>;
    const payload: BrowserAtlasIndexResponse = {
      ...parsed,
      items: Array.isArray(parsed.items)
        ? parsed.items.filter((entry): entry is BrowserAtlasItemEntry => Boolean(entry?.itemId))
        : [],
    };
    this.cache = { mtimeMs: stat.mtimeMs, payload };
    return payload;
  }
}

let instance: BrowserAtlasIndexService | null = null;

export function getBrowserAtlasIndexService(): BrowserAtlasIndexService {
  if (!instance) {
    instance = new BrowserAtlasIndexService();
  }
  return instance;
}
