import {
  api,
  type BrowserAtlasAnimatedFrame,
  type BrowserAtlasItemEntry,
  type BrowserAtlasStaticPlacement,
} from "./api";
import { resolveCanonicalRelativePath } from "./api/images";
import { loadImageAsset } from "./animationBudget";

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
let indexLoadPromise: Promise<boolean> | null = null;
let indexAvailable = false;
let atlasImageCacheVersion = "0";

function normalizeAtlasFile(atlasFile?: string | null): string | null {
  const normalized = `${atlasFile ?? ""}`.trim().replace(/\\/g, "/").replace(/^\/+/, "");
  return normalized || null;
}

function getItemIdAliases(itemId: string): string[] {
  const normalized = `${itemId ?? ""}`.trim();
  if (!normalized) {
    return [];
  }

  const aliases: string[] = [];
  const parts = normalized.split("~");
  if (parts.length >= 4 && parts[0] === "i") {
    const base = parts.slice(0, 4).join("~");
    aliases.push(base);
    aliases.push([parts[0], parts[1], parts[2], "0"].join("~"));
  }
  return Array.from(new Set(aliases.filter((alias) => alias && alias !== normalized)));
}

function getAtlasEntryForItemId(itemId: string): BrowserAtlasItemEntry | null {
  const normalized = `${itemId ?? ""}`.trim();
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
  for (const alias of getItemIdAliases(normalized)) {
    const entry = itemEntries.get(alias) ?? itemEntryAliases.get(alias);
    if (entry) {
      itemEntryAliases.set(normalized, entry);
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
  if (indexLoaded) {
    return indexAvailable;
  }
  if (indexLoadPromise) {
    return indexLoadPromise;
  }

  indexLoadPromise = api.getBrowserAtlasIndex()
    .then((payload) => {
      itemEntries.clear();
      itemEntryAliases.clear();
      atlasImageCacheVersion = [
        payload?.generatedAt ?? 0,
        payload?.itemCount ?? 0,
        payload?.animatedItemCount ?? 0,
        payload?.missingAtlasCount ?? 0,
      ].join("-");
      atlasImages.clear();
      for (const entry of payload?.items ?? []) {
        if (entry?.itemId) {
          itemEntries.set(entry.itemId, entry);
          for (const alias of getItemIdAliases(entry.itemId)) {
            if (!itemEntries.has(alias) && !itemEntryAliases.has(alias)) {
              itemEntryAliases.set(alias, entry);
            }
          }
        }
      }
      indexAvailable = itemEntries.size > 0;
      indexLoaded = true;
      return indexAvailable;
    })
    .catch(() => {
      indexAvailable = false;
      indexLoaded = true;
      return false;
    })
    .finally(() => {
      indexLoadPromise = null;
    });
  return indexLoadPromise;
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
  const available = await ensureGlobalBrowserAtlasIndex();
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
  const available = await ensureGlobalBrowserAtlasIndex();
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
  const available = await ensureGlobalBrowserAtlasIndex();
  if (!available) {
    return false;
  }

  const atlasFiles = new Set<string>();
  for (const entry of itemEntries.values()) {
    const animatedFile = normalizeAtlasFile(entry.animatedAtlas?.atlasFile);
    const staticFile = normalizeAtlasFile(entry.staticAtlas?.atlasFile);
    if (animatedFile) atlasFiles.add(animatedFile);
    if (staticFile) atlasFiles.add(staticFile);
  }

  const files = Array.from(atlasFiles);
  let processed = 0;
  onProgress?.(processed, files.length);
  await runConcurrent(files, 4, async (atlasFile) => {
    await loadAtlasImage(atlasFile);
    processed += 1;
    onProgress?.(processed, files.length);
  });
  return files.length > 0;
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

export function shouldUseLegacyBrowserAnimationProbe(itemId: string): boolean {
  const normalizedItemId = `${itemId ?? ""}`.trim();
  if (!normalizedItemId || !indexAvailable) {
    return true;
  }

  const entry = getAtlasEntryForItemId(normalizedItemId);
  if (!entry) {
    return true;
  }

  // Once NESQL++ has emitted a browser atlas entry, it becomes the source of truth for
  // homepage/history animation. Re-probing legacy render contracts during fast page
  // flips creates sprite/json request storms and can compete with the resident atlas
  // draw path. Items missing from the global index still keep the legacy fallback.
  return false;
}
export function getGlobalBrowserAtlasEntry(itemId: string): BrowserAtlasItemEntry | null {
  return getAtlasEntryForItemId(itemId);
}

export function getLoadedGlobalAtlasImage(atlasFile?: string | null): HTMLImageElement | null {
  const normalized = normalizeAtlasFile(atlasFile);
  if (!normalized) {
    return null;
  }
  return atlasImages.get(getAtlasImageCacheKey(normalized))?.image ?? null;
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
    .map((frame) => ({
      index: Number(frame.index ?? 0),
      x: Number(frame.x ?? 0),
      y: Number(frame.y ?? 0),
      width: Number(frame.width ?? 0),
      height: Number(frame.height ?? 0),
    }))
    .filter((frame) => frame.width > 0 && frame.height > 0);
}

export function normalizeTimeline(
  timeline?: BrowserAtlasAnimatedFrame[] | null,
  fallbackDurationMs?: number | null,
): Array<{ frameIndex: number; durationMs: number }> {
  return (timeline ?? [])
    .map((frame, index) => ({
      frameIndex: Number(frame.frameIndex ?? frame.index ?? index),
      durationMs: Math.max(16, Math.round(Number(frame.durationMs ?? fallbackDurationMs ?? 50))),
    }))
    .filter((frame) => Number.isFinite(frame.frameIndex));
}

