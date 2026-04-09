import { nextTick, onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue';
import {
  api,
  getImageUrl,
  type ItemSearchBasic,
} from '../services/api';
import { useRecipeDataState } from './state/useRecipeDataState';
import { useRecipeUiState } from './state/useRecipeUiState';
import { useRecipeCacheState } from './state/useRecipeCacheState';
import { buildRecipeIndexes } from '../utils/recipeIndexing';
import { usePerfInstrumentation } from './usePerfInstrumentation';
import { buildRecipeGraph, type RecipeGraph } from '../domain/recipeGraph';
import { useRecipeBrowserSelectors } from './recipe-browser/useRecipeBrowserSelectors';
import { loadRecipeBootstrap } from './useRecipeBootstrap';
import { useRecipeDetailHydrator } from './useRecipeDetailHydrator';
export function useRecipeViewer(itemIdRef: Ref<string | undefined>, playClick: () => void) {
  const { loading, item, recipes } = useRecipeDataState();
  const {
    currentTab,
    selectedMachineIndex,
    currentPage,
    recipeSearchQuery,
    setSelectedVariant,
    getSelectedVariant,
    clearSelectedVariants,
  } = useRecipeUiState();
  const {
    lastItemId,
    producedByIndexes,
    usedInIndexes,
    detailedRecipes,
    detailRequestsInFlight,
    setIndexes,
    setDetailedRecipes,
    peekDetailedRecipe,
    touchDetailedRecipe,
    shouldRefetchStale,
    markDetailRequestStarted,
    markDetailRequestFinished,
    resetRecipeCache,
  } = useRecipeCacheState();
  const perf = usePerfInstrumentation('recipe-viewer');
  const searchMatchedItemIds = ref<Set<string>>(new Set<string>());
  const pendingSearchLatency = ref<{ requestSeq: number; query: string; startedAt: number } | null>(null);
  const pendingRecipeSwitchLatency = ref<{
    requestSeq: number;
    source: string;
    startedAt: number;
    fromRecipeId: string | null;
  } | null>(null);
  const fastSearchResults = ref<ItemSearchBasic[]>([]);
  const searchingRecipes = ref(false);
  const loadError = ref('');
  const producedByGraph = ref<RecipeGraph>({ docs: new Map(), producedByIndex: new Map(), usedInIndex: new Map() });
  const usedInGraph = ref<RecipeGraph>({ docs: new Map(), producedByIndex: new Map(), usedInIndex: new Map() });
  let disposed = false;
  let loadRequestSeq = 0;
  let searchRequestSeq = 0;
  let recipeSwitchSeq = 0;
  let searchDebounce: ReturnType<typeof setTimeout> | null = null;
  let searchAbortController: AbortController | null = null;

  const getNow = (): number =>
    typeof performance !== 'undefined' && typeof performance.now === 'function'
      ? performance.now()
      : Date.now();

  const markRecipeSwitch = (source: string) => {
    const currentRecipeId = currentBaseRecipe.value?.recipeId ?? null;
    pendingRecipeSwitchLatency.value = {
      requestSeq: ++recipeSwitchSeq,
      source,
      startedAt: getNow(),
      fromRecipeId: currentRecipeId,
    };
  };

  const waitForPaint = async () => {
    await nextTick();
    await new Promise<void>((resolve) => {
      if (typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(() => resolve());
        return;
      }
      resolve();
    });
  };

  const logSearchLatency = (query: string, resultCount: number, durationMs: number) => {
    if (!import.meta.env.DEV) return;
    console.debug(
      `[obs] recipe-search-latency query="${query}" results=${resultCount} latency=${durationMs.toFixed(2)}ms`,
    );
  };

  const logRecipeSwitchLatency = (
    source: string,
    fromRecipeId: string | null,
    toRecipeId: string | null,
    durationMs: number,
  ) => {
    if (!import.meta.env.DEV) return;
    console.debug(
      `[obs] recipe-switch-latency source=${source} from=${fromRecipeId ?? 'null'} to=${toRecipeId ?? 'null'} latency=${durationMs.toFixed(2)}ms`,
    );
  };

  const logDetailHydration = (recipeIds: string[], durationMs: number, source: string) => {
    if (!import.meta.env.DEV) return;
    console.debug(`[obs] recipe-detail-hydration source=${source} count=${recipeIds.length} latency=${durationMs.toFixed(2)}ms ids=${recipeIds.join(',')}`);
  };

  const {
    detailFailedRecipeIds,
    hydrateRecipeDetails,
    resetDetailHydrationContext,
    disposeDetailHydration,
  } = useRecipeDetailHydrator({
    itemIdRef,
    recipes,
    detailedRecipes,
    detailRequestsInFlight,
    peekDetailedRecipe,
    touchDetailedRecipe,
    shouldRefetchStale,
    setDetailedRecipes,
    markDetailRequestStarted,
    markDetailRequestFinished,
    getNow,
    logDetailHydration,
  });

  const flushSearchLatency = async (requestSeq: number) => {
    const pending = pendingSearchLatency.value;
    if (!pending || pending.requestSeq !== requestSeq) return;
    await waitForPaint();
    const durationMs = getNow() - pending.startedAt;
    logSearchLatency(pending.query, filteredRecipeCount.value, durationMs);
    if (pendingSearchLatency.value?.requestSeq === requestSeq) {
      pendingSearchLatency.value = null;
    }
  };

  const getImagePath = (itemId: string) => {
    return getImageUrl(itemId);
  };

  const {
    machineCategories,
    currentCategory,
    currentCategoryPages,
    currentBaseRecipe,
    currentPageRecipes,
    currentRecipeVariantGroups,
    currentRecipeVariantSelections,
    currentRecipeId,
    isCurrentRecipeDetailLoading,
    isCurrentRecipeUsingFallback,
    isCurrentRecipeDetailFailed,
    totalPages,
    filteredRecipeCount,
    totalRecipeCount,
  } = useRecipeBrowserSelectors({
    currentTab,
    recipes,
    producedByIndexes,
    usedInIndexes,
    producedByGraph,
    usedInGraph,
    recipeSearchQuery,
    searchMatchedItemIds,
    selectedMachineIndex,
    currentPage,
    detailRequestsInFlight,
    detailedRecipes,
    detailFailedRecipeIds,
    getSelectedVariant,
    getImagePath,
  });

  const setRecipeVariant = (slotKey: string, variantIndex: number) => {
    const recipe = currentBaseRecipe.value;
    if (!recipe) return;
    setSelectedVariant(recipe.recipeId, slotKey, variantIndex);
  };
  const clearRecipeSearch = () => {
    recipeSearchQuery.value = '';
    searchingRecipes.value = false;
    searchMatchedItemIds.value = new Set<string>();
    fastSearchResults.value = [];
    pendingSearchLatency.value = null;
    searchRequestSeq += 1;
    if (searchDebounce) {
      clearTimeout(searchDebounce);
      searchDebounce = null;
    }
    if (searchAbortController) {
      searchAbortController.abort();
      searchAbortController = null;
    }
  };

  const clearCurrentRecipeState = () => {
    item.value = null;
    recipes.value = {
      usedIn: [],
      producedBy: [],
    };
  };

  const retryCurrentRecipeDetails = () => {
    const recipeId = currentRecipeId.value;
    if (!recipeId) return;
    void hydrateRecipeDetails([recipeId], 'manual-retry');
  };

  const loadRecipes = async () => {
    const itemId = itemIdRef.value;
    if (!itemId) return;
    const requestSeq = ++loadRequestSeq;

    perf.start('loadRecipes');
    loading.value = true;
    loadError.value = '';
    try {
      if (lastItemId.value !== itemId) {
        resetDetailHydrationContext();
        clearCurrentRecipeState();
        resetRecipeCache();
        producedByGraph.value = { docs: new Map(), producedByIndex: new Map(), usedInIndex: new Map() };
        usedInGraph.value = { docs: new Map(), producedByIndex: new Map(), usedInIndex: new Map() };
        loadError.value = '';
        lastItemId.value = itemId;
        clearSelectedVariants();
        recipeSearchQuery.value = '';
        pendingSearchLatency.value = null;
        pendingRecipeSwitchLatency.value = null;
        searchRequestSeq += 1;
        searchMatchedItemIds.value = new Set<string>();
        fastSearchResults.value = [];
        searchingRecipes.value = false;
        if (searchDebounce) {
          clearTimeout(searchDebounce);
          searchDebounce = null;
        }
        if (searchAbortController) {
          searchAbortController.abort();
          searchAbortController = null;
        }
      }

      const { item: bootstrappedItem, recipes: bootstrappedRecipes } = await perf.measureAsync(
        'loadRecipeData',
        () => loadRecipeBootstrap(itemId),
      );
      if (disposed || requestSeq !== loadRequestSeq || itemIdRef.value !== itemId) {
        return;
      }
      item.value = bootstrappedItem;
      recipes.value = {
        usedIn: bootstrappedRecipes.usedIn,
        producedBy: bootstrappedRecipes.producedBy,
      };
      if (import.meta.env.DEV && typeof window !== 'undefined') {
        (window as Window & { __recipeViewerSnapshot?: unknown }).__recipeViewerSnapshot = {
          itemId,
          producedByCount: recipes.value.producedBy.length,
          usedInCount: recipes.value.usedIn.length,
          firstProducedBy: recipes.value.producedBy[0]
            ? {
                recipeId: recipes.value.producedBy[0].recipeId,
                machineInfo: recipes.value.producedBy[0].machineInfo ?? null,
                recipeTypeData: recipes.value.producedBy[0].recipeTypeData ?? null,
                additionalKeys:
                  recipes.value.producedBy[0].additionalData &&
                  typeof recipes.value.producedBy[0].additionalData === 'object'
                    ? Object.keys(recipes.value.producedBy[0].additionalData as Record<string, unknown>)
                    : [],
              }
            : null,
        };
      }
      usedInGraph.value = buildRecipeGraph(recipes.value.usedIn);
      producedByGraph.value = buildRecipeGraph(recipes.value.producedBy);
      setIndexes('usedIn', buildRecipeIndexes(recipes.value.usedIn));
      setIndexes('producedBy', buildRecipeIndexes(recipes.value.producedBy));

      currentTab.value = recipes.value.producedBy.length > 0 ? 'producedBy' : 'usedIn';
      selectedMachineIndex.value = 0;
      currentPage.value = 0;

      const seedHydrationIds = [
        ...recipes.value.producedBy.slice(0, 2).map((recipe) => recipe.recipeId),
        ...recipes.value.usedIn.slice(0, 2).map((recipe) => recipe.recipeId),
      ];
      void hydrateRecipeDetails(seedHydrationIds, 'initial-seed');
    } catch (error) {
      console.error('Failed to load recipes:', error);
      if (!disposed && requestSeq === loadRequestSeq && itemIdRef.value === itemId) {
        loadError.value = '读取配方失败，请检查后端服务后重试。';
      }
    } finally {
      if (!disposed && requestSeq === loadRequestSeq) {
        loading.value = false;
      }
      perf.end('loadRecipes');
    }
  };

  const selectMachine = (index: number) => {
    if (index === selectedMachineIndex.value) return;
    markRecipeSwitch('machine-select');
    playClick();
    selectedMachineIndex.value = index;
    currentPage.value = 0;
  };

  const nextPage = () => {
    if (currentPage.value < totalPages.value - 1) {
      markRecipeSwitch('page-next');
      playClick();
      currentPage.value++;
    }
  };

  const prevPage = () => {
    if (currentPage.value > 0) {
      markRecipeSwitch('page-prev');
      playClick();
      currentPage.value--;
    }
  };

  const setPage = (page: number) => {
    if (page < 0 || page >= totalPages.value || page === currentPage.value) {
      return;
    }
    markRecipeSwitch('page-set');
    playClick();
    currentPage.value = page;
  };

  const setCurrentTab = (tab: 'usedIn' | 'producedBy') => {
    if (tab !== 'usedIn' && tab !== 'producedBy') return;
    if (tab === currentTab.value) return;
    markRecipeSwitch('tab-switch');
    currentTab.value = tab;
  };

  const retryLoadRecipes = () => {
    loadError.value = '';
    void loadRecipes();
  };

  const selectRecipeById = (recipeId: string): boolean => {
    if (!recipeId || !currentCategoryPages.value.length) return false;
    const index = currentCategoryPages.value.findIndex((recipe) => recipe.recipeId === recipeId);
    if (index < 0) return false;
    currentPage.value = index;
    return true;
  };

  watch(recipeSearchQuery, (query) => {
    if (searchDebounce) {
      clearTimeout(searchDebounce);
      searchDebounce = null;
    }
    if (searchAbortController) {
      searchAbortController.abort();
      searchAbortController = null;
    }
    selectedMachineIndex.value = 0;
    currentPage.value = 0;

    const normalized = query.trim();
    const previousQuery = pendingSearchLatency.value?.query ?? '';
    if (!normalized) {
      pendingSearchLatency.value = null;
      searchMatchedItemIds.value = new Set<string>();
      fastSearchResults.value = [];
      searchingRecipes.value = false;
      searchRequestSeq += 1;
      return;
    }

    if (normalized.includes('~') || normalized.toLowerCase().startsWith('type:')) {
      pendingSearchLatency.value = null;
      searchMatchedItemIds.value = new Set<string>();
      fastSearchResults.value = [];
      searchingRecipes.value = false;
      searchRequestSeq += 1;
      return;
    }

    if (normalized === previousQuery && (searchingRecipes.value || fastSearchResults.value.length > 0)) {
      return;
    }

    searchingRecipes.value = true;
    const requestSeq = ++searchRequestSeq;
    pendingSearchLatency.value = { requestSeq, query: normalized, startedAt: getNow() };
    searchDebounce = setTimeout(async () => {
      const controller = new AbortController();
      searchAbortController = controller;
      try {
        const matched = await api.searchItemsFast(normalized, 60, { signal: controller.signal });
        if (requestSeq !== searchRequestSeq) return;
        searchMatchedItemIds.value = new Set(matched.map((it) => it.itemId));
        fastSearchResults.value = matched.slice(0, 12);
      } catch (error) {
        if (controller.signal.aborted) return;
        console.warn('Failed to search indexed items:', error);
        if (requestSeq !== searchRequestSeq) return;
        searchMatchedItemIds.value = new Set<string>();
        fastSearchResults.value = [];
      } finally {
        if (searchAbortController === controller) {
          searchAbortController = null;
        }
        if (requestSeq !== searchRequestSeq) return;
        searchingRecipes.value = false;
        void flushSearchLatency(requestSeq);
      }
    }, 180);
  });

  watch(machineCategories, (categories) => {
    if (categories.length === 0) {
      selectedMachineIndex.value = 0;
      currentPage.value = 0;
      return;
    }

    if (selectedMachineIndex.value >= categories.length) {
      selectedMachineIndex.value = 0;
    }

    if (currentPage.value >= totalPages.value) {
      currentPage.value = Math.max(0, totalPages.value - 1);
    }
  });

  watch(
    () => `${currentTab.value}|${selectedMachineIndex.value}|${currentPage.value}|${currentBaseRecipe.value?.recipeId ?? ''}`,
    async () => {
      const pending = pendingRecipeSwitchLatency.value;
      if (!pending) return;
      const expectedSeq = pending.requestSeq;
      await waitForPaint();
      if (pendingRecipeSwitchLatency.value?.requestSeq !== expectedSeq) return;
      const toRecipeId = currentBaseRecipe.value?.recipeId ?? null;
      const durationMs = getNow() - pending.startedAt;
      logRecipeSwitchLatency(pending.source, pending.fromRecipeId, toRecipeId, durationMs);
      pendingRecipeSwitchLatency.value = null;
    },
  );

  watch(
    () => currentBaseRecipe.value?.recipeId,
    (recipeId) => {
      if (!recipeId) return;
      const neighbors = currentCategoryPages.value;
      const idx = neighbors.findIndex((recipe) => recipe.recipeId === recipeId);
      const candidateIds = [recipeId];
      if (idx >= 0) {
        if (neighbors[idx + 1]) candidateIds.push(neighbors[idx + 1].recipeId);
        if (neighbors[idx - 1]) candidateIds.push(neighbors[idx - 1].recipeId);
      }
      void hydrateRecipeDetails(candidateIds, 'recipe-neighbor');
    },
    { immediate: true },
  );

  watch(itemIdRef, () => {
    void loadRecipes();
  });

  onMounted(() => {
    void loadRecipes();
  });

  onBeforeUnmount(() => {
    disposed = true;
    loadRequestSeq += 1;
    disposeDetailHydration();
    searchRequestSeq += 1;
    if (searchDebounce) {
      clearTimeout(searchDebounce);
      searchDebounce = null;
    }
    if (searchAbortController) {
      searchAbortController.abort();
      searchAbortController = null;
    }
  });

  return {
    loading,
    item,
    recipes,
    currentTab,
    recipeSearchQuery,
    fastSearchResults,
    searchingRecipes,
    loadError,
    selectedMachineIndex,
    currentPage,
    machineCategories,
    currentCategory,
    currentCategoryPages,
    currentPageRecipes,
    currentRecipeId,
    isCurrentRecipeDetailLoading,
    isCurrentRecipeUsingFallback,
    isCurrentRecipeDetailFailed,
    currentRecipeVariantGroups,
    currentRecipeVariantSelections,
    filteredRecipeCount,
    totalRecipeCount,
    totalPages,
    getImagePath,
    selectMachine,
    setRecipeVariant,
    retryCurrentRecipeDetails,
    clearRecipeSearch,
    nextPage,
    prevPage,
    setPage,
    setCurrentTab,
    retryLoadRecipes,
    selectRecipeById,
  };
}
