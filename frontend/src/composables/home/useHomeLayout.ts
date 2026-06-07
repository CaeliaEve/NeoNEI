import { computed, ref, type ComputedRef, type Ref } from "vue";

type GridViewportSync = () => void;

export function useHomeGridViewport(itemSize: Ref<number>) {
  const itemGridViewportRef = ref<HTMLElement | null>(null);
  let syncViewport: GridViewportSync = () => {};

  const measureGridCapacityRaw = () => {
    const shell = itemGridViewportRef.value;
    if (!shell) return null;

    const style = window.getComputedStyle(shell);
    const paddingX =
      (Number.parseFloat(style.paddingLeft || "0") || 0)
      + (Number.parseFloat(style.paddingRight || "0") || 0);
    const paddingY =
      (Number.parseFloat(style.paddingTop || "0") || 0)
      + (Number.parseFloat(style.paddingBottom || "0") || 0);
    const gap = 4;
    const usableWidth = Math.max(0, shell.clientWidth - paddingX);
    const usableHeight = Math.max(0, shell.clientHeight - paddingY);
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
    itemGridViewportRef.value = element;
    syncViewport();
  };

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
