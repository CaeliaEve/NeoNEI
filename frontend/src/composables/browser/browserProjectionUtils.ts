import type { BrowserGridEntry, BrowserPagePackResponse, Item } from '../../services/api';
import { resolveCanonicalRelativePath } from '../../services/api/images';
import { getAnimatedAtlasImageUrl } from '../../services/animationBudget';
import type { BrowserFacetFilters, BrowserPageRequestParams, CachedBrowserPage } from './browserPageCache';

const itemFacetHaystackCache = new WeakMap<Item, string>();

export function collectDisplayItems(entries: BrowserGridEntry[]): Item[] {
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

export function collectAnimatedAtlasUrls(page: CachedBrowserPage): string[] {
  return Array.from(
    new Set(
      [
        ...Object.values(page.mediaManifest?.animatedAtlases ?? {})
          .map((entry: NonNullable<BrowserPagePackResponse['mediaManifest']>['animatedAtlases'][string]) => getAnimatedAtlasImageUrl(entry)),
        ...(page.resourceManifest?.animatedAtlasFiles ?? [])
          .map((atlasFile) => resolveCanonicalRelativePath(atlasFile)),
      ]
        .filter((url): url is string => Boolean(url)),
    ),
  );
}

export function collectBrowserPageResourceItemIds(page: CachedBrowserPage): string[] {
  const manifestItemIds = page.resourceManifest?.itemIds ?? [];
  if (manifestItemIds.length > 0) {
    return manifestItemIds.map((itemId) => `${itemId ?? ''}`.trim()).filter(Boolean);
  }
  return collectDisplayItems(page.data).map((item) => item.itemId).filter(Boolean);
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

export function normalizeFacetFilters(filters?: BrowserFacetFilters): BrowserFacetFilters {
  const normalized: BrowserFacetFilters = {};
  for (const [groupKey, query] of Object.entries(filters ?? {})) {
    const key = `${groupKey ?? ''}`.trim();
    const value = `${query ?? ''}`.trim();
    if (key && value) {
      normalized[key] = value;
    }
  }
  return Object.fromEntries(Object.entries(normalized).sort(([left], [right]) => left.localeCompare(right)));
}

function normalizeFacetNeedle(value: unknown): string {
  return `${value ?? ''}`
    .toLocaleLowerCase()
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .trim();
}

function collectFacetHaystack(item: Item): string {
  const cached = itemFacetHaystackCache.get(item);
  if (cached !== undefined) {
    return cached;
  }
  const values: string[] = [
    item.localizedName,
    item.internalName,
    item.modId,
    item.unlocalizedName,
    item.facetSummary,
    item.semanticFamily,
    item.semanticClassification,
    item.browserGroupLabel,
    item.searchTerms,
  ]
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0);

  const facets = item.facets;
  if (facets && typeof facets === 'object') {
    for (const [key, value] of Object.entries(facets)) {
      values.push(key);
      if (Array.isArray(value)) {
        values.push(...value.map((entry) => `${entry ?? ''}`));
      } else if (value && typeof value === 'object') {
        values.push(JSON.stringify(value));
      } else {
        values.push(`${value ?? ''}`);
      }
    }
  }

  const haystack = normalizeFacetNeedle(values.join(' '));
  itemFacetHaystackCache.set(item, haystack);
  return haystack;
}

function itemMatchesFacetFilter(item: Item, query: string): boolean {
  const needles = normalizeFacetNeedle(query)
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (needles.length === 0) {
    return true;
  }
  const haystack = collectFacetHaystack(item);
  return needles.every((needle) => haystack.includes(needle));
}

export function applyGroupFacetFilters(
  groupItemsByKey: Map<string, Item[]>,
  filters?: BrowserFacetFilters,
): Map<string, Item[]> {
  const normalizedFilters = normalizeFacetFilters(filters);
  if (Object.keys(normalizedFilters).length === 0) {
    return groupItemsByKey;
  }

  const filtered = new Map<string, Item[]>();
  for (const [groupKey, groupItems] of groupItemsByKey.entries()) {
    const query = normalizedFilters[groupKey];
    if (!query) {
      filtered.set(groupKey, groupItems);
      continue;
    }

    const representative = groupItems[0];
    const matches = groupItems.filter((item) => itemMatchesFacetFilter(item, query));
    if (representative && !matches.some((item) => item.itemId === representative.itemId)) {
      filtered.set(groupKey, [representative, ...matches]);
    } else {
      filtered.set(groupKey, matches);
    }
  }

  return filtered;
}

export function collectBrowserGroupKeys(entries: BrowserGridEntry[]): string[] {
  return Array.from(
    new Set(
      entries
        .filter((entry): entry is Extract<BrowserGridEntry, { kind: 'group-collapsed' | 'group-header' }> => entry.kind !== 'item')
        .map((entry) => `${entry.group.key ?? ''}`.trim())
        .filter(Boolean),
    ),
  );
}

export function buildPersistentBrowserPageKey(
  signature: string,
  params: BrowserPageRequestParams,
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
    expandedGroupFacetFilters: normalizeFacetFilters(params.expandedGroupFacetFilters),
    slotSize: params.slotSize,
  });
}

export function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
