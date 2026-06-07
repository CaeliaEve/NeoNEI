import { onBeforeUnmount, type Ref } from "vue";

type HomeView = "items" | "patterns";
type PageDirection = 1 | -1 | 0;

type UseHomeBrowserNavigationOptions = {
  currentView: Ref<HomeView>;
  currentPage: Ref<number>;
  totalPages: Ref<number>;
  searchQuery: Ref<string>;
  changePage: (page: number) => void;
  prefetchItemsPage: (page: number) => Promise<unknown> | unknown;
  forwardRadius?: number;
  backwardRadius?: number;
  prefetchDelayMs?: number;
};

const DEFAULT_FORWARD_RADIUS = 1;
const DEFAULT_BACKWARD_RADIUS = 1;
const DEFAULT_PREFETCH_DELAY_MS = 800;

const collectWrappedPageCandidates = (
  page: number,
  total: number,
  forwardRadius: number,
  backwardRadius: number,
) => {
  const normalizedTotal = Math.max(0, Math.floor(total));
  const normalizedPage = Math.max(1, Math.floor(page));
  const normalizedForwardRadius = Math.max(1, Math.floor(forwardRadius));
  const normalizedBackwardRadius = Math.max(1, Math.floor(backwardRadius));
  if (normalizedTotal <= 1) {
    return [] as number[];
  }

  const wrap = (value: number) => ((value - 1 + normalizedTotal) % normalizedTotal) + 1;
  const candidates = new Set<number>();

  for (let offset = 1; offset <= normalizedForwardRadius; offset += 1) {
    candidates.add(wrap(normalizedPage + offset));
  }

  for (let offset = 1; offset <= normalizedBackwardRadius; offset += 1) {
    candidates.add(wrap(normalizedPage - offset));
  }

  candidates.delete(normalizedPage);
  return Array.from(candidates).filter((candidate) => candidate >= 1 && candidate <= normalizedTotal);
};

export function useHomeBrowserNavigation({
  currentView,
  currentPage,
  totalPages,
  searchQuery,
  changePage,
  prefetchItemsPage,
  forwardRadius = DEFAULT_FORWARD_RADIUS,
  backwardRadius = DEFAULT_BACKWARD_RADIUS,
  prefetchDelayMs = DEFAULT_PREFETCH_DELAY_MS,
}: UseHomeBrowserNavigationOptions) {
  let neighborPrefetchTimer: number | null = null;
  let neighborPrefetchIdleHandle: number | null = null;

  const clearNeighborPrefetch = () => {
    if (neighborPrefetchTimer !== null) {
      clearTimeout(neighborPrefetchTimer);
      neighborPrefetchTimer = null;
    }
    if (neighborPrefetchIdleHandle !== null && typeof window !== "undefined" && "cancelIdleCallback" in window) {
      (window as Window & { cancelIdleCallback: (id: number) => void }).cancelIdleCallback(neighborPrefetchIdleHandle);
      neighborPrefetchIdleHandle = null;
    }
  };

  const scheduleNeighborPrefetch = (
    page: number,
    total: number,
    direction: PageDirection,
  ) => {
    clearNeighborPrefetch();

    if (currentView.value !== "items" || total <= 1 || searchQuery.value.trim()) {
      return;
    }

    const candidatePages = collectWrappedPageCandidates(
      page,
      total,
      direction >= 0 ? forwardRadius : backwardRadius,
      direction <= 0 ? forwardRadius : backwardRadius,
    );
    if (candidatePages.length === 0) {
      return;
    }

    neighborPrefetchTimer = window.setTimeout(() => {
      neighborPrefetchTimer = null;
      const runPrefetch = () => {
        for (const candidatePage of candidatePages) {
          void prefetchItemsPage(candidatePage);
        }
      };

      if (typeof window !== "undefined" && "requestIdleCallback" in window) {
        neighborPrefetchIdleHandle = (window as Window & {
          requestIdleCallback: (cb: () => void, opts?: { timeout: number }) => number;
        }).requestIdleCallback(() => {
          neighborPrefetchIdleHandle = null;
          runPrefetch();
        }, { timeout: 600 });
        return;
      }

      runPrefetch();
    }, prefetchDelayMs);
  };

  const changeItemsPageWrapped = (targetPage: number) => {
    const total = totalPages.value;
    if (total <= 0) return;
    const resolvedTargetPage = targetPage < 1
      ? total
      : targetPage > total
        ? 1
        : targetPage;
    const direction: PageDirection = targetPage < 1
      ? -1
      : targetPage > total
        ? 1
        : resolvedTargetPage > currentPage.value
          ? 1
          : resolvedTargetPage < currentPage.value
            ? -1
            : 0;

    changePage(resolvedTargetPage);
    scheduleNeighborPrefetch(resolvedTargetPage, total, direction);
  };

  const handleItemsWheel = (event: WheelEvent) => {
    if (currentView.value !== "items" || totalPages.value <= 1) return;
    if (Math.abs(event.deltaY) < 8) return;

    event.preventDefault();
    if (event.deltaY > 0) {
      changeItemsPageWrapped(currentPage.value + 1);
    } else {
      changeItemsPageWrapped(currentPage.value - 1);
    }
  };

  onBeforeUnmount(() => {
    clearNeighborPrefetch();
  });

  return {
    changeItemsPageWrapped,
    handleItemsWheel,
  };
}
