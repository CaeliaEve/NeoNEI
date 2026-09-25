import { computed, onBeforeUnmount, ref, type ComputedRef, type Ref } from "vue";

type GridViewportSync = () => void;

export function useHomeGridViewport(itemSize: Ref<number>) {
  const itemGridViewportRef = ref<HTMLElement | null>(null);
  let syncViewport: GridViewportSync = () => {};
  let viewportResizeObserver: ResizeObserver | null = null;
  let cachedContentWidth = 0;
  let cachedContentHeight = 0;

  const updateCachedViewportSize = (width: number, height: number) => {
    cachedContentWidth = Math.max(0, width);
    cachedContentHeight = Math.max(0, height);
  };

  const measureGridCapacityRaw = () => {
    const shell = itemGridViewportRef.value;
    if (!shell) return null;

    const gap = 4;
    const usableWidth = cachedContentWidth || Math.max(0, shell.clientWidth - 32);
    const usableHeight = cachedContentHeight || Math.max(0, shell.clientHeight - 32);
    const columnCount = Math.max(1, Math.floor((usableWidth + gap) / (itemSize.value + gap)));
    const rows = Math.max(1, Math.floor((usableHeight + gap) / (itemSize.value + gap)));

    if (columnCount <= 0 || rows <= 0) return null;
    return columnCount * rows;
  };

  const measureVisibleGridCapacity = (pageSize: Ref<number>) => {
    const capacity = measureGridCapacityRaw();
    if (!capacity) return null;
    const baseline = Math.max(20, pageSize.value);
    const lowerBound = Math.max(20, Math.floor(baseline * 0.75));
    const upperBound = Math.max(lowerBound, Math.ceil(baseline * 1.5));
    if (capacity < lowerBound || capacity > upperBound) {
      return null;
    }
    return capacity;
  };

  const setGridViewportSync = (sync: GridViewportSync) => {
    syncViewport = sync;
  };

  const setItemGridViewportRef = (element: HTMLElement | null) => {
    if (element === itemGridViewportRef.value) return;
    viewportResizeObserver?.disconnect();
    viewportResizeObserver = null;
    itemGridViewportRef.value = element;
    cachedContentWidth = 0;
    cachedContentHeight = 0;
    if (!element) return;
    if (typeof ResizeObserver !== "undefined") {
      viewportResizeObserver = new ResizeObserver((entries) => {
        const entry = entries[0];
        if (!entry) return;
        updateCachedViewportSize(entry.contentRect.width, entry.contentRect.height);
        syncViewport();
      });
      viewportResizeObserver.observe(element);
      return;
    }
    syncViewport();
  };

  onBeforeUnmount(() => {
    viewportResizeObserver?.disconnect();
    viewportResizeObserver = null;
  });

  return {
    itemGridViewportRef,
    setItemGridViewportRef,
    setGridViewportSync,
    measureGridCapacityRaw,
    measureVisibleGridCapacity,
  };
}

export function useHomeRailStyles(recipePreviewNeedsWideStage: ComputedRef<boolean>) {
  const centerRailStyle = computed(() => ({
    width: "var(--home-center-width)",
    left: "var(--home-center-left)",
  }));

  const leftRailStyle = computed(() => ({
    left: "max(24px, calc((100vw - var(--home-right-width) - var(--home-left-rail-width)) / 2))",
    right: "auto",
    width: "min(var(--home-left-rail-width), calc(100vw - var(--home-right-width) - 48px))",
    maxWidth: "calc(100vw - var(--home-right-width) - 48px)",
  }));

  const itemColumnStyle = computed(() => ({
    width: "var(--home-right-width)",
  }));

  const recipeDockStyle = computed(() => {
    if (recipePreviewNeedsWideStage.value) {
      return {
        left: "16px",
        right: "calc(var(--home-right-width) + 16px)",
        top: "var(--home-recipe-top)",
        bottom: "var(--home-recipe-bottom)",
        width: "auto",
        zIndex: "30",
      };
    }

    return {
      ...centerRailStyle.value,
      top: "var(--home-recipe-top)",
      bottom: "var(--home-recipe-bottom)",
      zIndex: "30",
    };
  });

  return {
    centerRailStyle,
    leftRailStyle,
    itemColumnStyle,
    recipeDockStyle,
  };
}
