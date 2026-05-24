import { nextTick, onMounted, onUnmounted, ref, watch, type Ref } from 'vue';
import {
  api,
  type BrowserGridEntry,
  type BrowserDefaultCatalogResponse,
  type BrowserSearchCatalogResponse,
  type BrowserGroupItemsResponse,
  type BrowserPagePackResponse,
  type HomeBootstrapResponse,
  type Item,
  type Mod,
  type PageAtlasResult,
} from '../services/api';
import { resolveCanonicalRelativePath } from '../services/api/images';
import { peekPageAtlas } from '../services/pageAtlas';
import {
  projectBrowserEntriesFromDefaultCatalog,
  type BrowserDefaultCatalogEntry,
} from '../services/browserLocalProjection';
import {
  getStoredRuntimeSignature,
  primeRuntimeCacheSignature,
  readPersistentRuntimeCache,
  writePersistentRuntimeCache,
} from '../services/persistentRuntimeCache';
import {
  preloadBrowserSearchWorker,
  queryBrowserSearchWorker,
  type WorkerQueryResult,
} from '../services/browserSearchWorker';
import {
  getAnimatedAtlasImageUrl,
  isImageAssetDecoded,
  loadImageAsset,
  primeAnimatedAtlasManifest,
  queueRenderableMediaPrewarmFromUnknown,
} from '../services/animationBudget';
import {
  getGlobalBrowserAtlasCoverageForItems,
  hasGlobalBrowserAtlas,
  inspectGlobalBrowserAtlasCoverageForItems,
  warmAllGlobalBrowserAtlases,
  warmGlobalBrowserAtlasForItems,
  warmGlobalBrowserAtlasForItemsDetailed,
} from '../services/globalBrowserAtlas';
import { markPerfEvent, resetPerfTimeline } from '../services/perfMarks';

type CachedBrowserPage = {
  data: BrowserGridEntry[];
  items: Item[];
  atlas: PageAtlasResult | null;
  mediaManifest?: BrowserPagePackResponse['mediaManifest'];
  resourceManifest?: BrowserPagePackResponse['resourceManifest'];
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

const SHARED_BROWSER_PAGE_CACHE_LIMIT = 256;
const SEARCH_LOCAL_PROJECTION_MAX_TOTAL = 1600;
const sharedPageCache = new Map<string, CachedBrowserPage>();
const sharedPageRequestInFlight = new Map<string, Promise<CachedBrowserPage>>();
const sharedPageRevalidationInFlight = new Map<string, Promise<void>>();
const sharedPagePresentationReady = new Set<string>();
const sharedPagePresentationWarmInFlight = new Map<string, Promise<void>>();
const SHARED_EXPANDED_PROJECTION_CACHE_LIMIT = 256;
const sharedExpandedProjectionCache = new Map<string, CachedBrowserPage>();

let browserCatalogWarmTimer: ReturnType<typeof setTimeout> | null = null;
let browserGroupWarmTimer: ReturnType<typeof setTimeout> | null = null;
let nativeBrowserWarmTimer: ReturnType<typeof setTimeout> | null = null;
const nativeBrowserWarmScopes = new Set<string>();
const nativeBrowserWarmPromises = new Map<string, Promise<void>>();

function setSharedBrowserPageCache(cacheKey: string, page: CachedBrowserPage): void {
  if (sharedPageCache.has(cacheKey)) {
    sharedPageCache.delete(cacheKey);
  }
  sharedPageCache.set(cacheKey, page);

  while (sharedPageCache.size > SHARED_BROWSER_PAGE_CACHE_LIMIT) {
    const oldestKey = sharedPageCache.keys().next().value;
    if (typeof oldestKey !== 'string' || !oldestKey) {
      break;
    }
    sharedPageCache.delete(oldestKey);
    sharedPagePresentationReady.delete(oldestKey);
    sharedPagePresentationWarmInFlight.delete(oldestKey);
  }
}

function setSharedExpandedProjectionCache(cacheKey: string, page: CachedBrowserPage): void {
  if (sharedExpandedProjectionCache.has(cacheKey)) {
    sharedExpandedProjectionCache.delete(cacheKey);
  }
  sharedExpandedProjectionCache.set(cacheKey, page);

  while (sharedExpandedProjectionCache.size > SHARED_EXPANDED_PROJECTION_CACHE_LIMIT) {
    const oldestKey = sharedExpandedProjectionCache.keys().next().value;
    if (typeof oldestKey !== 'string' || !oldestKey) {
      break;
    }
    sharedExpandedProjectionCache.delete(oldestKey);
  }
}

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

function collectAnimatedAtlasUrls(page: CachedBrowserPage): string[] {
  return Array.from(
    new Set(
      [
        ...Object.values(page.mediaManifest?.animatedAtlases ?? {})
          .map((entry) => getAnimatedAtlasImageUrl(entry)),
        ...(page.resourceManifest?.animatedAtlasFiles ?? [])
          .map((atlasFile) => resolveCanonicalRelativePath(atlasFile)),
      ]
        .filter((url): url is string => Boolean(url)),
    ),
  );
}

function collectBrowserPageResourceItemIds(page: CachedBrowserPage): string[] {
  const manifestItemIds = page.resourceManifest?.itemIds ?? [];
  if (manifestItemIds.length > 0) {
    return manifestItemIds.map((itemId) => `${itemId ?? ''}`.trim()).filter(Boolean);
  }
  return collectDisplayItems(page.data).map((item) => item.itemId).filter(Boolean);
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

function collectBrowserGroupKeys(entries: BrowserGridEntry[]): string[] {
  return Array.from(
    new Set(
      entries
        .filter((entry): entry is Extract<BrowserGridEntry, { kind: 'group-collapsed' | 'group-header' }> => entry.kind !== 'item')
        .map((entry) => `${entry.group.key ?? ''}`.trim())
        .filter(Boolean),
    ),
  );
}

function buildPersistentBrowserPageKey(
  signature: string,
  params: BrowserPageRequestParams,
): string {
  return JSON.stringify({
    type: 'browser-page-pack',
    version: 3,
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
  const pageCache = sharedPageCache;
  const pageRequestInFlight = sharedPageRequestInFlight;
  const pageRevalidationInFlight = sharedPageRevalidationInFlight;
  const pagePresentationReady = sharedPagePresentationReady;
  const pagePresentationWarmInFlight = sharedPagePresentationWarmInFlight;
  const items = ref<Item[]>([]);
  const browserEntries = ref<BrowserGridEntry[]>([]);
  const mods = ref<Mod[]>([]);
  const loading = ref(false);
  const transitioning = ref(false);
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
  let initialHomeBootstrapMarked = false;
  let firstBrowserTileVisibleMarked = false;
  let activeResourceWarmToken = 0;

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
  const isSearchLocalProjectionEligible = (params?: { search?: string; total?: number }) => {
    const search = `${params?.search ?? searchQuery.value ?? ''}`.trim();
    if (!search) {
      return false;
    }
    const total = Number(params?.total ?? totalItems.value ?? 0);
    return Number.isFinite(total) && total > 0 && total <= SEARCH_LOCAL_PROJECTION_MAX_TOTAL;
  };
  let lastSlotSize = buildSlotSize();
  let allowMeasuredPageCapacity = false;
  const getActiveBrowserScope = () => selectedMod.value === 'all' ? undefined : selectedMod.value;

  const prewarmVisibleBrowserGroups = (entries: BrowserGridEntry[]) => {
    if (hasActiveSearch() && !isSearchLocalProjectionEligible()) {
      return;
    }
    const groupKeys = collectBrowserGroupKeys(entries).slice(0, 12);
    if (groupKeys.length === 0) {
      return;
    }

    if (browserGroupWarmTimer !== null) {
      clearTimeout(browserGroupWarmTimer);
      browserGroupWarmTimer = null;
    }

    browserGroupWarmTimer = setTimeout(() => {
      browserGroupWarmTimer = null;
      for (const groupKey of groupKeys) {
        void api.getBrowserGroupItems(groupKey, getActiveBrowserScope()).catch(() => {
          // best-effort warmup only
        });
      }
    }, 40);
  };

  const prewarmBrowserDefaultCatalog = () => {
    if (browserCatalogWarmTimer !== null) {
      clearTimeout(browserCatalogWarmTimer);
      browserCatalogWarmTimer = null;
    }

    browserCatalogWarmTimer = setTimeout(() => {
      browserCatalogWarmTimer = null;
      const task = hasActiveSearch()
        ? (
          isSearchLocalProjectionEligible()
            ? api.getBrowserSearchCatalog({
              search: searchQuery.value.trim(),
              modId: getActiveBrowserScope(),
            })
            : null
        )
        : api.getBrowserDefaultCatalog({
          modId: getActiveBrowserScope(),
        });
      void task?.catch(() => {
        // best-effort warmup only
      });
    }, 60);
  };

  const buildNativeBrowserWarmKey = () => `${getActiveBrowserScope() ?? 'all'}::${pageSize.value}::${itemSize.value}`;

  const runNativeBrowserRuntimeWarm = async (warmKey: string, scope: string) => {
    const startedAt = performance.now();
    await Promise.allSettled([
      api.getBrowserDefaultCatalog({ modId: getActiveBrowserScope() }),
      hasGlobalBrowserAtlas()
        ? warmAllGlobalBrowserAtlases()
        : Promise.resolve(false),
    ]).then((results) => {
      markPerfEvent('browser-native-runtime-warm', {
        scope,
        durationMs: Math.round(performance.now() - startedAt),
        catalog: results[0]?.status ?? 'unknown',
        atlas: results[1]?.status ?? 'unknown',
      });
    }).catch(() => undefined);
    nativeBrowserWarmScopes.add(warmKey);
  };

  const ensureNativeBrowserRuntimeReady = async () => {
    if (hasActiveSearch()) {
      return;
    }

    const scope = getActiveBrowserScope() ?? 'all';
    const warmKey = buildNativeBrowserWarmKey();
    if (nativeBrowserWarmScopes.has(warmKey)) {
      return;
    }

    const existing = nativeBrowserWarmPromises.get(warmKey);
    if (existing) {
      await existing;
      return;
    }

    const promise = runNativeBrowserRuntimeWarm(warmKey, scope)
      .finally(() => {
        nativeBrowserWarmPromises.delete(warmKey);
      });
    nativeBrowserWarmPromises.set(warmKey, promise);
    await promise;
  };

  const warmNativeBrowserRuntime = () => {
    if (hasActiveSearch()) {
      return;
    }

    const scope = getActiveBrowserScope() ?? 'all';
    const warmKey = buildNativeBrowserWarmKey();
    if (nativeBrowserWarmScopes.has(warmKey)) {
      return;
    }

    if (nativeBrowserWarmTimer !== null) {
      clearTimeout(nativeBrowserWarmTimer);
      nativeBrowserWarmTimer = null;
    }

    nativeBrowserWarmTimer = setTimeout(() => {
      nativeBrowserWarmTimer = null;
      void ensureNativeBrowserRuntimeReady();
    }, 90);
  };

  const buildExpandedProjectionCacheKey = (
    params: BrowserPageRequestParams,
    groupItemsByKey: Map<string, Item[]>,
    catalogEntries?: BrowserDefaultCatalogEntry[],
  ): string => JSON.stringify({
    type: 'expanded-browser-projection',
    version: 1,
    page: params.page,
    pageSize: params.pageSize,
    search: params.search?.trim() || '',
    modId: params.modId || 'all',
    expandedGroups: normalizeExpandedGroups(params.expandedGroups),
    slotSize: params.slotSize,
    catalogSize: catalogEntries?.length ?? 0,
    groups: Array.from(groupItemsByKey.entries())
      .map(([groupKey, groupItems]) => [groupKey, groupItems.length] as const)
      .sort(([left], [right]) => left.localeCompare(right)),
  });

  const buildProjectedBrowserPage = (
    catalogEntries: BrowserDefaultCatalogEntry[],
    params: BrowserPageRequestParams,
    groupItemsByKey: Map<string, Item[]>,
  ): CachedBrowserPage => {
    const projected = projectBrowserEntriesFromDefaultCatalog(
      catalogEntries,
      {
        expandedGroups: params.expandedGroups,
        groupItemsByKey,
        page: params.page,
        pageSize: params.pageSize,
      },
    );
    const displayItems = collectDisplayItems(projected.data);
    return {
      data: projected.data,
      items: displayItems,
      atlas: peekPageAtlas(displayItems, itemSize.value) ?? null,
      mediaManifest: null,
      total: projected.total,
      totalPages: projected.totalPages,
      page: projected.page,
    };
  };

  const getOrBuildExpandedProjectionPage = (
    catalogEntries: BrowserDefaultCatalogEntry[],
    params: BrowserPageRequestParams,
    groupItemsByKey: Map<string, Item[]>,
  ): CachedBrowserPage => {
    const projectionCacheKey = buildExpandedProjectionCacheKey(params, groupItemsByKey, catalogEntries);
    const cachedProjection = sharedExpandedProjectionCache.get(projectionCacheKey);
    if (cachedProjection) {
      sharedExpandedProjectionCache.delete(projectionCacheKey);
      sharedExpandedProjectionCache.set(projectionCacheKey, cachedProjection);
      return cachedProjection;
    }

    const projectedPage = buildProjectedBrowserPage(catalogEntries, params, groupItemsByKey);
    setSharedExpandedProjectionCache(projectionCacheKey, projectedPage);
    return projectedPage;
  };

  const precomputeExpandedProjectionWindow = (
    catalogEntries: BrowserDefaultCatalogEntry[],
    params: BrowserPageRequestParams,
    groupItemsByKey: Map<string, Item[]>,
  ) => {
    for (const page of [params.page - 1, params.page, params.page + 1]) {
      if (page < 1) {
        continue;
      }
      getOrBuildExpandedProjectionPage(
        catalogEntries,
        {
          ...params,
          page,
        },
        groupItemsByKey,
      );
    }
  };

  const attachCachedBrowserByIdsPresentation = (
    params: BrowserPageRequestParams,
    basePage: CachedBrowserPage,
  ): CachedBrowserPage => {
    if (basePage.items.length <= 0) {
      return basePage;
    }

    const cachedPack = api.peekBrowserPagePackByIds({
      itemIds: basePage.items.map((item) => item.itemId),
      slotSize: params.slotSize,
    });
    if (!cachedPack) {
      return basePage;
    }

    return {
      ...basePage,
      atlas: cachedPack.atlas ?? basePage.atlas ?? null,
      mediaManifest: cachedPack.mediaManifest ?? basePage.mediaManifest ?? null,
      resourceManifest: cachedPack.resourceManifest ?? basePage.resourceManifest,
    };
  };

  const hydrateProjectedBrowserPageMedia = (
    cacheKey: string,
    params: BrowserPageRequestParams,
    basePage: CachedBrowserPage,
    requestId: number,
  ) => {
    if (hasGlobalBrowserAtlas()) {
      return;
    }
    if (basePage.items.length === 0) {
      return;
    }

    const currentCached = pageCache.get(cacheKey);
    if (currentCached?.atlas && currentCached.mediaManifest) {
      return;
    }

    const warmToken = activeResourceWarmToken;
    const itemIds = collectBrowserPageResourceItemIds(basePage);
    void warmGlobalBrowserAtlasForItemsDetailed(itemIds)
      .then((globalCoverage) => {
        if (warmToken !== activeResourceWarmToken || requestId !== loadItemsRequestId) {
          return null;
        }
        if (hasGlobalBrowserAtlas()) {
          return null;
        }
        if (globalCoverage.total > 0 && globalCoverage.missingCount === 0) {
          return null;
        }
        return api.getBrowserPagePackByIds({
          itemIds,
          slotSize: params.slotSize,
        });
      })
      .then((pack) => {
        if (warmToken !== activeResourceWarmToken || requestId !== loadItemsRequestId) {
          return;
        }
        if (!pack) {
          return;
        }
        const hydratedPage: CachedBrowserPage = {
          ...basePage,
          atlas: pack.atlas ?? basePage.atlas ?? null,
          mediaManifest: pack.mediaManifest ?? basePage.mediaManifest ?? null,
          resourceManifest: pack.resourceManifest ?? basePage.resourceManifest,
        };
        setSharedBrowserPageCache(cacheKey, hydratedPage);
        const activeCacheKey = buildPageCacheKey(buildRequestParams(currentPage.value));
        if (requestId === loadItemsRequestId && activeCacheKey === cacheKey) {
          applyBrowserResponse(hydratedPage, requestId, cacheKey);
        }
      })
      .catch(() => {
        // best-effort only
      });
  };
  const tryProjectExpandedGroupsFromLocalCaches = (
    params: BrowserPageRequestParams,
  ): { cacheKey: string; page: CachedBrowserPage } | null => {
    const normalizedSearch = `${params.search ?? ''}`.trim();
    if (normalizedSearch && !isSearchLocalProjectionEligible({ search: normalizedSearch })) {
      return null;
    }

    const catalog = normalizedSearch
      ? api.peekBrowserSearchCatalog(normalizedSearch, params.modId)
      : api.peekBrowserDefaultCatalog(params.modId);
    if (!catalog?.data?.length) {
      return null;
    }

    const groupItemsByKey = new Map<string, Item[]>();
    for (const groupKey of params.expandedGroups) {
      const response = api.peekBrowserGroupItems(groupKey, params.modId);
      if (!response?.items?.length) {
        return null;
      }
      groupItemsByKey.set(response.groupKey, response.items);
    }

    const catalogEntries = catalog.data as BrowserDefaultCatalogEntry[];
    precomputeExpandedProjectionWindow(catalogEntries, params, groupItemsByKey);
    const page = getOrBuildExpandedProjectionPage(
      catalogEntries,
      params,
      groupItemsByKey,
    );
    const cacheKey = buildPageCacheKey({
      ...params,
      page: page.page,
    });
    return { cacheKey, page: attachCachedBrowserByIdsPresentation(params, page) };
  };

  const tryProjectUnexpandedPageFromLocalCatalog = (
    params: BrowserPageRequestParams,
  ): { cacheKey: string; page: CachedBrowserPage } | null => {
    if (params.expandedGroups.length > 0) {
      return null;
    }

    const normalizedSearch = `${params.search ?? ''}`.trim();
    if (normalizedSearch && !isSearchLocalProjectionEligible({ search: normalizedSearch })) {
      return null;
    }

    const catalog = normalizedSearch
      ? api.peekBrowserSearchCatalog(normalizedSearch, params.modId)
      : api.peekBrowserDefaultCatalog(params.modId);
    if (!catalog?.data?.length) {
      return null;
    }

    const catalogEntries = catalog.data as BrowserDefaultCatalogEntry[];
    const page = buildProjectedBrowserPage(catalogEntries, params, new Map<string, Item[]>());
    const cacheKey = buildPageCacheKey({
      ...params,
      page: page.page,
    });
    return { cacheKey, page };
  };

  const tryLoadUnexpandedPageProjection = async (
    params: BrowserPageRequestParams,
  ): Promise<{ cacheKey: string; page: CachedBrowserPage } | null> => {
    if (params.expandedGroups.length > 0) {
      return null;
    }

    const normalizedSearch = `${params.search ?? ''}`.trim();
    if (normalizedSearch && !isSearchLocalProjectionEligible({ search: normalizedSearch })) {
      return null;
    }

    const catalog = normalizedSearch
      ? await api.getBrowserSearchCatalog({
        search: normalizedSearch,
        modId: params.modId,
      })
      : await api.getBrowserDefaultCatalog({
        modId: params.modId,
      });
    const catalogEntries = catalog.data as BrowserDefaultCatalogEntry[];
    if (catalogEntries.length <= 0) {
      return null;
    }

    const page = buildProjectedBrowserPage(catalogEntries, params, new Map<string, Item[]>());
    return {
      cacheKey: buildPageCacheKey({
        ...params,
        page: page.page,
      }),
      page,
    };
  };

  const tryLoadExpandedProjection = async (
    params: BrowserPageRequestParams,
  ): Promise<{ cacheKey: string; page: CachedBrowserPage } | null> => {
    if (params.expandedGroups.length === 0) {
      return null;
    }

    const normalizedSearch = `${params.search ?? ''}`.trim();
    if (normalizedSearch && !isSearchLocalProjectionEligible({ search: normalizedSearch })) {
      return null;
    }

    const [catalog, groupResponses] = await Promise.all([
      normalizedSearch
        ? api.getBrowserSearchCatalog({
          search: normalizedSearch,
          modId: params.modId,
        })
        : api.getBrowserDefaultCatalog({
          modId: params.modId,
        }),
      Promise.allSettled(
        params.expandedGroups.map((groupKey) => api.getBrowserGroupItems(groupKey, params.modId)),
      ),
    ]) as [(BrowserDefaultCatalogResponse | BrowserSearchCatalogResponse), PromiseSettledResult<BrowserGroupItemsResponse>[]];
    const groupItemsByKey = new Map<string, Item[]>();
    for (const response of groupResponses) {
      if (response.status !== 'fulfilled') {
        continue;
      }
      groupItemsByKey.set(response.value.groupKey, response.value.items);
    }

    const catalogEntries = catalog.data as BrowserDefaultCatalogEntry[];
    precomputeExpandedProjectionWindow(catalogEntries, params, groupItemsByKey);
    const page = getOrBuildExpandedProjectionPage(
      catalogEntries,
      params,
      groupItemsByKey,
    );
    return {
      cacheKey: buildPageCacheKey({
        ...params,
        page: page.page,
      }),
      page: attachCachedBrowserByIdsPresentation(params, page),
    };
  };

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
      modsLoadError.value = '\u52a0\u8f7d\u6a21\u7ec4\u5217\u8868\u5931\u8d25\uff0c\u8bf7\u68c0\u67e5\u540e\u7aef\u8fde\u63a5\u540e\u91cd\u8bd5';
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
    activeSignature?: string | null,
  ): Promise<{ signature: string; page: CachedBrowserPage } | null> => {
    if (params.search?.trim()) {
      return null;
    }

    const signature = activeSignature || getStoredRuntimeSignature();
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

  const ensureBrowserPagePresentationWarm = (
    cacheKey: string,
    response: CachedBrowserPage,
    options?: { animatedEntryLimit?: number; atlasLimit?: number },
  ): Promise<void> => {
    const warmToken = activeResourceWarmToken;
    const itemIds = collectBrowserPageResourceItemIds(response);
    if (hasGlobalBrowserAtlas()) {
      if (pagePresentationReady.has(cacheKey)) {
        return Promise.resolve();
      }
      const existing = pagePresentationWarmInFlight.get(cacheKey);
      if (existing) {
        return existing;
      }
      const request = warmGlobalBrowserAtlasForItemsDetailed(itemIds)
        .then((result) => {
          if (warmToken !== activeResourceWarmToken) {
            return;
          }
          markPerfEvent('browser-atlas-page-coverage', {
            page: response.page,
            ...result,
          });
          // Global browser atlas is the authoritative NEI-fast path. If entries
          // are missing, keep the page interactive and surface the coverage gap;
          // do not fall back to page atlases or per-item media requests.
          pagePresentationReady.add(cacheKey);
        })
        .catch(() => undefined)
        .finally(() => {
          pagePresentationWarmInFlight.delete(cacheKey);
        });
      pagePresentationWarmInFlight.set(cacheKey, request);
      return request;
    }

    prewarmCachedBrowserPageMedia(response, { ...options, warmToken });

    if (pagePresentationReady.has(cacheKey)) {
      return Promise.resolve();
    }

    const atlasUrls = [
      response.atlas?.atlasUrl ?? null,
      ...collectAnimatedAtlasUrls(response).slice(0, Math.max(1, options?.atlasLimit ?? 6)),
    ].filter((url): url is string => Boolean(url));

    if (atlasUrls.length > 0 && atlasUrls.every((url) => isImageAssetDecoded(url))) {
      pagePresentationReady.add(cacheKey);
      return Promise.resolve();
    }

    const existing = pagePresentationWarmInFlight.get(cacheKey);
    if (existing) {
      return existing;
    }

    const request = Promise.allSettled([
      warmGlobalBrowserAtlasForItems(itemIds).catch(() => false),
      warmPageAtlasPresentation(response, options),
    ])
      .then(() => {
        if (warmToken !== activeResourceWarmToken) {
          return;
        }
        pagePresentationReady.add(cacheKey);
      })
      .catch(() => undefined)
      .finally(() => {
        pagePresentationWarmInFlight.delete(cacheKey);
      });

    pagePresentationWarmInFlight.set(cacheKey, request);
    return request;
  };

  const warmPageAtlasPresentation = async (
    response: CachedBrowserPage,
    options?: { atlasLimit?: number },
  ): Promise<void> => {
    const atlasTasks: Array<Promise<unknown>> = [];
    const atlasUrls = Array.from(new Set([
      response.atlas?.atlasUrl ?? null,
      ...(response.resourceManifest?.atlasUrls ?? []),
    ].filter((url): url is string => Boolean(url))));
    for (const atlasUrl of atlasUrls) {
      atlasTasks.push(loadImageAsset(atlasUrl));
    }

    const animatedAtlasUrls = collectAnimatedAtlasUrls(response).slice(0, Math.max(1, options?.atlasLimit ?? 6));
    for (const atlasUrl of animatedAtlasUrls) {
      atlasTasks.push(loadImageAsset(atlasUrl).catch(() => undefined));
    }

    if (atlasTasks.length === 0) {
      return;
    }
    await Promise.allSettled(atlasTasks);
  };

  const waitForBrowserPagePresentation = async (
    cacheKey: string,
    response: CachedBrowserPage,
    waitMs: number,
  ) => {
    if (waitMs <= 0) {
      const warmToken = activeResourceWarmToken;
      window.setTimeout(() => {
        if (warmToken !== activeResourceWarmToken || pagePresentationReady.has(cacheKey)) {
          return;
        }
        void ensureBrowserPagePresentationWarm(cacheKey, response, {
          animatedEntryLimit: 0,
          atlasLimit: 0,
        });
      }, 450);
      return;
    }
    const pageItemIds = collectBrowserPageResourceItemIds(response);
    const globalCoverage = await inspectGlobalBrowserAtlasCoverageForItems(pageItemIds).catch(() => null);
    if (hasGlobalBrowserAtlas() && globalCoverage?.total && globalCoverage.total > 0) {
      const warmPromise = ensureBrowserPagePresentationWarm(cacheKey, response, {
        animatedEntryLimit: 0,
        atlasLimit: 0,
      });
      if (waitMs > 0 && !pagePresentationReady.has(cacheKey)) {
        await Promise.race([
          warmPromise,
          new Promise<void>((resolve) => {
            setTimeout(resolve, Math.min(180, Math.max(0, waitMs)));
          }),
        ]);
      }
      return;
    }
    if (!globalCoverage || globalCoverage.total <= 0 || globalCoverage.missingCount > 0) {
      if (!response.atlas?.atlasUrl || waitMs <= 0 || pagePresentationReady.has(cacheKey)) {
        return;
      }
    }

    const globalWarmPromise = warmGlobalBrowserAtlasForItemsDetailed(pageItemIds);
    const globalWarmResult = await Promise.race([
      globalWarmPromise,
      new Promise<null>((resolve) => {
        setTimeout(() => resolve(null), Math.min(120, Math.max(0, waitMs)));
      }),
    ]);
    if (globalWarmResult && globalWarmResult.total > 0 && globalWarmResult.missingCount === 0) {
      pagePresentationReady.add(cacheKey);
      return;
    }

    if (!response.atlas?.atlasUrl || waitMs <= 0 || pagePresentationReady.has(cacheKey)) {
      return;
    }

    const atlasUrls = [
      response.atlas.atlasUrl,
      ...collectAnimatedAtlasUrls(response).slice(0, 10),
    ].filter((url): url is string => Boolean(url));
    if (atlasUrls.length > 0 && atlasUrls.every((url) => isImageAssetDecoded(url))) {
      pagePresentationReady.add(cacheKey);
      return;
    }

    const warmPromise = ensureBrowserPagePresentationWarm(cacheKey, response, {
      animatedEntryLimit: 72,
      atlasLimit: 10,
    });

    await Promise.race([
      warmPromise,
      new Promise<void>((resolve) => {
        setTimeout(resolve, waitMs);
      }),
    ]);
  };

  const clearBrowserPageState = () => {
    pageCache.clear();
    pageRequestInFlight.clear();
    pageRevalidationInFlight.clear();
    pagePresentationReady.clear();
    pagePresentationWarmInFlight.clear();
    sharedExpandedProjectionCache.clear();
  };

  const applyBrowserResponse = (
    response: CachedBrowserPage,
    requestId: number,
    cacheKey?: string,
  ) => {
    if (requestId !== loadItemsRequestId) {
      return;
    }

    if (cacheKey) {
      if (hasGlobalBrowserAtlas()) {
        void waitForBrowserPagePresentation(cacheKey, response, 0);
      } else {
        void ensureBrowserPagePresentationWarm(cacheKey, response, {
          animatedEntryLimit: 72,
          atlasLimit: 10,
        });
      }
    } else if (!hasGlobalBrowserAtlas()) {
      prewarmCachedBrowserPageMedia(response, { animatedEntryLimit: 72, atlasLimit: 10 });
    }

    browserEntries.value = response.data;
    items.value = response.items;
    currentPageAtlas.value = hasGlobalBrowserAtlas() ? null : response.atlas;
    totalItems.value = response.total;
    totalPages.value = response.totalPages;
    currentPage.value = response.page;
    prewarmVisibleBrowserGroups(response.data);
    prewarmBrowserDefaultCatalog();
    warmNativeBrowserRuntime();

    if (!firstBrowserTileVisibleMarked && response.items.length > 0) {
      firstBrowserTileVisibleMarked = true;
      void nextTick().then(() => {
        markPerfEvent('first-browser-tile-visible', {
          itemId: response.items[0]?.itemId ?? null,
          page: response.page,
          total: response.total,
        });
      });
    }
  };

  const markInitialHomeBootstrapDone = (source: 'cache' | 'persistent-cache' | 'network-home-bootstrap' | 'network-page-pack') => {
    if (initialHomeBootstrapMarked) {
      return;
    }
    initialHomeBootstrapMarked = true;
    markPerfEvent('home-bootstrap-done', {
      source,
      page: currentPage.value,
      pageSize: pageSize.value,
      totalItems: totalItems.value,
      totalPages: totalPages.value,
    });
  };

  const prewarmCachedBrowserPageMedia = (
    response: CachedBrowserPage,
    options?: { animatedEntryLimit?: number; atlasLimit?: number; warmToken?: number },
  ) => {
    const warmToken = options?.warmToken ?? activeResourceWarmToken;
    const displayItemIds = collectBrowserPageResourceItemIds(response);
    void warmGlobalBrowserAtlasForItemsDetailed(displayItemIds)
      .then((coverage) => {
        if (warmToken !== activeResourceWarmToken) {
          return;
        }
        if (hasGlobalBrowserAtlas()) {
          markPerfEvent('browser-atlas-page-coverage', {
            page: response.page,
            ...getGlobalBrowserAtlasCoverageForItems(displayItemIds),
          });
        }
        if (hasGlobalBrowserAtlas()) {
          return;
        }
        if (coverage.total > 0 && coverage.missingCount === 0) {
          return;
        }
        void warmPageAtlasPresentation(response, options).catch(() => undefined);
        primeAnimatedAtlasManifest(response.mediaManifest);
        if (!hasGlobalBrowserAtlas()) {
          queueRenderableMediaPrewarmFromUnknown(response.data, {
            limit: Math.max(1, options?.animatedEntryLimit ?? 48),
            animatedOnly: true,
          });
        }
      })
      .catch(() => undefined);
  };

  const toCachedBrowserPage = (response: BrowserPagePackResponse): CachedBrowserPage => ({
    data: response.data,
    items: collectDisplayItems(response.data),
    atlas: response.atlas ?? null,
    mediaManifest: response.mediaManifest ?? null,
    resourceManifest: response.resourceManifest,
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
    setSharedBrowserPageCache(cacheKey, normalized);
    mods.value = response.mods;
    persistDefaultPage(requestParams, normalized, Promise.resolve(`${response.manifest.runtimeCacheKey ?? response.manifest.sourceSignature ?? ''}`.trim() || null));
    applyBrowserResponse(normalized, requestId, cacheKey);
    markInitialHomeBootstrapDone('network-home-bootstrap');
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
      mediaManifest: response.mediaManifest ?? null,
      resourceManifest: response.resourceManifest,
      total: response.total,
      totalPages: response.totalPages,
      page: response.page,
    } satisfies CachedBrowserPage;

    persistDefaultPage(params, normalized, options?.signaturePromise);
    return normalized;
  };

  const buildCachedSearchPageFromWorkerResult = (result: WorkerQueryResult): CachedBrowserPage => {
    const entries = (result.entries ?? []).map((entry) => {
      const item: Item = {
        itemId: entry.itemId,
        modId: entry.modId,
        internalName: entry.normalizedInternalName || entry.normalizedItemId || entry.itemId,
        localizedName: entry.localizedName || entry.itemId,
        searchTerms: entry.normalizedSearchTerms,
      };
      return {
        key: item.itemId,
        kind: 'item',
        item,
      } satisfies BrowserGridEntry;
    });
    const displayItems = collectDisplayItems(entries);
    return {
      data: entries,
      items: displayItems,
      atlas: peekPageAtlas(displayItems, itemSize.value) ?? null,
      mediaManifest: null,
      total: result.total,
      totalPages: result.totalPages,
      page: result.page,
    };
  };

  const loadSearchPage = async (
    params: BrowserPageRequestParams,
  ): Promise<CachedBrowserPage> => fetchPageWithDedup(buildPageCacheKey(params), async () => {
    const startedAt = performance.now();
    const result = await queryBrowserSearchWorker({
      query: params.search ?? '',
      modId: params.modId,
      page: params.page,
      pageSize: params.pageSize,
    });
    const normalized = buildCachedSearchPageFromWorkerResult(result);
    markPerfEvent('browser-search-local-page', {
      page: normalized.page,
      pageSize: params.pageSize,
      total: normalized.total,
      workerElapsedMs: result.elapsedMs ?? null,
      candidateCount: result.candidateCount ?? null,
      elapsedMs: performance.now() - startedAt,
    });
    hydrateProjectedBrowserPageMedia(
      buildPageCacheKey({ ...params, page: normalized.page }),
      params,
      normalized,
      loadItemsRequestId,
    );
    return normalized;
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
        setSharedBrowserPageCache(cacheKey, persistent);
        applyBrowserResponse(persistent, requestId, cacheKey);
        return;
      }

      const refreshed = await loadDefaultPage(requestParams, {
        signaturePromise: Promise.resolve(activeSignature),
      });
      setSharedBrowserPageCache(cacheKey, refreshed);
      applyBrowserResponse(refreshed, requestId, cacheKey);
    })().finally(() => {
      pageRevalidationInFlight.delete(cacheKey);
    });

    pageRevalidationInFlight.set(cacheKey, task);
    return task;
  };

  const loadItems = async () => {
    const requestId = ++loadItemsRequestId;
    activeResourceWarmToken += 1;
    loadError.value = '';
    const requestParams = buildRequestParams(currentPage.value);
    const cacheKey = buildPageCacheKey(requestParams);
    const cached = pageCache.get(cacheKey);
    const hadVisibleEntries = browserEntries.value.length > 0 && items.value.length > 0;

    if (cached) {
      if (hadVisibleEntries) {
        loading.value = false;
        transitioning.value = true;
        void waitForBrowserPagePresentation(cacheKey, cached, 0);
      } else {
        loading.value = false;
        transitioning.value = false;
      }
      applyBrowserResponse(cached, requestId, cacheKey);
      if (requestId === loadItemsRequestId) {
        transitioning.value = false;
      }
      return;
    }

    const localUnexpandedProjection = tryProjectUnexpandedPageFromLocalCatalog(requestParams);
    if (localUnexpandedProjection) {
      if (hadVisibleEntries) {
        loading.value = false;
        transitioning.value = true;
        void waitForBrowserPagePresentation(localUnexpandedProjection.cacheKey, localUnexpandedProjection.page, 0);
      } else {
        loading.value = false;
        transitioning.value = false;
      }
      setSharedBrowserPageCache(localUnexpandedProjection.cacheKey, localUnexpandedProjection.page);
      applyBrowserResponse(localUnexpandedProjection.page, requestId, localUnexpandedProjection.cacheKey);
      if (requestId === loadItemsRequestId) {
        transitioning.value = false;
      }
      return;
    }

    const localProjection = tryProjectExpandedGroupsFromLocalCaches(requestParams);
    if (localProjection) {
      if (hadVisibleEntries) {
        loading.value = false;
        transitioning.value = true;
        void waitForBrowserPagePresentation(localProjection.cacheKey, localProjection.page, 0);
      } else {
        loading.value = false;
        transitioning.value = false;
      }
      setSharedBrowserPageCache(localProjection.cacheKey, localProjection.page);
      applyBrowserResponse(localProjection.page, requestId, localProjection.cacheKey);
      hydrateProjectedBrowserPageMedia(
        localProjection.cacheKey,
        requestParams,
        localProjection.page,
        requestId,
      );
      if (requestId === loadItemsRequestId) {
        transitioning.value = false;
      }
      return;
    }

    if (hadVisibleEntries) {
      loading.value = false;
      transitioning.value = true;
    } else {
      loading.value = true;
      transitioning.value = false;
      currentPageAtlas.value = undefined;
    }

    try {
      const signaturePromise = resolvePublishSignature();

      const expandedProjection = await tryLoadExpandedProjection(requestParams);
      if (expandedProjection) {
        setSharedBrowserPageCache(expandedProjection.cacheKey, expandedProjection.page);
        if (hadVisibleEntries) {
          void waitForBrowserPagePresentation(expandedProjection.cacheKey, expandedProjection.page, 0);
        }
        applyBrowserResponse(expandedProjection.page, requestId, expandedProjection.cacheKey);
        hydrateProjectedBrowserPageMedia(
          expandedProjection.cacheKey,
          requestParams,
          expandedProjection.page,
          requestId,
        );
        return;
      }

      const unexpandedProjection = await tryLoadUnexpandedPageProjection(requestParams);
      if (unexpandedProjection) {
        setSharedBrowserPageCache(unexpandedProjection.cacheKey, unexpandedProjection.page);
        if (hadVisibleEntries) {
          void waitForBrowserPagePresentation(unexpandedProjection.cacheKey, unexpandedProjection.page, 0);
        }
        applyBrowserResponse(unexpandedProjection.page, requestId, unexpandedProjection.cacheKey);
        return;
      }

      if (!hasActiveSearch()) {
        const activeSignature = await signaturePromise;
        const persistent = await readPersistentDefaultPage(requestParams, activeSignature);
        if (persistent) {
          setSharedBrowserPageCache(cacheKey, persistent.page);
          if (hadVisibleEntries) {
            void waitForBrowserPagePresentation(cacheKey, persistent.page, 0);
          }
          applyBrowserResponse(persistent.page, requestId, cacheKey);
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

      const normalizedCacheKey = buildPageCacheKey({
        ...requestParams,
        page: normalized.page,
      });
      setSharedBrowserPageCache(normalizedCacheKey, normalized);
      if (hadVisibleEntries) {
        void waitForBrowserPagePresentation(normalizedCacheKey, normalized, 0);
      }
      applyBrowserResponse(normalized, requestId, normalizedCacheKey);
    } catch (error) {
      console.error('Failed to load items:', error);
      loadError.value = '\u52a0\u8f7d\u7269\u54c1\u5217\u8868\u5931\u8d25\uff0c\u8bf7\u68c0\u67e5\u540e\u7aef\u8fde\u63a5\u540e\u91cd\u8bd5';
      if (!hadVisibleEntries) {
        browserEntries.value = [];
        items.value = [];
        currentPageAtlas.value = null;
        totalItems.value = 0;
        totalPages.value = 0;
      }
    } finally {
      if (requestId === loadItemsRequestId) {
        loading.value = false;
        transitioning.value = false;
      }
    }
  };

  const loadInitialHomeState = async () => {
    const requestId = ++loadItemsRequestId;
    activeResourceWarmToken += 1;
    loading.value = true;
    transitioning.value = false;
    modsLoading.value = true;
    loadError.value = '';
    modsLoadError.value = '';
    currentPageAtlas.value = undefined;

    try {
      const requestParams = buildRequestParams(currentPage.value);
      const cacheKey = buildPageCacheKey(requestParams);
      const nativeWarmPromise = hasActiveSearch()
        ? Promise.resolve()
        : ensureNativeBrowserRuntimeReady();
      const cached = pageCache.get(cacheKey);
      if (cached) {
        await nativeWarmPromise;
        applyBrowserResponse(cached, requestId, cacheKey);
        markInitialHomeBootstrapDone('cache');
        try {
          mods.value = await api.getMods();
        } catch (error) {
          console.error('Failed to load mods:', error);
          mods.value = [];
          modsLoadError.value = '\u52a0\u8f7d\u6a21\u7ec4\u5217\u8868\u5931\u8d25\uff0c\u8bf7\u68c0\u67e5\u540e\u7aef\u8fde\u63a5\u540e\u91cd\u8bd5';
        }
        return;
      }

      const signaturePromise = !hasActiveSearch() ? resolvePublishSignature() : Promise.resolve(null);
      const activeSignature = await signaturePromise;
      const persistent = !hasActiveSearch()
        ? await readPersistentDefaultPage(requestParams, activeSignature)
        : null;

      if (persistent) {
        await nativeWarmPromise;
        setSharedBrowserPageCache(cacheKey, persistent.page);
        applyBrowserResponse(persistent.page, requestId, cacheKey);
        markInitialHomeBootstrapDone('persistent-cache');
        const modsPromise = api.getMods()
          .then((loadedMods) => {
            mods.value = loadedMods;
          })
          .catch((error) => {
            console.error('Failed to load mods:', error);
            mods.value = [];
            modsLoadError.value = '\u52a0\u8f7d\u6a21\u7ec4\u5217\u8868\u5931\u8d25\uff0c\u8bf7\u68c0\u67e5\u540e\u7aef\u8fde\u63a5\u540e\u91cd\u8bd5';
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
        await nativeWarmPromise;
        applyHomeBootstrapResponse(response, requestParams, requestId);
        return;
      }

      const loadedModsPromise = api.getMods();
      const normalized = hasActiveSearch()
        ? await loadSearchPage(requestParams)
        : await loadDefaultPage(requestParams, { signaturePromise });
      await nativeWarmPromise;

      const normalizedCacheKey = buildPageCacheKey({
        ...requestParams,
        page: normalized.page,
      });
      setSharedBrowserPageCache(normalizedCacheKey, normalized);
      applyBrowserResponse(normalized, requestId, normalizedCacheKey);
      if (requestParams.page === 1 && !requestParams.search?.trim() && requestParams.expandedGroups.length === 0) {
        markInitialHomeBootstrapDone('network-page-pack');
      }

      try {
        mods.value = await loadedModsPromise;
      } catch (error) {
        console.error('Failed to load mods:', error);
        mods.value = [];
        modsLoadError.value = '\u52a0\u8f7d\u6a21\u7ec4\u5217\u8868\u5931\u8d25\uff0c\u8bf7\u68c0\u67e5\u540e\u7aef\u8fde\u63a5\u540e\u91cd\u8bd5';
      }
    } catch (error) {
      console.error('Failed to load initial home state:', error);
      mods.value = [];
      modsLoadError.value = '\u52a0\u8f7d\u6a21\u7ec4\u5217\u8868\u5931\u8d25\uff0c\u8bf7\u68c0\u67e5\u540e\u7aef\u8fde\u63a5\u540e\u91cd\u8bd5';
      browserEntries.value = [];
      items.value = [];
      currentPageAtlas.value = null;
      totalItems.value = 0;
      totalPages.value = 0;
      loadError.value = '\u52a0\u8f7d\u7269\u54c1\u5217\u8868\u5931\u8d25\uff0c\u8bf7\u68c0\u67e5\u540e\u7aef\u8fde\u63a5\u540e\u91cd\u8bd5';
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
    void preloadBrowserSearchWorker().catch(() => {
      // best-effort warmup only
    });
  };

  const changePage = (page: number) => {
    currentPage.value = page;
    void loadItems();
  };

  const setExpandedGroups = (groupKeys: string[]) => {
    expandedGroupKeys.value = Array.from(new Set(groupKeys.filter(Boolean)));
    const requestParams = buildRequestParams(currentPage.value);
    const localProjection = tryProjectExpandedGroupsFromLocalCaches(requestParams);
    if (localProjection) {
      const requestId = ++loadItemsRequestId;
      activeResourceWarmToken += 1;
      loadError.value = '';
      loading.value = false;
      transitioning.value = false;
      setSharedBrowserPageCache(localProjection.cacheKey, localProjection.page);
      applyBrowserResponse(localProjection.page, requestId, localProjection.cacheKey);
      hydrateProjectedBrowserPageMedia(
        localProjection.cacheKey,
        requestParams,
        localProjection.page,
        requestId,
      );
      return;
    }
    void loadItems();
  };

  const setPageSize = (newSize: number, options?: { resetPage?: boolean }) => {
    const normalized = Math.max(20, Math.floor(newSize));
    if (normalized === pageSize.value) return;
    pageSize.value = normalized;
    clearBrowserPageState();
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
      const localProjection = tryProjectExpandedGroupsFromLocalCaches(requestParams);
      if (localProjection) {
        setSharedBrowserPageCache(localProjection.cacheKey, localProjection.page);
        // Prefetch only caches lightweight page data; media warming is reserved for the active page.
        return;
      }

      const expandedProjection = await tryLoadExpandedProjection(requestParams);
      if (expandedProjection) {
        setSharedBrowserPageCache(expandedProjection.cacheKey, expandedProjection.page);
        // Prefetch only caches lightweight page data; media warming is reserved for the active page.
        return;
      }

      const signaturePromise = hasActiveSearch()
        ? undefined
        : resolvePublishSignature();
      const normalized = hasActiveSearch()
        ? await loadSearchPage(requestParams)
        : await loadDefaultPage(requestParams, { signaturePromise });
      setSharedBrowserPageCache(cacheKey, normalized);
      // Do not decode atlas images during neighbor prefetch; active-page rendering owns presentation warming.
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
        clearBrowserPageState();
        void loadItems();
      }
    },
    { flush: 'post' },
  );

  onMounted(async () => {
    window.addEventListener('resize', handleResize);
    resetPerfTimeline();
    initialHomeBootstrapMarked = false;
    firstBrowserTileVisibleMarked = false;
    allowMeasuredPageCapacity = true;
    await nextTick();
    pageSize.value = calculatePageSize();
    await loadInitialHomeState();
    warmSearchIndex();
  });

  onUnmounted(() => {
    window.removeEventListener('resize', handleResize);
    if (resizeTimeout) clearTimeout(resizeTimeout);
    if (searchTimeout) clearTimeout(searchTimeout);
    if (browserCatalogWarmTimer) {
      clearTimeout(browserCatalogWarmTimer);
      browserCatalogWarmTimer = null;
    }
    if (browserGroupWarmTimer) {
      clearTimeout(browserGroupWarmTimer);
      browserGroupWarmTimer = null;
    }
    if (nativeBrowserWarmTimer) {
      clearTimeout(nativeBrowserWarmTimer);
      nativeBrowserWarmTimer = null;
    }
  });

  return {
    items,
    browserEntries,
    mods,
    loading,
    transitioning,
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
    clearCachedPages: clearBrowserPageState,
  };
}

