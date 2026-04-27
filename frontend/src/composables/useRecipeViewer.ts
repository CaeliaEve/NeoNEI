import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue';
import {
  api,
  getImageUrl,
  type ItemSearchBasic,
  type indexedItemRecipeSummaryResponse,
} from '../services/api';
import { useRecipeDataState } from './state/useRecipeDataState';
import { useRecipeUiState } from './state/useRecipeUiState';
import { useRecipeCacheState } from './state/useRecipeCacheState';
import { buildRecipeIndexes } from '../utils/recipeIndexing';
import { usePerfInstrumentation } from './usePerfInstrumentation';
import { buildRecipeGraph, type RecipeGraph } from '../domain/recipeGraph';
import { resolveRecipePresentationProfile } from '../services/uiTypeMapping';
import { useRecipeBrowserSelectors } from './recipe-browser/useRecipeBrowserSelectors';
import type { MachineCategory } from './recipe-browser/helpers';
import { loadRecipeBootstrap } from './useRecipeBootstrap';
import { useRecipeDetailHydrator } from './useRecipeDetailHydrator';
import { convertIndexedRecipe } from '../domain/recipeNormalization';
import { queueRenderableMediaPrewarmFromUnknown } from '../services/animationBudget';

const CATEGORY_PACK_PAGE_SIZE = 8;
const CATEGORY_PACK_IDS_ONLY_LIMIT = 0;
const RECIPE_PAGE_PREWARM_LOOKAHEAD = 6;
const RECIPE_PAGE_PREWARM_LOOKBEHIND = 2;
const RECIPE_PAGE_PREWARM_MAX_RECIPES = 18;

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
  const searchMatchedRecipeIds = ref<Set<string> | null>(null);
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
  let searchRequestSeq = 0;
  let recipeSwitchSeq = 0;
  let backgroundHydrationSeq = 0;
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
    currentCategoryOrderedRecipeIds,
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

  const setRecipeVariant = (slotKey: string, variantIndex: number) => {
    const recipe = currentBaseRecipe.value;
    if (!recipe) return;
    setSelectedVariant(recipe.recipeId, slotKey, variantIndex);
  };
  const clearRecipeSearch = () => {
    recipeSearchQuery.value = '';
    searchingRecipes.value = false;
    searchMatchedItemIds.value = new Set<string>();
    searchMatchedRecipeIds.value = null;
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

  const getCategoryLookupKey = (tab: 'usedIn' | 'producedBy', category: MachineCategory | null | undefined) => {
    const categoryKey = `${category?.categoryKey ?? ''}`.trim();
    if (!categoryKey) return '';
    return `${tab}:${categoryKey}`;
  };

  const getCategoryOrderedRecipeIds = (tab: 'usedIn' | 'producedBy', category: MachineCategory | null | undefined) => {
    const lookupKey = getCategoryLookupKey(tab, category);
    if (!lookupKey) return [] as string[];
    const recipeIds = categoryRecipeIdsByKey.value[lookupKey];
    return Array.isArray(recipeIds) ? recipeIds : [];
  };

  const setCategoryOrderedRecipeIds = (
    tab: 'usedIn' | 'producedBy',
    category: MachineCategory | null | undefined,
    recipeIds: string[] | undefined,
  ) => {
    if (!category || !Array.isArray(recipeIds) || recipeIds.length === 0) {
      return;
    }
    const lookupKey = getCategoryLookupKey(tab, category);
    if (!lookupKey) return;
    categoryRecipeIdsByKey.value = {
      ...categoryRecipeIdsByKey.value,
      [lookupKey]: recipeIds.map((recipeId) => recipeId.trim()).filter(Boolean),
    };
  };

  const getLoadedRecipeIdSet = (tab: 'usedIn' | 'producedBy') => new Set(
    (tab === 'usedIn' ? recipes.value.usedIn : recipes.value.producedBy).map((recipe) => recipe.recipeId),
  );

  const getCategoryRecipesPerPage = (category: MachineCategory | null | undefined) => {
    const sampleRecipe = category?.recipes?.[0]
      ?? (category && currentCategory.value && category.categoryKey === currentCategory.value.categoryKey
        ? (currentPageRecipes.value[0] ?? currentBaseRecipe.value ?? null)
        : null);
    if (!sampleRecipe) return 1;
    const profile = resolveRecipePresentationProfile({
      machineType: sampleRecipe.machineInfo?.machineType,
      recipeType: sampleRecipe.recipeType,
      recipeTypeData: sampleRecipe.recipeTypeData,
      inputs: sampleRecipe.inputs,
      additionalData: sampleRecipe.additionalData as Record<string, unknown> | undefined,
      metadata: sampleRecipe.metadata as Record<string, unknown> | undefined,
      preferDetailedCrafting: false,
    });
    return profile.component === 'FurnaceUI' ? 2 : 1;
  };

  const getLoadedCurrentTabRecipeMap = () => {
    const loadedRecipes = currentTab.value === 'usedIn'
      ? recipes.value.usedIn
      : recipes.value.producedBy;
    return new Map(loadedRecipes.map((recipe) => [recipe.recipeId, recipe] as const));
  };

  const buildCategoryPrewarmPageSequence = (pageCount: number, currentPageIndex: number): number[] => {
    if (pageCount <= 0) {
      return [];
    }

    const orderedPages: number[] = [];
    const seenPages = new Set<number>();
    const normalizedCurrent = ((currentPageIndex % pageCount) + pageCount) % pageCount;

    const pushPage = (page: number) => {
      const normalized = ((page % pageCount) + pageCount) % pageCount;
      if (seenPages.has(normalized)) {
        return;
      }
      seenPages.add(normalized);
      orderedPages.push(normalized);
    };

    pushPage(normalizedCurrent);
    for (let delta = 1; delta <= RECIPE_PAGE_PREWARM_LOOKAHEAD; delta += 1) {
      pushPage(normalizedCurrent + delta);
    }
    for (let delta = 1; delta <= RECIPE_PAGE_PREWARM_LOOKBEHIND; delta += 1) {
      pushPage(normalizedCurrent - delta);
    }

    return orderedPages;
  };

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

  const applyMergedRecipes = (mergedById: Map<string, typeof recipes.value.producedBy[number]>) => {
    const producedBy = bootstrapRecipeIndex.value.producedByRecipes
      .map((recipeId) => mergedById.get(recipeId))
      .filter((recipe): recipe is typeof recipes.value.producedBy[number] => Boolean(recipe));
    const usedIn = bootstrapRecipeIndex.value.usedInRecipes
      .map((recipeId) => mergedById.get(recipeId))
      .filter((recipe): recipe is typeof recipes.value.usedIn[number] => Boolean(recipe));

    recipes.value = { producedBy, usedIn };
    rebuildIndexesAndGraphs();
  };

  const mergeIndexedRecipesIntoState = (indexedRecipes: Array<{ id: string } & Record<string, unknown>>) => {
    const mergedById = new Map<string, typeof recipes.value.producedBy[number]>();
    for (const recipe of [...recipes.value.producedBy, ...recipes.value.usedIn]) {
      mergedById.set(recipe.recipeId, recipe);
    }
    for (const indexedRecipe of indexedRecipes) {
      const normalizedRecipe = convertIndexedRecipe(indexedRecipe as never);
      mergedById.set(normalizedRecipe.recipeId, normalizedRecipe);
    }
    applyMergedRecipes(mergedById);
  };

  const removePendingRecipeIds = (kind: 'producedBy' | 'usedIn', recipeIds: string[]) => {
    if (recipeIds.length === 0) return;
    const next = new Set(recipeIds.map((recipeId) => recipeId.trim()).filter(Boolean));
    if (kind === 'producedBy') {
      pendingProducedByRecipeIds.value = pendingProducedByRecipeIds.value.filter((recipeId) => !next.has(recipeId));
      return;
    }
    pendingUsageRecipeIds.value = pendingUsageRecipeIds.value.filter((recipeId) => !next.has(recipeId));
  };

  const removePendingRecipeIdsFromAll = (recipeIds: string[]) => {
    removePendingRecipeIds('producedBy', recipeIds);
    removePendingRecipeIds('usedIn', recipeIds);
  };

  const requestRemainingShardHydration = (
    itemId: string,
    requestSeq: number,
    reason: 'initial-fallback' | 'used-in-tab' | 'fallback-category',
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
    const requestKey = `${machineKey}:${options?.offset ?? 0}:${options?.limit ?? CATEGORY_PACK_PAGE_SIZE}:${options?.includeRecipeIds ? 1 : 0}`;
    if (!machineKey || requestedProducedByGroupKeys.value.has(requestKey)) {
      return;
    }
    const nextRequestedKeys = new Set(requestedProducedByGroupKeys.value);
    nextRequestedKeys.add(requestKey);
    requestedProducedByGroupKeys.value = nextRequestedKeys;

    try {
      const payload = await api.getRecipeBootstrapProducedByGroup(itemId, machineType, voltageTier ?? null, options);
      if (
        disposed
        || requestSeq !== loadRequestSeq
        || itemIdRef.value !== itemId
      ) {
        return;
      }
      setCategoryOrderedRecipeIds('producedBy', options?.category ?? currentCategory.value, payload.recipeIds);
      mergeIndexedRecipesIntoState(payload.recipes);
      removePendingRecipeIds('producedBy', payload.recipes.map((recipe) => recipe.id));
    } catch (error) {
      console.warn('Failed to hydrate producedBy machine group, falling back to full shard:', error);
      requestRemainingShardHydration(itemId, requestSeq, 'fallback-category');
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
    const requestKey = `${machineKey}:${options?.offset ?? 0}:${options?.limit ?? CATEGORY_PACK_PAGE_SIZE}:${options?.includeRecipeIds ? 1 : 0}`;
    if (!machineKey || requestedUsageGroupKeys.value.has(requestKey)) {
      return;
    }
    const nextRequestedKeys = new Set(requestedUsageGroupKeys.value);
    nextRequestedKeys.add(requestKey);
    requestedUsageGroupKeys.value = nextRequestedKeys;

    try {
      const payload = await api.getRecipeBootstrapUsedInGroup(itemId, machineType, voltageTier ?? null, options);
      if (
        disposed
        || requestSeq !== loadRequestSeq
        || itemIdRef.value !== itemId
      ) {
        return;
      }
      setCategoryOrderedRecipeIds('usedIn', options?.category ?? currentCategory.value, payload.recipeIds);
      mergeIndexedRecipesIntoState(payload.recipes);
      removePendingRecipeIds('usedIn', payload.recipes.map((recipe) => recipe.id));
    } catch (error) {
      console.warn('Failed to hydrate usedIn machine group, falling back to full shard:', error);
      requestRemainingShardHydration(itemId, requestSeq, 'fallback-category');
    }
  };

  const loadCategoryGroup = async (
    itemId: string,
    requestSeq: number,
    tab: 'usedIn' | 'producedBy',
    categoryKey: string,
    options?: { offset?: number; limit?: number; includeRecipeIds?: boolean; category?: MachineCategory | null },
  ) => {
    const requestKey = `${tab}:${categoryKey}:${options?.offset ?? 0}:${options?.limit ?? CATEGORY_PACK_PAGE_SIZE}:${options?.includeRecipeIds ? 1 : 0}`;
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
      setCategoryOrderedRecipeIds(tab, options?.category ?? currentCategory.value, payload.recipeIds);
      mergeIndexedRecipesIntoState(payload.recipes);
      removePendingRecipeIds(tab === 'producedBy' ? 'producedBy' : 'usedIn', payload.recipes.map((recipe) => recipe.id));
    } catch (error) {
      console.warn('Failed to hydrate recipe category group, falling back to full shard:', error);
      requestRemainingShardHydration(itemId, requestSeq, tab === 'usedIn' ? 'used-in-tab' : 'fallback-category');
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
    const lookupKey = getCategoryLookupKey(tab, category);
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
          if (category.type !== 'machine' || !`${category.machineKey ?? ''}`.trim()) {
            await loadCategoryGroup(itemId, requestSeq, tab, category.categoryKey, {
              offset: 0,
              limit: CATEGORY_PACK_IDS_ONLY_LIMIT,
              includeRecipeIds: true,
              category,
            });
            return;
          }

          const machineKey = `${category.machineKey ?? ''}`.trim();
          const machineType = machineKey.split('::')[0]?.trim() || category.name;
          if (tab === 'usedIn') {
            await loadUsedInMachineGroup(itemId, requestSeq, machineType, machineKey, category.voltageTier ?? null, {
              offset: 0,
              limit: CATEGORY_PACK_IDS_ONLY_LIMIT,
              includeRecipeIds: true,
              category,
            });
            return;
          }

          await loadProducedByMachineGroup(itemId, requestSeq, machineType, machineKey, category.voltageTier ?? null, {
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
          tab === 'usedIn' ? 'used-in-tab' : 'fallback-category',
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

    const clampedOffset = Math.max(
      0,
      Math.min(targetStart, Math.max(0, orderedRecipeIds.length - packWindowSize)),
    );
    const inflightKey = `${lookupKey}:${clampedOffset}:${packWindowSize}:0`;
    const existing = categoryPackRequestsInFlight.get(inflightKey);
    if (existing) {
      await existing;
      return;
    }

    const promise = (async () => {
      if (category.type !== 'machine' || !`${category.machineKey ?? ''}`.trim()) {
        await loadCategoryGroup(itemId, requestSeq, tab, category.categoryKey, {
          offset: clampedOffset,
          limit: packWindowSize,
          includeRecipeIds: false,
          category,
        });
        return;
      }

      const machineKey = `${category.machineKey ?? ''}`.trim();
      const machineType = machineKey.split('::')[0]?.trim() || category.name;
      if (tab === 'usedIn') {
        await loadUsedInMachineGroup(itemId, requestSeq, machineType, machineKey, category.voltageTier ?? null, {
          offset: clampedOffset,
          limit: packWindowSize,
          includeRecipeIds: false,
          category,
        });
        return;
      }

      await loadProducedByMachineGroup(itemId, requestSeq, machineType, machineKey, category.voltageTier ?? null, {
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
        currentTab.value === 'usedIn' ? 'used-in-tab' : 'initial-fallback',
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

    const normalizedIndex = ((selectedMachineIndex.value % categories.length) + categories.length) % categories.length;
    const candidateIndexes = [
      (normalizedIndex + 1) % categories.length,
      (normalizedIndex - 1 + categories.length) % categories.length,
    ];

    const seen = new Set<number>([normalizedIndex]);
    for (const index of candidateIndexes) {
      if (seen.has(index)) continue;
      seen.add(index);
      const category = categories[index];
      if (!category || isCategoryPackComplete(category)) {
        continue;
      }
      requestCurrentPagePack(itemId, loadRequestSeq, category, 'prefetch');
    }
  };

  const hydrateRemainingRecipesInBackground = async (
    itemId: string,
    requestSeq: number,
    pendingRecipeIds: string[],
    preloadedShardPromise?: Promise<Awaited<ReturnType<typeof api.getRecipeBootstrapShard>> | null>,
  ) => {
    if (pendingRecipeIds.length === 0) {
      rebuildIndexesAndGraphs();
      return;
    }

    const hydrationSeq = ++backgroundHydrationSeq;
    const mergedById = new Map<string, typeof recipes.value.producedBy[number]>();
    for (const recipe of [...recipes.value.producedBy, ...recipes.value.usedIn]) {
      mergedById.set(recipe.recipeId, recipe);
    }

    try {
      const shard = (await preloadedShardPromise) ?? await api.getRecipeBootstrapShard(itemId);
      if (
        disposed
        || hydrationSeq !== backgroundHydrationSeq
        || requestSeq !== loadRequestSeq
        || itemIdRef.value !== itemId
      ) {
        return;
      }

      for (const indexedRecipe of [...shard.indexedCrafting, ...shard.indexedUsage]) {
        const normalizedRecipe = convertIndexedRecipe(indexedRecipe);
        mergedById.set(normalizedRecipe.recipeId, normalizedRecipe);
      }

      applyMergedRecipes(mergedById);
      pendingProducedByRecipeIds.value = [];
      pendingUsageRecipeIds.value = [];
    } catch (shardError) {
      console.warn('Failed to hydrate recipe shard, falling back to chunked batch load:', shardError);
      const chunkSize = 200;
      try {
        for (let index = 0; index < pendingRecipeIds.length; index += chunkSize) {
          const chunk = pendingRecipeIds.slice(index, index + chunkSize);
          const indexedRecipes = await api.getIndexedRecipesByIds(chunk);
          if (
            disposed
            || hydrationSeq !== backgroundHydrationSeq
            || requestSeq !== loadRequestSeq
            || itemIdRef.value !== itemId
          ) {
            return;
          }

          for (const indexedRecipe of indexedRecipes) {
            const normalizedRecipe = convertIndexedRecipe(indexedRecipe);
            mergedById.set(normalizedRecipe.recipeId, normalizedRecipe);
          }
        }

        if (
          disposed
          || hydrationSeq !== backgroundHydrationSeq
          || requestSeq !== loadRequestSeq
          || itemIdRef.value !== itemId
        ) {
          return;
        }

        applyMergedRecipes(mergedById);
        pendingProducedByRecipeIds.value = [];
        pendingUsageRecipeIds.value = [];
      } catch (error) {
        console.warn('Failed to hydrate remaining recipe pages:', error);
        if (
          !disposed
          && hydrationSeq === backgroundHydrationSeq
          && requestSeq === loadRequestSeq
          && itemIdRef.value === itemId
        ) {
          rebuildIndexesAndGraphs();
        }
      }
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
    loadError.value = '';
    try {
      if (lastItemId.value !== itemId) {
        backgroundHydrationSeq += 1;
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
        searchMatchedRecipeIds.value = null;
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
      if (disposed || requestSeq !== loadRequestSeq || itemIdRef.value !== itemId) {
        return;
      }
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

  const navigateToPage = async (targetPage: number, source: 'page-next' | 'page-prev' | 'page-set') => {
    if (targetPage < 0 || targetPage >= totalPages.value || targetPage === currentPage.value) {
      return;
    }
    markRecipeSwitch(source);
    playClick();
    const itemId = itemIdRef.value;
    const category = currentCategory.value;
    if (itemId && category) {
      await ensureCategoryPageReady(itemId, loadRequestSeq, category, targetPage, 'visible');
    }
    currentPage.value = targetPage;
  };

  const nextPage = () => {
    if (totalPages.value <= 0) return;
    void navigateToPage((currentPage.value + 1) % totalPages.value, 'page-next');
  };

  const prevPage = () => {
    if (totalPages.value <= 0) return;
    void navigateToPage((currentPage.value - 1 + totalPages.value) % totalPages.value, 'page-prev');
  };

  const setPage = (page: number) => {
    if (page < 0 || page >= totalPages.value || page === currentPage.value) {
      return;
    }
    void navigateToPage(page, 'page-set');
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
    if (!recipeId) return false;
    const orderedRecipeIds = currentCategoryOrderedRecipeIds.value;
    const index = orderedRecipeIds.length > 0
      ? orderedRecipeIds.findIndex((id) => id === recipeId)
      : currentCategoryPages.value.findIndex((recipe) => recipe.recipeId === recipeId);
    if (index < 0) return false;
    const targetPage = Math.floor(index / Math.max(1, getCategoryRecipesPerPage(currentCategory.value)));
    void navigateToPage(targetPage, 'page-set');
    return true;
  };

  const scheduleRecipeSearch = (query: string) => {
    if (searchDebounce) {
      clearTimeout(searchDebounce);
      searchDebounce = null;
    }
    if (searchAbortController) {
      searchAbortController.abort();
      searchAbortController = null;
    }

    const normalized = query.trim();
    if (!normalized) {
      pendingSearchLatency.value = null;
      searchMatchedItemIds.value = new Set<string>();
      searchMatchedRecipeIds.value = null;
      fastSearchResults.value = [];
      searchingRecipes.value = false;
      searchRequestSeq += 1;
      return;
    }

    const itemId = itemIdRef.value;
    if (!itemId) {
      pendingSearchLatency.value = null;
      searchMatchedItemIds.value = new Set<string>();
      searchMatchedRecipeIds.value = null;
      fastSearchResults.value = [];
      searchingRecipes.value = false;
      searchRequestSeq += 1;
      return;
    }

    const tab = currentTab.value;
    searchingRecipes.value = true;
    searchMatchedItemIds.value = new Set<string>();
    searchMatchedRecipeIds.value = null;
    fastSearchResults.value = [];
    const requestSeq = ++searchRequestSeq;
    pendingSearchLatency.value = { requestSeq, query: normalized, startedAt: getNow() };
    searchDebounce = setTimeout(async () => {
      const controller = new AbortController();
      searchAbortController = controller;
      try {
        const searchPayload = await api.getRecipeBootstrapSearch(itemId, tab, normalized, { signal: controller.signal });
        if (
          disposed
          || controller.signal.aborted
          || requestSeq !== searchRequestSeq
          || itemIdRef.value !== itemId
          || currentTab.value !== tab
        ) {
          return;
        }

        const matchedRecipeIds = Array.isArray(searchPayload.recipeIds)
          ? searchPayload.recipeIds.map((recipeId) => recipeId.trim()).filter(Boolean)
          : [];
        const itemMatches = Array.isArray(searchPayload.itemMatches)
          ? searchPayload.itemMatches
          : [];

        searchMatchedItemIds.value = new Set(itemMatches.map((entry) => entry.itemId));
        fastSearchResults.value = itemMatches.slice(0, 12);

        const loadedRecipeIds = new Set(
          (tab === 'usedIn' ? recipes.value.usedIn : recipes.value.producedBy).map((recipe) => recipe.recipeId),
        );
        const missingMatchedRecipeIds = matchedRecipeIds.filter((recipeId) => !loadedRecipeIds.has(recipeId));
        if (missingMatchedRecipeIds.length > 0) {
          const indexedRecipes = await api.getIndexedRecipesByIds(missingMatchedRecipeIds, { signal: controller.signal });
          if (
            disposed
            || controller.signal.aborted
            || requestSeq !== searchRequestSeq
            || itemIdRef.value !== itemId
            || currentTab.value !== tab
          ) {
            return;
          }
          mergeIndexedRecipesIntoState(indexedRecipes);
          removePendingRecipeIdsFromAll(indexedRecipes.map((recipe) => recipe.id));
        }

        if (
          disposed
          || controller.signal.aborted
          || requestSeq !== searchRequestSeq
          || itemIdRef.value !== itemId
          || currentTab.value !== tab
        ) {
          return;
        }

        searchMatchedRecipeIds.value = new Set(matchedRecipeIds);
      } catch (error) {
        if (controller.signal.aborted) return;
        console.warn('Failed to search recipe bootstrap pack:', error);
        if (requestSeq !== searchRequestSeq) return;
        searchMatchedItemIds.value = new Set<string>();
        searchMatchedRecipeIds.value = null;
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
  };

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
      queueRecipePageMediaPrewarm();
    },
    { immediate: true },
  );

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
