import type {
  BrowserByIdsPackResponse,
  BrowserDefaultCatalogResponse,
  BrowserGridEntry,
  BrowserGroupItemsResponse,
  BrowserPagePackResponse,
  BrowserPageResourceManifest,
  BrowserSearchCatalogResponse,
  BrowserSearchPackResponse,
  Item,
  PageAtlasResult,
  PageRichMediaManifest,
  PublicRuntimeManifest,
  PaginatedResponse,
} from './types';
import { browserRuntimeClient, type BrowserByIdsParams, type BrowserPageParams } from './browserClient';
import { searchRuntimeClient } from './searchClient';
import {
  browserEntryMatchesLocalSearch,
  buildBrowserByIdsPackCacheKey,
  buildPersistentBrowserPageKey,
  collectDisplayItemsFromBrowserEntries,
  deriveBrowserPagePackFromWindow,
  getBrowserDefaultCatalogCacheKey,
  getBrowserGroupItemsCacheKey,
  getBrowserSearchCatalogCacheKey,
  resolvePublishedWindowPath,
} from './browserProjection';
import { setCacheWithLimit } from './cacheUtils';

type PersistentBrowserPageCacheRecord = {
  data: BrowserGridEntry[];
  items: Item[];
  atlas: PageAtlasResult | null;
  mediaManifest?: PageRichMediaManifest | null;
  resourceManifest?: BrowserPageResourceManifest;
  total: number;
  totalPages: number;
  page: number;
};

type BrowserCatalogClientOptions = {
  getManifest: () => Promise<PublicRuntimeManifest>;
  fetchPublishedJson: <T>(assetPath: string) => Promise<T>;
  isPublishedJsonWarm: (assetPath: string | null | undefined) => boolean;
  reportGap: (scope: string, route: string, reason: string, context?: { details?: Record<string, unknown> }) => void;
  readPersistent: <T>(kind: string, identity: Record<string, unknown>) => Promise<T | null>;
  persist: (kind: string, identity: Record<string, unknown>, payload: unknown) => void;
  resolveRuntimeSignature: () => Promise<string | null>;
  primeRuntimeSignature: (signature: string | null | undefined) => void;
  writePersistentRuntimeCache: (key: string, payload: unknown) => Promise<void>;
};

export function createBrowserCatalogClient(options: BrowserCatalogClientOptions) {
  const browserSearchShardCache = new Map<string, BrowserSearchPackResponse>();
  const browserSearchShardInFlight = new Map<string, Promise<BrowserSearchPackResponse | null>>();
  const browserDefaultCatalogCache = new Map<string, BrowserDefaultCatalogResponse>();
  const browserDefaultCatalogInFlight = new Map<string, Promise<BrowserDefaultCatalogResponse>>();
  const browserSearchCatalogCache = new Map<string, BrowserSearchCatalogResponse>();
  const browserSearchCatalogInFlight = new Map<string, Promise<BrowserSearchCatalogResponse>>();
  const browserGroupItemsCache = new Map<string, BrowserGroupItemsResponse>();
  const browserGroupItemsInFlight = new Map<string, Promise<BrowserGroupItemsResponse>>();
  const browserByIdsPackCache = new Map<string, BrowserByIdsPackResponse>();
  const browserByIdsPackInFlight = new Map<string, Promise<BrowserByIdsPackResponse>>();

  function clearSearchCaches(): void {
    browserSearchShardCache.clear();
    browserSearchShardInFlight.clear();
    browserSearchCatalogCache.clear();
    browserSearchCatalogInFlight.clear();
  }

  function clearAllCaches(): void {
    clearSearchCaches();
    browserDefaultCatalogCache.clear();
    browserDefaultCatalogInFlight.clear();
    browserGroupItemsCache.clear();
    browserGroupItemsInFlight.clear();
    browserByIdsPackCache.clear();
    browserByIdsPackInFlight.clear();
  }

  async function getBrowserItems(params: Omit<BrowserPageParams, 'slotSize'>): Promise<PaginatedResponse<BrowserGridEntry>> {
    const distDataPage = await browserRuntimeClient.getPagePack(params);
    if (distDataPage) {
      return {
        data: distDataPage.data,
        total: distDataPage.total,
        page: distDataPage.page,
        pageSize: distDataPage.pageSize,
        totalPages: distDataPage.totalPages,
      };
    }
    options.reportGap('browser-items', '/items/browser', 'dist-data browser page missing', { details: params });
    return browserRuntimeClient.getItemsPageCompat(params);
  }

  async function getBrowserDefaultCatalog(params?: { modId?: string; includeHidden?: boolean }): Promise<BrowserDefaultCatalogResponse> {
    const cacheKey = getBrowserDefaultCatalogCacheKey(params?.modId, params?.includeHidden);
    const cached = browserDefaultCatalogCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const inflight = browserDefaultCatalogInFlight.get(cacheKey);
    if (inflight) {
      return inflight;
    }

    const request = (async () => {
      const distDataCatalog = await browserRuntimeClient.getDefaultCatalog(params?.modId, params?.includeHidden);
      if (distDataCatalog) {
        browserDefaultCatalogCache.set(cacheKey, distDataCatalog);
        return distDataCatalog;
      }
      options.reportGap('browser-default-catalog', '/items/browser/default-catalog', 'dist-data default catalog missing', {
        details: params,
      });

      const persistent = await options.readPersistent<BrowserDefaultCatalogResponse>(
        'browser-default-catalog',
        { scope: cacheKey },
      );
      if (persistent?.data?.length) {
        browserDefaultCatalogCache.set(cacheKey, persistent);
        return persistent;
      }

      const payload = await browserRuntimeClient.getDefaultCatalogCompat(params);
      browserDefaultCatalogCache.set(cacheKey, payload);
      options.persist('browser-default-catalog', { scope: cacheKey }, payload);
      return payload;
    })().finally(() => {
      browserDefaultCatalogInFlight.delete(cacheKey);
    });

    browserDefaultCatalogInFlight.set(cacheKey, request);
    return request;
  }

  function peekBrowserDefaultCatalog(modId?: string, includeHidden = false): BrowserDefaultCatalogResponse | null {
    return browserDefaultCatalogCache.get(getBrowserDefaultCatalogCacheKey(modId, includeHidden)) ?? null;
  }

  async function getBrowserSearchCatalog(params: { search: string; modId?: string; includeHidden?: boolean }): Promise<BrowserSearchCatalogResponse> {
    const normalizedSearch = `${params.search ?? ''}`.trim();
    if (!normalizedSearch) {
      return getBrowserDefaultCatalog({ modId: params.modId, includeHidden: params.includeHidden });
    }

    const distDataCatalog = await browserRuntimeClient.getSearchCatalog(normalizedSearch, params.modId, params.includeHidden);
    if (distDataCatalog) {
      browserSearchCatalogCache.set(getBrowserSearchCatalogCacheKey(normalizedSearch, params.modId, params.includeHidden), distDataCatalog);
      return distDataCatalog;
    }
    options.reportGap('browser-search-catalog', 'local default-catalog projection', 'dist-data search catalog missing', {
      details: params,
    });

    const cacheKey = getBrowserSearchCatalogCacheKey(normalizedSearch, params.modId, params.includeHidden);
    const cached = browserSearchCatalogCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const inflight = browserSearchCatalogInFlight.get(cacheKey);
    if (inflight) {
      return inflight;
    }

    const request = (async () => {
      const defaultCatalog = browserDefaultCatalogCache.get(getBrowserDefaultCatalogCacheKey(params.modId, params.includeHidden));
      const filtered = (defaultCatalog?.data ?? []).filter((entry) => browserEntryMatchesLocalSearch(entry, normalizedSearch));
      const result: BrowserSearchCatalogResponse = {
        data: filtered,
        total: filtered.length,
        page: 1,
        pageSize: filtered.length,
        totalPages: 1,
      };
      browserSearchCatalogCache.set(cacheKey, result);
      return result;
    })().finally(() => {
      browserSearchCatalogInFlight.delete(cacheKey);
    });

    browserSearchCatalogInFlight.set(cacheKey, request);
    return request;
  }

  function peekBrowserSearchCatalog(search: string, modId?: string, includeHidden = false): BrowserSearchCatalogResponse | null {
    const normalizedSearch = `${search ?? ''}`.trim();
    if (!normalizedSearch) {
      return peekBrowserDefaultCatalog(modId, includeHidden);
    }
    return browserSearchCatalogCache.get(getBrowserSearchCatalogCacheKey(normalizedSearch, modId, includeHidden)) ?? null;
  }

  async function getBrowserGroupItems(groupKey: string, modId?: string, includeHidden = false): Promise<BrowserGroupItemsResponse> {
    const normalizedGroupKey = `${groupKey ?? ''}`.trim();
    if (!normalizedGroupKey) {
      return { groupKey: '', total: 0, items: [] };
    }

    const cacheKey = getBrowserGroupItemsCacheKey(normalizedGroupKey, modId, includeHidden);
    const cached = browserGroupItemsCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const distDataGroupItems = await browserRuntimeClient.getGroupItems(normalizedGroupKey, modId, includeHidden);
    if (distDataGroupItems?.items?.length) {
      browserGroupItemsCache.set(cacheKey, distDataGroupItems);
      return distDataGroupItems;
    }
    options.reportGap('browser-group-items', `/items/browser/group/${normalizedGroupKey}`, 'dist-data group items missing', {
      details: { groupKey: normalizedGroupKey, modId },
    });

    const inflight = browserGroupItemsInFlight.get(cacheKey);
    if (inflight) {
      return inflight;
    }

    const request = (async () => {
      const identity = { groupKey: normalizedGroupKey, scope: getBrowserDefaultCatalogCacheKey(modId, includeHidden) };
      const persistent = await options.readPersistent<BrowserGroupItemsResponse>('browser-group-items', identity);
      if (persistent?.items?.length) {
        browserGroupItemsCache.set(cacheKey, persistent);
        return persistent;
      }

      const payload = await browserRuntimeClient.getGroupItemsCompat(normalizedGroupKey, modId);
      browserGroupItemsCache.set(cacheKey, payload);
      options.persist('browser-group-items', identity, payload);
      return payload;
    })().finally(() => {
      browserGroupItemsInFlight.delete(cacheKey);
    });

    browserGroupItemsInFlight.set(cacheKey, request);
    return request;
  }

  function peekBrowserGroupItems(groupKey: string, modId?: string, includeHidden = false): BrowserGroupItemsResponse | null {
    const normalizedGroupKey = `${groupKey ?? ''}`.trim();
    if (!normalizedGroupKey) {
      return null;
    }
    return browserGroupItemsCache.get(getBrowserGroupItemsCacheKey(normalizedGroupKey, modId, includeHidden)) ?? null;
  }

  async function getBrowserPagePack(params: BrowserPageParams): Promise<BrowserPagePackResponse> {
    const distDataPagePack = await browserRuntimeClient.getPagePack(params);
    if (distDataPagePack) {
      return distDataPagePack;
    }
    options.reportGap('browser-page-pack', '/items/browser/page-pack', 'dist-data page pack missing', { details: params });

    const normalizedExpandedGroups = params.expandedGroups ?? [];
    const canUseStaticBundle = !params.search?.trim() && !params.modId && normalizedExpandedGroups.length === 0;
    if (canUseStaticBundle) {
      const manifest = await options.getManifest();
      const staticPath = resolvePublishedWindowPath(
        manifest.publishBundle?.files.browserPageWindows,
        params.slotSize,
        Math.max(1, Math.floor(params.page ?? 1)),
        Math.max(1, Math.floor(params.pageSize ?? 50)),
        options.isPublishedJsonWarm,
      );
      if (staticPath) {
        try {
          const published = await options.fetchPublishedJson<BrowserPagePackResponse>(staticPath);
          const derived = deriveBrowserPagePackFromWindow(
            published,
            Math.max(1, Math.floor(params.page ?? 1)),
            Math.max(1, Math.floor(params.pageSize ?? 50)),
          );
          if (derived) {
            return derived;
          }
        } catch {
          // Dev compatibility path handles missing publish bundle artifacts.
        }
      }
    }

    return browserRuntimeClient.getPagePackCompat(params);
  }

  async function primeDefaultBrowserPagePack(params: { page: number; pageSize: number; slotSize?: number }): Promise<BrowserPagePackResponse> {
    const normalized = {
      page: Math.max(1, Math.floor(params.page)),
      pageSize: Math.max(1, Math.floor(params.pageSize)),
      slotSize: params.slotSize,
    };
    const response = await getBrowserPagePack(normalized);
    const signature = await options.resolveRuntimeSignature();
    if (signature) {
      options.primeRuntimeSignature(signature);
      const payload: PersistentBrowserPageCacheRecord = {
        data: response.data,
        items: collectDisplayItemsFromBrowserEntries(response.data),
        atlas: response.atlas ?? null,
        mediaManifest: response.mediaManifest ?? null,
        resourceManifest: response.resourceManifest,
        total: response.total,
        totalPages: response.totalPages,
        page: response.page,
      };
      await options.writePersistentRuntimeCache(buildPersistentBrowserPageKey(signature, normalized), payload);
    }
    return response;
  }

  async function getBrowserSearchPack(): Promise<BrowserSearchPackResponse> {
    const distDataSearch = await searchRuntimeClient.getSearchPack();
    if (distDataSearch?.items?.length) {
      return distDataSearch;
    }
    options.reportGap('browser-search-pack', '/items/search/pack', 'dist-data search pack missing');

    const manifest = await options.getManifest();
    const staticPath = manifest.publishBundle?.files.browserSearchPack;
    if (staticPath) {
      try {
        return await options.fetchPublishedJson<BrowserSearchPackResponse>(staticPath);
      } catch {
        // Dev compatibility path handles missing publish bundle artifacts.
      }
    }
    return browserRuntimeClient.getSearchPackCompat();
  }

  async function getBrowserSearchPackShard(shardId: string): Promise<BrowserSearchPackResponse | null> {
    const normalizedShardId = `${shardId ?? ''}`.trim();
    if (!normalizedShardId) {
      return null;
    }

    const distDataSearch = await searchRuntimeClient.getSearchPack();
    if (distDataSearch?.items?.length) {
      return distDataSearch;
    }
    options.reportGap('browser-search-shard', `publish search shard ${normalizedShardId}`, 'dist-data search pack missing', {
      details: { shardId: normalizedShardId },
    });

    const cached = browserSearchShardCache.get(normalizedShardId);
    if (cached) {
      return cached;
    }
    const inflight = browserSearchShardInFlight.get(normalizedShardId);
    if (inflight) {
      return inflight;
    }

    const request = (async () => {
      const manifest = await options.getManifest();
      const shardPath = manifest.publishBundle?.files.browserSearchShards?.find(
        (entry) => entry.scope === 'all' && entry.shardId === normalizedShardId,
      )?.path;
      if (!shardPath) {
        return null;
      }

      try {
        const shard = await options.fetchPublishedJson<BrowserSearchPackResponse>(shardPath);
        browserSearchShardCache.set(normalizedShardId, shard);
        return shard;
      } catch {
        return null;
      }
    })().finally(() => {
      browserSearchShardInFlight.delete(normalizedShardId);
    });

    browserSearchShardInFlight.set(normalizedShardId, request);
    return request;
  }

  async function getBrowserPagePackByIds(params: BrowserByIdsParams): Promise<BrowserByIdsPackResponse> {
    const normalizedParams = {
      itemIds: params.itemIds.map((itemId) => `${itemId ?? ''}`.trim()).filter(Boolean),
      slotSize: params.slotSize,
    };
    const cacheKey = buildBrowserByIdsPackCacheKey(normalizedParams);
    const cached = browserByIdsPackCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const inflight = browserByIdsPackInFlight.get(cacheKey);
    if (inflight) {
      return inflight;
    }

    const request = (async () => {
      const distDataPack = await browserRuntimeClient.getByIdsPack(normalizedParams.itemIds);
      if (distDataPack) {
        return distDataPack;
      }
      options.reportGap('browser-by-ids-pack', '/items/browser/by-ids-pack', 'dist-data by-id pack missing', {
        details: { itemIds: normalizedParams.itemIds, slotSize: normalizedParams.slotSize },
      });
      return browserRuntimeClient.getByIdsPackCompat(normalizedParams);
    })()
      .then((data) => {
        setCacheWithLimit(browserByIdsPackCache, cacheKey, data, 96);
        return data;
      })
      .finally(() => {
        browserByIdsPackInFlight.delete(cacheKey);
      });

    browserByIdsPackInFlight.set(cacheKey, request);
    return request;
  }

  function peekBrowserPagePackByIds(params: BrowserByIdsParams): BrowserByIdsPackResponse | null {
    const normalizedParams = {
      itemIds: params.itemIds.map((itemId) => `${itemId ?? ''}`.trim()).filter(Boolean),
      slotSize: params.slotSize,
    };
    return browserByIdsPackCache.get(buildBrowserByIdsPackCacheKey(normalizedParams)) ?? null;
  }

  return {
    clearSearchCaches,
    clearAllCaches,
    getBrowserItems,
    getBrowserDefaultCatalog,
    peekBrowserDefaultCatalog,
    getBrowserSearchCatalog,
    peekBrowserSearchCatalog,
    getBrowserGroupItems,
    peekBrowserGroupItems,
    getBrowserPagePack,
    primeDefaultBrowserPagePack,
    getBrowserSearchPack,
    getBrowserSearchPackShard,
    getBrowserPagePackByIds,
    peekBrowserPagePackByIds,
  };
}
