<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { getItemImageUrlFromEntity } from '../services/api';
import {
  getSharedAnimationNowMs,
  prepareItemAnimationFrames,
  resolvePreparedAnimationFrameIndex,
  resolveTimelineFrameIndex,
  type PreparedAnimationFrame,
} from '../services/animationBudget';
import {
  getGlobalBrowserAtlasEntry,
  getLoadedGlobalAtlasImage,
  getStaticPlacement,
  normalizeFrames,
  normalizeTimeline,
  warmGlobalBrowserAtlasForItemsDetailed,
  type BrowserAtlasItemEntry,
} from '../services/globalBrowserAtlas';

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
const renderMode = ref<'loading' | 'atlas' | 'legacy'>('loading');

type PreparedAtlasAnimation = {
  atlasFile: string;
  frames: Array<{ index: number; x: number; y: number; width: number; height: number }>;
  timeline: Array<{ frameIndex: number; durationMs: number }>;
};

type PreparedAtlasStatic = {
  atlasFile: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

const atlasStatic = ref<PreparedAtlasStatic | null>(null);
const atlasAnimation = ref<PreparedAtlasAnimation | null>(null);

let animationFrameId: number | null = null;
let currentFrameIndex = 0;
let loadSequence = 0;

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

const drawAtlasSource = (
  atlas: HTMLImageElement,
  source: { x: number; y: number; width: number; height: number },
) => {
  const canvas = canvasRef.value;
  if (!canvas) return false;
  const ctx = canvas.getContext('2d');
  if (!ctx) return false;

  const sourceWidth = Math.max(1, Math.round(Number(source.width ?? 0)));
  const sourceHeight = Math.max(1, Math.round(Number(source.height ?? 0)));
  const sourceX = Math.max(0, Math.round(Number(source.x ?? 0)));
  const sourceY = Math.max(0, Math.round(Number(source.y ?? 0)));
  if (!sourceWidth || !sourceHeight) return false;

  if (canvas.width !== sourceWidth) canvas.width = sourceWidth;
  if (canvas.height !== sourceHeight) canvas.height = sourceHeight;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(atlas, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, sourceWidth, sourceHeight);
  return true;
};

const renderAtlasStatic = () => {
  const staticEntry = atlasStatic.value;
  if (!staticEntry) return false;
  const atlas = getLoadedGlobalAtlasImage(staticEntry.atlasFile);
  if (!atlas) return false;
  return drawAtlasSource(atlas, staticEntry);
};

const renderAtlasAnimationFrame = (timestamp: number = getSharedAnimationNowMs()) => {
  const animation = atlasAnimation.value;
  if (!animation) return false;
  const atlas = getLoadedGlobalAtlasImage(animation.atlasFile);
  if (!atlas) return false;
  const frameIndex = resolveTimelineFrameIndex(animation.timeline, timestamp);
  const frame = animation.frames.find((candidate) => candidate.index === frameIndex) ?? animation.frames[0];
  if (!frame) return false;
  return drawAtlasSource(atlas, frame);
};

const animate = (timestamp: number) => {
  if (atlasAnimation.value) {
    renderAtlasAnimationFrame(timestamp);
    if (isAnimating.value) {
      animationFrameId = requestAnimationFrame(animate);
    }
    return;
  }

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
  if ((!atlasAnimation.value && animationFrames.value.length <= 1) || isAnimating.value) return;
  isAnimating.value = true;
  if (atlasAnimation.value) {
    renderAtlasAnimationFrame(getSharedAnimationNowMs());
    animationFrameId = requestAnimationFrame(animate);
    return;
  }
  currentFrameIndex = resolvePreparedAnimationFrameIndex(animationFrames.value, getSharedAnimationNowMs());
  renderFrame(currentFrameIndex);
  animationFrameId = requestAnimationFrame(animate);
};

const resetState = () => {
  stopAnimation();
  hasAnimation.value = false;
  isLoaded.value = false;
  animationFrames.value = [];
  atlasStatic.value = null;
  atlasAnimation.value = null;
  renderMode.value = 'loading';
};

const stopAnimation = () => {
  isAnimating.value = false;
  if (animationFrameId !== null) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }
  currentFrameIndex = 0;
};

const prepareAtlasStatic = (entry: BrowserAtlasItemEntry): PreparedAtlasStatic | null => {
  const placement = getStaticPlacement(entry);
  const atlasFile = `${placement?.atlasFile ?? ''}`.trim();
  const width = Math.max(1, Number(placement?.width ?? 0));
  const height = Math.max(1, Number(placement?.height ?? 0));
  if (!atlasFile || !width || !height) return null;
  return {
    atlasFile,
    x: Math.max(0, Number(placement?.x ?? 0)),
    y: Math.max(0, Number(placement?.y ?? 0)),
    width,
    height,
  };
};

const prepareAtlasAnimation = (entry: BrowserAtlasItemEntry): PreparedAtlasAnimation | null => {
  const atlasFile = `${entry.animatedAtlas?.atlasFile ?? ''}`.trim();
  if (!atlasFile) return null;
  const frames = normalizeFrames(entry.animatedAtlas?.frames);
  const timeline = normalizeTimeline(entry.animatedAtlas?.timeline, entry.animatedAtlas?.frameDurationMs);
  if (frames.length === 0 || timeline.length === 0) return null;
  return { atlasFile, frames, timeline };
};

const checkAtlas = async (sequence: number): Promise<boolean> => {
  const itemId = `${props.itemId ?? ''}`.trim();
  if (!itemId) return false;

  await warmGlobalBrowserAtlasForItemsDetailed([itemId]);
  if (sequence !== loadSequence) return true;

  const entry = getGlobalBrowserAtlasEntry(itemId);
  if (!entry) return false;

  const preparedAnimation = props.enableAnimation ? prepareAtlasAnimation(entry) : null;
  const preparedStatic = prepareAtlasStatic(entry);
  if (!preparedAnimation && !preparedStatic) return false;

  atlasAnimation.value = preparedAnimation;
  atlasStatic.value = preparedStatic;
  hasAnimation.value = Boolean(preparedAnimation);
  renderMode.value = 'atlas';
  isLoaded.value = true;
  await nextTick();
  if (sequence !== loadSequence) return true;

  if (preparedAnimation) {
    startAnimation();
    return true;
  }

  renderAtlasStatic();
  return true;
};

const checkAnimation = async () => {
  const sequence = ++loadSequence;
  const atlasReady = await checkAtlas(sequence);
  if (sequence !== loadSequence || atlasReady) {
    return;
  }

  renderMode.value = 'legacy';
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
  loadSequence += 1;
  stopAnimation();
});
</script>

<template>
  <div class="animated-item-icon" :style="{ width: `${size}px`, height: `${size}px` }">
    <canvas
      v-if="renderMode === 'atlas' || (hasAnimation && isLoaded)"
      ref="canvasRef"
      :style="{
        width: `${size}px`,
        height: `${size}px`,
        imageRendering: 'pixelated',
      }"
    />

    <img
      v-else-if="renderMode === 'legacy'"
      :src="getImageSrc(itemId, renderAssetRef, imageFileName)"
      :alt="itemId"
      :style="{
        width: `${size}px`,
        height: `${size}px`,
        imageRendering: 'pixelated',
      }"
      @error="(e) => { (e.target as HTMLImageElement).src = '/placeholder.png'; }"
    />

    <span v-else class="animated-item-icon__placeholder" />
  </div>
</template>

<style scoped>
.animated-item-icon {
  display: inline-block;
}

.animated-item-icon__placeholder {
  display: block;
  width: 100%;
  height: 100%;
  border-radius: 4px;
  background: rgba(15, 23, 42, 0.72);
}
</style>
