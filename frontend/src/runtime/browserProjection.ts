import type {
  BrowserGridEntry,
  BrowserPagePackResponse,
  BrowserPageResourceManifest,
  Item,
  PageRichMediaManifest,
  PublishBundleWindowPathEntry,
} from './types';

export type BrowserPageCacheIdentity = {
  page: number;
  pageSize: number;
  search?: string;
  modId?: string;
  expandedGroups?: string[];
  slotSize?: number;
};

export function trimRichMediaManifest(
  mediaManifest: PageRichMediaManifest | null | undefined,
  entries: BrowserGridEntry[],
): PageRichMediaManifest | null {
  if (!mediaManifest) {
    return null;
  }

  const renderAssetRefs = new Set(
    entries
      .map((entry) => {
        const item = entry.kind === 'item' ? entry.item : entry.group.representative;
        return `${item?.renderAssetRef ?? ''}`.trim();
      })
      .filter(Boolean),
  );

  const animatedAtlases = Object.fromEntries(
    Object.entries(mediaManifest.animatedAtlases ?? {}).filter(([assetId]) => renderAssetRefs.has(assetId)),
  );

  return Object.keys(animatedAtlases).length > 0 ? { animatedAtlases } : null;
}

export function buildBrowserPageResourceManifest(
  entries: BrowserGridEntry[],
  mediaManifest: PageRichMediaManifest | null | undefined,
): BrowserPageResourceManifest {
  const displayItems = entries
    .map((entry) => (entry.kind === 'item' ? entry.item : entry.group.representative))
    .filter(Boolean);
  const itemIds = Array.from(new Set(displayItems.map((item) => `${item.itemId ?? ''}`.trim()).filter(Boolean)));
  const renderAssetRefs = Array.from(new Set(displayItems.map((item) => `${item.renderAssetRef ?? ''}`.trim()).filter(Boolean)));
  const animatedAtlasFiles = Array.from(new Set(
    Object.values(mediaManifest?.animatedAtlases ?? {})
      .map((entry) => `${entry?.atlasFile ?? ''}`.trim())
      .filter(Boolean),
  ));

  return {
    itemIds,
    renderAssetRefs,
    atlasUrls: [],
    animatedAtlasFiles,
    atlasEntryCount: 0,
    animatedAtlasCount: Object.keys(mediaManifest?.animatedAtlases ?? {}).length,
  };
}

export function deriveBrowserPagePackFromWindow(
  window: BrowserPagePackResponse,
  requestedPage: number,
  requestedPageSize: number,
): BrowserPagePackResponse | null {
  const normalizedPage = Math.max(1, Math.floor(requestedPage));
  const normalizedPageSize = Math.max(1, Math.floor(requestedPageSize));
  const startIndex = (normalizedPage - 1) * normalizedPageSize;
  const endIndex = startIndex + normalizedPageSize;
  const windowOffset = Number.isFinite(window.windowOffset)
    ? Math.max(0, Math.floor(window.windowOffset ?? 0))
    : window.page > 1
      ? Math.max(0, Math.floor((window.page - 1) * window.pageSize))
      : 0;
  const windowLength = Number.isFinite(window.windowLength)
    ? Math.max(0, Math.floor(window.windowLength ?? window.data.length))
    : window.data.length;
  const windowEnd = windowOffset + windowLength;
  if (startIndex < windowOffset || endIndex > windowEnd) {
    return null;
  }

  const relativeStartIndex = startIndex - windowOffset;
  const relativeEndIndex = relativeStartIndex + normalizedPageSize;
  const data = window.data.slice(relativeStartIndex, relativeEndIndex);
  const mediaManifest = trimRichMediaManifest(window.mediaManifest, data);
  return {
    data,
    total: window.total,
    page: normalizedPage,
    pageSize: normalizedPageSize,
    totalPages: Math.max(1, Math.ceil(window.total / normalizedPageSize)),
    mediaManifest,
    resourceManifest: buildBrowserPageResourceManifest(data, mediaManifest),
    windowOffset,
    windowLength: data.length,
  };
}

export function normalizeExpandedGroups(groups?: string[]): string[] {
  return Array.from(
    new Set(
      (groups ?? [])
        .map((entry) => `${entry ?? ''}`.trim())
        .filter(Boolean),
    ),
  ).sort();
}

export function buildPersistentBrowserPageKey(
  signature: string,
  params: BrowserPageCacheIdentity,
): string {
  return JSON.stringify({
    type: 'browser-page-pack',
    version: 4,
    signature,
    page: params.page,
    pageSize: params.pageSize,
    search: params.search?.trim() || '',
    modId: params.modId || 'all',
    expandedGroups: normalizeExpandedGroups(params.expandedGroups),
    slotSize: params.slotSize,
  });
}

function browserCatalogModeKey(includeHidden?: boolean): string {
  return includeHidden ? 'advanced' : 'default';
}

export function getBrowserDefaultCatalogCacheKey(modId?: string, includeHidden?: boolean): string {
  return `${browserCatalogModeKey(includeHidden)}::${`${modId ?? 'all'}`.trim().toLowerCase() || 'all'}`;
}

export function getBrowserGroupItemsCacheKey(groupKey: string, modId?: string, includeHidden?: boolean): string {
  return `${browserCatalogModeKey(includeHidden)}::${`${groupKey ?? ''}`.trim().toLowerCase()}::${`${modId ?? 'all'}`.trim().toLowerCase() || 'all'}`;
}

export function getBrowserSearchCatalogCacheKey(search: string, modId?: string, includeHidden?: boolean): string {
  return `${browserCatalogModeKey(includeHidden)}::${`${search ?? ''}`.trim().toLowerCase()}::${`${modId ?? 'all'}`.trim().toLowerCase() || 'all'}`;
}

function normalizeSearchNeedle(value: string): string {
  return `${value ?? ''}`.trim().toLowerCase().replace(/\s+/g, '');
}

export function browserEntryMatchesLocalSearch(entry: BrowserGridEntry, query: string): boolean {
  const needle = normalizeSearchNeedle(query);
  if (!needle) {
    return true;
  }
  const item = entry.kind === 'item' ? entry.item : entry.group.representative;
  const haystack = [
    item.localizedName,
    item.internalName,
    item.itemId,
    item.modId,
    item.searchTerms,
    item.unlocalizedName,
    entry.kind !== 'item' ? entry.group.label : '',
  ]
    .map((value) => normalizeSearchNeedle(`${value ?? ''}`))
    .filter(Boolean)
    .join('|');
  return haystack.includes(needle);
}

export function buildBrowserByIdsPackCacheKey(params: { itemIds: string[]; slotSize?: number }): string {
  return JSON.stringify({
    itemIds: params.itemIds.map((itemId) => `${itemId ?? ''}`.trim()).filter(Boolean),
    slotSize: Number.isFinite(Number(params.slotSize)) ? Number(params.slotSize) : null,
  });
}

export function collectDisplayItemsFromBrowserEntries(entries: BrowserGridEntry[]): Item[] {
  const ordered: Item[] = [];
  const seen = new Set<string>();

  for (const entry of entries) {
    const item = entry.kind === 'item' ? entry.item : entry.group.representative;
    const itemId = `${item?.itemId ?? ''}`.trim();
    if (!item || !itemId || seen.has(itemId)) {
      continue;
    }
    seen.add(itemId);
    ordered.push(item);
  }

  return ordered;
}

export function resolvePublishedWindowPath(
  entries: PublishBundleWindowPathEntry[] | undefined,
  slotSize: number | undefined,
  requestedPage: number,
  requestedPageSize: number,
  isWarm: (assetPath: string | null | undefined) => boolean,
): string | null {
  if (!Array.isArray(entries) || entries.length === 0) {
    return null;
  }

  const normalizedSlotSize = Math.max(1, Math.floor(Number(slotSize) || 0));
  const startIndex = (Math.max(1, Math.floor(requestedPage)) - 1) * Math.max(1, Math.floor(requestedPageSize));
  const endIndex = startIndex + Math.max(1, Math.floor(requestedPageSize));
  const candidates = entries.filter((entry) =>
    entry.scope === 'all'
    && startIndex >= Math.max(0, Math.floor(entry.offset ?? 0))
    && endIndex <= Math.max(0, Math.floor(entry.offset ?? 0)) + Math.max(0, Math.floor(entry.length ?? 0)),
  );
  if (candidates.length <= 0) {
    return null;
  }

  const pickBestCoverage = (coverageEntries: PublishBundleWindowPathEntry[]): PublishBundleWindowPathEntry | null => {
    if (coverageEntries.length <= 0) {
      return null;
    }
    return coverageEntries
      .slice()
      .sort((left, right) => {
        const warmDelta = Number(isWarm(right.path)) - Number(isWarm(left.path));
        if (warmDelta !== 0) {
          return warmDelta;
        }

        const slotDelta = Math.abs(left.slotSize - normalizedSlotSize) - Math.abs(right.slotSize - normalizedSlotSize);
        if (slotDelta !== 0) {
          return slotDelta;
        }

        const leftTrailingSlack = Math.max(
          0,
          Math.floor(left.offset ?? 0) + Math.floor(left.length ?? 0) - endIndex,
        );
        const rightTrailingSlack = Math.max(
          0,
          Math.floor(right.offset ?? 0) + Math.floor(right.length ?? 0) - endIndex,
        );
        const trailingSlackDelta = rightTrailingSlack - leftTrailingSlack;
        if (trailingSlackDelta !== 0) {
          return trailingSlackDelta;
        }

        const leftLeadingSlack = Math.max(0, startIndex - Math.floor(left.offset ?? 0));
        const rightLeadingSlack = Math.max(0, startIndex - Math.floor(right.offset ?? 0));
        const leadingSlackDelta = leftLeadingSlack - rightLeadingSlack;
        if (leadingSlackDelta !== 0) {
          return leadingSlackDelta;
        }

        return Math.floor(right.offset ?? 0) - Math.floor(left.offset ?? 0);
      })[0] ?? null;
  };

  const exactSlotCoverage = candidates.filter((entry) => entry.slotSize === normalizedSlotSize);
  return pickBestCoverage(exactSlotCoverage)?.path
    ?? pickBestCoverage(candidates)?.path
    ?? null;
}
