import fs from 'fs';
import {
  NESQL_ANIMATED_ATLAS_MANIFEST_FILE,
  NESQL_ATLAS_MANIFEST_FILE,
  NESQL_BROWSER_ATLAS_INDEX_FILE,
  NESQL_BROWSER_LAYOUT_INDEX_FILE,
} from '../config/runtime-paths';
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
  layoutCoverage?: BrowserAtlasLayoutCoverage;
  items: BrowserAtlasItemEntry[];
}

export interface BrowserAtlasLayoutCoverage {
  layoutItemCount: number;
  atlasItemCount: number;
  coveredLayoutItemCount: number;
  missingLayoutItemCount: number;
  missingLayoutItemIds: string[];
}

interface AnimatedAtlasManifestAsset {
  assetId?: string | null;
  variantKey?: string | null;
  frameDurationMs?: number | null;
  loopMode?: string | null;
  frameCount?: number | null;
  frames?: BrowserAtlasAnimatedFrame[] | null;
  timeline?: BrowserAtlasAnimatedFrame[] | null;
}

interface AnimatedAtlasManifestGroup {
  atlasGroup?: string | null;
  atlasFile?: string | null;
  assets?: AnimatedAtlasManifestAsset[] | null;
}

interface AnimatedAtlasManifest {
  groups?: AnimatedAtlasManifestGroup[] | null;
}

interface StaticAtlasManifestAsset {
  assetId?: string | null;
  variantKey?: string | null;
  sourcePath?: string | null;
  x?: number | string | { value?: unknown } | null;
  y?: number | string | { value?: unknown } | null;
  width?: number | string | { value?: unknown } | null;
  height?: number | string | { value?: unknown } | null;
}

interface StaticAtlasManifestGroup {
  atlasGroup?: string | null;
  atlasFile?: string | null;
  width?: number | string | { value?: unknown } | null;
  height?: number | string | { value?: unknown } | null;
  assets?: StaticAtlasManifestAsset[] | null;
}

interface StaticAtlasManifest {
  groups?: StaticAtlasManifestGroup[] | null;
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

  hasEntryForItemId(itemId: string): boolean {
    const { itemMap } = this.getItemMap();
    return Boolean(this.getEntryWithAliases(itemMap, itemId));
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
    for (const [itemId, item] of this.getAuxiliaryAnimatedEntries()) {
      const existing = itemMap.get(itemId);
      if (!existing || this.shouldPreferAuxiliaryAnimatedEntry(existing)) {
        itemMap.set(itemId, item);
      }
    }
    for (const [itemId, item] of this.getAuxiliaryStaticEntries()) {
      if (!itemMap.has(itemId)) {
        itemMap.set(itemId, item);
      }
    }
    meta.layoutCoverage = this.computeLayoutCoverage(itemMap);
    this.itemMapCache = { mtimeMs: stat.mtimeMs, itemMap, meta };
    this.cache = null;
    return this.itemMapCache;
  }

  private computeLayoutCoverage(itemMap: Map<string, BrowserAtlasItemEntry>): BrowserAtlasLayoutCoverage | undefined {
    if (!NESQL_BROWSER_LAYOUT_INDEX_FILE || !fs.existsSync(NESQL_BROWSER_LAYOUT_INDEX_FILE)) {
      return undefined;
    }

    try {
      const parsed = JSON.parse(fs.readFileSync(NESQL_BROWSER_LAYOUT_INDEX_FILE, 'utf-8')) as {
        items?: Array<{ itemId?: unknown }>;
        defaultEntries?: Array<{ itemId?: unknown; representativeItemId?: unknown }>;
      };
      const layoutItemIds = new Set<string>();
      for (const entry of parsed.items ?? []) {
        const itemId = `${entry?.itemId ?? ''}`.trim();
        if (itemId) layoutItemIds.add(itemId);
      }
      for (const entry of parsed.defaultEntries ?? []) {
        const itemId = `${entry?.representativeItemId ?? entry?.itemId ?? ''}`.trim();
        if (itemId) layoutItemIds.add(itemId);
      }

      const missingLayoutItemIds: string[] = [];
      let coveredLayoutItemCount = 0;
      for (const itemId of layoutItemIds) {
        const entry = this.getEntryWithAliases(itemMap, itemId);
        if (entry?.staticAtlas?.atlasFile || entry?.animatedAtlas?.atlasFile) {
          coveredLayoutItemCount += 1;
        } else if (missingLayoutItemIds.length < 100) {
          missingLayoutItemIds.push(itemId);
        }
      }

      return {
        layoutItemCount: layoutItemIds.size,
        atlasItemCount: itemMap.size,
        coveredLayoutItemCount,
        missingLayoutItemCount: layoutItemIds.size - coveredLayoutItemCount,
        missingLayoutItemIds,
      };
    } catch {
      return undefined;
    }
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
      assetId: entry.assetId ?? null,
      variantKey: entry.variantKey ?? null,
      mode: entry.mode ?? null,
      renderMode: entry.renderMode ?? null,
      resolutionMode: entry.resolutionMode ?? null,
      rendererFamily: entry.rendererFamily ?? null,
      playbackHint: entry.playbackHint ?? null,
      hasStaticAtlas: Boolean(staticAtlas),
      hasAnimatedAtlas: Boolean(animatedAtlas),
      staticAtlas,
      animatedAtlas,
    };
  }

  private shouldPreferAuxiliaryAnimatedEntry(existing: BrowserAtlasItemEntry): boolean {
    if (!existing?.animatedAtlas?.atlasFile) {
      return true;
    }
    if (existing.mode === 'rendered_frames' || existing.resolutionMode === 'animated_frame_sequence') {
      return false;
    }
    return false;
  }

  private toCompactFrames(frames?: BrowserAtlasAnimatedFrame[] | null): CompactBrowserAtlasFrame[] {
    return (frames ?? [])
      .map((frame) => [
        this.toNumber(frame.index, 0),
        this.toNumber(frame.x, 0),
        this.toNumber(frame.y, 0),
        this.toNumber(frame.width, 0),
        this.toNumber(frame.height, 0),
      ] as CompactBrowserAtlasFrame)
      .filter((frame) => Number.isFinite(frame[0]) && Number(frame[3] ?? 0) > 0 && Number(frame[4] ?? 0) > 0);
  }

  private toCompactTimeline(frames?: BrowserAtlasAnimatedFrame[] | null): CompactBrowserAtlasFrame[] {
    return (frames ?? [])
      .map((frame, index) => [
        this.toNumber(frame.frameIndex ?? frame.index, index),
        this.toNumber(frame.durationMs, 50),
      ] as CompactBrowserAtlasFrame)
      .filter((frame) => Number.isFinite(frame[0]) && Number(frame[1]) > 0);
  }

  private toNumber(value: unknown, defaultValue: number): number {
    if (typeof value === 'number') {
      return Number.isFinite(value) ? value : defaultValue;
    }
    if (typeof value === 'string') {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : defaultValue;
    }
    if (value && typeof value === 'object' && 'value' in value) {
      return this.toNumber((value as { value?: unknown }).value, defaultValue);
    }
    return defaultValue;
  }

  private getAuxiliaryAnimatedEntries(): Map<string, BrowserAtlasItemEntry> {
    const entries = new Map<string, BrowserAtlasItemEntry>();
    const filePath = NESQL_ANIMATED_ATLAS_MANIFEST_FILE;
    if (!filePath || !fs.existsSync(filePath)) {
      return entries;
    }

    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as AnimatedAtlasManifest;
    const groups = Array.isArray(parsed.groups) ? parsed.groups : [];
    for (const group of groups) {
      const atlasFile = `${group?.atlasFile ?? ''}`.trim();
      const assets = Array.isArray(group?.assets) ? group.assets : [];
      if (!atlasFile || assets.length === 0) {
        continue;
      }

      for (const asset of assets) {
        const assetId = `${asset?.assetId ?? ''}`.trim();
        const itemId = this.itemIdFromRenderAssetRef(assetId);
        if (!itemId) {
          continue;
        }

        const animatedAtlas: BrowserAtlasAnimatedPlacement = {
          atlasGroup: group.atlasGroup ?? null,
          atlasFile,
          variantKey: asset.variantKey ?? null,
          frameDurationMs: asset.frameDurationMs ?? null,
          loopMode: asset.loopMode ?? null,
          frameCount: asset.frameCount ?? null,
          frames: asset.frames ?? null,
          timeline: asset.timeline ?? null,
        };
        entries.set(itemId, this.toCompactEntry({
          itemId,
          assetId,
          variantKey: asset.variantKey ?? null,
          mode: 'native_sprite_animation',
          renderMode: 'native_sprite',
          resolutionMode: 'native_sprite',
          playbackHint: 'native_sprite',
          hasStaticAtlas: false,
          hasAnimatedAtlas: true,
          staticAtlas: null,
          animatedAtlas,
        }));
      }
    }
    return entries;
  }

  private getAuxiliaryStaticEntries(): Map<string, BrowserAtlasItemEntry> {
    const entries = new Map<string, BrowserAtlasItemEntry>();
    const filePath = NESQL_ATLAS_MANIFEST_FILE;
    if (!filePath || !fs.existsSync(filePath)) {
      return entries;
    }

    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as StaticAtlasManifest;
    const groups = Array.isArray(parsed.groups) ? parsed.groups : [];
    for (const group of groups) {
      const atlasFile = `${group?.atlasFile ?? ''}`.trim();
      const assets = Array.isArray(group?.assets) ? group.assets : [];
      if (!atlasFile || assets.length === 0) {
        continue;
      }

      for (const asset of assets) {
        const assetId = `${asset?.assetId ?? ''}`.trim();
        const itemId = this.itemIdFromRenderAssetRef(assetId);
        if (!itemId) {
          continue;
        }

        const staticAtlas: BrowserAtlasStaticPlacement = {
          atlasGroup: group.atlasGroup ?? null,
          atlasFile,
          atlasWidth: this.toNumber(group.width, 0),
          atlasHeight: this.toNumber(group.height, 0),
          x: this.toNumber(asset.x, 0),
          y: this.toNumber(asset.y, 0),
          width: this.toNumber(asset.width, 0),
          height: this.toNumber(asset.height, 0),
          sourcePath: asset.sourcePath ?? null,
        };
        if (!staticAtlas.width || !staticAtlas.height) {
          continue;
        }

        entries.set(itemId, this.toCompactEntry({
          itemId,
          assetId,
          variantKey: asset.variantKey ?? null,
          mode: 'native_sprite_static',
          renderMode: 'native_sprite',
          resolutionMode: 'native_sprite',
          playbackHint: 'static',
          hasStaticAtlas: true,
          hasAnimatedAtlas: false,
          staticAtlas,
          animatedAtlas: null,
        }));
      }
    }
    return entries;
  }

  private getEntryWithAliases(itemMap: Map<string, BrowserAtlasItemEntry>, itemId: string): BrowserAtlasItemEntry | null {
    for (const key of this.getAtlasLookupKeys(itemId)) {
      const exact = itemMap.get(key);
      if (exact) {
        return exact;
      }
      for (const alias of this.getItemIdAliases(key)) {
        const entry = itemMap.get(alias);
        if (entry) {
          return entry;
        }
      }
    }
    return null;
  }

  private getAtlasLookupKeys(itemId: string): string[] {
    const normalized = String(itemId || '').trim();
    if (!normalized) {
      return [];
    }
    const keys = [normalized];
    const renderAssetItemId = this.itemIdFromRenderAssetRef(normalized);
    if (renderAssetItemId) {
      keys.push(renderAssetItemId);
    }
    return Array.from(new Set(keys.filter(Boolean)));
  }

  private itemIdFromRenderAssetRef(renderAssetRef: string): string {
    const normalized = String(renderAssetRef || '').trim();
    if (normalized.startsWith('nesqlpp:item/')) {
      return normalized.slice('nesqlpp:item/'.length);
    }
    if (normalized.startsWith('nesqlpp:fluid/')) {
      return normalized.slice('nesqlpp:fluid/'.length);
    }
    return '';
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
