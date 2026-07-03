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
  ItemSearchBasic,
  PageRichMediaManifest,
  PublicRuntimeManifest,
  PaginatedResponse,
  SearchItemsFastOptions,
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
} from './browserProjection';
import {
  canUsePublishedBrowserPageWindow,
  resolvePublishedBrowserPageWindowPath,
  resolvePublishedBrowserSearchPackPath,
  resolvePublishedBrowserSearchShardPath,
} from './browserRuntimeArtifactPolicyCatalog';
import {
  mergeBrowserSearchPackEntries,
  searchBrowserSearchPackEntries,
} from './browserSearchProjection';
import { setCacheWithLimit } from './cacheUtils';

type PersistentBrowserPageCacheRecord = {
  data: BrowserGridEntry[];
  items: Item[];
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
    options.reportGap('browser-items', 'dist-data browser page pack', 'dist-data browser page missing', { details: params });
    throw new Error('Runtime browser items unavailable: compiled browser page pack is missing');
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
      options.reportGap('browser-default-catalog', 'dist-data default catalog', 'dist-data default catalog missing', {
        details: params,
      });
      throw new Error(`Runtime browser default catalog unavailable for ${cacheKey}: compiled catalog is missing`);
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
    options.reportGap('browser-group-items', `dist-data group ${normalizedGroupKey}`, 'dist-data group items missing', {
      details: { groupKey: normalizedGroupKey, modId },
    });
    throw new Error(`Runtime browser group unavailable for ${normalizedGroupKey}: compiled group pack is missing`);
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
    const canUsePublishedWindow = canUsePublishedBrowserPageWindow(params);
    let publishedArtifactFailure: string | null = null;
    if (canUsePublishedWindow) {
      const manifest = await options.getManifest();
      const staticPath = resolvePublishedBrowserPageWindowPath({
        manifest,
        request: params,
        isWarm: options.isPublishedJsonWarm,
      });
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
          publishedArtifactFailure = 'published browser page window could not derive requested page';
        } catch {
          publishedArtifactFailure = 'published browser page window could not be read';
        }
      } else {
        publishedArtifactFailure = 'published browser page window missing';
      }
    }

    options.reportGap('browser-page-pack', 'published browser page window', 'runtime browser page pack unavailable', {
      details: {
        ...params,
        publishedArtifactFailure,
        canUsePublishedWindow,
      },
    });
    throw new Error(`Runtime browser page pack unavailable: ${publishedArtifactFailure ?? 'compiled page pack is missing'}`);
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
    const manifest = await options.getManifest();
    const staticPath = resolvePublishedBrowserSearchPackPath(manifest);
    if (staticPath) {
      try {
        return await options.fetchPublishedJson<BrowserSearchPackResponse>(staticPath);
      } catch {
        options.reportGap('browser-search-pack', 'published browser search pack', 'published search pack unreadable');
        throw new Error(`Runtime browser search pack unavailable: published search pack could not be read (${staticPath})`);
      }
    }
    options.reportGap('browser-search-pack', 'published browser search pack', 'runtime search pack missing');
    throw new Error('Runtime browser search pack unavailable: compiled search pack is missing');
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
      const shardPath = resolvePublishedBrowserSearchShardPath(manifest, normalizedShardId);
      if (!shardPath) {
        options.reportGap('browser-search-shard', `publish search shard ${normalizedShardId}`, 'runtime search shard missing', {
          details: { shardId: normalizedShardId },
        });
        return null;
      }

      try {
        const shard = await options.fetchPublishedJson<BrowserSearchPackResponse>(shardPath);
        browserSearchShardCache.set(normalizedShardId, shard);
        return shard;
      } catch {
        options.reportGap('browser-search-shard', `publish search shard ${normalizedShardId}`, 'runtime search shard unreadable', {
          details: { shardId: normalizedShardId, path: shardPath },
        });
        return null;
      }
    })().finally(() => {
      browserSearchShardInFlight.delete(normalizedShardId);
    });

    browserSearchShardInFlight.set(normalizedShardId, request);
    return request;
  }

  async function searchItemsFast(
    keyword: string,
    limit: number = 60,
    searchOptions?: SearchItemsFastOptions,
  ): Promise<ItemSearchBasic[]> {
    const normalizedKeyword = `${keyword ?? ''}`.trim();
    if (!normalizedKeyword || normalizedKeyword.toLowerCase().startsWith('type:')) {
      return [];
    }

    const ensureNotAborted = () => {
      if (searchOptions?.signal?.aborted) {
        throw new DOMException('The operation was aborted.', 'AbortError');
      }
    };

    ensureNotAborted();
    const hotShard = await getBrowserSearchPackShard('hot');
    ensureNotAborted();
    const hotMatches = searchBrowserSearchPackEntries(hotShard?.items ?? [], normalizedKeyword, limit);
    if (hotMatches.length >= limit) {
      return hotMatches;
    }

    const tailShard = await getBrowserSearchPackShard('tail');
    ensureNotAborted();
    const mergedEntries = mergeBrowserSearchPackEntries(hotShard?.items ?? [], tailShard?.items ?? []);
    const mergedMatches = searchBrowserSearchPackEntries(mergedEntries, normalizedKeyword, limit);
    if (mergedMatches.length > 0 || mergedEntries.length > 0) {
      return mergedMatches;
    }

    const fullPack = await getBrowserSearchPack();
    ensureNotAborted();
    return searchBrowserSearchPackEntries(fullPack.items ?? [], normalizedKeyword, limit);
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
      options.reportGap('browser-by-ids-pack', 'dist-data by-id pack', 'dist-data by-id pack missing', {
        details: { itemIds: normalizedParams.itemIds, slotSize: normalizedParams.slotSize },
      });
      throw new Error('Runtime browser by-id pack unavailable: compiled by-id pack is missing');
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
    searchItemsFast,
    getBrowserPagePackByIds,
    peekBrowserPagePackByIds,
  };
}
