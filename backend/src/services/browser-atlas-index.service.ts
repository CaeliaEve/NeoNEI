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
type CompactBrowserAtlasFrame = [number, number, number?, number?, number?];

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
  private itemMapCache: { mtimeMs: number; itemMap: Map<string, BrowserAtlasItemEntry>; meta: Omit<BrowserAtlasIndexResponse, 'items'> } | null = null;

  getIndex(): BrowserAtlasIndexResponse {
    const { mtimeMs, itemMap, meta } = this.getItemMap();
    const payload: BrowserAtlasIndexResponse = {
      ...meta,
      items: Array.from(itemMap.values()),
    };
    this.cache = { mtimeMs, payload };
    return payload;
  }

  getEntries(itemIds: string[]): BrowserAtlasIndexResponse {
    const { itemMap, meta } = this.getItemMap();
    const items: BrowserAtlasItemEntry[] = [];
    const seen = new Set<string>();
    for (const rawItemId of itemIds) {
      const itemId = String(rawItemId || '').trim();
      if (!itemId || seen.has(itemId)) {
        continue;
      }
      seen.add(itemId);
      const entry = this.getEntryWithAliases(itemMap, itemId);
      if (entry) {
        // Return the requested id as the key even when it was resolved through a
        // GTNH/NEI variant alias. The old full-index frontend could resolve
        // these locally; the new page-scoped API must preserve that behavior or
        // hashed/NBT variants render as missing placeholders.
        items.push(entry.itemId === itemId ? entry : { ...entry, itemId });
      }
    }
    return {
      ...meta,
      items,
    };
  }

  private getItemMap(): { mtimeMs: number; itemMap: Map<string, BrowserAtlasItemEntry>; meta: Omit<BrowserAtlasIndexResponse, 'items'> } {
    const filePath = NESQL_BROWSER_ATLAS_INDEX_FILE;
    if (!filePath || !fs.existsSync(filePath)) {
      throw notFound('NESQL++ browser atlas index is not available. Re-export with a build that writes canonical/browser-atlas-index.json.');
    }

    const stat = fs.statSync(filePath);
    if (this.itemMapCache && this.itemMapCache.mtimeMs === stat.mtimeMs) {
      return this.itemMapCache;
    }

    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as Partial<BrowserAtlasIndexResponse>;
    const meta: Omit<BrowserAtlasIndexResponse, 'items'> = {
      schemaVersion: parsed.schemaVersion,
      generatedAt: parsed.generatedAt,
      staticAtlasManifest: parsed.staticAtlasManifest ?? null,
      animatedAtlasManifest: parsed.animatedAtlasManifest ?? null,
      renderIndex: parsed.renderIndex ?? null,
      itemCount: parsed.itemCount,
      animatedItemCount: parsed.animatedItemCount,
      missingAtlasCount: parsed.missingAtlasCount,
    };
    const items = Array.isArray(parsed.items)
      ? parsed.items
          .filter((entry): entry is BrowserAtlasItemEntry => Boolean(entry?.itemId))
          .map((entry) => this.toCompactEntry(entry))
      : [];
    const itemMap = new Map<string, BrowserAtlasItemEntry>();
    for (const item of items) {
      itemMap.set(item.itemId, item);
    }
    this.itemMapCache = { mtimeMs: stat.mtimeMs, itemMap, meta };
    this.cache = null;
    return this.itemMapCache;
  }

  private toCompactEntry(entry: BrowserAtlasItemEntry): BrowserAtlasItemEntry {
    const staticAtlas = entry.staticAtlas?.atlasFile
      ? {
        atlasFile: entry.staticAtlas.atlasFile,
        x: entry.staticAtlas.x,
        y: entry.staticAtlas.y,
        width: entry.staticAtlas.width,
        height: entry.staticAtlas.height,
      }
      : null;
    const animatedAtlas = entry.animatedAtlas?.atlasFile
      ? {
        atlasFile: entry.animatedAtlas.atlasFile,
        frameDurationMs: entry.animatedAtlas.frameDurationMs,
        frameCount: entry.animatedAtlas.frameCount,
        frames: this.toCompactFrames(entry.animatedAtlas.frames),
        timeline: this.toCompactTimeline(entry.animatedAtlas.timeline),
      } as unknown as BrowserAtlasAnimatedPlacement
      : null;

    return {
      itemId: entry.itemId,
      hasStaticAtlas: Boolean(staticAtlas),
      hasAnimatedAtlas: Boolean(animatedAtlas),
      staticAtlas,
      animatedAtlas,
    };
  }

  private toCompactFrames(frames?: BrowserAtlasAnimatedFrame[] | null): CompactBrowserAtlasFrame[] {
    return (frames ?? [])
      .map((frame) => [
        Number(frame.index ?? 0),
        Number(frame.x ?? 0),
        Number(frame.y ?? 0),
        Number(frame.width ?? 0),
        Number(frame.height ?? 0),
      ] as CompactBrowserAtlasFrame)
      .filter((frame) => Number.isFinite(frame[0]) && Number(frame[3] ?? 0) > 0 && Number(frame[4] ?? 0) > 0);
  }

  private toCompactTimeline(frames?: BrowserAtlasAnimatedFrame[] | null): CompactBrowserAtlasFrame[] {
    return (frames ?? [])
      .map((frame, index) => [
        Number(frame.frameIndex ?? frame.index ?? index),
        Number(frame.durationMs ?? 50),
      ] as CompactBrowserAtlasFrame)
      .filter((frame) => Number.isFinite(frame[0]) && Number(frame[1]) > 0);
  }

  private getEntryWithAliases(itemMap: Map<string, BrowserAtlasItemEntry>, itemId: string): BrowserAtlasItemEntry | null {
    const exact = itemMap.get(itemId);
    if (exact) {
      return exact;
    }
    for (const alias of this.getItemIdAliases(itemId)) {
      const entry = itemMap.get(alias);
      if (entry) {
        return entry;
      }
    }
    return null;
  }

  private getItemIdAliases(itemId: string): string[] {
    const normalized = String(itemId || '').trim();
    if (!normalized) {
      return [];
    }
    const aliases: string[] = [];
    const parts = normalized.split('~');
    if (parts.length >= 4 && parts[0] === 'i') {
      aliases.push(parts.slice(0, 4).join('~'));
      aliases.push([parts[0], parts[1], parts[2], '0'].join('~'));
    }
    return Array.from(new Set(aliases.filter((alias) => alias && alias !== normalized)));
  }
}

let instance: BrowserAtlasIndexService | null = null;

export function getBrowserAtlasIndexService(): BrowserAtlasIndexService {
  if (!instance) {
    instance = new BrowserAtlasIndexService();
  }
  return instance;
}
