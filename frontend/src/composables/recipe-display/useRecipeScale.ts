import { nextTick, onBeforeUnmount, onMounted, ref, watch, type ComputedRef } from 'vue';

export function useRecipeScale(shouldUseRouterScale: ComputedRef<boolean>, watchKeys: () => unknown[]) {
  const containerRef = ref<HTMLElement | null>(null);
  const contentRef = ref<HTMLElement | null>(null);
  const scaleValue = ref(1);
  let resizeObserver: ResizeObserver | null = null;
  let rafId: number | null = null;

  const calculateScale = () => {
    if (!shouldUseRouterScale.value || !containerRef.value || !contentRef.value) {
      scaleValue.value = 1;
      return;
    }

    const container = containerRef.value;
    const content = contentRef.value;
    const contentWidth = content.scrollWidth;
    const contentHeight = content.scrollHeight;
    if (contentWidth <= 0 || contentHeight <= 0) return;

    const scaleX = container.clientWidth / contentWidth;
    const scaleY = container.clientHeight / contentHeight;
    scaleValue.value = Math.min(scaleX, scaleY, 1);
  };

  const scheduleScale = () => {
    if (!shouldUseRouterScale.value) {
      scaleValue.value = 1;
      return;
    }
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
    }
    rafId = requestAnimationFrame(() => {
      rafId = null;
      void nextTick(() => {
        calculateScale();
      });
    });
  };

  onMounted(() => {
    scheduleScale();
    window.addEventListener('resize', scheduleScale);

    if (typeof ResizeObserver !== 'undefined' && containerRef.value) {
      resizeObserver = new ResizeObserver(() => {
        scheduleScale();
      });
      resizeObserver.observe(containerRef.value);
      if (contentRef.value) {
        resizeObserver.observe(contentRef.value);
      }
    }
  });

  onBeforeUnmount(() => {
    window.removeEventListener('resize', scheduleScale);
    if (resizeObserver) {
      resizeObserver.disconnect();
      resizeObserver = null;
    }
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  });

  watch(watchKeys, scheduleScale, { immediate: true });

  return {
    containerRef,
    contentRef,
    scaleValue,
    scheduleScale,
  };
}
