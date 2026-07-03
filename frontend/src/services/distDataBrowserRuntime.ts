import type {
  BrowserByIdsPackResponse,
  BrowserDefaultCatalogResponse,
  BrowserGridEntry,
  BrowserGroupItemsResponse,
  BrowserPagePackResponse,
  BrowserSearchPackEntry,
  BrowserVariantGroup,
  Item,
  Mod,
} from "../runtime/types";

export type DistDataBrowserItem = {
  itemId: string;
  localizedName?: string | null;
  internalName?: string | null;
  modId?: string | null;
  renderAssetRef?: string | null;
  browserOrder?: number | null;
  groupKey?: string | null;
  groupLabel?: string | null;
  groupSize?: number | null;
  representativeItemId?: string | null;
  publicItemId?: string | null;
  variantId?: string | null;
  payloadHash?: string | null;
  semanticFamily?: string | null;
  semanticClassification?: string | null;
  facetSummary?: string | null;
};

export type DistDataRawGroup = {
  groupKey?: string | null;
  groupLabel?: string | null;
  groupSize?: number | null;
  representativeItemId?: string | null;
  memberItemIds?: string[];
  semanticFamily?: string | null;
  semanticClassification?: string | null;
  groupSource?: string | null;
};

type BrowserCatalogMode = "default" | "advanced";

export type BrowserPagePackRequest = {
  page?: number;
  pageSize?: number;
  search?: string;
  modId?: string;
  expandedGroups?: string[];
  includeHidden?: boolean;
};

export type DistDataBrowserRuntime = {
  catalog: DistDataBrowserItem[];
  advancedCatalog: DistDataBrowserItem[];
  hiddenItemIds: Set<string>;
  groups: DistDataRawGroup[];
  catalogByModId: Map<string, DistDataBrowserItem[]>;
  advancedCatalogByModId: Map<string, DistDataBrowserItem[]>;
  itemById: Map<string, Item>;
  catalogEntryByItemId: Map<string, DistDataBrowserItem>;
  searchEntryByItemId: Map<string, BrowserSearchPackEntry>;
  memberItemsByGroupKey: Map<string, Item[]>;
  groupByKey: Map<string, DistDataRawGroup>;
  defaultCatalogByScope: Map<string, BrowserGridEntry[]>;
  searchCatalogByScope: Map<string, BrowserGridEntry[]>;
  pagePackByScope: Map<string, BrowserPagePackResponse>;
  byIdsPackByScope: Map<string, BrowserByIdsPackResponse>;
  groupItemsByScope: Map<string, BrowserGroupItemsResponse | null>;
  sortedSearchEntries: BrowserSearchPackEntry[];
  mods: Mod[];
};

export function stableNumber(value: unknown, defaultValue = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

function normalizeNeedle(value: string): string {
  return `${value ?? ""}`.trim().toLowerCase().replace(/\s+/g, "");
}

export function matchesSearch(entry: BrowserSearchPackEntry | undefined, query: string): boolean {
  const needle = normalizeNeedle(query);
  if (!needle) {
    return true;
  }
  if (!entry) {
    return false;
  }
  const looseNeedle = `${query ?? ""}`.trim().toLowerCase();
  return [
    entry.normalizedLocalizedName,
    entry.normalizedInternalName,
    entry.normalizedItemId,
    entry.normalizedSearchTerms,
    entry.pinyinFull,
    entry.pinyinAcronym,
    entry.aliases,
    entry.localizedName,
    entry.modId,
  ].some((value) => {
    const normalized = normalizeNeedle(`${value ?? ""}`);
    return normalized.includes(needle) || `${value ?? ""}`.toLowerCase().includes(looseNeedle);
  });
}

export function directlyMatchesVariant(entry: BrowserSearchPackEntry | undefined, query: string): boolean {
  if (!entry) {
    return false;
  }
  const needle = normalizeNeedle(query);
  if (!needle) {
    return false;
  }
  const directFields = [
    entry.localizedName,
    entry.normalizedLocalizedName,
    entry.normalizedInternalName,
    entry.normalizedItemId,
    entry.variantId,
    entry.facetSummary,
  ];
  return directFields.some((value) => normalizeNeedle(`${value ?? ""}`).includes(needle));
}

export function toItem(entry: DistDataBrowserItem, searchEntry?: BrowserSearchPackEntry): Item {
  return {
    itemId: entry.itemId,
    modId: `${entry.modId ?? searchEntry?.modId ?? "unknown"}`,
    internalName: `${entry.internalName ?? entry.itemId}`,
    localizedName: `${entry.localizedName ?? searchEntry?.localizedName ?? entry.internalName ?? entry.itemId}`,
    renderAssetRef: entry.renderAssetRef ?? (searchEntry as unknown as { renderAssetRef?: string | null } | undefined)?.renderAssetRef ?? null,
    browserGroupKey: entry.groupKey ?? null,
    browserGroupLabel: entry.groupLabel ?? null,
    browserGroupSize: stableNumber(entry.groupSize, 1),
    publicItemId: entry.publicItemId ?? searchEntry?.publicItemId ?? null,
    variantId: entry.variantId ?? searchEntry?.variantId ?? null,
    payloadHash: entry.payloadHash ?? null,
    semanticFamily: entry.semanticFamily ?? searchEntry?.family ?? null,
    semanticClassification: entry.semanticClassification ?? searchEntry?.classification ?? null,
    facetSummary: entry.facetSummary ?? searchEntry?.facetSummary ?? null,
  };
}

export function buildGroup(group: DistDataRawGroup, representative: Item): BrowserVariantGroup {
  const size = Math.max(1, stableNumber(group.groupSize, group.memberItemIds?.length ?? 1));
  return {
    key: `${group.groupKey ?? representative.browserGroupKey ?? representative.itemId}`,
    representative,
    size,
    visibleCount: 1,
    expandable: size > 1,
    label: `${group.groupLabel ?? representative.browserGroupLabel ?? representative.localizedName}`,
    semanticFamily: group.semanticFamily ?? null,
    semanticClassification: group.semanticClassification ?? null,
    groupSource: group.groupSource ?? null,
  };
}

export function filterByModId(item: Item, modId?: string): boolean {
  const scope = `${modId ?? ""}`.trim();
  return !scope || scope === "all" || item.modId === scope;
}

export function getCatalogScopeKey(modId?: string, mode: BrowserCatalogMode = "default"): string {
  const scope = `${modId ?? "all"}`.trim() || "all";
  return `${mode}:${scope}`;
}

export function getSearchCatalogScopeKey(search: string, modId?: string, mode: BrowserCatalogMode = "default"): string {
  return `${getCatalogScopeKey(modId, mode)}::${normalizeNeedle(search)}`;
}


export function getExpandedGroupsScopeKey(expandedGroups?: string[]): string {
  return Array.from(new Set((expandedGroups ?? [])
    .map((groupKey) => `${groupKey ?? ""}`.trim())
    .filter(Boolean)))
    .sort()
    .join(",");
}

export function getBrowserPagePackScopeKey(params: BrowserPagePackRequest): string {
  const mode: BrowserCatalogMode = params.includeHidden ? "advanced" : "default";
  const normalizedPage = Math.max(1, Math.floor(Number(params.page) || 1));
  const rawPageSize = Math.floor(Number(params.pageSize));
  const pageSize = Number.isFinite(rawPageSize) && rawPageSize > 0 ? `${rawPageSize}` : "auto";
  return [
    getCatalogScopeKey(params.modId, mode),
    `q:${normalizeNeedle(`${params.search ?? ""}`)}`,
    `expanded:${getExpandedGroupsScopeKey(params.expandedGroups)}`,
    `page:${normalizedPage}`,
    `pageSize:${pageSize}`,
  ].join("::");
}



export function getBrowserGroupItemsScopeKey(groupKey: string, modId?: string, includeHidden = false): string {
  const normalizedGroupKey = `${groupKey ?? ""}`.trim();
  const mode: BrowserCatalogMode = includeHidden ? "advanced" : "default";
  return `${getCatalogScopeKey(modId, mode)}::group:${normalizedGroupKey}`;
}

export function normalizeBrowserByIdsItemIds(itemIds: string[]): string[] {
  const seen = new Set<string>();
  return itemIds
    .map((itemId) => `${itemId ?? ""}`.trim())
    .filter((itemId) => {
      if (!itemId || seen.has(itemId)) {
        return false;
      }
      seen.add(itemId);
      return true;
    });
}

export function getBrowserByIdsPackScopeKey(itemIds: string[]): string {
  return `ids:${normalizeBrowserByIdsItemIds(itemIds).join("\u001f")}`;
}

export function getRuntimeCatalog(runtime: DistDataBrowserRuntime, includeHidden?: boolean, modId?: string): DistDataBrowserItem[] {
  const scope = `${modId ?? ""}`.trim();
  if (!scope || scope === "all") {
    return includeHidden ? runtime.advancedCatalog : runtime.catalog;
  }
  return (includeHidden ? runtime.advancedCatalogByModId : runtime.catalogByModId).get(scope) ?? [];
}

export function buildCatalogByModId(
  catalog: DistDataBrowserItem[],
  itemById: Map<string, Item>,
): Map<string, DistDataBrowserItem[]> {
  const catalogByModId = new Map<string, DistDataBrowserItem[]>();
  for (const entry of catalog) {
    const modId = `${itemById.get(entry.itemId)?.modId ?? "unknown"}`.trim() || "unknown";
    const scopedCatalog = catalogByModId.get(modId);
    if (scopedCatalog) {
      scopedCatalog.push(entry);
    } else {
      catalogByModId.set(modId, [entry]);
    }
  }
  return catalogByModId;
}

export function buildDefaultCatalog(runtime: DistDataBrowserRuntime, modId?: string, includeHidden = false): BrowserGridEntry[] {
  const scopeKey = getCatalogScopeKey(modId, includeHidden ? "advanced" : "default");
  const cached = runtime.defaultCatalogByScope.get(scopeKey);
  if (cached) {
    return cached;
  }

  const emittedGroups = new Set<string>();
  const entries: BrowserGridEntry[] = [];
  for (const catalogEntry of getRuntimeCatalog(runtime, includeHidden, modId)) {
    const item = runtime.itemById.get(catalogEntry.itemId);
    if (!item) {
      continue;
    }

    const groupKey = `${catalogEntry.groupKey ?? ""}`.trim();
    const representativeItemId = `${catalogEntry.representativeItemId ?? ""}`.trim();
    if (groupKey && stableNumber(catalogEntry.groupSize, 1) > 1) {
      if (representativeItemId && representativeItemId !== item.itemId) {
        continue;
      }
      if (emittedGroups.has(groupKey)) {
        continue;
      }
      const rawGroup = runtime.groupByKey.get(groupKey) ?? {
        groupKey,
        groupLabel: catalogEntry.groupLabel,
        groupSize: catalogEntry.groupSize,
        representativeItemId: item.itemId,
        memberItemIds: [item.itemId],
      };
      emittedGroups.add(groupKey);
      entries.push({
        key: `collapsed:${groupKey}`,
        kind: "group-collapsed",
        group: buildGroup(rawGroup, item),
      });
      continue;
    }

    entries.push({ key: item.itemId, kind: "item", item });
  }
  runtime.defaultCatalogByScope.set(scopeKey, entries);
  return entries;
}

export function expandCatalogGroups(
  entries: BrowserGridEntry[],
  runtime: DistDataBrowserRuntime,
  expandedGroups?: string[],
): BrowserGridEntry[] {
  const expanded = new Set((expandedGroups ?? []).map((groupKey) => `${groupKey ?? ""}`.trim()).filter(Boolean));
  if (!expanded.size) {
    return entries;
  }
  const result: BrowserGridEntry[] = [];
  for (const entry of entries) {
    if (entry.kind !== "group-collapsed" || !expanded.has(entry.group.key)) {
      result.push(entry);
      continue;
    }
    result.push({ key: `expanded:${entry.group.key}`, kind: "group-header", group: entry.group });
    for (const member of runtime.memberItemsByGroupKey.get(entry.group.key) ?? [entry.group.representative]) {
      result.push({ key: member.itemId, kind: "item", item: member });
    }
  }
  return result;
}

export function buildSortedSearchEntries(searchPackItems: BrowserSearchPackEntry[]): BrowserSearchPackEntry[] {
  return [...searchPackItems].sort((a, b) => {
    const rankA = stableNumber((a as unknown as { searchRank?: number }).searchRank, Number.MAX_SAFE_INTEGER);
    const rankB = stableNumber((b as unknown as { searchRank?: number }).searchRank, Number.MAX_SAFE_INTEGER);
    if (rankA !== rankB) return rankA - rankB;
    return stableNumber((b as unknown as { popularityScore?: number }).popularityScore, 0)
      - stableNumber((a as unknown as { popularityScore?: number }).popularityScore, 0);
  });
}

export function buildSearchCatalog(
  runtime: DistDataBrowserRuntime,
  search: string,
  modId?: string,
  includeHidden = false,
): BrowserGridEntry[] {
  const normalizedSearch = `${search ?? ""}`.trim();
  const scopeKey = getSearchCatalogScopeKey(normalizedSearch, modId, includeHidden ? "advanced" : "default");
  const cached = runtime.searchCatalogByScope.get(scopeKey);
  if (cached) {
    return cached;
  }

  const emittedGroups = new Set<string>();
  const emittedItems = new Set<string>();
  const filtered: BrowserGridEntry[] = [];

  for (const searchEntry of runtime.sortedSearchEntries) {
    if (!includeHidden && runtime.hiddenItemIds.has(searchEntry.itemId)) {
      continue;
    }
    if (!matchesSearch(searchEntry, normalizedSearch)) {
      continue;
    }
    const item = runtime.itemById.get(searchEntry.itemId);
    if (!item || !filterByModId(item, modId)) {
      continue;
    }

    const groupKey = `${searchEntry.groupKey ?? item.browserGroupKey ?? ""}`.trim();
    const groupSize = Math.max(1, stableNumber(searchEntry.groupSize ?? item.browserGroupSize, 1));
    const representativeItemId = `${searchEntry.representativeItemId ?? ""}`.trim();
    const isRepresentative = !representativeItemId || representativeItemId === item.itemId;
    const shouldSurfaceVariant = Boolean(groupKey)
      && groupSize > 1
      && !isRepresentative
      && directlyMatchesVariant(searchEntry, normalizedSearch);

    if (groupKey && groupSize > 1 && !shouldSurfaceVariant) {
      if (emittedGroups.has(groupKey)) {
        continue;
      }
      const representative = runtime.itemById.get(representativeItemId) ?? item;
      const rawGroup = runtime.groupByKey.get(groupKey) ?? {
        groupKey,
        groupLabel: searchEntry.groupLabel ?? item.browserGroupLabel,
        groupSize,
        representativeItemId: representative.itemId,
        memberItemIds: [representative.itemId],
        semanticFamily: searchEntry.family ?? item.semanticFamily ?? null,
        semanticClassification: searchEntry.classification ?? item.semanticClassification ?? null,
        groupSource: searchEntry.groupSource ?? null,
      };
      emittedGroups.add(groupKey);
      filtered.push({
        key: `collapsed:${groupKey}`,
        kind: "group-collapsed",
        group: buildGroup(rawGroup, representative),
      });
      continue;
    }

    if (emittedItems.has(item.itemId)) {
      continue;
    }
    emittedItems.add(item.itemId);
    filtered.push({ key: item.itemId, kind: "item", item });
  }

  runtime.searchCatalogByScope.set(scopeKey, filtered);
  return filtered;
}
export function paginate<T>(data: T[]): BrowserDefaultCatalogResponse {
  return {
    data: data as BrowserDefaultCatalogResponse["data"],
    total: data.length,
    page: 1,
    pageSize: data.length,
    totalPages: 1,
  };
}

export function paginateBrowserEntries(
  data: BrowserGridEntry[],
  page?: number,
  pageSize?: number,
): Pick<BrowserPagePackResponse, "data" | "total" | "page" | "pageSize" | "totalPages"> {
  const normalizedPageSize = Math.max(1, Math.floor(Number(pageSize) || data.length || 1));
  const totalPages = Math.max(1, Math.ceil(data.length / normalizedPageSize));
  const normalizedPage = Math.min(totalPages, Math.max(1, Math.floor(Number(page) || 1)));
  const start = (normalizedPage - 1) * normalizedPageSize;
  return {
    data: data.slice(start, start + normalizedPageSize),
    total: data.length,
    page: normalizedPage,
    pageSize: normalizedPageSize,
    totalPages,
  };
}

export function collectItemsFromEntries(entries: BrowserGridEntry[]): Item[] {
  const items: Item[] = [];
  const seen = new Set<string>();
  for (const entry of entries) {
    if (entry.kind !== "item") {
      if (!seen.has(entry.group.representative.itemId)) {
        seen.add(entry.group.representative.itemId);
        items.push(entry.group.representative);
      }
      continue;
    }
    if (!seen.has(entry.item.itemId)) {
      seen.add(entry.item.itemId);
      items.push(entry.item);
    }
  }
  return items;
}

export function buildResourceManifest(entries: BrowserGridEntry[]) {
  const items = collectItemsFromEntries(entries);
  const renderAssetRefs = items
    .map((item) => `${item.renderAssetRef ?? ""}`.trim())
    .filter(Boolean);
  return {
    itemIds: items.map((item) => item.itemId),
    renderAssetRefs: Array.from(new Set(renderAssetRefs)),
    atlasUrls: [],
    animatedAtlasFiles: [],
    atlasEntryCount: 0,
    animatedAtlasCount: 0,
  };
}




export function buildBrowserGroupItems(
  runtime: DistDataBrowserRuntime,
  groupKey: string,
  modId?: string,
  includeHidden = false,
): BrowserGroupItemsResponse | null {
  const normalizedGroupKey = `${groupKey ?? ""}`.trim();
  if (!normalizedGroupKey) {
    return null;
  }
  const scopeKey = getBrowserGroupItemsScopeKey(normalizedGroupKey, modId, includeHidden);
  if (runtime.groupItemsByScope.has(scopeKey)) {
    return runtime.groupItemsByScope.get(scopeKey) ?? null;
  }

  const items = (runtime.memberItemsByGroupKey.get(normalizedGroupKey) ?? [])
    .filter((item) => filterByModId(item, modId) && (includeHidden || !runtime.hiddenItemIds.has(item.itemId)));
  const response = items.length > 0
    ? {
        groupKey: normalizedGroupKey,
        total: items.length,
        items,
      } satisfies BrowserGroupItemsResponse
    : null;
  runtime.groupItemsByScope.set(scopeKey, response);
  return response;
}

export function buildBrowserByIdsPack(
  runtime: DistDataBrowserRuntime,
  itemIds: string[],
): BrowserByIdsPackResponse {
  const scopeKey = getBrowserByIdsPackScopeKey(itemIds);
  const cached = runtime.byIdsPackByScope.get(scopeKey);
  if (cached) {
    return cached;
  }

  const data = normalizeBrowserByIdsItemIds(itemIds)
    .map((itemId) => runtime.itemById.get(itemId))
    .filter((item): item is Item => Boolean(item))
    .map((item) => ({ key: item.itemId, kind: "item" as const, item }));
  const byIdsPack: BrowserByIdsPackResponse = {
    data,
    mediaManifest: null,
    resourceManifest: buildResourceManifest(data),
  };
  runtime.byIdsPackByScope.set(scopeKey, byIdsPack);
  return byIdsPack;
}

export function buildBrowserPagePack(
  runtime: DistDataBrowserRuntime,
  params: BrowserPagePackRequest,
): BrowserPagePackResponse {
  const scopeKey = getBrowserPagePackScopeKey(params);
  const cached = runtime.pagePackByScope.get(scopeKey);
  if (cached) {
    return cached;
  }

  const normalizedSearch = `${params.search ?? ""}`.trim();
  const baseEntries = normalizedSearch
    ? buildSearchCatalog(runtime, normalizedSearch, params.modId, params.includeHidden)
    : buildDefaultCatalog(runtime, params.modId, params.includeHidden);
  const expandedEntries = expandCatalogGroups(baseEntries, runtime, params.expandedGroups);
  const page = paginateBrowserEntries(expandedEntries, params.page, params.pageSize);
  const pagePack: BrowserPagePackResponse = {
    ...page,
    mediaManifest: null,
    resourceManifest: buildResourceManifest(page.data),
  };
  runtime.pagePackByScope.set(scopeKey, pagePack);
  return pagePack;
}

export function buildModsFromRuntime(runtime: DistDataBrowserRuntime): Mod[] {
  if (runtime.mods.length) {
    return runtime.mods;
  }
  const mods = new Map<string, Mod>();
  for (const entry of buildDefaultCatalog(runtime)) {
    const item = entry.kind === "item" ? entry.item : entry.group.representative;
    const modId = `${item.modId ?? "unknown"}`.trim() || "unknown";
    const existing = mods.get(modId);
    if (existing) {
      existing.itemCount += 1;
      continue;
    }
    mods.set(modId, {
      modId,
      modName: modId,
      itemCount: 1,
    });
  }
  const sortedMods = Array.from(mods.values()).sort((left, right) => right.itemCount - left.itemCount || left.modName.localeCompare(right.modName));
  runtime.mods = sortedMods;
  return sortedMods;
}
