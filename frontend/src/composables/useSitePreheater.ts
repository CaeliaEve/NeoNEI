import { computed, ref, type Ref } from "vue";
import {
  api,
  type BrowserPagePackResponse,
  type Item,
  type PublicRuntimeManifest,
} from "../services/api";
import {
  clearPersistentRuntimeCache,
  getPersistentRuntimeCacheStats,
} from "../services/persistentRuntimeCache";
import {
  preloadBrowserSearchWorker,
  resetBrowserSearchWorker,
} from "../services/browserSearchWorker";
import {
  getAnimatedAtlasImageUrl,
  loadImageAsset,
  primeAnimatedAtlasManifest,
} from "../services/animationBudget";
import { loadRecipeBootstrap } from "./useRecipeBootstrap";

export type SitePreheatMode = "quick" | "deep" | "full";

type ItemIdCarrier = Pick<Item, "itemId"> | { itemId: string };

type SitePreheatModeSpec = {
  label: string;
  browserPageLimit: number | "all";
  recipeBootstrapLimit: number;
  recipeUiLimit: number;
  browserBatchSize: number;
  recipeBatchSize: number;
  recipeUiBatchSize: number;
  warmRecipeSearchPacks: boolean;
  warmRecipeShards: boolean;
  warmFullSearchPack: boolean;
  browserConcurrency: number;
  recipeConcurrency: number;
  recipeUiConcurrency: number;
};

const MODE_SPECS: Record<SitePreheatMode, SitePreheatModeSpec> = {
  quick: {
    label: "\u5feb\u901f\u9884\u70ed",
    browserPageLimit: 18,
    recipeBootstrapLimit: 32,
    recipeUiLimit: 96,
    browserBatchSize: 18,
    recipeBatchSize: 32,
    recipeUiBatchSize: 96,
    warmRecipeSearchPacks: false,
    warmRecipeShards: false,
    warmFullSearchPack: false,
    browserConcurrency: 2,
    recipeConcurrency: 2,
    recipeUiConcurrency: 4,
  },
  deep: {
    label: "\u6df1\u5ea6\u9884\u70ed",
    browserPageLimit: 120,
    recipeBootstrapLimit: 128,
    recipeUiLimit: 512,
    browserBatchSize: 24,
    recipeBatchSize: 32,
    recipeUiBatchSize: 96,
    warmRecipeSearchPacks: true,
    warmRecipeShards: false,
    warmFullSearchPack: true,
    browserConcurrency: 3,
    recipeConcurrency: 3,
    recipeUiConcurrency: 5,
  },
  full: {
    label: "\u5168\u7ad9\u9884\u70ed",
    browserPageLimit: "all",
    recipeBootstrapLimit: Number.POSITIVE_INFINITY,
    recipeUiLimit: 768,
    browserBatchSize: 8,
    recipeBatchSize: 16,
    recipeUiBatchSize: 32,
    warmRecipeSearchPacks: true,
    warmRecipeShards: true,
    warmFullSearchPack: true,
    browserConcurrency: 2,
    recipeConcurrency: 2,
    recipeUiConcurrency: 2,
  },
};

const PREHEAT_LAST_COMPLETED_AT_STORAGE_KEY = "neonei.site-preheat.last-completed-at";
const PREHEAT_LAST_COMPLETED_MODE_STORAGE_KEY = "neonei.site-preheat.last-completed-mode";

function createAbortError(): Error {
  return new Error("Site preheat aborted");
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    throw createAbortError();
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.message === "Site preheat aborted";
}

function canUseLocalStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function readStoredLastCompletedAt(): string | null {
  if (!canUseLocalStorage()) {
    return null;
  }
  try {
    return window.localStorage.getItem(PREHEAT_LAST_COMPLETED_AT_STORAGE_KEY);
  } catch {
    return null;
  }
}

function readStoredLastCompletedMode(): SitePreheatMode | null {
  if (!canUseLocalStorage()) {
    return null;
  }
  try {
    const value = window.localStorage.getItem(PREHEAT_LAST_COMPLETED_MODE_STORAGE_KEY);
    return value === "quick" || value === "deep" || value === "full" ? value : null;
  } catch {
    return null;
  }
}

function storeLastCompletion(mode: SitePreheatMode, completedAt: string): void {
  if (!canUseLocalStorage()) {
    return;
  }
  try {
    window.localStorage.setItem(PREHEAT_LAST_COMPLETED_AT_STORAGE_KEY, completedAt);
    window.localStorage.setItem(PREHEAT_LAST_COMPLETED_MODE_STORAGE_KEY, mode);
  } catch {
    // best-effort only
  }
}

function clearStoredLastCompletion(): void {
  if (!canUseLocalStorage()) {
    return;
  }
  try {
    window.localStorage.removeItem(PREHEAT_LAST_COMPLETED_AT_STORAGE_KEY);
    window.localStorage.removeItem(PREHEAT_LAST_COMPLETED_MODE_STORAGE_KEY);
  } catch {
    // best-effort only
  }
}

function yieldToUi(ms = 0): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function formatCount(value: number): string {
  return Math.max(0, Math.floor(value || 0)).toLocaleString();
}

function uniqueItemIds(values: ItemIdCarrier[]): string[] {
  return Array.from(
    new Set(
      values
        .map((entry) => `${entry?.itemId ?? ""}`.trim())
        .filter(Boolean),
    ),
  );
}

function buildWrappedPageSequence(
  totalPages: number,
  currentPage: number,
  limit: number | "all",
): number[] {
  const normalizedTotal = Math.max(0, Math.floor(totalPages));
  if (normalizedTotal <= 0) {
    return [];
  }

  const normalizedLimit = limit === "all"
    ? normalizedTotal
    : Math.min(normalizedTotal, Math.max(1, Math.floor(limit)));
  const startPage = Math.min(normalizedTotal, Math.max(1, Math.floor(currentPage || 1)));
  const ordered: number[] = [];
  const seen = new Set<number>();

  const pushPage = (page: number) => {
    if (page < 1 || page > normalizedTotal || seen.has(page) || ordered.length >= normalizedLimit) {
      return;
    }
    seen.add(page);
    ordered.push(page);
  };

  pushPage(startPage);
  for (let offset = 1; ordered.length < normalizedLimit && offset < normalizedTotal; offset += 1) {
    const forward = ((startPage - 1 + offset) % normalizedTotal) + 1;
    pushPage(forward);
    if (ordered.length >= normalizedLimit) {
      break;
    }
    const backward = ((startPage - 1 - offset + normalizedTotal * 4) % normalizedTotal) + 1;
    pushPage(backward);
  }

  return ordered;
}

async function runConcurrent<T>(
  items: T[],
  concurrency: number,
  signal: AbortSignal,
  onItem: (item: T, index: number) => Promise<void>,
): Promise<void> {
  if (items.length <= 0) {
    return;
  }

  let nextIndex = 0;
  const workerCount = Math.max(1, Math.min(concurrency, items.length));

  const worker = async () => {
    while (nextIndex < items.length) {
      throwIfAborted(signal);
      const currentIndex = nextIndex;
      nextIndex += 1;
      await onItem(items[currentIndex], currentIndex);
      if ((currentIndex + 1) % 6 === 0) {
        await yieldToUi();
      }
    }
  };

  await Promise.all(Array.from({ length: workerCount }, () => worker()));
}

function collectAnimatedAtlasUrlsFromPagePack(pagePack: Pick<BrowserPagePackResponse, "mediaManifest">): string[] {
  return Array.from(
    new Set(
      Object.values(pagePack.mediaManifest?.animatedAtlases ?? {})
        .map((entry) => getAnimatedAtlasImageUrl(entry))
        .filter((url): url is string => Boolean(url)),
    ),
  );
}

async function runConcurrentBatched<T>(
  items: T[],
  concurrency: number,
  batchSize: number,
  signal: AbortSignal,
  onItem: (item: T, index: number) => Promise<void>,
  onBatchComplete?: (processedCount: number, totalCount: number) => Promise<void>,
): Promise<void> {
  if (items.length <= 0) {
    return;
  }

  const normalizedBatchSize = Math.max(1, Math.floor(batchSize));
  for (let offset = 0; offset < items.length; offset += normalizedBatchSize) {
    throwIfAborted(signal);
    const batch = items.slice(offset, offset + normalizedBatchSize);
    await runConcurrent(batch, concurrency, signal, async (item, batchIndex) => {
      await onItem(item, offset + batchIndex);
    });
    if (onBatchComplete) {
      await onBatchComplete(Math.min(items.length, offset + batch.length), items.length);
    }
  }
}

export function useSitePreheater(options: {
  itemSize: Ref<number>;
  pageSize: Ref<number>;
  currentPage: Ref<number>;
  totalPages: Ref<number>;
  totalItems: Ref<number>;
  visibleItems: Readonly<Ref<Item[]>>;
  historyItems: Readonly<Ref<ItemIdCarrier[]>>;
  clearCachedPages?: () => void;
}) {
  const running = ref(false);
  const stopping = ref(false);
  const currentMode = ref<SitePreheatMode | null>(null);
  const currentPhase = ref("\u5c1a\u672a\u5f00\u59cb");
  const statusText = ref("\u672a\u5f00\u59cb\u9884\u70ed");
  const progressCurrent = ref(0);
  const progressTotal = ref(0);
  const lastCompletedAt = ref<string | null>(readStoredLastCompletedAt());
  const lastCompletedMode = ref<SitePreheatMode | null>(readStoredLastCompletedMode());
  const lastError = ref<string>("");
  const cacheEntryCount = ref(0);
  const cacheApproxBytes = ref(0);
  const recipeCoverageHint = ref("\u5c06\u4f18\u5148\u9884\u70ed\u6d4f\u89c8\u5206\u9875\u3001\u641c\u7d22\u7d22\u5f15\u4e0e\u70ed\u914d\u65b9\u5165\u53e3\uff0c\u53ea\u662f\u628a\u7f51\u9875\u4f53\u9a8c\u538b\u5230\u66f4\u63a5\u8fd1\u6e38\u620f\u5185 NEI\u3002");

  let abortController: AbortController | null = null;

  const currentSlotSize = computed(() => Math.max(32, Math.ceil(options.itemSize.value * 0.9)));
  const progressPercent = computed(() => {
    if (progressTotal.value <= 0) {
      return 0;
    }
    return Math.max(0, Math.min(100, Math.round((progressCurrent.value / progressTotal.value) * 100)));
  });

  const refreshCacheStats = async () => {
    const stats = await getPersistentRuntimeCacheStats();
    cacheEntryCount.value = stats.entryCount;
    cacheApproxBytes.value = stats.approxBytes;
  };

  const prewarmBrowserPageVisuals = async (pagePack: BrowserPagePackResponse) => {
    primeAnimatedAtlasManifest(pagePack.mediaManifest);
    const assetTasks: Array<Promise<unknown>> = [];
    if (pagePack.atlas?.atlasUrl) {
      assetTasks.push(loadImageAsset(pagePack.atlas.atlasUrl));
    }
    const animatedAtlasUrls = collectAnimatedAtlasUrlsFromPagePack(pagePack).slice(0, 10);
    for (const atlasUrl of animatedAtlasUrls) {
      assetTasks.push(loadImageAsset(atlasUrl).catch(() => undefined));
    }
    if (assetTasks.length > 0) {
      await Promise.allSettled(assetTasks);
    }
  };

  const flushPreheatMemory = async (detail: string) => {
    api.trimPreheatRuntimeCaches();
    statusText.value = detail;
    await yieldToUi(16);
  };

  const updateRecipeCoverageHint = (manifest: PublicRuntimeManifest | null | undefined) => {
    const hotRecipeCount = manifest?.publishBundle?.files.recipeBootstrapItems?.length ?? 0;
    if (hotRecipeCount > 0) {
      recipeCoverageHint.value = `\u5f53\u524d\u5bfc\u51fa\u53ef\u76f4\u63a5\u9759\u6001\u9884\u70ed ${formatCount(hotRecipeCount)} \u4e2a\u70ed\u914d\u65b9\u5165\u53e3\uff1b\u5168\u7ad9\u6a21\u5f0f\u4f1a\u518d\u628a\u5168\u90e8\u6d4f\u89c8\u5206\u9875\u4e0e\u8fd9\u4e9b\u70ed\u914d\u65b9\u76f8\u5173 UI \u4e00\u5e76\u7f13\u5b58\u3002`;
      return;
    }
    recipeCoverageHint.value = "\u5f53\u524d\u5bfc\u51fa\u672a\u643a\u5e26\u70ed\u914d\u65b9\u9759\u6001\u5305\uff1b\u9884\u70ed\u4ecd\u4f1a\u8986\u76d6\u6d4f\u89c8\u533a\u3001\u641c\u7d22\u7d22\u5f15\u4e0e\u8fd0\u884c\u65f6\u53ef\u83b7\u53d6\u7684\u57fa\u7840\u914d\u65b9\u5165\u53e3\u3002";
  };

  const bumpProgress = (delta = 1, detail?: string) => {
    progressCurrent.value = Math.min(progressTotal.value, progressCurrent.value + delta);
    if (detail) {
      statusText.value = detail;
    }
  };

  const extendPlannedWork = (delta: number) => {
    progressTotal.value += Math.max(0, Math.floor(delta));
  };

  const ensureBrowserUniverse = async () => {
    if (options.totalPages.value > 0) {
      return {
        totalPages: options.totalPages.value,
        totalItems: options.totalItems.value,
      };
    }

    const response = await api.getHomeBootstrap({
      page: 1,
      pageSize: Math.max(20, Math.floor(options.pageSize.value || 55)),
      slotSize: currentSlotSize.value,
    });

    return {
      totalPages: response.pagePack.totalPages,
      totalItems: response.pagePack.total,
    };
  };

  const buildRecipeSeedIds = (
    manifest: PublicRuntimeManifest,
    spec: SitePreheatModeSpec,
  ): string[] => {
    const manifestItems = Array.isArray(manifest.publishBundle?.files.recipeBootstrapItems)
      ? manifest.publishBundle?.files.recipeBootstrapItems ?? []
      : [];
    const visibleAndHistory = uniqueItemIds([
      ...options.visibleItems.value,
      ...options.historyItems.value,
    ]);
    const manifestSubset = spec.recipeBootstrapLimit === Number.POSITIVE_INFINITY
      ? manifestItems
      : manifestItems.slice(0, spec.recipeBootstrapLimit);
    return uniqueItemIds([
      ...visibleAndHistory.map((itemId) => ({ itemId })),
      ...manifestSubset.map((itemId) => ({ itemId })),
    ]);
  };

  const stopPreheat = () => {
    if (!running.value || !abortController) {
      return;
    }
    stopping.value = true;
    currentPhase.value = "\u6b63\u5728\u505c\u6b62";
    statusText.value = "\u6b63\u5728\u505c\u6b62\u9884\u70ed\u4efb\u52a1\u2026";
    abortController.abort();
  };

  const clearPreheatCaches = async () => {
    if (running.value) {
      return;
    }
    await clearPersistentRuntimeCache();
    clearStoredLastCompletion();
    api.resetRuntimeCaches();
    resetBrowserSearchWorker();
    options.clearCachedPages?.();
    await refreshCacheStats();
    currentPhase.value = "\u7f13\u5b58\u5df2\u6e05\u7a7a";
    statusText.value = "\u672c\u5730\u9884\u70ed\u7f13\u5b58\u5df2\u6e05\u7a7a";
    progressCurrent.value = 0;
    progressTotal.value = 0;
    lastCompletedAt.value = null;
    lastCompletedMode.value = null;
    lastError.value = "";
  };

  const startPreheat = async (mode: SitePreheatMode) => {
    if (running.value) {
      return;
    }

    const spec = MODE_SPECS[mode];
    const controller = new AbortController();
    abortController = controller;
    running.value = true;
    stopping.value = false;
    currentMode.value = mode;
    currentPhase.value = `${spec.label}\u51c6\u5907\u4e2d`;
    statusText.value = "\u6b63\u5728\u8bfb\u53d6\u53d1\u5e03\u6e05\u5355\u2026";
    progressCurrent.value = 0;
    progressTotal.value = 4;
    lastError.value = "";

    try {
      const manifest = await api.getPublishManifest();
      throwIfAborted(controller.signal);
      updateRecipeCoverageHint(manifest);
      bumpProgress(1, "\u53d1\u5e03\u6e05\u5355\u5df2\u8f7d\u5165");

      const universe = await ensureBrowserUniverse();
      throwIfAborted(controller.signal);
      bumpProgress(1, `\u68c0\u6d4b\u5230 ${formatCount(universe.totalItems)} \u4e2a\u7269\u54c1\uff0c${formatCount(universe.totalPages)} \u9875\u6d4f\u89c8\u5206\u9875`);

      currentPhase.value = "\u57fa\u7840\u5916\u58f3\u9884\u70ed";
      await api.getMods();
      bumpProgress(1, "\u6a21\u7ec4\u5217\u8868\u5df2\u9884\u70ed");

      await preloadBrowserSearchWorker();
      if (spec.warmFullSearchPack) {
        await api.getBrowserSearchPack();
      }
      bumpProgress(1, spec.warmFullSearchPack ? "\u641c\u7d22\u7d22\u5f15\u5df2\u5b8c\u6574\u9884\u70ed" : "\u641c\u7d22\u7d22\u5f15\u70ed\u5206\u7247\u5df2\u9884\u70ed");

      currentPhase.value = "\u6d4f\u89c8\u533a\u5206\u9875\u9884\u70ed";
      const pageTargets = buildWrappedPageSequence(
        universe.totalPages,
        options.currentPage.value,
        spec.browserPageLimit === "all" ? universe.totalPages : spec.browserPageLimit,
      );
      extendPlannedWork(pageTargets.length);
      await runConcurrentBatched(
        pageTargets,
        spec.browserConcurrency,
        spec.browserBatchSize,
        controller.signal,
        async (page, index) => {
          const pagePack = await api.primeDefaultBrowserPagePack({
            page,
            pageSize: Math.max(20, Math.floor(options.pageSize.value || 55)),
            slotSize: currentSlotSize.value,
          });
          await prewarmBrowserPageVisuals(pagePack);
          bumpProgress(1, `\u6d4f\u89c8\u533a\u5206\u9875\u9884\u70ed\u4e2d ${index + 1}/${pageTargets.length}`);
        },
        async (processed, total) => {
          if (processed < total) {
            await flushPreheatMemory(`\u6d4f\u89c8\u533a\u5206\u9875\u5df2\u5199\u5165 ${processed}/${total}\uff0c\u6b63\u5728\u91ca\u653e\u5185\u5b58\u2026`);
          }
        },
      );

      currentPhase.value = "\u70ed\u914d\u65b9\u5165\u53e3\u9884\u70ed";
      const recipeSeeds = buildRecipeSeedIds(manifest, spec);
      extendPlannedWork(recipeSeeds.length);
      const warmedRecipeIds = new Set<string>();
      const tryCollectRecipeId = (recipeId: string | null | undefined) => {
        if (!recipeId) {
          return;
        }
        if (warmedRecipeIds.size >= spec.recipeUiLimit && !warmedRecipeIds.has(recipeId)) {
          return;
        }
        warmedRecipeIds.add(recipeId);
      };
      await runConcurrentBatched(
        recipeSeeds,
        spec.recipeConcurrency,
        spec.recipeBatchSize,
        controller.signal,
        async (itemId, index) => {
          const bootstrap = await loadRecipeBootstrap(itemId);
          for (const recipe of bootstrap.recipes.producedBy) {
            tryCollectRecipeId(recipe.recipeId);
          }
          for (const recipe of bootstrap.recipes.usedIn) {
            tryCollectRecipeId(recipe.recipeId);
          }
          if (spec.warmRecipeShards) {
            const shard = await api.getRecipeBootstrapShard(itemId);
            for (const recipeId of shard.recipeIndex?.producedByRecipes ?? []) {
              tryCollectRecipeId(recipeId);
            }
            for (const recipeId of shard.recipeIndex?.usedInRecipes ?? []) {
              tryCollectRecipeId(recipeId);
            }
          }
          if (spec.warmRecipeSearchPacks) {
            await Promise.allSettled([
              api.prefetchRecipeBootstrapSearchPack(itemId, "producedBy"),
              api.prefetchRecipeBootstrapSearchPack(itemId, "usedIn"),
            ]);
          }
          bumpProgress(1, `\u70ed\u914d\u65b9\u5165\u53e3\u9884\u70ed\u4e2d ${index + 1}/${recipeSeeds.length}`);
        },
        async (processed, total) => {
          if (processed < total) {
            await flushPreheatMemory(`\u70ed\u914d\u65b9\u5165\u53e3\u5df2\u5199\u5165 ${processed}/${total}\uff0c\u6b63\u5728\u91ca\u653e\u5185\u5b58\u2026`);
          }
        },
      );

      const recipeUiTargets = Array.from(warmedRecipeIds).slice(0, spec.recipeUiLimit);
      currentPhase.value = "\u914d\u65b9\u754c\u9762\u9884\u70ed";
      extendPlannedWork(recipeUiTargets.length);
      await runConcurrentBatched(
        recipeUiTargets,
        spec.recipeUiConcurrency,
        spec.recipeUiBatchSize,
        controller.signal,
        async (recipeId, index) => {
          await api.getOptionalRecipeUiPayload(recipeId);
          bumpProgress(1, `\u914d\u65b9\u754c\u9762\u9884\u70ed\u4e2d ${index + 1}/${recipeUiTargets.length}`);
        },
        async (processed, total) => {
          if (processed < total) {
            await flushPreheatMemory(`\u914d\u65b9\u754c\u9762\u5df2\u5199\u5165 ${processed}/${total}\uff0c\u6b63\u5728\u91ca\u653e\u5185\u5b58\u2026`);
          }
        },
      );

      currentPhase.value = "\u6536\u5c3e";
      await refreshCacheStats();
      progressCurrent.value = progressTotal.value;
      const completedAt = new Date().toISOString();
      lastCompletedAt.value = completedAt;
      lastCompletedMode.value = mode;
      storeLastCompletion(mode, completedAt);
      statusText.value = `${spec.label}\u5b8c\u6210\uff1a\u672c\u5730\u5df2\u7f13\u5b58 ${formatCount(cacheEntryCount.value)} \u6761\u8fd0\u884c\u65f6\u8bb0\u5f55`;
    } catch (error) {
      if (isAbortError(error)) {
        statusText.value = "\u9884\u70ed\u5df2\u505c\u6b62";
        currentPhase.value = "\u5df2\u505c\u6b62";
      } else {
        console.error("Failed to preheat NeoNEI runtime:", error);
        currentPhase.value = "\u9884\u70ed\u5931\u8d25";
        lastError.value = error instanceof Error ? error.message : "\u672a\u77e5\u9519\u8bef";
        statusText.value = "\u9884\u70ed\u5931\u8d25\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5";
      }
    } finally {
      running.value = false;
      stopping.value = false;
      currentMode.value = null;
      abortController = null;
      await refreshCacheStats().catch(() => undefined);
    }
  };

  void refreshCacheStats();

  return {
    running,
    stopping,
    currentMode,
    currentPhase,
    statusText,
    progressCurrent,
    progressTotal,
    progressPercent,
    lastCompletedAt,
    lastCompletedMode,
    lastError,
    cacheEntryCount,
    cacheApproxBytes,
    recipeCoverageHint,
    refreshCacheStats,
    startPreheat,
    stopPreheat,
    clearPreheatCaches,
  };
}
