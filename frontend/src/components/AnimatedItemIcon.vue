<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import { getImageUrl } from '../services/api';
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
  size?: number;
  enableAnimation?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  size: 32,
  enableAnimation: true,
});

const getImageSrc = (itemId: string): string => getImageUrl(itemId);

const hasAnimation = ref(false);
const isAnimating = ref(false);
const isLoaded = ref(false);
const canvasRef = ref<HTMLCanvasElement | null>(null);
const animationFrames = ref<HTMLImageElement[]>([]);

let animationFrameId: number | null = null;
let lastFrameTime = 0;
const animationFPS = 20;
const frameInterval = 1000 / animationFPS;

const renderFrame = (frameIndex: number) => {
  const canvas = canvasRef.value;
  if (!canvas || animationFrames.value.length === 0) return;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const currentImg = animationFrames.value[frameIndex];
  if (!currentImg || !currentImg.complete) return;

  canvas.width = currentImg.naturalWidth;
  canvas.height = currentImg.naturalHeight;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(currentImg, 0, 0);
};

const animate = (timestamp: number) => {
  if (!lastFrameTime) lastFrameTime = timestamp;
  const elapsed = timestamp - lastFrameTime;

  if (elapsed >= frameInterval) {
    const currentFrame =
      animationFrames.value.length > 0
        ? Math.floor(timestamp / frameInterval) % animationFrames.value.length
        : 0;
    renderFrame(currentFrame);
    lastFrameTime = timestamp;
  }

  if (isAnimating.value) {
    animationFrameId = requestAnimationFrame(animate);
  }
};

const startAnimation = () => {
  if (animationFrames.value.length <= 1 || isAnimating.value) return;
  isAnimating.value = true;
  lastFrameTime = 0;
  animationFrameId = requestAnimationFrame(animate);
};

const stopAnimation = () => {
  isAnimating.value = false;
  if (animationFrameId !== null) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }
};

const loadAnimationFrames = async (itemId: string, renderAssetRef?: string | null): Promise<void> => {
  try {
    const imageUrl = getImageSrc(itemId);
    const animatedAtlasEntry = await fetchAnimatedAtlasEntry(renderAssetRef);
    const frames: HTMLImageElement[] = [];

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
          frames.push(img);
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
      const height =
        spriteMeta.height ||
        Math.floor(atlasImg.naturalHeight / Math.max(spriteMeta.timeline.length, 1));

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
        frames.push(img);
      }
    } else {
      const staticImg = await loadImageAsset(imageUrl);
      frames.push(staticImg);
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
    const imageUrl = getImageSrc(props.itemId);
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
      :src="getImageSrc(itemId)"
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
