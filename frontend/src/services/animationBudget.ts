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
import { api, type Item, type PageRichMediaManifest } from './api';

const MAX_ANIMATION_WORKERS = 3;
const MAX_CACHED_IMAGE_ASSETS = 384;
const MAX_WARM_IMAGE_HISTORY = 8192;
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
const animatedAtlasInFlight = new Map<string, Promise<AnimatedAtlasAssetEntry | null>>();
const primedRenderHintCache = new Map<string, NonNullable<Item['renderHint']> | null>();
const renderContractCache = new Map<string, Awaited<ReturnType<typeof api.getRenderContractAsset>> | null>();
const renderContractInFlight = new Map<string, Promise<Awaited<ReturnType<typeof api.getRenderContractAsset>> | null>>();
const directGifProbeCache = new Map<string, boolean>();
const directGifProbeInFlight = new Map<string, Promise<boolean>>();
const imageAssetCache = new Map<string, HTMLImageElement>();
const imageAssetInFlight = new Map<string, Promise<HTMLImageElement>>();
const warmImageAssetHistory = new Map<string, true>();
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

const resolveTimelineFrameSlotIndex = (frame: TimelineFrameLike | undefined, fallbackIndex: number): number => {
  if (!frame) {
    return fallbackIndex;
  }
  if (typeof frame.frameIndex === 'number') {
    return frame.frameIndex;
  }
  if (typeof frame.index === 'number') {
    return frame.index;
  }
  return fallbackIndex;
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
  fallback?: number | null,
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

  return Math.max(Number(fallback ?? 0), timelineMax, 1);
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

const loadImage = (src: string): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.src = src;
    image.onload = async () => {
      try {
        if (typeof image.decode === 'function') {
          await image.decode();
        }
      } catch {
        // Keep the already-loaded image usable even if decode() rejects.
      }
      resolve(image);
    };
    image.onerror = () => reject(new Error(`Image load failed: ${src}`));
  });
};

const loadImageCached = async (src: string): Promise<HTMLImageElement> => {
  if (imageAssetCache.has(src)) {
    const cached = imageAssetCache.get(src)!;
    touchBoundedCache(imageAssetCache, src, cached, MAX_CACHED_IMAGE_ASSETS);
    touchBoundedCache(warmImageAssetHistory, src, true, MAX_WARM_IMAGE_HISTORY);
    return cached;
  }

  const inFlight = imageAssetInFlight.get(src);
  if (inFlight) {
    return inFlight;
  }

  const request = loadImage(src)
    .then((image) => {
      touchBoundedCache(imageAssetCache, src, image, MAX_CACHED_IMAGE_ASSETS);
      touchBoundedCache(warmImageAssetHistory, src, true, MAX_WARM_IMAGE_HISTORY);
      return image;
    })
    .finally(() => {
      imageAssetInFlight.delete(src);
    });

  imageAssetInFlight.set(src, request);
  return request;
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

const getItemImageBaseUrl = (entity: RenderableEntityLike): string => {
  return getItemImageUrlFromEntity({
    itemId: entity.itemId ?? null,
    renderAssetRef: entity.renderAssetRef ?? null,
    imageFileName: entity.imageFileName ?? null,
    preferredImageUrl: entity.preferredImageUrl ?? null,
  });
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

    if (hasAnimation && renderAssetRef) {
      const animatedAtlasEntry = await fetchAnimatedAtlasEntry(renderAssetRef);
      if (animatedAtlasEntry && animatedAtlasEntry.frames.length > 0) {
        frames = await buildAnimatedAtlasFrames(animatedAtlasEntry);
      }
    }

    if (frames.length === 0 && hasAnimation) {
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

  const inFlight = animatedAtlasInFlight.get(renderAssetRef);
  if (inFlight) {
    return inFlight;
  }

  const request = runAnimationWork(async () => {
    try {
      const entry = await api.getAnimatedAtlasEntry(renderAssetRef);
      animatedAtlasCache.set(renderAssetRef, entry);
      return entry;
    } catch {
      animatedAtlasCache.set(renderAssetRef, null);
      return null;
    } finally {
      animatedAtlasInFlight.delete(renderAssetRef);
    }
  });

  animatedAtlasInFlight.set(renderAssetRef, request);
  return request;
};

export const fetchRenderContractAsset = async (
  renderAssetRef?: string | null,
): Promise<Awaited<ReturnType<typeof api.getRenderContractAsset>> | null> => {
  if (!renderAssetRef) return null;
  if (renderContractCache.has(renderAssetRef)) {
    return renderContractCache.get(renderAssetRef) ?? null;
  }

  const inFlight = renderContractInFlight.get(renderAssetRef);
  if (inFlight) {
    return inFlight;
  }

  const request = runAnimationWork(async () => {
    try {
      const entry = await api.getRenderContractAsset(renderAssetRef);
      renderContractCache.set(renderAssetRef, entry);
      return entry;
    } catch {
      renderContractCache.set(renderAssetRef, null);
      return null;
    } finally {
      renderContractInFlight.delete(renderAssetRef);
    }
  });

  renderContractInFlight.set(renderAssetRef, request);
  return request;
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
    const primedRenderHint = renderAssetRef ? primedRenderHintCache.get(renderAssetRef) : undefined;
    if (primedRenderHint) {
      animationProbeCache.set(baseUrl, Boolean(primedRenderHint.hasAnimation));
      return Boolean(primedRenderHint.hasAnimation);
    }

    if (renderAssetRef) {
      const atlasEntry = await fetchAnimatedAtlasEntry(renderAssetRef);
      if (atlasEntry && atlasEntry.frames.length > 0) {
        animationProbeCache.set(baseUrl, true);
        return true;
      }
    }

    const spriteMetadata = await fetchNativeSpriteMetadata(baseUrl);
    if (animationProbeCache.has(baseUrl)) {
      return animationProbeCache.get(baseUrl) ?? false;
    }

    if (spriteMetadata?.animated) {
      animationProbeCache.set(baseUrl, true);
      return true;
    }

    const renderContract = renderAssetRef ? await fetchRenderContractAsset(renderAssetRef) : null;
    if (renderContract) {
      const captureContract = renderContract.captureContract as { multiFrame?: unknown; frameCount?: unknown } | null;
      const rendererContract = renderContract.rendererContract as {
        needsMultipleFrames?: unknown;
        shouldPreferNativeSpriteAnimation?: unknown;
        nativeFrameCount?: unknown;
      } | null;
      const hasAuxNativeSprite =
        renderContract.animationMode === 'native_sprite_aux'
        || (
          typeof renderContract.spriteMetadataFile === 'string'
          && renderContract.spriteMetadataFile.length > 0
          && typeof renderContract.nativeSpriteAtlasFile === 'string'
          && renderContract.nativeSpriteAtlasFile.length > 0
          && Number(rendererContract?.nativeFrameCount ?? renderContract.frameCount ?? 0) > 1
        );

      if (
        renderContract.renderMode === 'native_sprite'
        && typeof renderContract.frameCount === 'number'
        && renderContract.frameCount > 1
      ) {
        animationProbeCache.set(baseUrl, true);
        return true;
      }

      if (
        renderContract.renderMode === 'captured_final_atlas'
        && (
          renderContract.mode === 'rendered_frames'
          || (typeof renderContract.frameCount === 'number' && renderContract.frameCount > 1)
        )
      ) {
        animationProbeCache.set(baseUrl, true);
        return true;
      }

      const explicitStatic =
        (renderContract.animationMode === 'none' && !hasAuxNativeSprite)
        || renderContract.playbackHint === 'static'
        || (
          typeof renderContract.frameCount === 'number'
          && renderContract.frameCount <= 1
          && renderContract.animationMode !== 'native_sprite'
          && renderContract.animationMode !== 'native_sprite_aux'
        )
        || (captureContract?.multiFrame === false && rendererContract?.needsMultipleFrames === false && !hasAuxNativeSprite)
        || (
          rendererContract?.shouldPreferNativeSpriteAnimation === false
          && !hasAuxNativeSprite
          && Number(rendererContract?.nativeFrameCount ?? 0) <= 1
        );

      if (explicitStatic) {
        animationProbeCache.set(baseUrl, false);
        return false;
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

export const probeDirectGifPlayback = async (baseUrl: string): Promise<boolean> => {
  if (directGifProbeCache.has(baseUrl)) {
    return directGifProbeCache.get(baseUrl) ?? false;
  }

  const inFlight = directGifProbeInFlight.get(baseUrl);
  if (inFlight) {
    return inFlight;
  }

  const request = runAnimationWork(async () => {
    const detectFromResponse = (response: Response | null): boolean => {
      if (!response?.ok) return false;
      const contentType = response.headers.get('content-type') || '';
      return contentType.toLowerCase().includes('image/gif');
    };

    try {
      let response: Response | null = null;
      try {
        response = await fetch(baseUrl, { method: 'HEAD' });
      } catch {
        response = null;
      }

      let isGif = detectFromResponse(response);
      if (!isGif && (!response || !response.ok || !response.headers.get('content-type'))) {
        response = await fetch(baseUrl, { method: 'GET' });
        isGif = detectFromResponse(response);
      }

      directGifProbeCache.set(baseUrl, isGif);
      return isGif;
    } catch {
      directGifProbeCache.set(baseUrl, false);
      return false;
    } finally {
      directGifProbeInFlight.delete(baseUrl);
    }
  });

  directGifProbeInFlight.set(baseUrl, request);
  return request;
};

export const prepareItemAnimationFrames = async (
  entity: RenderableEntityLike,
): Promise<PreparedAnimationFrame[]> => {
  return resolvePreparedAnimationFrames(
    getItemImageBaseUrl(entity),
    entity.renderAssetRef ?? null,
  );
};

export const prewarmImageAsset = async (src?: string | null): Promise<void> => {
  const normalizedSrc = `${src ?? ''}`.trim();
  if (!normalizedSrc) {
    return;
  }
  try {
    await loadImageCached(normalizedSrc);
  } catch {
    // Ignore prewarm failures; visible render paths will retry on demand.
  }
};

export const isImageAssetWarm = (src?: string | null): boolean => {
  const normalizedSrc = `${src ?? ''}`.trim();
  if (!normalizedSrc) {
    return false;
  }
  return warmImageAssetHistory.has(normalizedSrc)
    || imageAssetCache.has(normalizedSrc)
    || imageAssetInFlight.has(normalizedSrc);
};

export const prewarmRenderableEntityMedia = async (
  entity: RenderableEntityLike,
): Promise<void> => {
  if (entity.itemId || entity.imageFileName || entity.renderAssetRef || entity.preferredImageUrl) {
    const itemImageUrl = getItemImageBaseUrl(entity);
    const explicitAnimation = entity.renderHint?.hasAnimation === true;
    const explicitStatic = entity.renderHint?.hasAnimation === false;

    if (explicitStatic) {
      await prewarmImageAsset(itemImageUrl);
      return;
    }

    if (explicitAnimation) {
      await resolvePreparedAnimationFrames(itemImageUrl, entity.renderAssetRef ?? null);
      return;
    }

    if (entity.renderAssetRef) {
      const animatedAtlasEntry = await fetchAnimatedAtlasEntry(entity.renderAssetRef);
      if (animatedAtlasEntry && animatedAtlasEntry.frames.length > 0) {
        await resolvePreparedAnimationFrames(itemImageUrl, entity.renderAssetRef ?? null);
        return;
      }
    }

    const spriteMetadata = await fetchNativeSpriteMetadata(itemImageUrl);
    if (spriteMetadata?.animated && (spriteMetadata.timeline?.length ?? 0) > 0) {
      await resolvePreparedAnimationFrames(itemImageUrl, entity.renderAssetRef ?? null);
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
    candidate.renderAssetRef
    || candidate.preferredImageUrl
    || renderHint?.hasAnimation
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

export const loadImageAsset = loadImageCached;
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
