import {
  api,
  type BrowserAtlasAnimatedFrame,
  type BrowserAtlasItemEntry,
  type BrowserAtlasStaticPlacement,
} from "./api";
import { resolveCanonicalRelativePath } from "./api/images";
import { loadImageAsset } from "./imageAssetLoader";
import { markPerfEvent } from "./perfMarks";

export type { BrowserAtlasItemEntry } from "./api";

type AtlasImageState = {
  image: HTMLImageElement | null;
  promise: Promise<HTMLImageElement | null> | null;
  failed: boolean;
};

const itemEntries = new Map<string, BrowserAtlasItemEntry>();
const itemEntryAliases = new Map<string, BrowserAtlasItemEntry>();
const atlasImages = new Map<string, AtlasImageState>();
let indexLoaded = false;
let fullIndexLoaded = false;
let indexLoadPromise: Promise<boolean> | null = null;
let indexAvailable = true;
let atlasImageCacheVersion = "0";
let allAtlasWarmPromise: Promise<boolean> | null = null;
let allAtlasWarmVersion = "";

function normalizeAtlasFile(atlasFile?: string | null): string | null {
  const normalized = `${atlasFile ?? ""}`.trim().replace(/\\/g, "/").replace(/^\/+/, "");
  return normalized || null;
}

function itemIdFromRenderAssetRef(renderAssetRef?: string | null): string | null {
  const normalized = `${renderAssetRef ?? ""}`.trim();
  if (normalized.startsWith("nesqlpp:item/")) return normalized.slice("nesqlpp:item/".length);
  if (normalized.startsWith("nesqlpp:fluid/")) return normalized.slice("nesqlpp:fluid/".length);
  return null;
}

function getAtlasLookupKeys(itemId?: string | null, renderAssetRef?: string | null): string[] {
  const keys: string[] = [];
  const normalizedRenderAssetRef = `${renderAssetRef ?? ""}`.trim();
  if (normalizedRenderAssetRef) {
    keys.push(normalizedRenderAssetRef);
    const renderAssetItemId = itemIdFromRenderAssetRef(normalizedRenderAssetRef);
    if (renderAssetItemId) keys.push(renderAssetItemId);
  }
  const normalizedItemId = `${itemId ?? ""}`.trim();
  if (normalizedItemId) keys.push(normalizedItemId);
  return Array.from(new Set(keys.filter(Boolean)));
}

function getItemIdAliases(itemId: string): string[] {
  const normalized = `${itemId ?? ""}`.trim();
  if (!normalized) {
    return [];
  }

  const aliases: string[] = [];
  const parts = normalized.split("~");
  if (parts.length >= 4 && parts[0] === "i") {
    const modId = `${parts[1] ?? ""}`.toLowerCase();
    const internalName = `${parts[2] ?? ""}`.toLowerCase();
    if (modId === "thaumcraftneiplugin" && internalName === "aspect" && parts[4]) {
      aliases.push([parts[0], parts[1], parts[2], "0", parts[4]].join("~"));
      aliases.push([parts[0], parts[1], parts[2], "1", parts[4]].join("~"));
      return Array.from(new Set(aliases.filter((alias) => alias && alias !== normalized)));
    }
    const base = parts.slice(0, 4).join("~");
    aliases.push(base);
    aliases.push([parts[0], parts[1], parts[2], "0"].join("~"));
  }
  return Array.from(new Set(aliases.filter((alias) => alias && alias !== normalized)));
}

function getAtlasEntryForSingleKey(key: string): BrowserAtlasItemEntry | null {
  const normalized = `${key ?? ""}`.trim();
  if (!normalized) {
    return null;
  }
  const exact = itemEntries.get(normalized);
  if (exact) {
    return exact;
  }
  const aliased = itemEntryAliases.get(normalized);
  if (aliased) {
    return aliased;
  }
  const renderAssetItemId = itemIdFromRenderAssetRef(normalized);
  if (renderAssetItemId) {
    const renderAssetEntry = itemEntries.get(renderAssetItemId) ?? itemEntryAliases.get(renderAssetItemId);
    if (renderAssetEntry) {
      itemEntryAliases.set(normalized, renderAssetEntry);
      return renderAssetEntry;
    }
  }
  for (const alias of getItemIdAliases(normalized)) {
    const entry = itemEntries.get(alias) ?? itemEntryAliases.get(alias);
    if (entry) {
      itemEntryAliases.set(normalized, entry);
      return entry;
    }
  }
  return null;
}

function getAtlasEntryForItemId(itemId: string, renderAssetRef?: string | null): BrowserAtlasItemEntry | null {
  for (const key of getAtlasLookupKeys(itemId, renderAssetRef)) {
    const entry = getAtlasEntryForSingleKey(key);
    if (entry) {
      return entry;
    }
  }
  return null;
}

function getAtlasImageState(atlasFile: string): AtlasImageState {
  const existing = atlasImages.get(atlasFile);
  if (existing) {
    return existing;
  }
  const state: AtlasImageState = { image: null, promise: null, failed: false };
  atlasImages.set(atlasFile, state);
  return state;
}

function getAtlasImageCacheKey(atlasFile: string): string {
  return `${atlasFile}?v=${encodeURIComponent(atlasImageCacheVersion)}`;
}

function withAtlasVersion(url: string): string {
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}v=${encodeURIComponent(atlasImageCacheVersion)}`;
}

async function loadAtlasImage(atlasFile?: string | null): Promise<HTMLImageElement | null> {
  const normalized = normalizeAtlasFile(atlasFile);
  if (!normalized) {
    return null;
  }
  const state = getAtlasImageState(getAtlasImageCacheKey(normalized));
  if (state.image) {
    return state.image;
  }
  if (state.failed) {
    return null;
  }
  if (state.promise) {
    return state.promise;
  }

  const rawUrl = resolveCanonicalRelativePath(normalized);
  const url = rawUrl ? withAtlasVersion(rawUrl) : null;
  if (!url) {
    state.failed = true;
    return null;
  }

  state.promise = loadImageAsset(url)
    .then((image) => {
      state.image = image;
      return image;
    })
    .catch(() => {
      state.failed = true;
      return null;
    })
    .finally(() => {
      state.promise = null;
    });
  return state.promise;
}

export async function ensureGlobalBrowserAtlasIndex(): Promise<boolean> {
  if (fullIndexLoaded) {
    return indexAvailable;
  }
  if (indexLoadPromise) {
    return indexLoadPromise;
  }

  indexLoadPromise = api.getBrowserAtlasIndex()
    .then((payload) => {
      itemEntries.clear();
      itemEntryAliases.clear();
      updateAtlasCacheVersion(payload);
      atlasImages.clear();
      mergeAtlasEntries(payload?.items ?? []);
      indexAvailable = itemEntries.size > 0;
      indexLoaded = true;
      fullIndexLoaded = true;
      return indexAvailable;
    })
    .catch(() => {
      indexAvailable = false;
      indexLoaded = true;
      fullIndexLoaded = true;
      return false;
    })
    .finally(() => {
      indexLoadPromise = null;
    });
  return indexLoadPromise;
}

function updateAtlasCacheVersion(payload?: { generatedAt?: number; itemCount?: number; animatedItemCount?: number; missingAtlasCount?: number } | null) {
  const nextVersion = [
    payload?.generatedAt ?? atlasImageCacheVersion,
    payload?.itemCount ?? 0,
    payload?.animatedItemCount ?? 0,
    payload?.missingAtlasCount ?? 0,
  ].join("-");
  if (nextVersion !== atlasImageCacheVersion) {
    atlasImageCacheVersion = nextVersion;
    atlasImages.clear();
    allAtlasWarmPromise = null;
    allAtlasWarmVersion = "";
  }
}

function mergeAtlasEntries(entries: BrowserAtlasItemEntry[]) {
  for (const entry of entries) {
    if (entry?.itemId) {
      itemEntries.set(entry.itemId, entry);
      const aliases = [
        entry.assetId,
        entry.variantKey,
        itemIdFromRenderAssetRef(entry.assetId),
        ...getItemIdAliases(entry.itemId),
      ];
      for (const alias of aliases) {
        const normalizedAlias = `${alias ?? ""}`.trim();
        if (normalizedAlias && !itemEntries.has(normalizedAlias) && !itemEntryAliases.has(normalizedAlias)) {
          itemEntryAliases.set(normalizedAlias, entry);
        }
      }
    }
  }
}

async function ensureGlobalBrowserAtlasEntries(itemIds: string[]): Promise<boolean> {
  void itemIds;
  // The homepage browser is now atlas-resident by contract: every visible item
  // must be in the exported browser-atlas-index before the grid becomes hot.
  // Do not hydrate page-scoped atlas entries through POST here; that recreates
  // NEI-incompatible "load textures for the page I just reached" behavior.
  return ensureGlobalBrowserAtlasIndex();
}

async function runConcurrent<T>(
  entries: T[],
  concurrency: number,
  worker: (entry: T, index: number) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  const workers = Array.from({ length: Math.max(1, concurrency) }, async () => {
    while (cursor < entries.length) {
      const index = cursor;
      cursor += 1;
      await worker(entries[index], index);
    }
  });
  await Promise.all(workers);
}

export async function warmGlobalBrowserAtlasForItems(itemIds: string[]): Promise<boolean> {
  const result = await warmGlobalBrowserAtlasForItemsDetailed(itemIds);
  return result.drawableCount > 0 && result.missingCount === 0;
}

export async function inspectGlobalBrowserAtlasCoverageForItems(itemIds: string[]): Promise<{
  total: number;
  indexedCount: number;
  drawableCount: number;
  missingCount: number;
  animatedCount: number;
  staticCount: number;
  atlasFileCount: number;
}> {
  const available = await ensureGlobalBrowserAtlasEntries(itemIds);
  if (!available) {
    const total = Array.from(new Set(itemIds.map((itemId) => `${itemId ?? ""}`.trim()).filter(Boolean))).length;
    return {
      total,
      indexedCount: 0,
      drawableCount: 0,
      missingCount: total,
      animatedCount: 0,
      staticCount: 0,
      atlasFileCount: 0,
    };
  }
  return getGlobalBrowserAtlasCoverageForItems(itemIds);
}

export async function warmGlobalBrowserAtlasForItemsDetailed(itemIds: string[]): Promise<{
  total: number;
  drawableCount: number;
  missingCount: number;
  atlasFileCount: number;
}> {
  const available = await ensureGlobalBrowserAtlasEntries(itemIds);
  if (!available) {
    return {
      total: itemIds.length,
      drawableCount: 0,
      missingCount: itemIds.length,
      atlasFileCount: 0,
    };
  }

  const atlasFiles = new Set<string>();
  let drawableCount = 0;
  let missingCount = 0;
  for (const itemId of itemIds) {
    const entry = getAtlasEntryForItemId(itemId);
    const animatedFile = normalizeAtlasFile(entry?.animatedAtlas?.atlasFile);
    const staticFile = normalizeAtlasFile(entry?.staticAtlas?.atlasFile);
    if (animatedFile || staticFile) {
      drawableCount += 1;
      if (animatedFile) atlasFiles.add(animatedFile);
      if (staticFile) atlasFiles.add(staticFile);
    } else {
      missingCount += 1;
    }
  }

  await Promise.all(Array.from(atlasFiles, (atlasFile) => loadAtlasImage(atlasFile)));
  return {
    total: itemIds.length,
    drawableCount,
    missingCount,
    atlasFileCount: atlasFiles.size,
  };
}

export async function warmAllGlobalBrowserAtlases(
  onProgress?: (processed: number, total: number) => void,
): Promise<boolean> {
  if (allAtlasWarmPromise) {
    return allAtlasWarmPromise;
  }

  const available = await ensureGlobalBrowserAtlasIndex();
  if (!available) {
    return false;
  }
  if (allAtlasWarmPromise) {
    return allAtlasWarmPromise;
  }

  const atlasFiles = new Set<string>();
  for (const entry of itemEntries.values()) {
    const animatedFile = normalizeAtlasFile(entry.animatedAtlas?.atlasFile);
    const staticFile = normalizeAtlasFile(entry.staticAtlas?.atlasFile);
    if (animatedFile) atlasFiles.add(animatedFile);
    if (staticFile) atlasFiles.add(staticFile);
  }

  const files = Array.from(atlasFiles);
  if (
    allAtlasWarmVersion === atlasImageCacheVersion
    && files.length > 0
    && files.every((atlasFile) => getAtlasImageState(getAtlasImageCacheKey(atlasFile)).image)
  ) {
    onProgress?.(files.length, files.length);
    return true;
  }

  let processed = 0;
  onProgress?.(processed, files.length);
  markPerfEvent("browser-atlas-resident-warm-start", {
    itemCount: itemEntries.size,
    atlasFileCount: files.length,
  });
  allAtlasWarmPromise = (async () => {
    await runConcurrent(files, 4, async (atlasFile) => {
      await loadAtlasImage(atlasFile);
      processed += 1;
      onProgress?.(processed, files.length);
    });
    allAtlasWarmVersion = atlasImageCacheVersion;
    markPerfEvent("browser-atlas-resident-warm-complete", {
      itemCount: itemEntries.size,
      atlasFileCount: files.length,
      loadedImageCount: getLoadedGlobalAtlasImages().length,
    });
    return files.length > 0;
  })().finally(() => {
    allAtlasWarmPromise = null;
  });
  return allAtlasWarmPromise;
}

export function getGlobalBrowserAtlasCoverageForItems(itemIds: string[]): {
  total: number;
  indexedCount: number;
  drawableCount: number;
  missingCount: number;
  animatedCount: number;
  staticCount: number;
  atlasFileCount: number;
} {
  const uniqueItemIds = Array.from(new Set(itemIds.map((itemId) => `${itemId ?? ""}`.trim()).filter(Boolean)));
  const atlasFiles = new Set<string>();
  let indexedCount = 0;
  let drawableCount = 0;
  let missingCount = 0;
  let animatedCount = 0;
  let staticCount = 0;

  for (const itemId of uniqueItemIds) {
    const entry = getAtlasEntryForItemId(itemId);
    if (!entry) {
      missingCount += 1;
      continue;
    }
    indexedCount += 1;
    const animatedFile = normalizeAtlasFile(entry.animatedAtlas?.atlasFile);
    const staticFile = normalizeAtlasFile(entry.staticAtlas?.atlasFile);
    if (animatedFile || staticFile) {
      drawableCount += 1;
      if (animatedFile) {
        animatedCount += 1;
        atlasFiles.add(animatedFile);
      }
      if (staticFile) {
        staticCount += 1;
        atlasFiles.add(staticFile);
      }
    } else {
      missingCount += 1;
    }
  }

  return {
    total: uniqueItemIds.length,
    indexedCount,
    drawableCount,
    missingCount,
    animatedCount,
    staticCount,
    atlasFileCount: atlasFiles.size,
  };
}

export function getGlobalBrowserAtlasEntry(
  itemId: string,
  renderAssetRef?: string | null,
): BrowserAtlasItemEntry | null {
  return getAtlasEntryForItemId(itemId, renderAssetRef);
}

export async function inspectGlobalBrowserAtlasResidentState(): Promise<{
  available: boolean;
  itemCount: number;
  atlasFileCount: number;
  loadedAtlasFileCount: number;
  cacheVersion: string;
}> {
  const available = await ensureGlobalBrowserAtlasIndex();
  if (!available) {
    return {
      available: false,
      itemCount: 0,
      atlasFileCount: 0,
      loadedAtlasFileCount: 0,
      cacheVersion: atlasImageCacheVersion,
    };
  }

  const atlasFiles = new Set<string>();
  for (const entry of itemEntries.values()) {
    const animatedFile = normalizeAtlasFile(entry.animatedAtlas?.atlasFile);
    const staticFile = normalizeAtlasFile(entry.staticAtlas?.atlasFile);
    if (animatedFile) atlasFiles.add(animatedFile);
    if (staticFile) atlasFiles.add(staticFile);
  }

  const files = Array.from(atlasFiles);
  const loadedAtlasFileCount = files.filter((atlasFile) =>
    Boolean(getAtlasImageState(getAtlasImageCacheKey(atlasFile)).image),
  ).length;

  return {
    available: true,
    itemCount: itemEntries.size,
    atlasFileCount: files.length,
    loadedAtlasFileCount,
    cacheVersion: atlasImageCacheVersion,
  };
}
export function getLoadedGlobalAtlasImage(atlasFile?: string | null): HTMLImageElement | null {
  const normalized = normalizeAtlasFile(atlasFile);
  if (!normalized) {
    return null;
  }
  return atlasImages.get(getAtlasImageCacheKey(normalized))?.image ?? null;
}

export function getLoadedGlobalAtlasImages(): HTMLImageElement[] {
  const images: HTMLImageElement[] = [];
  for (const state of atlasImages.values()) {
    if (state.image) {
      images.push(state.image);
    }
  }
  return images;
}

export function getGlobalBrowserAtlasTextureDescriptorsForItems(itemIds: string[]): Array<{ key: string; url: string }> {
  const atlasFiles = new Set<string>();
  for (const itemId of itemIds) {
    const entry = getAtlasEntryForItemId(itemId);
    const animatedFile = normalizeAtlasFile(entry?.animatedAtlas?.atlasFile);
    const staticFile = normalizeAtlasFile(entry?.staticAtlas?.atlasFile);
    if (animatedFile) atlasFiles.add(animatedFile);
    if (staticFile) atlasFiles.add(staticFile);
  }
  return Array.from(atlasFiles)
    .map((atlasFile) => {
      const rawUrl = resolveCanonicalRelativePath(atlasFile);
      return rawUrl ? { key: atlasFile, url: withAtlasVersion(rawUrl) } : null;
    })
    .filter((entry): entry is { key: string; url: string } => Boolean(entry));
}

export function getGlobalBrowserAtlasTextureDescriptorsForKeys(textureKeys: string[]): Array<{ key: string; url: string }> {
  const atlasFiles = new Set<string>();
  for (const textureKey of textureKeys) {
    const normalized = normalizeAtlasFile(textureKey);
    if (normalized) atlasFiles.add(normalized);
  }
  return Array.from(atlasFiles)
    .map((atlasFile) => {
      const rawUrl = resolveCanonicalRelativePath(atlasFile);
      return rawUrl ? { key: atlasFile, url: withAtlasVersion(rawUrl) } : null;
    })
    .filter((entry): entry is { key: string; url: string } => Boolean(entry));
}

export async function getAllGlobalBrowserAtlasTextureDescriptors(): Promise<Array<{ key: string; url: string }>> {
  const available = await ensureGlobalBrowserAtlasIndex();
  if (!available) return [];
  const atlasFiles = new Set<string>();
  for (const entry of itemEntries.values()) {
    const animatedFile = normalizeAtlasFile(entry.animatedAtlas?.atlasFile);
    const staticFile = normalizeAtlasFile(entry.staticAtlas?.atlasFile);
    if (animatedFile) atlasFiles.add(animatedFile);
    if (staticFile) atlasFiles.add(staticFile);
  }
  return Array.from(atlasFiles)
    .map((atlasFile) => {
      const rawUrl = resolveCanonicalRelativePath(atlasFile);
      return rawUrl ? { key: atlasFile, url: withAtlasVersion(rawUrl) } : null;
    })
    .filter((entry): entry is { key: string; url: string } => Boolean(entry));
}

export type GlobalBrowserAtlasSpriteDescriptor = {
  itemId: string;
  textureKey: string;
  sourceX: number;
  sourceY: number;
  sourceWidth: number;
  sourceHeight: number;
};

function normalizeFrameSlot(frameIndex: number, frameCount: number): number {
  if (frameCount <= 0) return 0;
  const integerIndex = Math.floor(Number(frameIndex) || 0);
  return ((integerIndex % frameCount) + frameCount) % frameCount;
}

export function selectAtlasFrameByTimelineIndex<T extends { index: number }>(
  frames: T[],
  frameIndex: number,
): T | null {
  if (frames.length <= 0) return null;
  const direct = frames.find((frame) => frame.index === frameIndex);
  if (direct) return direct;
  return frames[normalizeFrameSlot(frameIndex, frames.length)] ?? frames[0] ?? null;
}

function pickAnimationFrame(entry: BrowserAtlasItemEntry, nowMs: number) {
  const animatedFile = normalizeAtlasFile(entry.animatedAtlas?.atlasFile);
  const frames = normalizeFrames(entry.animatedAtlas?.frames);
  if (!animatedFile || frames.length <= 0) return null;
  const timeline = normalizeTimeline(entry.animatedAtlas?.timeline, entry.animatedAtlas?.frameDurationMs);
  if (timeline.length <= 0) {
    const firstFrame = frames[0];
    return firstFrame ? { textureKey: animatedFile, frame: firstFrame } : null;
  }
  const totalDuration = timeline.reduce((sum, frame) => sum + Math.max(16, frame.durationMs), 0);
  if (totalDuration <= 0) return null;
  let cursor = Math.floor(nowMs) % totalDuration;
  let selectedFrameIndex = timeline[0]?.frameIndex ?? 0;
  for (const frame of timeline) {
    const duration = Math.max(16, frame.durationMs);
    if (cursor < duration) {
      selectedFrameIndex = frame.frameIndex;
      break;
    }
    cursor -= duration;
  }
  const selectedFrame = selectAtlasFrameByTimelineIndex(frames, selectedFrameIndex);
  return selectedFrame ? { textureKey: animatedFile, frame: selectedFrame } : null;
}

export function getGlobalBrowserAtlasSpriteDescriptorForItem(
  itemId: string,
  nowMs: number,
): GlobalBrowserAtlasSpriteDescriptor | null {
  const entry = getAtlasEntryForItemId(itemId);
  if (!entry) return null;
  const animated = pickAnimationFrame(entry, nowMs);
  if (animated) {
    return {
      itemId,
      textureKey: animated.textureKey,
      sourceX: animated.frame.x,
      sourceY: animated.frame.y,
      sourceWidth: animated.frame.width,
      sourceHeight: animated.frame.height,
    };
  }
  const staticFile = normalizeAtlasFile(entry.staticAtlas?.atlasFile);
  const staticAtlas = entry.staticAtlas;
  if (!staticFile || !staticAtlas) return null;
  const sourceX = toAtlasNumber(staticAtlas.x, 0);
  const sourceY = toAtlasNumber(staticAtlas.y, 0);
  const sourceWidth = toAtlasNumber(staticAtlas.width, 0);
  const sourceHeight = toAtlasNumber(staticAtlas.height, 0);
  if (sourceWidth <= 0 || sourceHeight <= 0) return null;
  return {
    itemId,
    textureKey: staticFile,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
  };
}

export function hasGlobalBrowserAtlas(): boolean {
  return indexAvailable;
}

export function getStaticPlacement(entry: BrowserAtlasItemEntry | null): BrowserAtlasStaticPlacement | null {
  return entry?.staticAtlas ?? null;
}

export function normalizeFrames(frames?: BrowserAtlasAnimatedFrame[] | null): Array<{
  index: number;
  x: number;
  y: number;
  width: number;
  height: number;
}> {
  return (frames ?? [])
    .map((frame) => {
      const compact = Array.isArray(frame) ? frame as unknown[] : null;
      return {
        index: toAtlasNumber(compact?.[0] ?? frame.index, 0),
        x: toAtlasNumber(compact?.[1] ?? frame.x, 0),
        y: toAtlasNumber(compact?.[2] ?? frame.y, 0),
        width: toAtlasNumber(compact?.[3] ?? frame.width, 0),
        height: toAtlasNumber(compact?.[4] ?? frame.height, 0),
      };
    })
    .filter((frame) => frame.width > 0 && frame.height > 0);
}

export function normalizeTimeline(
  timeline?: BrowserAtlasAnimatedFrame[] | null,
  defaultDurationMs?: number | null,
): Array<{ frameIndex: number; durationMs: number }> {
  return (timeline ?? [])
    .map((frame, index) => {
      const compact = Array.isArray(frame) ? frame as unknown[] : null;
      return {
        frameIndex: toAtlasNumber(compact?.[0] ?? frame.frameIndex ?? frame.index, index),
        durationMs: Math.max(16, Math.round(toAtlasNumber(compact?.[1] ?? frame.durationMs ?? defaultDurationMs, 50))),
      };
    })
    .filter((frame) => Number.isFinite(frame.frameIndex));
}

function toAtlasNumber(value: unknown, defaultValue: number): number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : defaultValue;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : defaultValue;
  }
  if (value && typeof value === "object" && "value" in value) {
    return toAtlasNumber((value as { value?: unknown }).value, defaultValue);
  }
  return defaultValue;
}
