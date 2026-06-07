import type { BrowserGridEntry, BrowserPagePackResponse, Item, PageAtlasResult } from '../../services/api';

export type CachedBrowserPage = {
  data: BrowserGridEntry[];
  items: Item[];
  atlas: PageAtlasResult | null;
  mediaManifest?: BrowserPagePackResponse['mediaManifest'];
  resourceManifest?: BrowserPagePackResponse['resourceManifest'];
  total: number;
  totalPages: number;
  page: number;
};

export type BrowserFacetFilters = Record<string, string>;

export type BrowserPageRequestParams = {
  page: number;
  pageSize: number;
  search?: string;
  modId?: string;
  expandedGroups: string[];
  expandedGroupFacetFilters: BrowserFacetFilters;
  slotSize: number;
  includeHidden?: boolean;
};

const SHARED_BROWSER_PAGE_CACHE_LIMIT = 256;
const SHARED_EXPANDED_PROJECTION_CACHE_LIMIT = 256;

export const sharedPageCache = new Map<string, CachedBrowserPage>();
export const sharedPageRequestInFlight = new Map<string, Promise<CachedBrowserPage>>();
export const sharedPageRevalidationInFlight = new Map<string, Promise<void>>();
export const sharedPagePresentationReady = new Set<string>();
export const sharedPagePresentationWarmInFlight = new Map<string, Promise<void>>();
export const sharedExpandedProjectionCache = new Map<string, CachedBrowserPage>();

export function setSharedBrowserPageCache(cacheKey: string, page: CachedBrowserPage): void {
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

export function setSharedExpandedProjectionCache(cacheKey: string, page: CachedBrowserPage): void {
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
