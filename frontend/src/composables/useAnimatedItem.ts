import { onMounted, onUnmounted, ref } from 'vue';
import {
  fetchNativeSpriteMetadata,
  getNativeSpriteAtlasUrl,
  loadImageAsset,
  probeAnimationSupport,
} from '../services/animationBudget';

interface AnimatedItemOptions {
  baseUrl: string;
  fps?: number;
  autoplay?: boolean;
}

export async function detectAnimation(baseUrl: string): Promise<{
  hasAnimation: boolean;
  frameCount: number;
  frameUrls: string[];
}> {
  try {
    const spriteMeta = await fetchNativeSpriteMetadata(baseUrl);
    if (spriteMeta?.animated && (spriteMeta.timeline?.length ?? 0) > 0) {
      return {
        hasAnimation: true,
        frameCount: spriteMeta.timeline!.length,
        frameUrls: [getNativeSpriteAtlasUrl(baseUrl, spriteMeta)],
      };
    }
  } catch {
  }
  return { hasAnimation: false, frameCount: 0, frameUrls: [baseUrl] };
}

export function useAnimatedItem(options: AnimatedItemOptions) {
  const { baseUrl, fps = 20, autoplay = true } = options;

  const canvasRef = ref<HTMLCanvasElement | null>(null);
  const isAnimating = ref(false);
  const currentFrame = ref(0);
  const frameUrls = ref<string[]>([]);
  const frames = ref<HTMLImageElement[]>([]);
  const isLoaded = ref(false);

  let animationFrameId: number | null = null;
  let lastFrameTime = 0;
  const frameInterval = 1000 / fps;

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

  const renderFrame = () => {
    const canvas = canvasRef.value;
    if (!canvas || frames.value.length === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const currentImg = frames.value[currentFrame.value];
    if (!currentImg || !currentImg.complete || currentImg.naturalWidth === 0) return;

    canvas.width = currentImg.naturalWidth;
    canvas.height = currentImg.naturalHeight;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(currentImg, 0, 0);
  };

  const animate = (timestamp: number) => {
    if (!lastFrameTime) {
      lastFrameTime = timestamp;
    }
    const elapsed = timestamp - lastFrameTime;

    if (elapsed >= frameInterval) {
      currentFrame.value = (currentFrame.value + 1) % Math.max(frames.value.length, 1);
      renderFrame();
      lastFrameTime = timestamp;
    }

    if (isAnimating.value) {
      animationFrameId = requestAnimationFrame(animate);
    }
  };

  const startAnimation = () => {
    if (frames.value.length <= 1 || isAnimating.value) return;
    isAnimating.value = true;
    animationFrameId = requestAnimationFrame(animate);
  };

  const stopAnimation = () => {
    isAnimating.value = false;
    if (animationFrameId !== null) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }
  };

  const loadFrames = async () => {
    const spriteMeta = await fetchNativeSpriteMetadata(baseUrl);

    if (spriteMeta?.animated && (spriteMeta.timeline?.length ?? 0) > 0) {
      const atlasUrl = getNativeSpriteAtlasUrl(baseUrl, spriteMeta);
      const atlasImg = await loadImageAsset(atlasUrl);
      const width = spriteMeta.width || atlasImg.naturalWidth;
      const physicalFrameCount = getSpriteSheetPhysicalFrameCount(spriteMeta.timeline, spriteMeta.frameCount);
      const height =
        spriteMeta.height ||
        Math.floor(atlasImg.naturalHeight / physicalFrameCount);

      const loadedFrames: HTMLImageElement[] = [];
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
        loadedFrames.push(img);
      }

      frames.value = loadedFrames;
      frameUrls.value = [atlasUrl];
      isLoaded.value = true;
      if (autoplay && loadedFrames.length > 1) startAnimation();
      return;
    }

    const img = new Image();
    img.src = baseUrl;
    await new Promise((resolve) => {
      img.onload = resolve;
      img.onerror = resolve;
    });
    frames.value = [img];
    frameUrls.value = [baseUrl];
    isLoaded.value = true;
  };

  onMounted(() => {
    void probeAnimationSupport(baseUrl).then((hasAnim) => {
      if (hasAnim) {
        void loadFrames();
      } else {
        const img = new Image();
        img.src = baseUrl;
        frames.value = [img];
        frameUrls.value = [baseUrl];
        isLoaded.value = true;
      }
    });
  });

  onUnmounted(() => {
    stopAnimation();
  });

  return {
    canvasRef,
    isAnimating,
    currentFrame,
    frameUrls,
    frames,
    isLoaded,
    frameCount: frameUrls.value.length,
    startAnimation,
    stopAnimation,
    loadFrames,
  };
}
