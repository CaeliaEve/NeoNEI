import {
  resolveCanonicalRelativePath,
  getSpriteAtlasUrlFromImageUrl,
  getSpriteMetadataUrlFromImageUrl,
  getFluidImageUrlFromFluid,
  getItemImageUrlFromEntity,
  resolveRenderRelativePath,
  type AnimatedAtlasAssetEntry,
  type NativeSpriteMetadata,
} from './api/images';
import type { Item, PageRichMediaManifest } from './api';
import { getNativeCaptureByAssetId, getNativeRenderFactsForItem } from './distDataRuntime';
import type { NativeFramebufferCaptureEntry } from '../runtime/types';
import { warmGlobalBrowserAtlasForItemsDetailed } from './globalBrowserAtlas';
import {
  loadImageAsset as loadImageCached,
  prewarmImageAsset,
} from './imageAssetLoader';
export {
  isImageAssetDecoded,
  isImageAssetWarm,
  loadImageAsset,
  prewarmImageAsset,
} from './imageAssetLoader';

const MAX_ANIMATION_WORKERS = 3;
const MAX_PREPARED_FRAME_SETS = 192;

class AsyncWorkQueue {
  private activeCount = 0;
  private pending: Array<() => void> = [];
  private readonly maxConcurrency: number;

  constructor(maxConcurrency: number) {
    this.maxConcurrency = maxConcurrency;
  }

  run<T>(task: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const execute = async () => {
        this.activeCount += 1;
        try {
          const result = await task();
          resolve(result);
        } catch (error) {
          reject(error);
        } finally {
          this.activeCount -= 1;
          const next = this.pending.shift();
          if (next) next();
        }
      };

      if (this.activeCount < this.maxConcurrency) {
        void execute();
      } else {
        this.pending.push(() => {
          void execute();
        });
      }
    });
  }
}

const animationWorkQueue = new AsyncWorkQueue(MAX_ANIMATION_WORKERS);
const mediaPrewarmQueue = new AsyncWorkQueue(2);

const animationProbeCache = new Map<string, boolean>();
const animationProbeInFlight = new Map<string, Promise<boolean>>();
const spriteMetadataCache = new Map<string, NativeSpriteMetadata | null>();
const spriteMetadataInFlight = new Map<string, Promise<NativeSpriteMetadata | null>>();
const animatedAtlasCache = new Map<string, AnimatedAtlasAssetEntry | null>();
const primedRenderHintCache = new Map<string, NonNullable<Item['renderHint']> | null>();
const preparedAnimationFrameCache = new Map<string, PreparedAnimationFrame[]>();
const preparedAnimationFrameInFlight = new Map<string, Promise<PreparedAnimationFrame[]>>();
const queuedRenderablePrewarmTasks = new Map<string, Promise<void>>();
const DEFAULT_FRAME_DURATION_MS = 50;

export interface PreparedAnimationFrame {
  source: CanvasImageSource;
  width: number;
  height: number;
  durationMs: number;
}

interface TimelineFrameLike {
  frameIndex?: number;
  index?: number;
  durationMs?: number | null;
}

interface RenderableEntityLike {
  itemId?: string | null;
  fluidId?: string | null;
  preferredImageUrl?: string | null;
  renderAssetRef?: string | null;
  imageFileName?: string | null;
  renderHint?: Item['renderHint'];
}

const normalizeFrameDuration = (durationMs?: number | null): number => {
  if (typeof durationMs !== 'number' || !Number.isFinite(durationMs) || durationMs <= 0) {
    return DEFAULT_FRAME_DURATION_MS;
  }
  return Math.max(16, Math.round(durationMs));
};

const SHARED_ANIMATION_EPOCH_MS =
  typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();

export const getSharedAnimationNowMs = (): number => {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
};

const getSharedAnimationElapsedMs = (nowMs: number): number => {
  return Math.max(0, nowMs - SHARED_ANIMATION_EPOCH_MS);
};

const resolveTimelineFrameSlotIndex = (frame: TimelineFrameLike | undefined, defaultIndex: number): number => {
  if (!frame) {
    return defaultIndex;
  }
  if (typeof frame.frameIndex === 'number') {
    return frame.frameIndex;
  }
  if (typeof frame.index === 'number') {
    return frame.index;
  }
  return defaultIndex;
};

export const resolveTimelineFrameIndex = (
  timeline: TimelineFrameLike[] | undefined,
  nowMs: number = getSharedAnimationNowMs(),
): number => {
  if (!(timeline?.length)) {
    return 0;
  }
  if (timeline.length === 1) {
    return resolveTimelineFrameSlotIndex(timeline[0], 0);
  }

  const totalDuration = timeline.reduce(
    (sum, frame) => sum + normalizeFrameDuration(frame.durationMs),
    0,
  );
  if (totalDuration <= 0) {
    return resolveTimelineFrameSlotIndex(timeline[0], 0);
  }

  let elapsed = getSharedAnimationElapsedMs(nowMs) % totalDuration;
  for (let idx = 0; idx < timeline.length; idx += 1) {
    const frame = timeline[idx];
    const duration = normalizeFrameDuration(frame.durationMs);
    if (elapsed < duration) {
      return resolveTimelineFrameSlotIndex(frame, idx);
    }
    elapsed -= duration;
  }

  return resolveTimelineFrameSlotIndex(timeline[timeline.length - 1], timeline.length - 1);
};

export const resolvePreparedAnimationFrameIndex = (
  frames: Array<Pick<PreparedAnimationFrame, 'durationMs'>> | undefined,
  nowMs: number = getSharedAnimationNowMs(),
): number => {
  if (!(frames?.length)) {
    return 0;
  }
  if (frames.length === 1) {
    return 0;
  }

  const totalDuration = frames.reduce(
    (sum, frame) => sum + normalizeFrameDuration(frame.durationMs),
    0,
  );
  if (totalDuration <= 0) {
    return 0;
  }

  let elapsed = getSharedAnimationElapsedMs(nowMs) % totalDuration;
  for (let idx = 0; idx < frames.length; idx += 1) {
    const duration = normalizeFrameDuration(frames[idx]?.durationMs);
    if (elapsed < duration) {
      return idx;
    }
    elapsed -= duration;
  }

  return frames.length - 1;
};

const getSpriteSheetPhysicalFrameCount = (
  timeline: Array<{ frameIndex?: number; index?: number }> | undefined,
  declaredFrameCount?: number | null,
): number => {
  const timelineMax =
    timeline?.reduce((max, frame, idx) => {
      const frameIndex =
        typeof frame.frameIndex === 'number'
          ? frame.frameIndex
          : typeof frame.index === 'number'
            ? frame.index
            : idx;
      return Math.max(max, frameIndex + 1);
    }, 0) ?? 0;

  return Math.max(Number(declaredFrameCount ?? 0), timelineMax, 1);
};

const touchBoundedCache = <T>(cache: Map<string, T>, key: string, value: T, maxSize: number): void => {
  if (cache.has(key)) {
    cache.delete(key);
  }
  cache.set(key, value);
  while (cache.size > maxSize) {
    const oldestKey = cache.keys().next().value;
    if (!oldestKey) break;
    cache.delete(oldestKey);
  }
};

const getRenderableEntityKey = (entity: RenderableEntityLike): string => {
  return [
    `${entity.itemId ?? ''}`.trim(),
    `${entity.fluidId ?? ''}`.trim(),
    `${entity.renderAssetRef ?? ''}`.trim(),
    `${entity.imageFileName ?? ''}`.trim(),
    `${entity.preferredImageUrl ?? ''}`.trim(),
  ].join('|');
};

const getPreparedFrameCacheKey = (baseUrl: string, renderAssetRef?: string | null): string => {
  return `${renderAssetRef?.trim() || baseUrl}`;
};

const getNativeItemRenderAssetRef = (itemId?: string | null): string | null => {
  const normalizedItemId = `${itemId ?? ''}`.trim();
  return normalizedItemId ? `nesqlpp:item/${normalizedItemId}` : null;
};

const getEffectiveRenderAssetRef = (entity: RenderableEntityLike): string | null => {
  return `${entity.renderAssetRef ?? ''}`.trim() || getNativeItemRenderAssetRef(entity.itemId);
};

const hasAnimatedCapture = (capture?: NativeFramebufferCaptureEntry | null): boolean => {
  if (!capture) return false;
  const frameCount = Number(capture.frameCount ?? capture.frames?.length ?? capture.timeline?.length ?? 0);
  return Number.isFinite(frameCount) && frameCount > 1;
};

const buildNativeRenderHint = async (
  entity: RenderableEntityLike,
): Promise<NonNullable<Item['renderHint']> | null> => {
  const itemId = `${entity.itemId ?? ''}`.trim();
  const renderAssetRef = getEffectiveRenderAssetRef(entity);
  if (!itemId && !renderAssetRef) {
    return null;
  }
  const facts = await getNativeRenderFactsForItem(itemId, renderAssetRef).catch(() => null);
  if (!facts?.renderer && !facts?.shader && !facts?.capture) {
    return null;
  }
  const renderer = facts.renderer;
  const shader = facts.shader;
  const capture = facts.capture;
  const requiresCapture = Boolean(
    renderer?.requiresFramebufferCapture
      || shader?.captureRequired
      || capture,
  );
  const hasAnimation = hasAnimatedCapture(capture)
    || Boolean(shader?.captureRequired && requiresCapture)
    || Boolean(renderer?.usesShader && requiresCapture);
  return {
    renderMode: capture?.renderMode ?? (requiresCapture ? 'captured_final_atlas' : renderer?.rendererKind ?? null),
    animationMode: capture?.animationMode ?? (hasAnimation ? 'captured_native' : 'none'),
    playbackHint: requiresCapture ? 'native_capture' : (renderer?.supportsNativeAtlas ? 'native_sprite' : null),
    frameCount: Number.isFinite(Number(capture?.frameCount)) ? Number(capture?.frameCount) : null,
    explicitStatic: !hasAnimation && renderer?.supportsNativeAtlas === true,
    prefersNativeSprite: renderer?.supportsNativeAtlas === true && !requiresCapture,
    prefersCapturedAtlas: requiresCapture,
    hasAnimation,
  };
};

const primeNativeRenderFactsForEntity = async (
  entity: RenderableEntityLike,
): Promise<NonNullable<Item['renderHint']> | null> => {
  const renderAssetRef = getEffectiveRenderAssetRef(entity);
  if (!renderAssetRef) return null;
  const existing = getPrimedRenderHint(renderAssetRef);
  if (typeof existing !== 'undefined') return existing;
  const nativeHint = await buildNativeRenderHint(entity);
  if (nativeHint) {
    primeRenderAnimationHint(renderAssetRef, nativeHint);
  }
  return nativeHint;
};

function getPrimedRenderHint(renderAssetRef?: string | null): NonNullable<Item['renderHint']> | null | undefined {
  const assetId = `${renderAssetRef ?? ''}`.trim();
  if (!assetId) {
    return undefined;
  }
  return primedRenderHintCache.get(assetId);
}

const buildAnimatedAtlasFrames = async (
  atlasEntry: AnimatedAtlasAssetEntry,
): Promise<PreparedAnimationFrame[]> => {
  const atlasUrl = getAnimatedAtlasImageUrl(atlasEntry);
  if (!atlasUrl) {
    return [];
  }

  const atlasImg = await loadImageCached(atlasUrl);
  const frames: PreparedAnimationFrame[] = [];
  for (const frame of atlasEntry.frames) {
    const frameCanvas = document.createElement('canvas');
    frameCanvas.width = frame.width;
    frameCanvas.height = frame.height;
    const frameCtx = frameCanvas.getContext('2d');
    if (!frameCtx) {
      continue;
    }
    frameCtx.drawImage(
      atlasImg,
      frame.x,
      frame.y,
      frame.width,
      frame.height,
      0,
      0,
      frame.width,
      frame.height,
    );
    const timelineEntry = atlasEntry.timeline?.find((entry) => entry.index === frame.index)
      ?? atlasEntry.timeline?.find((entry) => entry.frameIndex === frame.index);
    frames.push({
      source: frameCanvas,
      width: frame.width,
      height: frame.height,
      durationMs: normalizeFrameDuration(timelineEntry?.durationMs ?? atlasEntry.frameDurationMs),
    });
  }
  return frames;
};

const buildNativeSpriteFrames = async (
  baseUrl: string,
  spriteMeta: NativeSpriteMetadata,
): Promise<PreparedAnimationFrame[]> => {
  if (!(spriteMeta.animated && (spriteMeta.timeline?.length ?? 0) > 0)) {
    return [];
  }

  const atlasUrl = getNativeSpriteAtlasUrl(baseUrl, spriteMeta);
  const atlasImg = await loadImageCached(atlasUrl);
  const width = spriteMeta.width || atlasImg.naturalWidth;
  const physicalFrameCount = getSpriteSheetPhysicalFrameCount(spriteMeta.timeline, spriteMeta.frameCount);
  const height =
    spriteMeta.height ||
    Math.floor(atlasImg.naturalHeight / physicalFrameCount);
  const defaultFrameDurationMs = normalizeFrameDuration(
    typeof spriteMeta.defaultFrameTime === 'number' ? spriteMeta.defaultFrameTime * 50 : undefined,
  );

  const frames: PreparedAnimationFrame[] = [];
  for (let idx = 0; idx < spriteMeta.timeline.length; idx++) {
    const frame = spriteMeta.timeline[idx];
    const frameIndex =
      typeof frame.frameIndex === 'number'
        ? frame.frameIndex
        : typeof frame.index === 'number'
          ? frame.index
          : idx;

    const frameCanvas = document.createElement('canvas');
    frameCanvas.width = width;
    frameCanvas.height = height;
    const frameCtx = frameCanvas.getContext('2d');
    if (!frameCtx) {
      continue;
    }
    frameCtx.drawImage(atlasImg, 0, frameIndex * height, width, height, 0, 0, width, height);
    frames.push({
      source: frameCanvas,
      width,
      height,
      durationMs: normalizeFrameDuration(
        typeof frame.durationMs === 'number' ? frame.durationMs : defaultFrameDurationMs,
      ),
    });
  }

  return frames;
};

const getNativeCaptureFramePath = (frame: { path?: string | null; sourcePath?: string | null }): string | null => {
  return `${frame.path ?? frame.sourcePath ?? ''}`.trim() || null;
};

const buildNativeCaptureFrames = async (
  capture?: NativeFramebufferCaptureEntry | null,
): Promise<PreparedAnimationFrame[]> => {
  if (!capture) {
    return [];
  }
  const sourceFrames = (Array.isArray(capture.frames) && capture.frames.length > 0
    ? capture.frames
    : [])
    .map((frame, index) => ({ frame, index, path: getNativeCaptureFramePath(frame) }))
    .filter((entry): entry is { frame: NonNullable<NativeFramebufferCaptureEntry['frames']>[number]; index: number; path: string } => Boolean(entry.path));

  if (sourceFrames.length === 0) {
    return [];
  }

  const timeline = Array.isArray(capture.timeline) ? capture.timeline : [];
  const frames: PreparedAnimationFrame[] = [];
  for (const entry of sourceFrames) {
    const imageUrl = resolveRenderRelativePath(entry.path) ?? resolveCanonicalRelativePath(entry.path);
    if (!imageUrl) {
      continue;
    }
    const image = await loadImageCached(imageUrl);
    const timelineEntry = timeline.find((candidate) => candidate.frameIndex === entry.index)
      ?? timeline.find((candidate) => candidate.index === entry.index)
      ?? timeline[entry.index];
    frames.push({
      source: image,
      width: image.naturalWidth || image.width,
      height: image.naturalHeight || image.height,
      durationMs: normalizeFrameDuration(timelineEntry?.durationMs ?? capture.frameDurationMs),
    });
  }
  return frames;
};

const getItemImageBaseUrl = (entity: RenderableEntityLike): string => {
  return getItemImageUrlFromEntity({
    itemId: entity.itemId ?? null,
    renderAssetRef: entity.renderAssetRef ?? null,
    imageFileName: entity.imageFileName ?? null,
    preferredImageUrl: entity.preferredImageUrl ?? null,
  });
};

const getItemIdFromRenderAssetRef = (renderAssetRef?: string | null): string | null => {
  const normalized = `${renderAssetRef ?? ''}`.trim();
  const match = normalized.match(/^nesqlpp:item\/(.+)$/);
  return match?.[1]?.trim() || null;
};

const prewarmItemViaGlobalBrowserAtlas = async (entity: RenderableEntityLike): Promise<boolean> => {
  const itemId = `${entity.itemId ?? ''}`.trim() || getItemIdFromRenderAssetRef(entity.renderAssetRef);
  if (!itemId) {
    return false;
  }

  try {
    const coverage = await warmGlobalBrowserAtlasForItemsDetailed([itemId]);
    return coverage.drawableCount > 0 && coverage.missingCount === 0;
  } catch {
    return false;
  }
};

const resolvePreparedAnimationFrames = async (
  baseUrl: string,
  renderAssetRef?: string | null,
): Promise<PreparedAnimationFrame[]> => {
  const cacheKey = getPreparedFrameCacheKey(baseUrl, renderAssetRef);
  if (preparedAnimationFrameCache.has(cacheKey)) {
    const cached = preparedAnimationFrameCache.get(cacheKey)!;
    touchBoundedCache(preparedAnimationFrameCache, cacheKey, cached, MAX_PREPARED_FRAME_SETS);
    return cached;
  }

  const inFlight = preparedAnimationFrameInFlight.get(cacheKey);
  if (inFlight) {
    return inFlight;
  }

  const request = (async () => {
    const hasAnimation = await probeAnimationSupport(baseUrl, renderAssetRef);
    let frames: PreparedAnimationFrame[] = [];
    const primedRenderHint = getPrimedRenderHint(renderAssetRef);
    const shouldTryCapturedAtlasFirst = primedRenderHint
      ? primedRenderHint.prefersCapturedAtlas === true && primedRenderHint.prefersNativeSprite !== true
      : false;
    const shouldTryNativeSpriteFirst = primedRenderHint
      ? primedRenderHint.prefersNativeSprite === true || primedRenderHint.playbackHint === 'native_sprite'
      : true;

    if (hasAnimation && renderAssetRef && shouldTryCapturedAtlasFirst) {
      const nativeCapture = await getNativeCaptureByAssetId(renderAssetRef).catch(() => null);
      frames = await buildNativeCaptureFrames(nativeCapture);
    }

    if (frames.length === 0 && hasAnimation && renderAssetRef && shouldTryCapturedAtlasFirst) {
      const animatedAtlasEntry = await fetchAnimatedAtlasEntry(renderAssetRef);
      if (animatedAtlasEntry && animatedAtlasEntry.frames.length > 0) {
        frames = await buildAnimatedAtlasFrames(animatedAtlasEntry);
      }
    }

    if (frames.length === 0 && hasAnimation && shouldTryNativeSpriteFirst) {
      const spriteMeta = await fetchNativeSpriteMetadata(baseUrl);
      if (spriteMeta) {
        frames = await buildNativeSpriteFrames(baseUrl, spriteMeta);
      }
    }

    if (frames.length === 0 && hasAnimation && renderAssetRef && !shouldTryCapturedAtlasFirst) {
      const nativeCapture = await getNativeCaptureByAssetId(renderAssetRef).catch(() => null);
      frames = await buildNativeCaptureFrames(nativeCapture);
    }

    if (frames.length === 0 && hasAnimation && renderAssetRef && !shouldTryCapturedAtlasFirst) {
      const animatedAtlasEntry = await fetchAnimatedAtlasEntry(renderAssetRef);
      if (animatedAtlasEntry && animatedAtlasEntry.frames.length > 0) {
        frames = await buildAnimatedAtlasFrames(animatedAtlasEntry);
      }
    }

    if (frames.length === 0 && hasAnimation && !shouldTryNativeSpriteFirst) {
      const spriteMeta = await fetchNativeSpriteMetadata(baseUrl);
      if (spriteMeta) {
        frames = await buildNativeSpriteFrames(baseUrl, spriteMeta);
      }
    }

    if (frames.length === 0) {
      const staticImg = await loadImageCached(baseUrl);
      frames = [{
        source: staticImg,
        width: staticImg.naturalWidth || staticImg.width,
        height: staticImg.naturalHeight || staticImg.height,
        durationMs: DEFAULT_FRAME_DURATION_MS,
      }];
    }

    touchBoundedCache(preparedAnimationFrameCache, cacheKey, frames, MAX_PREPARED_FRAME_SETS);
    return frames;
  })().finally(() => {
    preparedAnimationFrameInFlight.delete(cacheKey);
  });

  preparedAnimationFrameInFlight.set(cacheKey, request);
  return request;
};

export const runAnimationWork = <T>(task: () => Promise<T>): Promise<T> => {
  return animationWorkQueue.run(task);
};

export const fetchNativeSpriteMetadata = async (
  baseUrl: string,
): Promise<NativeSpriteMetadata | null> => {
  if (spriteMetadataCache.has(baseUrl)) {
    return spriteMetadataCache.get(baseUrl) ?? null;
  }

  const inFlight = spriteMetadataInFlight.get(baseUrl);
  if (inFlight) {
    return inFlight;
  }

  const request = runAnimationWork(async () => {
    try {
      const response = await fetch(getSpriteMetadataUrlFromImageUrl(baseUrl));
      if (!response.ok) {
        spriteMetadataCache.set(baseUrl, null);
        return null;
      }
      const metadata = (await response.json()) as NativeSpriteMetadata;
      spriteMetadataCache.set(baseUrl, metadata);
      return metadata;
    } catch {
      spriteMetadataCache.set(baseUrl, null);
      return null;
    } finally {
      spriteMetadataInFlight.delete(baseUrl);
    }
  });

  spriteMetadataInFlight.set(baseUrl, request);
  return request;
};

export const fetchAnimatedAtlasEntry = async (
  renderAssetRef?: string | null,
): Promise<AnimatedAtlasAssetEntry | null> => {
  if (!renderAssetRef) return null;
  if (animatedAtlasCache.has(renderAssetRef)) {
    return animatedAtlasCache.get(renderAssetRef) ?? null;
  }

  animatedAtlasCache.set(renderAssetRef, null);
  return null;
};

export const primeAnimatedAtlasManifest = (
  manifest?: PageRichMediaManifest | null,
): void => {
  if (!manifest?.animatedAtlases) {
    return;
  }

  for (const [assetId, entry] of Object.entries(manifest.animatedAtlases)) {
    const normalizedAssetId = `${assetId ?? ''}`.trim();
    if (!normalizedAssetId || !entry) {
      continue;
    }
    animatedAtlasCache.set(normalizedAssetId, entry);
  }
};

export const primeRenderAnimationHint = (
  renderAssetRef?: string | null,
  renderHint?: Item['renderHint'],
): void => {
  const assetId = `${renderAssetRef ?? ''}`.trim();
  if (!assetId || typeof renderHint === 'undefined') {
    return;
  }
  primedRenderHintCache.set(assetId, renderHint ?? null);
};

export const primeRenderAnimationHintsFromUnknown = (value: unknown): void => {
  const seen = new Set<unknown>();

  const visit = (node: unknown) => {
    if (!node || typeof node !== 'object') {
      return;
    }
    if (seen.has(node)) {
      return;
    }
    seen.add(node);

    if (Array.isArray(node)) {
      for (const entry of node) {
        visit(entry);
      }
      return;
    }

    const record = node as Record<string, unknown>;
    const renderAssetRef = typeof record.renderAssetRef === 'string' ? record.renderAssetRef : null;
    const renderHint =
      record.renderHint && typeof record.renderHint === 'object'
        ? (record.renderHint as NonNullable<Item['renderHint']>)
        : (record.renderHint === null ? null : undefined);
    if (renderAssetRef && typeof renderHint !== 'undefined') {
      primeRenderAnimationHint(renderAssetRef, renderHint);
    }

    for (const nested of Object.values(record)) {
      visit(nested);
    }
  };

  visit(value);
};

export const probeAnimationSupport = async (baseUrl: string, renderAssetRef?: string | null): Promise<boolean> => {
  if (animationProbeCache.has(baseUrl)) {
    return animationProbeCache.get(baseUrl) ?? false;
  }

  const inFlight = animationProbeInFlight.get(baseUrl);
  if (inFlight) {
    return inFlight;
  }

  const request = (async () => {
    const primedRenderHint = getPrimedRenderHint(renderAssetRef);
    if (primedRenderHint) {
      animationProbeCache.set(baseUrl, Boolean(primedRenderHint.hasAnimation));
      return Boolean(primedRenderHint.hasAnimation);
    }

    const spriteMetadata = await fetchNativeSpriteMetadata(baseUrl);
    if (animationProbeCache.has(baseUrl)) {
      return animationProbeCache.get(baseUrl) ?? false;
    }

    if (spriteMetadata?.animated) {
      animationProbeCache.set(baseUrl, true);
      return true;
    }

    if (renderAssetRef) {
      const atlasEntry = await fetchAnimatedAtlasEntry(renderAssetRef);
      if (atlasEntry && atlasEntry.frames.length > 0) {
        animationProbeCache.set(baseUrl, true);
        return true;
      }
    }



    const hasAnimation = false;
    animationProbeCache.set(baseUrl, hasAnimation);
    return hasAnimation;
  })().finally(() => {
    animationProbeInFlight.delete(baseUrl);
  });

  animationProbeInFlight.set(baseUrl, request);
  return request;
};

export const prewarmRenderableEntityMedia = async (
  entity: RenderableEntityLike,
): Promise<void> => {
  const itemId = `${entity.itemId ?? ''}`.trim() || getItemIdFromRenderAssetRef(entity.renderAssetRef);
  if (itemId) {
    await primeNativeRenderFactsForEntity({ ...entity, itemId });
    await prewarmItemViaGlobalBrowserAtlas({ ...entity, itemId });
    return;
  }

  if (entity.imageFileName || entity.renderAssetRef || entity.preferredImageUrl) {
    const itemImageUrl = getItemImageBaseUrl(entity);
    const nativeRenderHint = await primeNativeRenderFactsForEntity(entity);
    const effectiveRenderHint = entity.renderHint ?? nativeRenderHint;
    const effectiveRenderAssetRef = getEffectiveRenderAssetRef(entity);
    const explicitAnimation = effectiveRenderHint?.hasAnimation === true;
    const explicitStatic = effectiveRenderHint?.hasAnimation === false;

    if (explicitStatic) {
      await prewarmImageAsset(itemImageUrl);
      return;
    }

    if (explicitAnimation) {
      await resolvePreparedAnimationFrames(itemImageUrl, effectiveRenderAssetRef);
      return;
    }

    if (effectiveRenderAssetRef) {
      const animatedAtlasEntry = await fetchAnimatedAtlasEntry(effectiveRenderAssetRef);
      if (animatedAtlasEntry && animatedAtlasEntry.frames.length > 0) {
        await resolvePreparedAnimationFrames(itemImageUrl, effectiveRenderAssetRef);
        return;
      }
    }

    const spriteMetadata = await fetchNativeSpriteMetadata(itemImageUrl);
    if (spriteMetadata?.animated && (spriteMetadata.timeline?.length ?? 0) > 0) {
      await resolvePreparedAnimationFrames(itemImageUrl, effectiveRenderAssetRef);
      return;
    }

    await prewarmImageAsset(itemImageUrl);
    return;
  }

  const fluidImageUrl = getFluidImageUrlFromFluid({
    fluidId: entity.fluidId ?? null,
    renderAssetRef: entity.renderAssetRef ?? null,
    preferredImageUrl: entity.preferredImageUrl ?? null,
  });
  await prewarmImageAsset(fluidImageUrl);
};

function shouldQueueRenderableCandidate(
  candidate: RenderableEntityLike,
  options?: { animatedOnly?: boolean },
): boolean {
  if (
    !candidate.itemId
    && !candidate.fluidId
    && !candidate.renderAssetRef
    && !candidate.imageFileName
    && !candidate.preferredImageUrl
  ) {
    return false;
  }

  if (!options?.animatedOnly) {
    return true;
  }

  const renderHint = candidate.renderHint;
  return Boolean(
    renderHint?.hasAnimation
    || renderHint?.prefersNativeSprite
    || renderHint?.prefersCapturedAtlas,
  );
}

export const queueRenderableMediaPrewarmFromUnknown = (
  value: unknown,
  options?: { limit?: number; animatedOnly?: boolean },
): void => {
  const limit = Math.max(1, options?.limit ?? 40);
  const seenNodes = new Set<unknown>();
  const candidates = new Map<string, RenderableEntityLike>();

  const visit = (node: unknown) => {
    if (!node || typeof node !== 'object') {
      return;
    }
    if (seenNodes.has(node) || candidates.size >= limit) {
      return;
    }
    seenNodes.add(node);

    if (Array.isArray(node)) {
      for (const entry of node) {
        if (candidates.size >= limit) break;
        visit(entry);
      }
      return;
    }

    const record = node as Record<string, unknown>;
    const candidate: RenderableEntityLike = {
      itemId: typeof record.itemId === 'string' ? record.itemId : null,
      fluidId: typeof record.fluidId === 'string' ? record.fluidId : null,
      preferredImageUrl: typeof record.preferredImageUrl === 'string' ? record.preferredImageUrl : null,
      renderAssetRef: typeof record.renderAssetRef === 'string' ? record.renderAssetRef : null,
      imageFileName: typeof record.imageFileName === 'string' ? record.imageFileName : null,
      renderHint:
        record.renderHint && typeof record.renderHint === 'object'
          ? (record.renderHint as Item['renderHint'])
          : undefined,
    };

    if (shouldQueueRenderableCandidate(candidate, options)) {
      const candidateKey = getRenderableEntityKey(candidate);
      if (!candidates.has(candidateKey)) {
        candidates.set(candidateKey, candidate);
      }
    }

    for (const nested of Object.values(record)) {
      if (candidates.size >= limit) break;
      visit(nested);
    }
  };

  visit(value);

  for (const [candidateKey, candidate] of candidates) {
    if (queuedRenderablePrewarmTasks.has(candidateKey)) {
      continue;
    }
    const task = mediaPrewarmQueue
      .run(async () => {
        await prewarmRenderableEntityMedia(candidate);
      })
      .catch(() => undefined)
      .finally(() => {
        queuedRenderablePrewarmTasks.delete(candidateKey);
      });
    queuedRenderablePrewarmTasks.set(candidateKey, task);
  }
};

export function getNativeSpriteAtlasUrl(
  baseUrl: string,
  metadata?: NativeSpriteMetadata | null,
): string {
  return (
    resolveRenderRelativePath(metadata?.nativeSpriteAtlasFile) ||
    getSpriteAtlasUrlFromImageUrl(baseUrl)
  );
}

export function getAnimatedAtlasImageUrl(entry?: AnimatedAtlasAssetEntry | null): string | null {
  return resolveCanonicalRelativePath(entry?.atlasFile);
}
