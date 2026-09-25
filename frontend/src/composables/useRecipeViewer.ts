import { computed, onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue';
import {
  api,
  type indexedItemRecipeSummaryResponse,
} from '../services/api';
import { useRecipeDataState } from './state/useRecipeDataState';
import { useRecipeUiState } from './state/useRecipeUiState';
import { useRecipeCacheState } from './state/useRecipeCacheState';
import { buildRecipeIndexes } from '../utils/recipeIndexing';
import { usePerfInstrumentation } from './usePerfInstrumentation';
import { buildRecipeGraph, type RecipeGraph } from '../domain/recipeGraph';
import { useRecipeBrowserSelectors } from './recipe-browser/useRecipeBrowserSelectors';
import { createRecipeSearchController } from './recipe-browser/recipeSearchController';
import { createRecipeMergeState } from './recipe-browser/recipeMergeState';
import {
  buildCategoryGroupRequestKey,
  buildMachineGroupRequestKey,
  collectAdjacentRecipePages,
  collectNeighborCategoryIndexes,
  computeCategoryPackWindow,
  resolveCategoryMachineRoute,
} from './recipe-browser/recipeCategoryPackUtils';
import {
  getCategoryRecipesPerPage,
  getLoadedRecipeIdSet as buildLoadedRecipeIdSet,
  getLoadedRecipeMap,
  getRecipeCategoryLookupKey,
  getStoredCategoryOrderedRecipeIds,
  setStoredCategoryOrderedRecipeIds,
} from './recipe-browser/recipeCategoryState';
import type { MachineCategory } from './recipe-browser/helpers';
import { loadRecipeBootstrap } from './useRecipeBootstrap';
import { useRecipeDetailHydrator } from './useRecipeDetailHydrator';
import {
  queueRenderableMediaPrewarmFromUnknown,
} from '../services/animationBudget';
import { createRecipeShardHydrator } from './recipe-browser/recipeShardHydrator';
import {
  RECIPE_HYDRATION_RECOVERY_REASONS,
  recipeHydrationRecoveryReasonForTab,
  reportRecipeGroupHydrationFailure,
  type RecipeHydrationRecoveryReason,
} from './recipe-browser/recipeHydrationPolicyCatalog';
import { createRecipeNavigationController } from './recipe-browser/recipeNavigationController';
import {
  buildCategoryPrewarmPageSequence,
  primeRecipePayloadMedia,
  RECIPE_PAGE_PREWARM_MAX_RECIPES,
} from './recipe-display/recipeMediaPrewarm';
import { markPerfEvent } from '../services/perfMarks';
import {
  createRecipeSwitchLatencyTracker,
  logDetailHydration,
  logRecipeSwitchLatency,
  logSearchLatency,
  waitForPaint,
} from './recipe-display/recipeViewerTelemetry';

const CATEGORY_PACK_PAGE_SIZE = 8;
const CATEGORY_PACK_IDS_ONLY_LIMIT = 0;
const RECIPE_BOOTSTRAP_SUMMARY_BUDGET_MS = 100;
const RECIPE_FULL_GROUP_BUDGET_MS = 300;

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

  const loadError = ref('');
  const producedByGraph = ref<RecipeGraph>({ docs: new Map(), producedByIndex: new Map(), usedInIndex: new Map() });
  const usedInGraph = ref<RecipeGraph>({ docs: new Map(), producedByIndex: new Map(), usedInIndex: new Map() });
  const bootstrapRecipeIndex = ref<{ usedInRecipes: string[]; producedByRecipes: string[] }>({
    usedInRecipes: [],
    producedByRecipes: [],
  });
  const bootstrapIndexedSummary = ref<indexedItemRecipeSummaryResponse | null>(null);
  const pendingProducedByRecipeIds = ref<string[]>([]);
  const pendingUsageRecipeIds = ref<string[]>([]);
  const categoryRecipeIdsByKey = ref<Record<string, string[]>>({});
  const requestedProducedByGroupKeys = ref<Set<string>>(new Set<string>());
  const requestedUsageGroupKeys = ref<Set<string>>(new Set<string>());
  const requestedCategoryGroupKeys = ref<Set<string>>(new Set<string>());
  const fullShardHydrationStarted = ref(false);
  const categoryPackRequestsInFlight = new Map<string, Promise<void>>();
  let disposed = false;
  let loadRequestSeq = 0;
  let recipeFirstPageVisibleItemId: string | null = null;

  const getNow = (): number =>
    typeof performance !== 'undefined' && typeof performance.now === 'function'
      ? performance.now()
      : Date.now();



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

  const recipeSearchController = createRecipeSearchController({
    itemIdRef,
    currentTab,
    recipeSearchQuery,
    getNow,
    waitForPaint,
    getFilteredRecipeCount: () => filteredRecipeCount.value,
    getLoadedRecipeIds: (tab) => buildLoadedRecipeIdSet(recipes.value, tab),
    isDisposed: () => disposed,
    logSearchLatency,
  });
  const {
    searchMatchedItemIds,
    searchMatchedRecipeIds,
    fastSearchResults,
    searchingRecipes,
  } = recipeSearchController;



  const getImagePath = (itemId: string) => {
    return `item:${itemId}`;
  };

  const {
    machineCategories,
    currentCategory,
    currentCategoryOrderedRecipeIds,
    currentCategoryPages,
    currentBaseRecipe,
    currentPageRecipes,
    currentRecipeVariantGroups,
    currentRecipeVariantSelections,
    currentRecipeId,
    isCurrentRecipeDetailLoading,
    isCurrentRecipeUsingSummaryProjection,
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
    searchMatchedRecipeIds,
    indexedSummary: bootstrapIndexedSummary,
    tabRecipeTotals: computed(() => ({
      producedBy: Math.max(
        recipes.value.producedBy.length,
        bootstrapRecipeIndex.value.producedByRecipes.length,
        bootstrapIndexedSummary.value?.counts?.producedBy ?? 0,
      ),
      usedIn: Math.max(
        recipes.value.usedIn.length,
        bootstrapRecipeIndex.value.usedInRecipes.length,
        bootstrapIndexedSummary.value?.counts?.usedIn ?? 0,
      ),
    })),
    categoryRecipeIdsByKey,
    selectedMachineIndex,
    currentPage,
    detailRequestsInFlight,
    detailedRecipes,
    detailFailedRecipeIds,
    getSelectedVariant,
    getImagePath,
  });

  const recipeSwitchLatency = createRecipeSwitchLatencyTracker({
    getCurrentRecipeId: () => currentBaseRecipe.value?.recipeId ?? null,
    getNow,
    waitForPaint,
    logRecipeSwitchLatency,
  });
  const markRecipeSwitch = recipeSwitchLatency.mark;

  const setRecipeVariant = (slotKey: string, variantIndex: number) => {
    const recipe = currentBaseRecipe.value;
    if (!recipe) return;
    setSelectedVariant(recipe.recipeId, slotKey, variantIndex);
  };
  const clearRecipeSearch = () => recipeSearchController.clear();

  const clearCurrentRecipeState = () => {
    item.value = null;
    recipes.value = {
      usedIn: [],
      producedBy: [],
    };
    bootstrapIndexedSummary.value = null;
    bootstrapRecipeIndex.value = {
      usedInRecipes: [],
      producedByRecipes: [],
    };
    pendingProducedByRecipeIds.value = [];
    pendingUsageRecipeIds.value = [];
    categoryRecipeIdsByKey.value = {};
    requestedProducedByGroupKeys.value = new Set<string>();
    requestedUsageGroupKeys.value = new Set<string>();
    requestedCategoryGroupKeys.value = new Set<string>();
    fullShardHydrationStarted.value = false;
    categoryPackRequestsInFlight.clear();
  };

  const rebuildIndexesAndGraphs = () => {
    usedInGraph.value = buildRecipeGraph(recipes.value.usedIn);
    producedByGraph.value = buildRecipeGraph(recipes.value.producedBy);
    setIndexes('usedIn', buildRecipeIndexes(recipes.value.usedIn));
    setIndexes('producedBy', buildRecipeIndexes(recipes.value.producedBy));
  };

  const getCategoryOrderedRecipeIds = (tab: 'usedIn' | 'producedBy', category: MachineCategory | null | undefined) => (
    getStoredCategoryOrderedRecipeIds(
      categoryRecipeIdsByKey,
      tab,
      category,
      category?.recipes.map((recipe) => recipe.recipeId) ?? [],
    )
  );

  const setCategoryOrderedRecipeIds = (
    tab: 'usedIn' | 'producedBy',
    category: MachineCategory | null | undefined,
    recipeIds: string[],
  ) => setStoredCategoryOrderedRecipeIds(categoryRecipeIdsByKey, tab, category, recipeIds);

  const getLoadedRecipeIdSet = (tab: 'usedIn' | 'producedBy') => buildLoadedRecipeIdSet(recipes.value, tab);

  const getLoadedCurrentTabRecipeMap = () => getLoadedRecipeMap(
    currentTab.value === 'usedIn' ? recipes.value.usedIn : recipes.value.producedBy,
  );


  const collectCategoryRecipesForPrewarm = (
    category: MachineCategory | null | undefined,
    pageIndex: number,
  ) => {
    if (!category) {
      return [] as typeof recipes.value.producedBy;
    }

    const recipesPerPage = Math.max(1, getCategoryRecipesPerPage(category));
    const loadedRecipeMap = getLoadedCurrentTabRecipeMap();
    const orderedRecipeIds = currentCategoryOrderedRecipeIds.value;
    const pageCount = totalPages.value;
    const candidatePages = buildCategoryPrewarmPageSequence(pageCount, pageIndex);
    const collected: typeof recipes.value.producedBy = [];
    const seenRecipeIds = new Set<string>();

    if (orderedRecipeIds.length > 0) {
      for (const candidatePage of candidatePages) {
        const startIndex = candidatePage * recipesPerPage;
        const recipeIds = orderedRecipeIds.slice(startIndex, startIndex + recipesPerPage);
        for (const recipeId of recipeIds) {
          const recipe = loadedRecipeMap.get(recipeId);
          if (!recipe || seenRecipeIds.has(recipe.recipeId)) {
            continue;
          }
          seenRecipeIds.add(recipe.recipeId);
          collected.push(recipe);
          if (collected.length >= RECIPE_PAGE_PREWARM_MAX_RECIPES) {
            return collected;
          }
        }
      }
      return collected;
    }

    const loadedPages = currentCategoryPages.value;
    for (const candidatePage of candidatePages) {
      const startIndex = candidatePage * recipesPerPage;
      const slice = loadedPages.slice(startIndex, startIndex + recipesPerPage);
      for (const recipe of slice) {
        if (!recipe || seenRecipeIds.has(recipe.recipeId)) {
          continue;
        }
        seenRecipeIds.add(recipe.recipeId);
        collected.push(recipe);
        if (collected.length >= RECIPE_PAGE_PREWARM_MAX_RECIPES) {
          return collected;
        }
      }
    }

    return collected;
  };

  const queueRecipePageMediaPrewarm = () => {
    if (loading.value || recipeSearchQuery.value.trim()) {
      return;
    }
    const category = currentCategory.value;
    if (!category || totalPages.value <= 0) {
      return;
    }
    const recipesForPrewarm = collectCategoryRecipesForPrewarm(category, currentPage.value);
    if (recipesForPrewarm.length <= 0) {
      return;
    }
    queueRenderableMediaPrewarmFromUnknown(recipesForPrewarm, {
      limit: Math.max(24, recipesForPrewarm.length * 18),
    });
  };

  const prefetchRecipeSearchPack = () => {
    const itemId = itemIdRef.value;
    const tab = currentTab.value;
    if (!itemId || loading.value) {
      return;
    }
    void api.prefetchRecipeBootstrapSearchPack(itemId, tab).catch(() => {
      // best-effort only
    });
  };

  const {
    applyMergedRecipes,
    mergeIndexedRecipesIntoState,
    removePendingRecipeIds,
  } = createRecipeMergeState({
    recipes,
    bootstrapRecipeIndex,
    pendingProducedByRecipeIds,
    pendingUsageRecipeIds,
    rebuildIndexesAndGraphs,
  });

  const {
    cancelPendingHydration,
    hydrateRemainingRecipesInBackground,
  } = createRecipeShardHydrator({
    itemIdRef,
    recipes,
    pendingProducedByRecipeIds,
    pendingUsageRecipeIds,
    applyMergedRecipes,
    rebuildIndexesAndGraphs,
    isDisposed: () => disposed,
    getLoadRequestSeq: () => loadRequestSeq,
  });

  const requestRemainingShardHydration = (
    itemId: string,
    requestSeq: number,
    reason: RecipeHydrationRecoveryReason,
    preloadedShardPromise?: Promise<Awaited<ReturnType<typeof api.getRecipeBootstrapShard>> | null>,
  ) => {
    if (fullShardHydrationStarted.value) {
      return;
    }
    const pendingRecipeIds = Array.from(new Set([
      ...pendingProducedByRecipeIds.value,
      ...pendingUsageRecipeIds.value,
    ]));
    if (pendingRecipeIds.length === 0) {
      return;
    }
    fullShardHydrationStarted.value = true;
    void hydrateRemainingRecipesInBackground(itemId, requestSeq, pendingRecipeIds, preloadedShardPromise)
      .finally(() => {
        if (
          !disposed
          && requestSeq === loadRequestSeq
          && itemIdRef.value === itemId
          && (pendingProducedByRecipeIds.value.length > 0 || pendingUsageRecipeIds.value.length > 0)
        ) {
          fullShardHydrationStarted.value = false;
        }
        if (import.meta.env.DEV) {
          console.debug(`[obs] recipe-full-shard-hydration reason=${reason} item=${itemId}`);
        }
      });
  };

  const loadProducedByMachineGroup = async (
    itemId: string,
    requestSeq: number,
    machineType: string,
    machineKey: string,
    voltageTier?: string | null,
    options?: { offset?: number; limit?: number; includeRecipeIds?: boolean; category?: MachineCategory | null },
  ) => {
    const requestKey = buildMachineGroupRequestKey({
      machineKey,
      offset: options?.offset,
      limit: options?.limit,
      includeRecipeIds: options?.includeRecipeIds,
      defaultLimit: CATEGORY_PACK_PAGE_SIZE,
    });
    if (!machineKey || requestedProducedByGroupKeys.value.has(requestKey)) {
      return;
    }
    const nextRequestedKeys = new Set(requestedProducedByGroupKeys.value);
    nextRequestedKeys.add(requestKey);
    requestedProducedByGroupKeys.value = nextRequestedKeys;

    try {
      const payload = await api.getRecipeBootstrapProducedByGroup(itemId, machineType, voltageTier ?? null, {
        ...options,
        machineKey,
      });
      if (
        disposed
        || requestSeq !== loadRequestSeq
        || itemIdRef.value !== itemId
      ) {
        return;
      }
      primeRecipePayloadMedia(payload);
      setCategoryOrderedRecipeIds('producedBy', options?.category ?? currentCategory.value, payload.recipeIds);
      mergeIndexedRecipesIntoState(payload.recipes);
      removePendingRecipeIds('producedBy', payload.recipes.map((recipe) => recipe.id));
    } catch (error) {
      reportRecipeGroupHydrationFailure('produced-by-machine-group', RECIPE_HYDRATION_RECOVERY_REASONS.groupWindowRecovery, error);
      requestRemainingShardHydration(itemId, requestSeq, RECIPE_HYDRATION_RECOVERY_REASONS.groupWindowRecovery);
    }
  };

  const loadUsedInMachineGroup = async (
    itemId: string,
    requestSeq: number,
    machineType: string,
    machineKey: string,
    voltageTier?: string | null,
    options?: { offset?: number; limit?: number; includeRecipeIds?: boolean; category?: MachineCategory | null },
  ) => {
    const requestKey = buildMachineGroupRequestKey({
      machineKey,
      offset: options?.offset,
      limit: options?.limit,
      includeRecipeIds: options?.includeRecipeIds,
      defaultLimit: CATEGORY_PACK_PAGE_SIZE,
    });
    if (!machineKey || requestedUsageGroupKeys.value.has(requestKey)) {
      return;
    }
    const nextRequestedKeys = new Set(requestedUsageGroupKeys.value);
    nextRequestedKeys.add(requestKey);
    requestedUsageGroupKeys.value = nextRequestedKeys;

    try {
      const payload = await api.getRecipeBootstrapUsedInGroup(itemId, machineType, voltageTier ?? null, {
        ...options,
        machineKey,
      });
      if (
        disposed
        || requestSeq !== loadRequestSeq
        || itemIdRef.value !== itemId
      ) {
        return;
      }
      primeRecipePayloadMedia(payload);
      setCategoryOrderedRecipeIds('usedIn', options?.category ?? currentCategory.value, payload.recipeIds);
      mergeIndexedRecipesIntoState(payload.recipes);
      removePendingRecipeIds('usedIn', payload.recipes.map((recipe) => recipe.id));
    } catch (error) {
      reportRecipeGroupHydrationFailure('used-in-machine-group', RECIPE_HYDRATION_RECOVERY_REASONS.groupWindowRecovery, error);
      requestRemainingShardHydration(itemId, requestSeq, RECIPE_HYDRATION_RECOVERY_REASONS.groupWindowRecovery);
    }
  };

  const loadCategoryGroup = async (
    itemId: string,
    requestSeq: number,
    tab: 'usedIn' | 'producedBy',
    categoryKey: string,
    options?: { offset?: number; limit?: number; includeRecipeIds?: boolean; category?: MachineCategory | null },
  ) => {
    const requestKey = buildCategoryGroupRequestKey({
      tab,
      categoryKey,
      offset: options?.offset,
      limit: options?.limit,
      includeRecipeIds: options?.includeRecipeIds,
      defaultLimit: CATEGORY_PACK_PAGE_SIZE,
    });
    if (!categoryKey || requestedCategoryGroupKeys.value.has(requestKey)) {
      return;
    }
    const nextRequestedKeys = new Set(requestedCategoryGroupKeys.value);
    nextRequestedKeys.add(requestKey);
    requestedCategoryGroupKeys.value = nextRequestedKeys;

    try {
      const payload = await api.getRecipeBootstrapCategoryGroup(itemId, tab, categoryKey, options);
      if (
        disposed
        || requestSeq !== loadRequestSeq
        || itemIdRef.value !== itemId
      ) {
        return;
      }
      primeRecipePayloadMedia(payload);
      setCategoryOrderedRecipeIds(tab, options?.category ?? currentCategory.value, payload.recipeIds);
      mergeIndexedRecipesIntoState(payload.recipes);
      removePendingRecipeIds(tab === 'producedBy' ? 'producedBy' : 'usedIn', payload.recipes.map((recipe) => recipe.id));
    } catch (error) {
      reportRecipeGroupHydrationFailure('category-group', RECIPE_HYDRATION_RECOVERY_REASONS.groupWindowRecovery, error);
      requestRemainingShardHydration(itemId, requestSeq, RECIPE_HYDRATION_RECOVERY_REASONS.groupWindowRecovery);
    }
  };

  const isCategoryPackComplete = (category: NonNullable<typeof currentCategory.value>) => {
    const tab = currentTab.value;
    const orderedRecipeIds = getCategoryOrderedRecipeIds(tab, category);
    if (orderedRecipeIds.length > 0) {
      const loadedRecipeIds = getLoadedRecipeIdSet(tab);
      return orderedRecipeIds.every((recipeId) => loadedRecipeIds.has(recipeId));
    }

    const loadedRecipeCount = category.recipeVariants.size;
    const expectedRecipeCount = typeof category.recipeCount === 'number'
      ? category.recipeCount
      : category.recipes.length;
    return loadedRecipeCount > 0 && (expectedRecipeCount <= 0 || loadedRecipeCount >= expectedRecipeCount);
  };

  const requestCategoryPack = async (
    itemId: string,
    requestSeq: number,
    category: NonNullable<typeof currentCategory.value>,
    mode: 'visible' | 'prefetch',
    targetPage: number,
  ) => {
    if (isCategoryPackComplete(category)) {
      return;
    }

    const tab = currentTab.value;
    const lookupKey = getRecipeCategoryLookupKey(tab, category);
    const currentOrderedRecipeIds = getCategoryOrderedRecipeIds(tab, category);
    const includeRecipeIds = currentOrderedRecipeIds.length === 0;
    const recipesPerPage = getCategoryRecipesPerPage(category);
    const packWindowSize = Math.max(CATEGORY_PACK_PAGE_SIZE, recipesPerPage * 4);
    const normalizedTargetPage = Math.max(0, Math.floor(targetPage));

    if (includeRecipeIds) {
      const inflightKey = `${lookupKey}:0:${CATEGORY_PACK_IDS_ONLY_LIMIT}:1`;
      const existing = categoryPackRequestsInFlight.get(inflightKey);
      if (existing) {
        await existing;
      } else {
        const promise = (async () => {
          const machineRoute = resolveCategoryMachineRoute(category);
          if (!machineRoute.isMachineRoute) {
            await loadCategoryGroup(itemId, requestSeq, tab, category.categoryKey, {
              offset: 0,
              limit: CATEGORY_PACK_IDS_ONLY_LIMIT,
              includeRecipeIds: true,
              category,
            });
            return;
          }

          if (tab === 'usedIn') {
            await loadUsedInMachineGroup(itemId, requestSeq, machineRoute.machineType, machineRoute.machineKey, category.voltageTier ?? null, {
              offset: 0,
              limit: CATEGORY_PACK_IDS_ONLY_LIMIT,
              includeRecipeIds: true,
              category,
            });
            return;
          }

          await loadProducedByMachineGroup(itemId, requestSeq, machineRoute.machineType, machineRoute.machineKey, category.voltageTier ?? null, {
            offset: 0,
            limit: CATEGORY_PACK_IDS_ONLY_LIMIT,
            includeRecipeIds: true,
            category,
          });
        })().finally(() => {
          categoryPackRequestsInFlight.delete(inflightKey);
        });
        categoryPackRequestsInFlight.set(inflightKey, promise);
        await promise;
      }
    }

    const orderedRecipeIds = getCategoryOrderedRecipeIds(tab, category);
    if (orderedRecipeIds.length === 0) {
      if (mode === 'visible') {
        requestRemainingShardHydration(
          itemId,
          requestSeq,
          recipeHydrationRecoveryReasonForTab(tab),
        );
      }
      return;
    }

    const loadedRecipeIds = getLoadedRecipeIdSet(tab);
    const targetStart = normalizedTargetPage * recipesPerPage;
    const targetRecipeIds = orderedRecipeIds.slice(targetStart, targetStart + recipesPerPage);
    if (targetRecipeIds.length === 0 || targetRecipeIds.every((recipeId) => loadedRecipeIds.has(recipeId))) {
      return;
    }

    const clampedOffset = computeCategoryPackWindow({
      targetStart,
      orderedRecipeCount: orderedRecipeIds.length,
      packWindowSize,
    });
    const inflightKey = `${lookupKey}:${clampedOffset}:${packWindowSize}:0`;
    const existing = categoryPackRequestsInFlight.get(inflightKey);
    if (existing) {
      await existing;
      return;
    }

    const promise = (async () => {
      const machineRoute = resolveCategoryMachineRoute(category);
      if (!machineRoute.isMachineRoute) {
        await loadCategoryGroup(itemId, requestSeq, tab, category.categoryKey, {
          offset: clampedOffset,
          limit: packWindowSize,
          includeRecipeIds: false,
          category,
        });
        return;
      }

      if (tab === 'usedIn') {
        await loadUsedInMachineGroup(itemId, requestSeq, machineRoute.machineType, machineRoute.machineKey, category.voltageTier ?? null, {
          offset: clampedOffset,
          limit: packWindowSize,
          includeRecipeIds: false,
          category,
        });
        return;
      }

      await loadProducedByMachineGroup(itemId, requestSeq, machineRoute.machineType, machineRoute.machineKey, category.voltageTier ?? null, {
        offset: clampedOffset,
        limit: packWindowSize,
        includeRecipeIds: false,
        category,
      });
    })().finally(() => {
      categoryPackRequestsInFlight.delete(inflightKey);
    });
    categoryPackRequestsInFlight.set(inflightKey, promise);
    await promise;
  };

  const ensureCategoryPageReady = async (
    itemId: string,
    requestSeq: number,
    category: NonNullable<typeof currentCategory.value>,
    page: number,
    mode: 'visible' | 'prefetch',
  ) => {
    await requestCategoryPack(itemId, requestSeq, category, mode, page);
  };

  const {
    selectMachine,
    nextPage,
    prevPage,
    setPage,
    selectRecipeById,
  } = createRecipeNavigationController({
    itemIdRef,
    selectedMachineIndex,
    currentPage,
    totalPages,
    currentCategory,
    currentCategoryPages,
    currentCategoryOrderedRecipeIds,
    machineCategories,
    currentTab,
    categoryRecipeIdsByKey,
    playClick,
    markRecipeSwitch,
    getNow,
    getLoadRequestSeq: () => loadRequestSeq,
    ensureCategoryPageReady,
  });
  const requestCurrentPagePack = (
    itemId: string,
    requestSeq: number,
    category: NonNullable<typeof currentCategory.value>,
    mode: 'visible' | 'prefetch',
  ) => {
    void ensureCategoryPageReady(
      itemId,
      requestSeq,
      category,
      mode === 'visible' ? currentPage.value : 0,
      mode,
    );
  };

  const ensureVisibleRecipePack = () => {
    const itemId = itemIdRef.value;
    if (!itemId || loading.value || recipeSearchQuery.value.trim()) {
      return;
    }

    if (currentTab.value === 'usedIn') {
      if (pendingUsageRecipeIds.value.length <= 0) {
        return;
      }
    } else if (currentTab.value !== 'producedBy') {
      return;
    } else if (pendingProducedByRecipeIds.value.length <= 0) {
      return;
    }

    const category = currentCategory.value;
    if (!category) {
      requestRemainingShardHydration(
        itemId,
        loadRequestSeq,
        currentTab.value === 'usedIn'
          ? RECIPE_HYDRATION_RECOVERY_REASONS.usedInVisiblePack
          : RECIPE_HYDRATION_RECOVERY_REASONS.initialVisiblePack,
      );
      return;
    }

    requestCurrentPagePack(itemId, loadRequestSeq, category, 'visible');
  };

  const prefetchNeighborRecipePacks = () => {
    const itemId = itemIdRef.value;
    if (!itemId || loading.value || recipeSearchQuery.value.trim()) {
      return;
    }

    const pendingRecipeIds = currentTab.value === 'usedIn'
      ? pendingUsageRecipeIds.value
      : pendingProducedByRecipeIds.value;
    if (pendingRecipeIds.length <= 0) {
      return;
    }

    const categories = machineCategories.value;
    if (categories.length <= 1) {
      return;
    }

    for (const index of collectNeighborCategoryIndexes(selectedMachineIndex.value, categories.length)) {
      const category = categories[index];
      if (!category || isCategoryPackComplete(category)) {
        continue;
      }
      requestCurrentPagePack(itemId, loadRequestSeq, category, 'prefetch');
    }
  };

  const prefetchCurrentCategoryAdjacentPages = () => {
    const itemId = itemIdRef.value;
    const category = currentCategory.value;
    if (!itemId || !category || loading.value || recipeSearchQuery.value.trim()) {
      return;
    }

    const pageCount = Math.max(0, totalPages.value);
    if (pageCount <= 1) {
      return;
    }

    for (const page of collectAdjacentRecipePages(currentPage.value, pageCount)) {
      void ensureCategoryPageReady(itemId, loadRequestSeq, category, page, 'prefetch');
    }
  };

  const retryCurrentRecipeDetails = () => {
    const recipeId = currentRecipeId.value;
    if (!recipeId) return;
    void hydrateRecipeDetails([recipeId], 'manual-retry');
  };

  const producedByTotalCount = computed(() =>
    Math.max(
      recipes.value.producedBy.length,
      bootstrapRecipeIndex.value.producedByRecipes.length,
      bootstrapIndexedSummary.value?.counts?.producedBy ?? 0,
    ),
  );

  const usedInTotalCount = computed(() =>
    Math.max(
      recipes.value.usedIn.length,
      bootstrapRecipeIndex.value.usedInRecipes.length,
      bootstrapIndexedSummary.value?.counts?.usedIn ?? 0,
    ),
  );

  const loadRecipes = async () => {
    const itemId = itemIdRef.value;
    if (!itemId) return;
    const requestSeq = ++loadRequestSeq;

    perf.start('loadRecipes');
    loading.value = true;
    loadError.value = '\u8bfb\u53d6\u914d\u65b9\u5931\u8d25\uff0c\u8bf7\u68c0\u67e5\u540e\u7aef\u670d\u52a1\u540e\u91cd\u8bd5\u3002';
    try {
      if (lastItemId.value !== itemId) {
        cancelPendingHydration();
        recipeFirstPageVisibleItemId = null;
        resetDetailHydrationContext();
        clearCurrentRecipeState();
        resetRecipeCache();
        producedByGraph.value = { docs: new Map(), producedByIndex: new Map(), usedInIndex: new Map() };
        usedInGraph.value = { docs: new Map(), producedByIndex: new Map(), usedInIndex: new Map() };
        loadError.value = '\u8bfb\u53d6\u914d\u65b9\u5931\u8d25\uff0c\u8bf7\u68c0\u67e5\u540e\u7aef\u670d\u52a1\u540e\u91cd\u8bd5\u3002';
        lastItemId.value = itemId;
        clearSelectedVariants();
        clearRecipeSearch();
        recipeSwitchLatency.clear();
      }

      const bootstrapStartedAt = getNow();
      const {
        item: bootstrappedItem,
        recipes: bootstrappedRecipes,
        recipeIndex,
        indexedSummary,
        pendingProducedByRecipeIds: nextPendingProducedByRecipeIds,
        pendingUsageRecipeIds: nextPendingUsageRecipeIds,
        pendingRecipeIds,
      } = await perf.measureAsync(
        'loadRecipeData',
        () => loadRecipeBootstrap(itemId),
      );
      const bootstrapDurationMs = getNow() - bootstrapStartedAt;
      markPerfEvent('recipe-open-budget', {
        itemId,
        durationMs: bootstrapDurationMs,
        summaryBudgetMs: RECIPE_BOOTSTRAP_SUMMARY_BUDGET_MS,
        fullGroupBudgetMs: RECIPE_FULL_GROUP_BUDGET_MS,
        withinSummaryBudget: bootstrapDurationMs <= RECIPE_BOOTSTRAP_SUMMARY_BUDGET_MS,
        withinFullGroupBudget: bootstrapDurationMs <= RECIPE_FULL_GROUP_BUDGET_MS,
      });
      if (disposed || requestSeq !== loadRequestSeq || itemIdRef.value !== itemId) {
        return;
      }
      loadError.value = '';
      item.value = bootstrappedItem;
      bootstrapRecipeIndex.value = recipeIndex;
      bootstrapIndexedSummary.value = indexedSummary;
      pendingProducedByRecipeIds.value = nextPendingProducedByRecipeIds;
      pendingUsageRecipeIds.value = nextPendingUsageRecipeIds;
      recipes.value = {
        usedIn: bootstrappedRecipes.usedIn,
        producedBy: bootstrappedRecipes.producedBy,
      };
      rebuildIndexesAndGraphs();
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
      const hasProducedByRecipes = producedByTotalCount.value > 0;
      const hasUsedInRecipes = usedInTotalCount.value > 0;
      if (currentTab.value === 'usedIn') {
        currentTab.value = hasUsedInRecipes ? 'usedIn' : (hasProducedByRecipes ? 'producedBy' : 'usedIn');
      } else if (currentTab.value === 'producedBy') {
        currentTab.value = hasProducedByRecipes ? 'producedBy' : (hasUsedInRecipes ? 'usedIn' : 'producedBy');
      } else {
        currentTab.value = hasProducedByRecipes ? 'producedBy' : 'usedIn';
      }
      selectedMachineIndex.value = 0;
      currentPage.value = 0;

      const seedHydrationIds = [
        ...recipes.value.producedBy.slice(0, 2).map((recipe) => recipe.recipeId),
        ...recipes.value.usedIn.slice(0, 2).map((recipe) => recipe.recipeId),
      ];
      void hydrateRecipeDetails(seedHydrationIds, 'initial-seed');
      if (currentTab.value === 'usedIn' && pendingRecipeIds.length > 0) {
        fullShardHydrationStarted.value = false;
      }
      queueMicrotask(() => ensureVisibleRecipePack());
    } catch (error) {
      console.error('Failed to load recipes:', error);
      if (!disposed && requestSeq === loadRequestSeq && itemIdRef.value === itemId) {
        loadError.value = '\u8bfb\u53d6\u914d\u65b9\u5931\u8d25\uff0c\u8bf7\u68c0\u67e5\u540e\u7aef\u670d\u52a1\u540e\u91cd\u8bd5\u3002';
      }
    } finally {
      if (!disposed && requestSeq === loadRequestSeq) {
        loading.value = false;
      }
      perf.end('loadRecipes');
    }
  };

  const setCurrentTab = (tab: 'usedIn' | 'producedBy') => {
    if (tab !== 'usedIn' && tab !== 'producedBy') return;
    if (tab === currentTab.value) return;
    markRecipeSwitch('tab-switch');
    currentTab.value = tab;
  };

  const retryLoadRecipes = () => {
    loadError.value = '\u8bfb\u53d6\u914d\u65b9\u5931\u8d25\uff0c\u8bf7\u68c0\u67e5\u540e\u7aef\u670d\u52a1\u540e\u91cd\u8bd5\u3002';
    void loadRecipes();
  };

  const scheduleRecipeSearch = (query: string) => recipeSearchController.schedule(query);

  watch(recipeSearchQuery, (query) => {
    selectedMachineIndex.value = 0;
    currentPage.value = 0;
    scheduleRecipeSearch(query);
  });

  watch(currentTab, () => {
    if (!recipeSearchQuery.value.trim()) {
      return;
    }
    selectedMachineIndex.value = 0;
    currentPage.value = 0;
    scheduleRecipeSearch(recipeSearchQuery.value);
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
    () => [
      itemIdRef.value,
      currentTab.value,
      currentCategory.value?.machineKey ?? currentCategory.value?.name ?? '',
      currentCategoryPages.value.length,
      pendingProducedByRecipeIds.value.length,
      pendingUsageRecipeIds.value.length,
      loading.value,
    ] as const,
    () => {
      ensureVisibleRecipePack();
      prefetchNeighborRecipePacks();
      prefetchCurrentCategoryAdjacentPages();
      prefetchRecipeSearchPack();
      queueRecipePageMediaPrewarm();
    },
    { immediate: true },
  );

  watch(
    () => [
      itemIdRef.value,
      currentTab.value,
      currentCategory.value?.categoryKey ?? '',
      currentPage.value,
      totalPages.value,
      currentCategoryOrderedRecipeIds.value.length,
      recipes.value.producedBy.length,
      recipes.value.usedIn.length,
      loading.value,
    ] as const,
    () => {
      prefetchCurrentCategoryAdjacentPages();
      queueRecipePageMediaPrewarm();
    },
    { immediate: true },
  );

  watch(
    () => `${currentTab.value}|${selectedMachineIndex.value}|${currentPage.value}|${currentBaseRecipe.value?.recipeId ?? ''}`,
    () => {
      void recipeSwitchLatency.flush();
    },
  );

  watch(
    () => currentBaseRecipe.value?.recipeId,
    async (recipeId) => {
      if (!recipeId) return;
      const itemId = itemIdRef.value ?? null;
      if (itemId && recipeFirstPageVisibleItemId !== itemId) {
        await waitForPaint();
        if (recipeFirstPageVisibleItemId === itemId || itemIdRef.value !== itemId || currentBaseRecipe.value?.recipeId !== recipeId) {
          return;
        }
        recipeFirstPageVisibleItemId = itemId;
        markPerfEvent('recipe-first-page-visible', {
          itemId,
          recipeId,
          tab: currentTab.value,
          page: currentPage.value,
        });
      }
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
    recipeSearchController.dispose();
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
    isCurrentRecipeUsingSummaryProjection,
    isCurrentRecipeDetailFailed,
    currentRecipeVariantGroups,
    currentRecipeVariantSelections,
    filteredRecipeCount,
    totalRecipeCount,
    producedByTotalCount,
    usedInTotalCount,
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

