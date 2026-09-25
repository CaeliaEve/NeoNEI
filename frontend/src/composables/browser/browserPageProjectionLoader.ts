import {
  api,
  type BrowserDefaultCatalogResponse,
  type BrowserGroupItemsResponse,
  type BrowserSearchCatalogResponse,
  type Item,
} from '../../services/api';
import {
  projectBrowserEntriesFromDefaultCatalog,
  type BrowserDefaultCatalogEntry,
} from '../../services/browserLocalProjection';
import { markPerfEvent } from '../../services/perfMarks';
import {
  buildBrowserPageCacheKey,
  sharedExpandedProjectionCache,
  setSharedExpandedProjectionCache,
  type BrowserPageRequestParams,
  type CachedBrowserPage,
} from './browserPageCache';
import {
  applyGroupFacetFilters,
  collectBrowserPageResourceItemIds,
  collectDisplayItems,
  normalizeExpandedGroups,
  normalizeFacetFilters,
} from './browserProjectionUtils';

export type BrowserPageProjectionLoader = {
  loadProjectedPagePack: (params: BrowserPageRequestParams) => Promise<CachedBrowserPage>;
  tryLoadExpandedProjection: (params: BrowserPageRequestParams) => Promise<{ cacheKey: string; page: CachedBrowserPage } | null>;
  tryLoadUnexpandedPageProjection: (params: BrowserPageRequestParams) => Promise<{ cacheKey: string; page: CachedBrowserPage } | null>;
  tryProjectExpandedGroupsFromLocalCaches: (params: BrowserPageRequestParams) => { cacheKey: string; page: CachedBrowserPage } | null;
  tryProjectUnexpandedPageFromLocalCatalog: (params: BrowserPageRequestParams) => { cacheKey: string; page: CachedBrowserPage } | null;
  hydrateProjectedBrowserPageMedia: (
    cacheKey: string,
    params: BrowserPageRequestParams,
    basePage: CachedBrowserPage,
    requestId: number,
  ) => void;
};

export function createBrowserPageProjectionLoader(options: {
  isSearchLocalProjectionEligible: (params?: { search?: string; total?: number }) => boolean;
}): BrowserPageProjectionLoader {
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
    expandedGroupFacetFilters: normalizeFacetFilters(params.expandedGroupFacetFilters),
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
    const filteredGroupItemsByKey = applyGroupFacetFilters(
      groupItemsByKey,
      params.expandedGroupFacetFilters,
    );
    const projected = projectBrowserEntriesFromDefaultCatalog(
      catalogEntries,
      {
        expandedGroups: params.expandedGroups,
        groupItemsByKey: filteredGroupItemsByKey,
        page: params.page,
        pageSize: params.pageSize,
      },
    );
    const displayItems = collectDisplayItems(projected.data);
    return {
      data: projected.data,
      items: displayItems,
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

  const tryProjectExpandedGroupsFromLocalCaches = (
    params: BrowserPageRequestParams,
  ): { cacheKey: string; page: CachedBrowserPage } | null => {
    const normalizedSearch = `${params.search ?? ''}`.trim();
    if (normalizedSearch && !options.isSearchLocalProjectionEligible({ search: normalizedSearch })) {
      return null;
    }

    const catalog = normalizedSearch
      ? api.peekBrowserSearchCatalog(normalizedSearch, params.modId, params.includeHidden)
      : api.peekBrowserDefaultCatalog(params.modId, params.includeHidden);
    if (!catalog?.data?.length) {
      return null;
    }

    const groupItemsByKey = new Map<string, Item[]>();
    for (const groupKey of params.expandedGroups) {
      const response = api.peekBrowserGroupItems(groupKey, params.modId, params.includeHidden);
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
    const cacheKey = buildBrowserPageCacheKey({
      ...params,
      page: page.page,
    });
    return { cacheKey, page };
  };

  const tryProjectUnexpandedPageFromLocalCatalog = (
    params: BrowserPageRequestParams,
  ): { cacheKey: string; page: CachedBrowserPage } | null => {
    if (params.expandedGroups.length > 0) {
      return null;
    }

    const normalizedSearch = `${params.search ?? ''}`.trim();
    if (normalizedSearch && !options.isSearchLocalProjectionEligible({ search: normalizedSearch })) {
      return null;
    }

    const catalog = normalizedSearch
      ? api.peekBrowserSearchCatalog(normalizedSearch, params.modId, params.includeHidden)
      : api.peekBrowserDefaultCatalog(params.modId, params.includeHidden);
    if (!catalog?.data?.length) {
      return null;
    }

    const catalogEntries = catalog.data as BrowserDefaultCatalogEntry[];
    const page = buildProjectedBrowserPage(catalogEntries, params, new Map<string, Item[]>());
    const cacheKey = buildBrowserPageCacheKey({
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
    if (normalizedSearch && !options.isSearchLocalProjectionEligible({ search: normalizedSearch })) {
      return null;
    }

    const catalog = normalizedSearch
      ? await api.getBrowserSearchCatalog({
        search: normalizedSearch,
        modId: params.modId,
        includeHidden: params.includeHidden,
      })
      : await api.getBrowserDefaultCatalog({
        modId: params.modId,
        includeHidden: params.includeHidden,
      });
    const catalogEntries = catalog.data as BrowserDefaultCatalogEntry[];
    if (catalogEntries.length <= 0) {
      return null;
    }

    const page = buildProjectedBrowserPage(catalogEntries, params, new Map<string, Item[]>());
    return {
      cacheKey: buildBrowserPageCacheKey({
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
    if (normalizedSearch && !options.isSearchLocalProjectionEligible({ search: normalizedSearch })) {
      return null;
    }

    const [catalog, groupResponses] = await Promise.all([
      normalizedSearch
        ? api.getBrowserSearchCatalog({
          search: normalizedSearch,
          modId: params.modId,
          includeHidden: params.includeHidden,
        })
        : api.getBrowserDefaultCatalog({
          modId: params.modId,
          includeHidden: params.includeHidden,
        }),
      Promise.allSettled(
        params.expandedGroups.map((groupKey) => api.getBrowserGroupItems(groupKey, params.modId, params.includeHidden)),
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
      cacheKey: buildBrowserPageCacheKey({
        ...params,
        page: page.page,
      }),
      page,
    };
  };

  const loadProjectedPagePack = async (
    params: BrowserPageRequestParams,
  ): Promise<CachedBrowserPage> => {
    const unexpandedProjection = await tryLoadUnexpandedPageProjection(params);
    if (unexpandedProjection) {
      return unexpandedProjection.page;
    }

    const expandedProjection = await tryLoadExpandedProjection(params);
    if (expandedProjection) {
      return expandedProjection.page;
    }

    throw new Error('Native browser catalog projection unavailable for current runtime');
  };

  const hydrateProjectedBrowserPageMedia = (
    cacheKey: string,
    params: BrowserPageRequestParams,
    basePage: CachedBrowserPage,
    requestId: number,
  ) => {
    if (basePage.items.length === 0) {
      return;
    }

    const itemIds = collectBrowserPageResourceItemIds(basePage);
    if (itemIds.length === 0) {
      return;
    }

    void requestId;
    markPerfEvent('browser-projected-page-resource-warm', {
      page: params.page,
      pageSize: params.pageSize,
      items: itemIds.length,
      cacheKey,
      source: 'native-runtime-render-worker',
    });
  };

  return {
    loadProjectedPagePack,
    tryLoadExpandedProjection,
    tryLoadUnexpandedPageProjection,
    tryProjectExpandedGroupsFromLocalCaches,
    tryProjectUnexpandedPageFromLocalCatalog,
    hydrateProjectedBrowserPageMedia,
  };
}
