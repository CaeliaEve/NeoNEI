<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue';
import { getItemImageUrlFromEntity } from '../services/api';
import {
  getSharedAnimationNowMs,
  prepareItemAnimationFrames,
  resolvePreparedAnimationFrameIndex,
  type PreparedAnimationFrame,
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

const hasAnimation = ref(false);
const isAnimating = ref(false);
const isLoaded = ref(false);
const canvasRef = ref<HTMLCanvasElement | null>(null);
const animationFrames = ref<PreparedAnimationFrame[]>([]);

let animationFrameId: number | null = null;
let currentFrameIndex = 0;

const renderFrame = (frameIndex: number) => {
  const canvas = canvasRef.value;
  if (!canvas || animationFrames.value.length === 0) return;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const currentFrame = animationFrames.value[frameIndex];
  if (!currentFrame) return;

  canvas.width = currentFrame.width;
  canvas.height = currentFrame.height;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(currentFrame.source, 0, 0, currentFrame.width, currentFrame.height);
};

const animate = (timestamp: number) => {
  if (!animationFrames.value.length) {
    animationFrameId = null;
    return;
  }

  const nextFrameIndex = resolvePreparedAnimationFrameIndex(animationFrames.value, timestamp);
  if (nextFrameIndex !== currentFrameIndex) {
    currentFrameIndex = nextFrameIndex;
    renderFrame(currentFrameIndex);
  }

  if (isAnimating.value) {
    animationFrameId = requestAnimationFrame(animate);
  }
};

const startAnimation = () => {
  if (animationFrames.value.length <= 1 || isAnimating.value) return;
  isAnimating.value = true;
  currentFrameIndex = resolvePreparedAnimationFrameIndex(animationFrames.value, getSharedAnimationNowMs());
  renderFrame(currentFrameIndex);
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

const checkAnimation = async () => {
  if (!props.enableAnimation) {
    isLoaded.value = true;
    return;
  }

  try {
    const frames = await prepareItemAnimationFrames({
      itemId: props.itemId,
      renderAssetRef: props.renderAssetRef ?? null,
      imageFileName: props.imageFileName ?? null,
    });
    animationFrames.value = frames;
    hasAnimation.value = frames.length > 1;
    isLoaded.value = true;
    if (frames.length > 1) {
      startAnimation();
    }
  } catch (error) {
    console.error('Error loading animated item icon:', error);
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
