<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue';
import { getItemImageUrlFromEntity } from '../services/api';
import {
  fetchAnimatedAtlasEntry,
  fetchNativeSpriteMetadata,
  getAnimatedAtlasImageUrl,
  getNativeSpriteAtlasUrl,
  loadImageAsset,
  probeAnimationSupport,
} from '../services/animationBudget';

interface Props {
  itemId: string;
  renderAssetRef?: string | null;
  imageFileName?: string | null;
  size?: number;
  enableAnimation?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  size: 32,
  enableAnimation: true,
});

const getImageSrc = (itemId: string, renderAssetRef?: string | null, imageFileName?: string | null): string => (
  getItemImageUrlFromEntity({ itemId, renderAssetRef, imageFileName })
);

const getAnimationBaseUrl = (
  itemId: string,
  renderAssetRef?: string | null,
  imageFileName?: string | null,
): string => {
  return getItemImageUrlFromEntity({ itemId, renderAssetRef, imageFileName });
};

const hasAnimation = ref(false);
const isAnimating = ref(false);
const isLoaded = ref(false);
const canvasRef = ref<HTMLCanvasElement | null>(null);
const animationFrames = ref<Array<{ image: HTMLImageElement; durationMs: number }>>([]);

let animationFrameId: number | null = null;
let lastFrameTime = 0;
let currentFrameIndex = 0;
const DEFAULT_FRAME_DURATION_MS = 50;

const normalizeFrameDuration = (durationMs?: number | null): number => {
  if (typeof durationMs !== 'number' || !Number.isFinite(durationMs) || durationMs <= 0) {
    return DEFAULT_FRAME_DURATION_MS;
  }
  return Math.max(16, Math.round(durationMs));
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

const renderFrame = (frameIndex: number) => {
  const canvas = canvasRef.value;
  if (!canvas || animationFrames.value.length === 0) return;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const currentImg = animationFrames.value[frameIndex]?.image;
  if (!currentImg || !currentImg.complete) return;

  canvas.width = currentImg.naturalWidth;
  canvas.height = currentImg.naturalHeight;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(currentImg, 0, 0);
};

const animate = (timestamp: number) => {
  if (!animationFrames.value.length) {
    animationFrameId = null;
    return;
  }

  if (!lastFrameTime) {
    lastFrameTime = timestamp;
    renderFrame(currentFrameIndex);
    if (isAnimating.value) {
      animationFrameId = requestAnimationFrame(animate);
    }
    return;
  }

  let elapsed = timestamp - lastFrameTime;
  let frameDuration = normalizeFrameDuration(animationFrames.value[currentFrameIndex]?.durationMs);
  let advanced = false;
  let guard = 0;

  while (elapsed >= frameDuration && guard < animationFrames.value.length * 2) {
    elapsed -= frameDuration;
    currentFrameIndex = (currentFrameIndex + 1) % animationFrames.value.length;
    frameDuration = normalizeFrameDuration(animationFrames.value[currentFrameIndex]?.durationMs);
    advanced = true;
    guard += 1;
  }

  if (advanced) {
    renderFrame(currentFrameIndex);
  }

  lastFrameTime = timestamp - elapsed;
  if (isAnimating.value) {
    animationFrameId = requestAnimationFrame(animate);
  }
};

const startAnimation = () => {
  if (animationFrames.value.length <= 1 || isAnimating.value) return;
  isAnimating.value = true;
  currentFrameIndex = 0;
  renderFrame(currentFrameIndex);
  lastFrameTime = 0;
  animationFrameId = requestAnimationFrame(animate);
};

const resetState = () => {
  stopAnimation();
  hasAnimation.value = false;
  isLoaded.value = false;
  animationFrames.value = [];
};

const stopAnimation = () => {
  isAnimating.value = false;
  if (animationFrameId !== null) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }
  currentFrameIndex = 0;
};

const loadAnimationFrames = async (itemId: string, renderAssetRef?: string | null): Promise<void> => {
  try {
    const imageUrl = getAnimationBaseUrl(itemId, renderAssetRef, props.imageFileName);
    const animatedAtlasEntry = await fetchAnimatedAtlasEntry(renderAssetRef);
    const frames: Array<{ image: HTMLImageElement; durationMs: number }> = [];

    if (animatedAtlasEntry && animatedAtlasEntry.frames.length > 0) {
      const atlasUrl = getAnimatedAtlasImageUrl(animatedAtlasEntry);
      if (atlasUrl) {
        const atlasImg = await loadImageAsset(atlasUrl);
        for (const frame of animatedAtlasEntry.frames) {
          const frameCanvas = document.createElement('canvas');
          frameCanvas.width = frame.width;
          frameCanvas.height = frame.height;
          const frameCtx = frameCanvas.getContext('2d');
          if (frameCtx) {
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
          }

          const img = new Image();
          img.src = frameCanvas.toDataURL('image/png');
          await new Promise<void>((resolve, reject) => {
            img.onload = () => resolve();
            img.onerror = () => reject();
          });
          const timelineEntry = animatedAtlasEntry.timeline?.find((entry) => entry.index === frame.index)
            ?? animatedAtlasEntry.timeline?.find((entry) => entry.frameIndex === frame.index);
          frames.push({
            image: img,
            durationMs: normalizeFrameDuration(timelineEntry?.durationMs ?? animatedAtlasEntry.frameDurationMs),
          });
        }
      }
    }

    if (frames.length > 0) {
      animationFrames.value = frames;
      isLoaded.value = true;
      if (frames.length > 1) {
        hasAnimation.value = true;
        startAnimation();
      }
      return;
    }

    const spriteMeta = await fetchNativeSpriteMetadata(imageUrl);

    if (spriteMeta?.animated && (spriteMeta.timeline?.length ?? 0) > 0) {
      const atlasUrl = getNativeSpriteAtlasUrl(imageUrl, spriteMeta);
      const atlasImg = await loadImageAsset(atlasUrl);
      const width = spriteMeta.width || atlasImg.naturalWidth;
      const physicalFrameCount = getSpriteSheetPhysicalFrameCount(spriteMeta.timeline, spriteMeta.frameCount);
      const height =
        spriteMeta.height ||
        Math.floor(atlasImg.naturalHeight / physicalFrameCount);
      const defaultFrameDurationMs = normalizeFrameDuration(
        typeof spriteMeta.defaultFrameTime === 'number' ? spriteMeta.defaultFrameTime * 50 : undefined,
      );

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
        if (frameCtx) {
          frameCtx.drawImage(atlasImg, 0, frameIndex * height, width, height, 0, 0, width, height);
        }

        const img = new Image();
        img.src = frameCanvas.toDataURL('image/png');
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = () => reject();
        });
        frames.push({
          image: img,
          durationMs: normalizeFrameDuration(
            typeof frame.durationMs === 'number' ? frame.durationMs : defaultFrameDurationMs,
          ),
        });
      }
    } else {
      const staticImg = await loadImageAsset(imageUrl);
      frames.push({ image: staticImg, durationMs: DEFAULT_FRAME_DURATION_MS });
    }

    animationFrames.value = frames;
    isLoaded.value = true;

    if (frames.length > 1) {
      hasAnimation.value = true;
      startAnimation();
    }
  } catch (error) {
    console.error('Error loading animated item icon:', error);
    isLoaded.value = true;
  }
};

const checkAnimation = async () => {
  if (!props.enableAnimation) {
    isLoaded.value = true;
    return;
  }

  try {
    const imageUrl = getImageSrc(props.itemId, props.renderAssetRef, props.imageFileName);
    const hasAnim = await probeAnimationSupport(imageUrl, props.renderAssetRef);
    if (hasAnim) {
      await loadAnimationFrames(props.itemId, props.renderAssetRef);
    } else {
      isLoaded.value = true;
    }
  } catch {
    isLoaded.value = true;
  }
};

onMounted(() => {
  void checkAnimation();
});

watch(
  () => [props.itemId, props.renderAssetRef, props.imageFileName, props.enableAnimation],
  () => {
    resetState();
    void checkAnimation();
  },
);

onUnmounted(() => {
  stopAnimation();
});
</script>

<template>
  <div class="animated-item-icon" :style="{ width: `${size}px`, height: `${size}px` }">
    <canvas
      v-if="hasAnimation && isLoaded"
      ref="canvasRef"
      :style="{
        width: `${size}px`,
        height: `${size}px`,
        imageRendering: 'pixelated',
      }"
    />

    <img
      v-else
      :src="getImageSrc(itemId, renderAssetRef, imageFileName)"
      :alt="itemId"
      :style="{
        width: `${size}px`,
        height: `${size}px`,
        imageRendering: 'pixelated',
      }"
      @error="(e) => { (e.target as HTMLImageElement).src = '/placeholder.png'; }"
    />
  </div>
</template>

<style scoped>
.animated-item-icon {
  display: inline-block;
}
</style>
