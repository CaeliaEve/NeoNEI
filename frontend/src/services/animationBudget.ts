import {
  resolveCanonicalRelativePath,
  getSpriteAtlasUrlFromImageUrl,
  getSpriteMetadataUrlFromImageUrl,
  resolveRenderRelativePath,
  type AnimatedAtlasAssetEntry,
  type NativeSpriteMetadata,
} from './api/images';
import { api } from './api';

const MAX_ANIMATION_WORKERS = 3;

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

const animationProbeCache = new Map<string, boolean>();
const animationProbeInFlight = new Map<string, Promise<boolean>>();
const spriteMetadataCache = new Map<string, NativeSpriteMetadata | null>();
const spriteMetadataInFlight = new Map<string, Promise<NativeSpriteMetadata | null>>();
const animatedAtlasCache = new Map<string, AnimatedAtlasAssetEntry | null>();
const animatedAtlasInFlight = new Map<string, Promise<AnimatedAtlasAssetEntry | null>>();

const loadImage = (src: string): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.src = src;
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Image load failed: ${src}`));
  });
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

export const probeAnimationSupport = async (baseUrl: string, renderAssetRef?: string | null): Promise<boolean> => {
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

  const hasAnimation = Boolean(spriteMetadata?.animated);
  animationProbeCache.set(baseUrl, hasAnimation);
  animationProbeInFlight.delete(baseUrl);
  return hasAnimation;
};

export const loadImageAsset = loadImage;
export const getNativeSpriteAtlasUrl = (
  baseUrl: string,
  metadata?: NativeSpriteMetadata | null,
): string => {
  return (
    resolveRenderRelativePath(metadata?.nativeSpriteAtlasFile) ||
    getSpriteAtlasUrlFromImageUrl(baseUrl)
  );
};

export const getAnimatedAtlasImageUrl = (entry?: AnimatedAtlasAssetEntry | null): string | null => {
  return resolveCanonicalRelativePath(entry?.atlasFile);
};
