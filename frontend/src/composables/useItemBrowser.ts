import { nextTick, onMounted, onUnmounted, ref, watch, type Ref } from 'vue';
import {
  api,
  type BrowserGridEntry,
  type BrowserPagePackResponse,
  type HomeBootstrapResponse,
  type Item,
  type Mod,
  type PageAtlasResult,
} from '../services/api';
import {
  getStoredRuntimeSignature,
  primeRuntimeCacheSignature,
  readPersistentRuntimeCache,
  writePersistentRuntimeCache,
} from '../services/persistentRuntimeCache';

type CachedBrowserPage = {
  data: BrowserGridEntry[];
  items: Item[];
  atlas: PageAtlasResult | null;
  total: number;
  totalPages: number;
  page: number;
};

type BrowserPageRequestParams = {
  page: number;
  pageSize: number;
  search?: string;
  modId?: string;
  expandedGroups: string[];
  slotSize: number;
};

function collectDisplayItems(entries: BrowserGridEntry[]): Item[] {
  const ordered: Item[] = [];
  const seen = new Set<string>();

  for (const entry of entries) {
    const item = entry.kind === 'item' ? entry.item : entry.group.representative;
    if (!item?.itemId || seen.has(item.itemId)) continue;
    seen.add(item.itemId);
    ordered.push(item);
  }

  return ordered;
}

function normalizeExpandedGroups(groups?: string[]): string[] {
  return Array.from(
    new Set(
      (groups ?? [])
        .map((entry) => `${entry ?? ''}`.trim())
        .filter(Boolean),
    ),
  ).sort();
}

function buildPersistentBrowserPageKey(
  signature: string,
  params: BrowserPageRequestParams,
): string {
  return JSON.stringify({
    type: 'browser-page-pack',
    version: 1,
    signature,
    page: params.page,
    pageSize: params.pageSize,
    search: params.search?.trim() || '',
    modId: params.modId || 'all',
    expandedGroups: normalizeExpandedGroups(params.expandedGroups),
    slotSize: params.slotSize,
  });
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function useItemBrowser(
  itemSize: Ref<number>,
  options?: {
    measureVisiblePageCapacity?: () => number | null;
  },
) {
  const pageCache = new Map<string, CachedBrowserPage>();
  const pageRequestInFlight = new Map<string, Promise<CachedBrowserPage>>();
  const pageRevalidationInFlight = new Map<string, Promise<void>>();
  const items = ref<Item[]>([]);
  const browserEntries = ref<BrowserGridEntry[]>([]);
  const mods = ref<Mod[]>([]);
  const loading = ref(false);
  const modsLoading = ref(false);
  const loadError = ref('');
  const modsLoadError = ref('');
  const searchQuery = ref('');
  const selectedMod = ref<string>('all');
  const expandedGroupKeys = ref<string[]>([]);
  const currentPage = ref(1);
  const pageSize = ref(50);
  const totalItems = ref(0);
  const totalPages = ref(0);
  const currentPageAtlas = ref<PageAtlasResult | null | undefined>(undefined);

  let loadItemsRequestId = 0;
  let resizeTimeout: ReturnType<typeof setTimeout> | undefined;
  let searchTimeout: ReturnType<typeof setTimeout> | undefined;

  const buildPageCacheKey = (params: {
    page: number;
    pageSize: number;
    search?: string;
    modId?: string;
    expandedGroups?: string[];
    slotSize: number;
  }) =>
    JSON.stringify({
      page: params.page,
      pageSize: params.pageSize,
      search: params.search?.trim() || '',
      modId: params.modId || 'all',
      expandedGroups: normalizeExpandedGroups(params.expandedGroups),
      slotSize: params.slotSize,
    });

  const buildSlotSize = () => Math.max(32, Math.ceil(itemSize.value * 0.9));
  const hasActiveSearch = () => Boolean(searchQuery.value.trim());
  let lastSlotSize = buildSlotSize();
  let allowMeasuredPageCapacity = false;

  const estimateHomeRightColumnWidth = () => {
    const viewportWidth = window.innerWidth;
    if (viewportWidth >= 3200) {
      return clampNumber(viewportWidth * 0.41, 1120, 2160);
    }
    if (viewportWidth >= 2560) {
      return clampNumber(viewportWidth * 0.4, 860, 1760);
    }
    if (viewportWidth >= 1920) {
      return clampNumber(viewportWidth * 0.39, 700, 1500);
    }
    if (viewportWidth >= 1600) {
      return clampNumber(viewportWidth * 0.38, 580, 1360);
    }
    return clampNumber(viewportWidth * 0.38, 520, 1240);
  };

  const calculatePageSize = () => {
    const measuredCapacity = allowMeasuredPageCapacity
      ? options?.measureVisiblePageCapacity?.()
      : null;
    if (typeof measuredCapacity === 'number' && Number.isFinite(measuredCapacity) && measuredCapacity > 0) {
      return Math.max(20, Math.floor(measuredCapacity));
    }

    const gap = 4;
    const itemSizeWithGap = itemSize.value + gap;

    const paginationHeight = 52;
    const historyReserveHeight = Math.min(itemSize.value, 56) * 2 + 4 + 40;
    const paddingX = 32;
    const paddingY = 24;

    const maxHeight =
      window.innerHeight - paginationHeight - historyReserveHeight - paddingY;
    const contentWidth = estimateHomeRightColumnWidth() - paddingX;

    const rows = Math.max(1, Math.floor(maxHeight / itemSizeWithGap));
    const cols = Math.floor(contentWidth / itemSizeWithGap);

    return Math.max(rows * cols, 20);
  };

  const loadMods = async () => {
    modsLoading.value = true;
    modsLoadError.value = '';
    try {
      mods.value = await api.getMods();
    } catch (error) {
      console.error('Failed to load mods:', error);
      mods.value = [];
      modsLoadError.value = '????????????????????';
    } finally {
      modsLoading.value = false;
    }
  };

  const buildRequestParams = (page: number): BrowserPageRequestParams => ({
    page,
    pageSize: pageSize.value,
    search: searchQuery.value.trim() || undefined,
    modId: selectedMod.value === 'all' ? undefined : selectedMod.value,
    expandedGroups: normalizeExpandedGroups(expandedGroupKeys.value),
    slotSize: buildSlotSize(),
  });

  const resolvePublishSignature = async (): Promise<string | null> => {
    try {
      const manifest = await api.getPublishManifest();
      const runtimeCacheKey = `${manifest.runtimeCacheKey ?? manifest.sourceSignature ?? ''}`.trim();
      if (runtimeCacheKey) {
        primeRuntimeCacheSignature(runtimeCacheKey);
      }
      return runtimeCacheKey || getStoredRuntimeSignature();
    } catch {
      return getStoredRuntimeSignature();
    }
  };

  const readPersistentDefaultPage = async (
    params: BrowserPageRequestParams,
  ): Promise<{ signature: string; page: CachedBrowserPage } | null> => {
    if (params.search?.trim()) {
      return null;
    }

    const signature = getStoredRuntimeSignature();
    if (!signature) {
      return null;
    }

    const cached = await readPersistentRuntimeCache<CachedBrowserPage>(
      buildPersistentBrowserPageKey(signature, params),
    );
    if (!cached) {
      return null;
    }

    return {
      signature,
      page: cached,
    };
  };

  const writePersistentDefaultPage = async (
    signature: string,
    params: BrowserPageRequestParams,
    page: CachedBrowserPage,
  ): Promise<void> => {
    if (!signature || params.search?.trim()) {
      return;
    }

    await writePersistentRuntimeCache(
      buildPersistentBrowserPageKey(signature, params),
      page,
    );
  };

  const persistDefaultPage = (
    params: BrowserPageRequestParams,
    page: CachedBrowserPage,
    signaturePromise?: Promise<string | null>,
  ) => {
    if (params.search?.trim()) {
      return;
    }

    void (signaturePromise ?? resolvePublishSignature())
      .then(async (signature) => {
        if (!signature) {
          return;
        }
        primeRuntimeCacheSignature(signature);
        await writePersistentDefaultPage(signature, params, page);
      })
      .catch(() => {
        // best-effort persistent cache only
      });
  };

  const fetchPageWithDedup = (
    cacheKey: string,
    loader: () => Promise<CachedBrowserPage>,
  ): Promise<CachedBrowserPage> => {
    const existing = pageRequestInFlight.get(cacheKey);
    if (existing) {
      return existing;
    }

    const request = loader().finally(() => {
      pageRequestInFlight.delete(cacheKey);
    });
    pageRequestInFlight.set(cacheKey, request);
    return request;
  };

  const applyBrowserResponse = (
    response: CachedBrowserPage,
    requestId: number,
  ) => {
    if (requestId !== loadItemsRequestId) {
      return;
    }

    browserEntries.value = response.data;
    items.value = response.items;
    currentPageAtlas.value = response.atlas;
    totalItems.value = response.total;
    totalPages.value = response.totalPages;
    currentPage.value = response.page;
  };

  const toCachedBrowserPage = (response: BrowserPagePackResponse): CachedBrowserPage => ({
    data: response.data,
    items: collectDisplayItems(response.data),
    atlas: response.atlas ?? null,
    total: response.total,
    totalPages: response.totalPages,
    page: response.page,
  });

  const isHomeBootstrapEligible = (params: BrowserPageRequestParams): boolean => (
    params.page === 1
    && !params.search?.trim()
    && params.expandedGroups.length === 0
  );

  const applyHomeBootstrapResponse = (
    response: HomeBootstrapResponse,
    requestParams: BrowserPageRequestParams,
    requestId: number,
  ) => {
    const normalized = toCachedBrowserPage(response.pagePack);
    const cacheKey = buildPageCacheKey({
      ...requestParams,
      page: normalized.page,
    });
    pageCache.set(cacheKey, normalized);
    mods.value = response.mods;
    persistDefaultPage(requestParams, normalized, Promise.resolve(`${response.manifest.runtimeCacheKey ?? response.manifest.sourceSignature ?? ''}`.trim() || null));
    applyBrowserResponse(normalized, requestId);
  };

  const loadDefaultPageNetwork = async (
    params: BrowserPageRequestParams,
    options?: { signaturePromise?: Promise<string | null> },
  ): Promise<CachedBrowserPage> => {
    const response = await api.getBrowserPagePack(params);

    const normalized = {
      data: response.data,
      items: collectDisplayItems(response.data),
      atlas: response.atlas ?? null,
      total: response.total,
      totalPages: response.totalPages,
      page: response.page,
    } satisfies CachedBrowserPage;

    persistDefaultPage(params, normalized, options?.signaturePromise);
    return normalized;
  };

  const loadSearchPage = async (
    params: BrowserPageRequestParams,
  ): Promise<CachedBrowserPage> => fetchPageWithDedup(buildPageCacheKey(params), async () => {
    const response = await api.getBrowserPagePack({
      page: params.page,
      pageSize: params.pageSize,
      search: params.search,
      modId: params.modId,
      expandedGroups: params.expandedGroups,
      slotSize: params.slotSize,
    });

    return {
      data: response.data,
      items: collectDisplayItems(response.data),
      atlas: response.atlas ?? null,
      total: response.total,
      totalPages: response.totalPages,
      page: response.page,
    };
  });

  const loadDefaultPage = async (
    params: BrowserPageRequestParams,
    options?: { signaturePromise?: Promise<string | null> },
  ): Promise<CachedBrowserPage> => fetchPageWithDedup(
    buildPageCacheKey(params),
    () => loadDefaultPageNetwork(params, options),
  );

  const revalidatePersistentDefaultPage = (
    requestParams: BrowserPageRequestParams,
    requestId: number,
    cacheKey: string,
    cachedSignature: string,
    signaturePromise: Promise<string | null>,
  ) => {
    const existing = pageRevalidationInFlight.get(cacheKey);
    if (existing) {
      return existing;
    }

    const task = (async () => {
      const activeSignature = await signaturePromise;
      if (!activeSignature || activeSignature === cachedSignature) {
        return;
      }

      const persistent = await readPersistentRuntimeCache<CachedBrowserPage>(
        buildPersistentBrowserPageKey(activeSignature, requestParams),
      );
      if (persistent) {
        pageCache.set(cacheKey, persistent);
        applyBrowserResponse(persistent, requestId);
        return;
      }

      const refreshed = await loadDefaultPage(requestParams, {
        signaturePromise: Promise.resolve(activeSignature),
      });
      pageCache.set(cacheKey, refreshed);
      applyBrowserResponse(refreshed, requestId);
    })().finally(() => {
      pageRevalidationInFlight.delete(cacheKey);
    });

    pageRevalidationInFlight.set(cacheKey, task);
    return task;
  };

  const loadItems = async () => {
    const requestId = ++loadItemsRequestId;
    loading.value = true;
    loadError.value = '';
    currentPageAtlas.value = undefined;

    try {
      const requestParams = buildRequestParams(currentPage.value);
      const cacheKey = buildPageCacheKey(requestParams);
      const cached = pageCache.get(cacheKey);
      if (cached) {
        applyBrowserResponse(cached, requestId);
        return;
      }

      const signaturePromise = resolvePublishSignature();

      if (!hasActiveSearch()) {
        const persistent = await readPersistentDefaultPage(requestParams);
        if (persistent) {
          pageCache.set(cacheKey, persistent.page);
          applyBrowserResponse(persistent.page, requestId);
          loading.value = false;
          void revalidatePersistentDefaultPage(
            requestParams,
            requestId,
            cacheKey,
            persistent.signature,
            signaturePromise,
          );
          return;
        }
      }

      const normalized = hasActiveSearch()
        ? await loadSearchPage(requestParams)
        : await loadDefaultPage(requestParams, { signaturePromise });

      pageCache.set(
        buildPageCacheKey({
          ...requestParams,
          page: normalized.page,
        }),
        normalized,
      );
      applyBrowserResponse(normalized, requestId);
    } catch (error) {
      console.error('Failed to load items:', error);
      loadError.value = '????????????????????';
      browserEntries.value = [];
      items.value = [];
      currentPageAtlas.value = null;
      totalItems.value = 0;
      totalPages.value = 0;
    } finally {
      if (requestId === loadItemsRequestId) {
        loading.value = false;
      }
    }
  };

  const loadInitialHomeState = async () => {
    const requestId = ++loadItemsRequestId;
    loading.value = true;
    modsLoading.value = true;
    loadError.value = '';
    modsLoadError.value = '';
    currentPageAtlas.value = undefined;

    try {
      const requestParams = buildRequestParams(currentPage.value);
      const cacheKey = buildPageCacheKey(requestParams);
      const cached = pageCache.get(cacheKey);
      if (cached) {
        applyBrowserResponse(cached, requestId);
        try {
          mods.value = await api.getMods();
        } catch (error) {
          console.error('Failed to load mods:', error);
          mods.value = [];
          modsLoadError.value = '????????????????????';
        }
        return;
      }

      const persistent = !hasActiveSearch()
        ? await readPersistentDefaultPage(requestParams)
        : null;

      if (persistent) {
        const signaturePromise = resolvePublishSignature();
        pageCache.set(cacheKey, persistent.page);
        applyBrowserResponse(persistent.page, requestId);
        const modsPromise = api.getMods()
          .then((loadedMods) => {
            mods.value = loadedMods;
          })
          .catch((error) => {
            console.error('Failed to load mods:', error);
            mods.value = [];
            modsLoadError.value = '????????????????????';
          })
          .finally(() => {
            modsLoading.value = false;
          });
        loading.value = false;
        void revalidatePersistentDefaultPage(
          requestParams,
          requestId,
          cacheKey,
          persistent.signature,
          signaturePromise,
        );
        await modsPromise;
        return;
      }

      if (isHomeBootstrapEligible(requestParams)) {
        const response = await api.getHomeBootstrap({
          page: requestParams.page,
          pageSize: requestParams.pageSize,
          slotSize: requestParams.slotSize,
          modId: requestParams.modId,
        });
        applyHomeBootstrapResponse(response, requestParams, requestId);
        return;
      }

      const loadedModsPromise = api.getMods();
      const signaturePromise = resolvePublishSignature();
      const normalized = hasActiveSearch()
        ? await loadSearchPage(requestParams)
        : await loadDefaultPage(requestParams, { signaturePromise });

      pageCache.set(
        buildPageCacheKey({
          ...requestParams,
          page: normalized.page,
        }),
        normalized,
      );
      applyBrowserResponse(normalized, requestId);

      try {
        mods.value = await loadedModsPromise;
      } catch (error) {
        console.error('Failed to load mods:', error);
        mods.value = [];
        modsLoadError.value = '????????????????????';
      }
    } catch (error) {
      console.error('Failed to load initial home state:', error);
      mods.value = [];
      modsLoadError.value = '????????????????????';
      browserEntries.value = [];
      items.value = [];
      currentPageAtlas.value = null;
      totalItems.value = 0;
      totalPages.value = 0;
      loadError.value = '????????????????????';
    } finally {
      if (requestId === loadItemsRequestId) {
        loading.value = false;
        modsLoading.value = false;
      }
    }
  };

  const onSearch = () => {
    if (searchTimeout) clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      currentPage.value = 1;
      void loadItems();
    }, 220);
  };

  const warmSearchIndex = () => {
    // Search now hydrates directly from the backend browser page-pack fast path.
  };

  const changePage = (page: number) => {
    currentPage.value = page;
    void loadItems();
  };

  const setExpandedGroups = (groupKeys: string[]) => {
    expandedGroupKeys.value = Array.from(new Set(groupKeys.filter(Boolean)));
    pageCache.clear();
    void loadItems();
  };

  const setPageSize = (newSize: number, options?: { resetPage?: boolean }) => {
    const normalized = Math.max(20, Math.floor(newSize));
    if (normalized === pageSize.value) return;
    pageSize.value = normalized;
    pageCache.clear();
    if (options?.resetPage) {
      currentPage.value = 1;
    }
    void loadItems();
  };

  const prefetchItemsPage = async (page: number) => {
    if (page < 1) return;
    const requestParams = buildRequestParams(page);
    const cacheKey = buildPageCacheKey(requestParams);
    if (pageCache.has(cacheKey)) return;

    try {
      const signaturePromise = hasActiveSearch()
        ? undefined
        : resolvePublishSignature();
      const normalized = hasActiveSearch()
        ? await loadSearchPage(requestParams)
        : await loadDefaultPage(requestParams, { signaturePromise });
      pageCache.set(cacheKey, normalized);
    } catch {
      // best-effort prefetch only
    }
  };

  const getCachedItemsPage = (page: number) => {
    if (page < 1) return null;
    const requestParams = buildRequestParams(page);
    return pageCache.get(buildPageCacheKey(requestParams)) ?? null;
  };

  const handleResize = () => {
    if (resizeTimeout) clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
      const newSize = calculatePageSize();
      if (newSize !== pageSize.value) {
        setPageSize(newSize, { resetPage: true });
      }
    }, 300);
  };

  watch(
    itemSize,
    () => {
      const nextSlotSize = buildSlotSize();
      const newSize = calculatePageSize();
      const slotSizeChanged = nextSlotSize !== lastSlotSize;
      lastSlotSize = nextSlotSize;
      if (newSize !== pageSize.value) {
        setPageSize(newSize, { resetPage: true });
        return;
      }
      if (slotSizeChanged) {
        pageCache.clear();
        void loadItems();
      }
    },
    { flush: 'post' },
  );

  onMounted(async () => {
    window.addEventListener('resize', handleResize);
    await nextTick();
    pageSize.value = calculatePageSize();
    await loadInitialHomeState();
    allowMeasuredPageCapacity = true;
  });

  onUnmounted(() => {
    window.removeEventListener('resize', handleResize);
    if (resizeTimeout) clearTimeout(resizeTimeout);
    if (searchTimeout) clearTimeout(searchTimeout);
  });

  return {
    items,
    browserEntries,
    mods,
    loading,
    modsLoading,
    loadError,
    modsLoadError,
    searchQuery,
    selectedMod,
    expandedGroupKeys,
    currentPage,
    pageSize,
    totalItems,
    totalPages,
    currentPageAtlas,
    setExpandedGroups,
    setPageSize,
    loadMods,
    loadItems,
    onSearch,
    warmSearchIndex,
    changePage,
    prefetchItemsPage,
    getCachedItemsPage,
  };
}
