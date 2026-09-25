import { resolveOpfsCachedAssetUrl } from './opfsAssetCache';

const MAX_CACHED_IMAGE_ASSETS = 384;
const MAX_WARM_IMAGE_HISTORY = 8192;

const imageAssetCache = new Map<string, HTMLImageElement>();
const imageAssetInFlight = new Map<string, Promise<HTMLImageElement>>();
const warmImageAssetHistory = new Map<string, true>();

const touchBoundedCache = <T>(
  cache: Map<string, T>,
  key: string,
  value: T,
  maxSize: number,
): void => {
  cache.delete(key);
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
        // The loaded image remains usable when decode() is unsupported or rejects.
      }
      resolve(image);
    };
    image.onerror = () => reject(new Error(`Image load failed: ${src}`));
  });
};

export const loadImageAsset = async (src: string): Promise<HTMLImageElement> => {
  const cached = imageAssetCache.get(src);
  if (cached) {
    touchBoundedCache(imageAssetCache, src, cached, MAX_CACHED_IMAGE_ASSETS);
    touchBoundedCache(warmImageAssetHistory, src, true, MAX_WARM_IMAGE_HISTORY);
    return cached;
  }

  const inFlight = imageAssetInFlight.get(src);
  if (inFlight) {
    return inFlight;
  }

  const request = resolveOpfsCachedAssetUrl(src)
    .then((cachedSrc) => loadImage(cachedSrc ?? src))
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

export const prewarmImageAsset = async (src?: string | null): Promise<void> => {
  const normalizedSrc = `${src ?? ''}`.trim();
  if (!normalizedSrc) return;
  try {
    await loadImageAsset(normalizedSrc);
  } catch {
    // Visible render paths retry failed speculative prewarms on demand.
  }
};

export const isImageAssetWarm = (src?: string | null): boolean => {
  const normalizedSrc = `${src ?? ''}`.trim();
  if (!normalizedSrc) return false;
  return warmImageAssetHistory.has(normalizedSrc)
    || imageAssetCache.has(normalizedSrc)
    || imageAssetInFlight.has(normalizedSrc);
};

export const isImageAssetDecoded = (src?: string | null): boolean => {
  const normalizedSrc = `${src ?? ''}`.trim();
  if (!normalizedSrc) return false;
  return imageAssetCache.has(normalizedSrc) || warmImageAssetHistory.has(normalizedSrc);
};
