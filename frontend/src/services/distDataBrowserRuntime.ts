import type {
  BrowserDefaultCatalogResponse,
  BrowserGridEntry,
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

export type DistDataBrowserRuntime = {
  catalog: DistDataBrowserItem[];
  advancedCatalog: DistDataBrowserItem[];
  hiddenItemIds: Set<string>;
  groups: DistDataRawGroup[];
  itemById: Map<string, Item>;
  catalogEntryByItemId: Map<string, DistDataBrowserItem>;
  searchEntryByItemId: Map<string, BrowserSearchPackEntry>;
  memberItemsByGroupKey: Map<string, Item[]>;
  groupByKey: Map<string, DistDataRawGroup>;
  defaultCatalogByScope: Map<string, BrowserGridEntry[]>;
  searchCatalogByScope: Map<string, BrowserGridEntry[]>;
};

export function stableNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
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

export function getRuntimeCatalog(runtime: DistDataBrowserRuntime, includeHidden?: boolean): DistDataBrowserItem[] {
  return includeHidden ? runtime.advancedCatalog : runtime.catalog;
}

export function buildDefaultCatalog(runtime: DistDataBrowserRuntime, modId?: string, includeHidden = false): BrowserGridEntry[] {
  const scopeKey = getCatalogScopeKey(modId, includeHidden ? "advanced" : "default");
  const cached = runtime.defaultCatalogByScope.get(scopeKey);
  if (cached) {
    return cached;
  }

  const emittedGroups = new Set<string>();
  const entries: BrowserGridEntry[] = [];
  for (const catalogEntry of getRuntimeCatalog(runtime, includeHidden)) {
    const item = runtime.itemById.get(catalogEntry.itemId);
    if (!item || !filterByModId(item, modId)) {
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

export function buildModsFromRuntime(runtime: DistDataBrowserRuntime): Mod[] {
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
  return Array.from(mods.values()).sort((left, right) => right.itemCount - left.itemCount || left.modName.localeCompare(right.modName));
}

