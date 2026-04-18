<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { getItemImageUrlFromEntity, getPreferredStaticImageUrlFromEntity, type Item } from "../services/api";
import type { PageAtlasSpriteEntry } from "../services/pageAtlas";
import {
  fetchAnimatedAtlasEntry,
  fetchNativeSpriteMetadata,
  getAnimatedAtlasImageUrl,
  getNativeSpriteAtlasUrl,
  loadImageAsset,
  probeAnimationSupport,
} from "../services/animationBudget";

interface Props {
  item: Item;
  itemSize?: number;
  enableAnimation?: boolean;
  animationSpeed?: number;
  eager?: boolean;
  deferAnimationMs?: number;
  atlasSprite?: PageAtlasSpriteEntry | null;
}

const props = withDefaults(defineProps<Props>(), {
  itemSize: 50,
  enableAnimation: true,
  animationSpeed: 20,
  eager: false,
  deferAnimationMs: 0,
  atlasSprite: null,
});

const emit = defineEmits<{
  click: [item: Item];
  contextmenu: [item: Item, event: MouseEvent];
}>();

const hasAnimation = ref(false);
const showAnimation = ref(false);
const isStaticImageLoaded = ref(false);
const staticImageError = ref(false);
const isAnimationLoaded = ref(false);
const canvasRef = ref<HTMLCanvasElement | null>(null);
const rootRef = ref<HTMLElement | null>(null);
const animationFrames = ref<HTMLImageElement[]>([]);
const isVisible = ref(false);

let animationFrameId: number | null = null;
let lastFrameTime = 0;
let animationProbeToken = 0;
let visibilityObserver: IntersectionObserver | null = null;

const frameInterval = computed(() => 1000 / props.animationSpeed);
const spriteScale = computed(() => (props.atlasSprite ? (props.itemSize * 0.9) / props.atlasSprite.slotSize : 1));
const atlasSpriteStyle = computed<Record<string, string> | null>(() => {
  if (!props.atlasSprite) return null;
  return {
    width: `${props.itemSize * 0.9}px`,
    height: `${props.itemSize * 0.9}px`,
    backgroundImage: `url(${props.atlasSprite.atlasUrl})`,
    backgroundRepeat: "no-repeat",
    backgroundPosition: `-${props.atlasSprite.x * spriteScale.value}px -${props.atlasSprite.y * spriteScale.value}px`,
    backgroundSize: `${props.atlasSprite.atlasWidth * spriteScale.value}px ${props.atlasSprite.atlasHeight * spriteScale.value}px`,
    imageRendering: "pixelated" as string,
  };
});

const getImageSrc = (item: Item): string => {
  return getPreferredStaticImageUrlFromEntity(item);
};

const imageSrc = computed(() => getImageSrc(props.item));
const shouldRenderFallbackImage = computed(() => {
  if (props.atlasSprite || showAnimation.value) return false;
  const src = imageSrc.value || "";
  return !src.includes('/images/item/OpenBlocks/devnull~0');
});

const renderFrame = (frameIndex: number) => {
  const canvas = canvasRef.value;
  const currentImg = animationFrames.value[frameIndex];
  if (!canvas || !currentImg || !currentImg.complete) return;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  canvas.width = currentImg.naturalWidth;
  canvas.height = currentImg.naturalHeight;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(currentImg, 0, 0);
};

const animate = (timestamp: number) => {
  if (!lastFrameTime) lastFrameTime = timestamp;
  const elapsed = timestamp - lastFrameTime;

  if (elapsed >= frameInterval.value) {
    const currentFrame =
      animationFrames.value.length > 0
        ? Math.floor(timestamp / frameInterval.value) % animationFrames.value.length
        : 0;
    renderFrame(currentFrame);
    lastFrameTime = timestamp;
  }

  animationFrameId = requestAnimationFrame(animate);
};

const stopAnimation = () => {
  if (animationFrameId !== null) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }
  lastFrameTime = 0;
};

const startAnimation = () => {
  if (animationFrames.value.length <= 1 || animationFrameId !== null) return;
  animationFrameId = requestAnimationFrame(animate);
};

const resetAnimationState = () => {
  stopAnimation();
  hasAnimation.value = false;
  showAnimation.value = false;
  isAnimationLoaded.value = false;
  animationFrames.value = [];
};

const loadAnimationFrames = async (token: number): Promise<void> => {
  const animatedAtlasEntry = await fetchAnimatedAtlasEntry(props.item.renderAssetRef);
  if (token !== animationProbeToken) return;

  if (animatedAtlasEntry && animatedAtlasEntry.frames.length > 0) {
    const atlasUrl = getAnimatedAtlasImageUrl(animatedAtlasEntry);
    if (atlasUrl) {
      const atlasImg = await loadImageAsset(atlasUrl);
      if (token !== animationProbeToken) return;

      const frames: HTMLImageElement[] = [];
      for (const frame of animatedAtlasEntry.frames) {
        const frameCanvas = document.createElement("canvas");
        frameCanvas.width = frame.width;
        frameCanvas.height = frame.height;
        const frameCtx = frameCanvas.getContext("2d");
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
        img.src = frameCanvas.toDataURL("image/png");
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = () => reject();
        });
        frames.push(img);
      }

      if (token !== animationProbeToken) return;
      animationFrames.value = frames;
      isAnimationLoaded.value = true;
      showAnimation.value = frames.length > 1;
      hasAnimation.value = frames.length > 1;
      if (frames.length > 1) {
        startAnimation();
      }
      return;
    }
  }

  const spriteMeta = await fetchNativeSpriteMetadata(getItemImageUrlFromEntity(props.item));
  if (token !== animationProbeToken) return;

  if (spriteMeta?.animated && (spriteMeta.timeline?.length ?? 0) > 0) {
    const atlasUrl = getNativeSpriteAtlasUrl(getItemImageUrlFromEntity(props.item), spriteMeta);
    const atlasImg = await loadImageAsset(atlasUrl);
    if (token !== animationProbeToken) return;

    const width = spriteMeta.width || atlasImg.naturalWidth;
    const height =
      spriteMeta.height || Math.floor(atlasImg.naturalHeight / Math.max(spriteMeta.timeline.length, 1));
    const frames: HTMLImageElement[] = [];

    for (let idx = 0; idx < spriteMeta.timeline.length; idx++) {
      const frame = spriteMeta.timeline[idx];
      const frameIndex =
        typeof frame.frameIndex === "number"
          ? frame.frameIndex
          : typeof frame.index === "number"
            ? frame.index
            : idx;

      const frameCanvas = document.createElement("canvas");
      frameCanvas.width = width;
      frameCanvas.height = height;
      const frameCtx = frameCanvas.getContext("2d");
      if (frameCtx) {
        frameCtx.drawImage(atlasImg, 0, frameIndex * height, width, height, 0, 0, width, height);
      }

      const img = new Image();
      img.src = frameCanvas.toDataURL("image/png");
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject();
      });
      frames.push(img);
    }

    if (token !== animationProbeToken) return;
    animationFrames.value = frames;
    isAnimationLoaded.value = true;
    showAnimation.value = frames.length > 1;
    hasAnimation.value = frames.length > 1;
    if (frames.length > 1) {
      startAnimation();
    }
  }
};

const scheduleAnimationEnhancement = () => {
  if (!props.enableAnimation) return;
  const token = ++animationProbeToken;

  const run = async () => {
    if (!isVisible.value || !isStaticImageLoaded.value) return;
    try {
      const supportsAnimation = await probeAnimationSupport(getItemImageUrlFromEntity(props.item), props.item.renderAssetRef);
      if (token !== animationProbeToken || !supportsAnimation) return;
      await loadAnimationFrames(token);
    } catch {
      // Keep static image visible on any animation-path failure.
    }
  };

  const kick = () => {
    if (typeof window !== "undefined" && "requestIdleCallback" in window) {
      (window as Window & { requestIdleCallback: (cb: () => void, opts?: { timeout: number }) => number })
        .requestIdleCallback(() => { void run(); }, { timeout: 1200 });
      return;
    }
    setTimeout(() => { void run(); }, 120);
  };

  if (props.deferAnimationMs > 0) {
    setTimeout(kick, props.deferAnimationMs);
    return;
  }

  kick();
};

const handleClick = () => {
  emit("click", props.item);
};

const handleContextMenu = (event: MouseEvent) => {
  event.preventDefault();
  emit("contextmenu", props.item, event);
};

const handleRightMouseDown = (event: MouseEvent) => {
  if (event.button !== 2) return;
  event.preventDefault();
  emit("contextmenu", props.item, event);
};

watch(
  () => props.item.itemId,
  () => {
    resetAnimationState();
    isStaticImageLoaded.value = Boolean(props.atlasSprite);
    staticImageError.value = false;
    if (isVisible.value && !props.atlasSprite) {
      scheduleAnimationEnhancement();
    }
  },
);

watch(
  () => props.atlasSprite,
  (atlasSprite) => {
    if (atlasSprite) {
      resetAnimationState();
      isStaticImageLoaded.value = true;
      staticImageError.value = false;
      return;
    }

    isStaticImageLoaded.value = false;
    if (isVisible.value) {
      scheduleAnimationEnhancement();
    }
  },
  { immediate: true },
);

onMounted(() => {
  const element = rootRef.value;
  if (element) {
    visibilityObserver = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        isVisible.value = Boolean(entry?.isIntersecting);
        if (isVisible.value && props.enableAnimation && isStaticImageLoaded.value && !hasAnimation.value && !showAnimation.value) {
          scheduleAnimationEnhancement();
        }
      },
      {
        rootMargin: "160px",
        threshold: 0.01,
      },
    );
    visibilityObserver.observe(element);
  }
});

onUnmounted(() => {
  animationProbeToken += 1;
  stopAnimation();
  visibilityObserver?.disconnect();
});
</script>

<template>
  <div
    ref="rootRef"
    @click="handleClick"
    @mousedown="handleRightMouseDown"
    @contextmenu="handleContextMenu"
    class="item-card-enhanced surface-card flex items-center justify-center relative group overflow-hidden"
    :class="['card-interactive', { 'animate-fade-in': isStaticImageLoaded || isAnimationLoaded }]"
    :style="{ width: `${itemSize}px`, height: `${itemSize}px` }"
  >
    <div
      v-if="!isStaticImageLoaded && !isAnimationLoaded && !staticImageError"
      class="absolute inset-0 flex items-center justify-center bg-subtle/50 rounded"
    >
      <div class="spinner"></div>
    </div>

    <img
      v-if="shouldRenderFallbackImage"
      :src="imageSrc"
      :loading="eager ? 'eager' : 'lazy'"
      :fetchpriority="eager ? 'high' : 'auto'"
      :decoding="eager ? 'sync' : 'async'"
      :alt="item.localizedName"
      :style="{
        width: `${itemSize * 0.9}px`,
        height: `${itemSize * 0.9}px`,
        imageRendering: 'pixelated',
      }"
      :class="[
        'object-contain transition-all duration-normal',
        {
          'opacity-0': !isStaticImageLoaded,
          'opacity-100': isStaticImageLoaded,
        },
      ]"
      @load="
        () => {
          isStaticImageLoaded = true;
          if (isVisible && props.enableAnimation && !hasAnimation && !showAnimation) {
            scheduleAnimationEnhancement();
          }
        }
      "
      @error="
        (e) => {
          staticImageError = true;
          isStaticImageLoaded = true;
          (e.target as HTMLImageElement).src = '/placeholder.png';
        }
      "
    />

    <div
      v-if="!showAnimation && atlasSprite"
      :style="atlasSpriteStyle || undefined"
      class="atlas-sprite"
    />

    <canvas
      v-if="showAnimation && isAnimationLoaded"
      ref="canvasRef"
      class="rounded"
      :style="{
        width: `${itemSize * 0.9}px`,
        height: `${itemSize * 0.9}px`,
        imageRendering: 'pixelated',
      }"
    />

    <div
      class="absolute inset-0 rounded ring-1 ring-black/5 opacity-0 group-hover:opacity-100 transition-all pointer-events-none"
    ></div>
  </div>
</template>

<style scoped>
.surface-card {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  transition: all var(--duration-normal) var(--ease-smooth);
}

.surface-card:hover {
  box-shadow: var(--shadow-md);
  transform: translateY(-2px);
}

.bg-subtle\/50 {
  background: var(--color-surface-embedded);
  opacity: 0.5;
}

.rounded {
  border-radius: var(--radius-sm);
}

@keyframes fade-in {
  from {
    opacity: 0;
    transform: scale(0.95);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

.animate-fade-in {
  animation: fade-in var(--duration-normal) var(--ease-smooth);
}

.duration-normal {
  transition-duration: var(--duration-normal);
}

.opacity-0 {
  opacity: 0;
}

.opacity-100 {
  opacity: 1;
}

.ring-black\/5 {
  --tw-ring-color: rgb(0 0 0 / 0.05);
}

.group:hover .group-hover\:opacity-100 {
  opacity: 1;
}

.transition-all {
  transition-property: all;
  transition-timing-function: var(--ease-smooth);
  transition-duration: var(--duration-normal);
}

.relative {
  position: relative;
}

.absolute {
  position: absolute;
}

.inset-0 {
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
}

.flex {
  display: flex;
}

.items-center {
  align-items: center;
}

.justify-center {
  justify-content: center;
}

.overflow-hidden {
  overflow: hidden;
}

.pointer-events-none {
  pointer-events: none;
}

.object-contain {
  object-fit: contain;
}

.atlas-sprite {
  flex-shrink: 0;
}
</style>
