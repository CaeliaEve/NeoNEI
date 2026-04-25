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
const renderContractCache = new Map<string, Awaited<ReturnType<typeof api.getRenderContractAsset>> | null>();
const renderContractInFlight = new Map<string, Promise<Awaited<ReturnType<typeof api.getRenderContractAsset>> | null>>();
const directGifProbeCache = new Map<string, boolean>();
const directGifProbeInFlight = new Map<string, Promise<boolean>>();

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

export const probeAnimationSupport = async (baseUrl: string, renderAssetRef?: string | null): Promise<boolean> => {
  const renderContract = renderAssetRef ? await fetchRenderContractAsset(renderAssetRef) : null;
  if (renderContract) {
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

  const hasAnimation = Boolean(spriteMetadata?.animated);
  animationProbeCache.set(baseUrl, hasAnimation);
  animationProbeInFlight.delete(baseUrl);
  return hasAnimation;
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
