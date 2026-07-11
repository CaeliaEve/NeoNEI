<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import {
  getSharedAnimationNowMs,
  resolveTimelineFrameIndex,
} from '../services/animationBudget';
import {
  getGlobalBrowserAtlasEntry,
  getLoadedGlobalAtlasImage,
  getStaticPlacement,
  normalizeFrames,
  normalizeTimeline,
  selectAtlasFrameByTimelineIndex,
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

const hasAnimation = ref(false);
const isAnimating = ref(false);
const isLoaded = ref(false);
const canvasRef = ref<HTMLCanvasElement | null>(null);
const renderMode = ref<'loading' | 'atlas'>('loading');

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
let loadSequence = 0;

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
  const frame = selectAtlasFrameByTimelineIndex(animation.frames, frameIndex);
  if (!frame) return false;
  return drawAtlasSource(atlas, frame);
};

const animate = (timestamp: number) => {
  if (!atlasAnimation.value) {
    animationFrameId = null;
    return;
  }

  renderAtlasAnimationFrame(timestamp);
  if (isAnimating.value) {
    animationFrameId = requestAnimationFrame(animate);
  }
};

const startAnimation = () => {
  if (!atlasAnimation.value || isAnimating.value) return;
  isAnimating.value = true;
  renderAtlasAnimationFrame(getSharedAnimationNowMs());
  animationFrameId = requestAnimationFrame(animate);
};

const resetState = () => {
  stopAnimation();
  hasAnimation.value = false;
  isLoaded.value = false;
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
  const renderAssetRef = `${props.renderAssetRef ?? ''}`.trim();
  if (!itemId && !renderAssetRef) return false;

  const lookupKeys = Array.from(new Set([renderAssetRef, itemId].filter(Boolean)));
  await warmGlobalBrowserAtlasForItemsDetailed(lookupKeys);
  if (sequence !== loadSequence) return true;

  const entry = getGlobalBrowserAtlasEntry(itemId, renderAssetRef);
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

  // Native-NEI runtime contract: item icons are resolved from the compiled
  // browser atlas/render index. Do not fall back to per-item GIF/sprite probing
  // here; that path reintroduces page-local texture fetches and hides exporter
  // defects behind slow frontend work. Missing atlas entries must be fixed in
  // Elysium compiler/dist-data validation.
  renderMode.value = 'atlas';
  isLoaded.value = true;
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
      v-else
      src="/placeholder.png"
      :alt="itemId"
      class="animated-item-icon__placeholder-image"
      :style="{ width: `${size}px`, height: `${size}px` }"
    />
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

.animated-item-icon__placeholder-image {
  display: block;
  image-rendering: pixelated;
  opacity: 0.72;
}
</style>
