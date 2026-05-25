import type {
  BrowserDefaultCatalogResponse,
  BrowserAtlasIndexResponse,
  BrowserByIdsPackResponse,
  BrowserGridEntry,
  BrowserGroupItemsResponse,
  BrowserPagePackResponse,
  BrowserSearchCatalogResponse,
  BrowserSearchPackEntry,
  BrowserSearchPackResponse,
  HomeBootstrapResponse,
  BrowserVariantGroup,
  Item,
  Mod,
  PublicRuntimeManifest,
  RecipeBootstrapPayload,
  RecipeUiPayload,
} from "./api";

type DistDataManifest = {
  schemaVersion?: string;
  generatedAt?: string | null;
  source?: string | null;
  sourceRepository?: string | null;
  runtimeCacheKey?: string | null;
  sourceSignature?: string | null;
  files?: {
    searchAll?: string;
    browserCatalog?: string;
    browserGroups?: string;
    recipeCategories?: string;
    recipeItemIndex?: string;
    recipeUiPayloadIndex?: string;
    textureManifest?: string;
    animationTable?: string;
    browserAtlasIndex?: string;
    validationReport?: string;
  };
};

type DistDataSearchPayload = {
  schemaVersion?: string;
  version?: number;
  signature?: string;
  total?: number;
  items?: BrowserSearchPackEntry[];
};

type DistDataBrowserItem = {
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
};

type DistDataBrowserCatalogPayload = {
  schemaVersion?: string;
  items?: DistDataBrowserItem[];
};

type DistDataRawGroup = {
  groupKey?: string | null;
  groupLabel?: string | null;
  groupSize?: number | null;
  representativeItemId?: string | null;
  memberItemIds?: string[];
};

type DistDataGroupPayload = {
  schemaVersion?: string;
  groups?: DistDataRawGroup[];
};

type DistDataRecipeItemIndexEntry = {
  itemId: string;
  producedBy?: Array<{ recipeId?: string; categoryId?: string; displayName?: string }>;
  usedIn?: Array<{ recipeId?: string; categoryId?: string; displayName?: string }>;
};

type DistDataRecipeItemIndexPayload = {
  schemaVersion?: string;
  items?: DistDataRecipeItemIndexEntry[];
};

type DistDataRecipeUiPayloadIndexEntry = {
  recipeId: string;
  path: string;
  familyKey?: string;
  recipeType?: string;
  machineType?: string;
};

type DistDataRecipeUiPayloadIndexPayload = {
  schemaVersion?: string;
  recipes?: DistDataRecipeUiPayloadIndexEntry[];
};

type DistDataBrowserRuntime = {
  catalog: DistDataBrowserItem[];
  groups: DistDataRawGroup[];
  itemById: Map<string, Item>;
  catalogEntryByItemId: Map<string, DistDataBrowserItem>;
  searchEntryByItemId: Map<string, BrowserSearchPackEntry>;
  memberItemsByGroupKey: Map<string, Item[]>;
  groupByKey: Map<string, DistDataRawGroup>;
  defaultCatalogByScope: Map<string, BrowserGridEntry[]>;
  searchCatalogByScope: Map<string, BrowserGridEntry[]>;
};

export type DistDataSearchPack = {
  manifest: DistDataManifest;
  runtimeCacheKey: string;
  pack: BrowserSearchPackResponse;
};

let manifestRequest: Promise<DistDataManifest | null> | null = null;
let searchPackRequest: Promise<DistDataSearchPack | null> | null = null;
let browserRuntimeRequest: Promise<DistDataBrowserRuntime | null> | null = null;
let cachedSearchPack: DistDataSearchPack | null = null;
let cachedBrowserRuntime: DistDataBrowserRuntime | null = null;
let recipeItemIndexRequest: Promise<Map<string, DistDataRecipeItemIndexEntry> | null> | null = null;
let cachedRecipeItemIndex: Map<string, DistDataRecipeItemIndexEntry> | null = null;
let recipeUiPayloadIndexRequest: Promise<Map<string, DistDataRecipeUiPayloadIndexEntry> | null> | null = null;
let cachedRecipeUiPayloadIndex: Map<string, DistDataRecipeUiPayloadIndexEntry> | null = null;
const cachedRecipeUiPayloads = new Map<string, RecipeUiPayload>();
let browserAtlasIndexRequest: Promise<BrowserAtlasIndexResponse | null> | null = null;
let cachedBrowserAtlasIndex: BrowserAtlasIndexResponse | null = null;

function trimSlashes(value: string): string {
  return value.replace(/^\/+|\/+$/g, "");
}

function normalizeBasePath(value: unknown): string {
  const raw = `${value ?? ""}`.trim();
  if (!raw) {
    return "/dist-data";
  }
  return raw.replace(/\/+$/g, "");
}

function getConfiguredBasePath(): string {
  const envBasePath = normalizeBasePath(import.meta.env.VITE_DIST_DATA_BASE_URL);
  if (typeof window === "undefined") {
    return envBasePath;
  }

  try {
    const override = window.localStorage.getItem("neonei:dist-data-base-url");
    if (override?.trim()) {
      return normalizeBasePath(override);
    }
  } catch {
    // Storage can be unavailable in privacy modes; keep the env/default base path.
  }

  return envBasePath;
}

function joinAssetPath(basePath: string, assetPath: string): string {
  const normalizedAssetPath = `${assetPath ?? ""}`.trim();
  if (!normalizedAssetPath) {
    throw new Error("Missing dist-data asset path");
  }
  if (/^https?:\/\//i.test(normalizedAssetPath)) {
    return normalizedAssetPath;
  }
  if (/^https?:\/\//i.test(basePath)) {
    return `${basePath}/${trimSlashes(normalizedAssetPath)}`;
  }
  return `${basePath.startsWith("/") ? basePath : `/${basePath}`}/${trimSlashes(normalizedAssetPath)}`;
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    cache: "force-cache",
    credentials: "same-origin",
  });
  if (!response.ok) {
    throw new Error(`dist-data request failed (${response.status}) for ${url}`);
  }
  return response.json() as Promise<T>;
}

function buildRuntimeCacheKey(manifest: DistDataManifest): string {
  const explicit = `${manifest.runtimeCacheKey ?? manifest.sourceSignature ?? ""}`.trim();
  if (explicit) {
    return `dist-data-v3:${explicit}`;
  }

  const schema = `${manifest.schemaVersion ?? "unknown"}`.trim();
  const generatedAt = `${manifest.generatedAt ?? "unknown"}`.trim();
  const source = `${manifest.source ?? "unknown"}`.trim();
  return `dist-data-v3:${schema}:${source}:${generatedAt}`;
}

function coerceSearchPack(manifest: DistDataManifest, payload: DistDataSearchPayload): BrowserSearchPackResponse {
  const items = Array.isArray(payload.items) ? payload.items.filter((entry) => entry?.itemId) : [];
  return {
    version: Number.isFinite(Number(payload.version)) ? Number(payload.version) : 3,
    signature: payload.signature ?? buildRuntimeCacheKey(manifest),
    total: Number.isFinite(Number(payload.total)) ? Number(payload.total) : items.length,
    items,
  };
}

function stableNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeNeedle(value: string): string {
  return `${value ?? ""}`.trim().toLowerCase().replace(/\s+/g, "");
}

function matchesSearch(entry: BrowserSearchPackEntry | undefined, query: string): boolean {
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

function toItem(entry: DistDataBrowserItem, searchEntry?: BrowserSearchPackEntry): Item {
  return {
    itemId: entry.itemId,
    modId: `${entry.modId ?? searchEntry?.modId ?? "unknown"}`,
    internalName: `${entry.internalName ?? entry.itemId}`,
    localizedName: `${entry.localizedName ?? searchEntry?.localizedName ?? entry.internalName ?? entry.itemId}`,
    renderAssetRef: entry.renderAssetRef ?? (searchEntry as unknown as { renderAssetRef?: string | null } | undefined)?.renderAssetRef ?? null,
    browserGroupKey: entry.groupKey ?? null,
    browserGroupLabel: entry.groupLabel ?? null,
    browserGroupSize: stableNumber(entry.groupSize, 1),
  };
}

function buildGroup(group: DistDataRawGroup, representative: Item): BrowserVariantGroup {
  const size = Math.max(1, stableNumber(group.groupSize, group.memberItemIds?.length ?? 1));
  return {
    key: `${group.groupKey ?? representative.browserGroupKey ?? representative.itemId}`,
    representative,
    size,
    visibleCount: 1,
    expandable: size > 1,
    label: `${group.groupLabel ?? representative.browserGroupLabel ?? representative.localizedName}`,
  };
}

function filterByModId(item: Item, modId?: string): boolean {
  const scope = `${modId ?? ""}`.trim();
  return !scope || scope === "all" || item.modId === scope;
}

function getCatalogScopeKey(modId?: string): string {
  const scope = `${modId ?? "all"}`.trim();
  return scope || "all";
}

function getSearchCatalogScopeKey(search: string, modId?: string): string {
  return `${getCatalogScopeKey(modId)}::${normalizeNeedle(search)}`;
}

function buildDefaultCatalog(runtime: DistDataBrowserRuntime, modId?: string): BrowserGridEntry[] {
  const scopeKey = getCatalogScopeKey(modId);
  const cached = runtime.defaultCatalogByScope.get(scopeKey);
  if (cached) {
    return cached;
  }

  const emittedGroups = new Set<string>();
  const entries: BrowserGridEntry[] = [];
  for (const catalogEntry of runtime.catalog) {
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

function expandCatalogGroups(
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
    for (const member of runtime.memberItemsByGroupKey.get(entry.group.key) ?? [entry.group.representative]) {
      result.push({ key: member.itemId, kind: "item", item: member });
    }
  }
  return result;
}

function paginate<T>(data: T[]): BrowserDefaultCatalogResponse {
  return {
    data: data as BrowserDefaultCatalogResponse["data"],
    total: data.length,
    page: 1,
    pageSize: data.length,
    totalPages: 1,
  };
}

function paginateBrowserEntries(
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

function collectItemsFromEntries(entries: BrowserGridEntry[]): Item[] {
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

function buildResourceManifest(entries: BrowserGridEntry[]) {
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

function buildModsFromRuntime(runtime: DistDataBrowserRuntime): Mod[] {
  const mods = new Map<string, Mod>();
  for (const item of runtime.itemById.values()) {
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

function buildPublicManifestFromDistData(manifest: DistDataManifest): PublicRuntimeManifest {
  const runtimeCacheKey = buildRuntimeCacheKey(manifest);
  return {
    version: 3,
    sourceSignature: `${manifest.sourceSignature ?? manifest.runtimeCacheKey ?? runtimeCacheKey}`,
    compiledAt: manifest.generatedAt ?? null,
    publishRevision: manifest.source ?? null,
    publishCompiledAt: manifest.generatedAt ?? null,
    browserLayoutKey: runtimeCacheKey,
    runtimeCacheKey,
    publishBundle: null,
  };
}

async function getBrowserRuntime(): Promise<DistDataBrowserRuntime | null> {
  if (cachedBrowserRuntime) {
    return cachedBrowserRuntime;
  }
  if (browserRuntimeRequest) {
    return browserRuntimeRequest;
  }

  browserRuntimeRequest = (async () => {
    const manifest = await getDistDataManifest();
    const catalogPath = `${manifest?.files?.browserCatalog ?? ""}`.trim();
    const groupPath = `${manifest?.files?.browserGroups ?? ""}`.trim();
    if (!manifest || !catalogPath || !groupPath) {
      return null;
    }

    const [catalogPayload, groupPayload, searchPack] = await Promise.all([
      fetchJson<DistDataBrowserCatalogPayload>(joinAssetPath(getConfiguredBasePath(), catalogPath)),
      fetchJson<DistDataGroupPayload>(joinAssetPath(getConfiguredBasePath(), groupPath)),
      getDistDataSearchPack(),
    ]);
    const catalog = Array.isArray(catalogPayload.items) ? catalogPayload.items.filter((entry) => entry?.itemId) : [];
    const groups = Array.isArray(groupPayload.groups) ? groupPayload.groups.filter((entry) => entry?.groupKey) : [];
    if (!catalog.length) {
      return null;
    }

    const searchEntryByItemId = new Map<string, BrowserSearchPackEntry>();
    for (const searchEntry of searchPack?.pack.items ?? []) {
      searchEntryByItemId.set(searchEntry.itemId, searchEntry);
    }
    const catalogEntryByItemId = new Map<string, DistDataBrowserItem>();
    const itemById = new Map<string, Item>();
    for (const entry of catalog) {
      catalogEntryByItemId.set(entry.itemId, entry);
      itemById.set(entry.itemId, toItem(entry, searchEntryByItemId.get(entry.itemId)));
    }

    const memberItemsByGroupKey = new Map<string, Item[]>();
    const groupByKey = new Map<string, DistDataRawGroup>();
    for (const group of groups) {
      const rawKey = `${group.groupKey ?? ""}`.trim();
      if (rawKey) {
        groupByKey.set(rawKey, group);
      }
      const groupKey = `${group.groupKey ?? ""}`.trim();
      const memberItems = (group.memberItemIds ?? [])
        .map((itemId) => itemById.get(itemId))
        .filter((item): item is Item => Boolean(item));
      if (groupKey && memberItems.length) {
        memberItemsByGroupKey.set(groupKey, memberItems);
      }
    }

    cachedBrowserRuntime = {
      catalog,
      groups,
      itemById,
      catalogEntryByItemId,
      searchEntryByItemId,
      memberItemsByGroupKey,
      groupByKey,
      defaultCatalogByScope: new Map(),
      searchCatalogByScope: new Map(),
    };
    return cachedBrowserRuntime;
  })()
    .catch(() => null)
    .finally(() => {
      browserRuntimeRequest = null;
    });

  return browserRuntimeRequest;
}

export async function getDistDataManifest(): Promise<DistDataManifest | null> {
  if (manifestRequest) {
    return manifestRequest;
  }

  manifestRequest = fetchJson<DistDataManifest>(joinAssetPath(getConfiguredBasePath(), "manifest.json"))
    .catch(() => null)
    .finally(() => {
      manifestRequest = null;
    });
  return manifestRequest;
}

export async function getDistDataSearchPack(): Promise<DistDataSearchPack | null> {
  if (cachedSearchPack) {
    return cachedSearchPack;
  }
  if (searchPackRequest) {
    return searchPackRequest;
  }

  searchPackRequest = (async () => {
    const manifest = await getDistDataManifest();
    const searchPath = `${manifest?.files?.searchAll ?? ""}`.trim();
    if (!manifest || !searchPath) {
      return null;
    }

    const payload = await fetchJson<DistDataSearchPayload>(joinAssetPath(getConfiguredBasePath(), searchPath));
    const pack = coerceSearchPack(manifest, payload);
    if (!pack.items.length) {
      return null;
    }

    cachedSearchPack = {
      manifest,
      runtimeCacheKey: buildRuntimeCacheKey(manifest),
      pack,
    };
    return cachedSearchPack;
  })()
    .catch(() => null)
    .finally(() => {
      searchPackRequest = null;
    });

  return searchPackRequest;
}

export async function getDistDataDefaultCatalog(modId?: string): Promise<BrowserDefaultCatalogResponse | null> {
  const runtime = await getBrowserRuntime();
  if (!runtime) {
    return null;
  }
  return paginate(buildDefaultCatalog(runtime, modId));
}

export async function getDistDataSearchCatalog(search: string, modId?: string): Promise<BrowserSearchCatalogResponse | null> {
  const runtime = await getBrowserRuntime();
  if (!runtime) {
    return null;
  }
  const normalizedSearch = `${search ?? ""}`.trim();
  if (!normalizedSearch) {
    return getDistDataDefaultCatalog(modId) as Promise<BrowserSearchCatalogResponse | null>;
  }
  const scopeKey = getSearchCatalogScopeKey(normalizedSearch, modId);
  const cached = runtime.searchCatalogByScope.get(scopeKey);
  if (cached) {
    return paginate(cached) as BrowserSearchCatalogResponse;
  }
  const baseEntries = buildDefaultCatalog(runtime, modId);
  const filtered = baseEntries.filter((entry) => {
    const item = entry.kind === "item" ? entry.item : entry.group.representative;
    return matchesSearch(runtime.searchEntryByItemId.get(item.itemId), normalizedSearch);
  });
  runtime.searchCatalogByScope.set(scopeKey, filtered);
  return paginate(filtered) as BrowserSearchCatalogResponse;
}

export async function getDistDataHomeBootstrap(params: {
  page?: number;
  pageSize?: number;
  slotSize?: number;
  modId?: string;
}): Promise<HomeBootstrapResponse | null> {
  const [manifest, runtime] = await Promise.all([getDistDataManifest(), getBrowserRuntime()]);
  if (!manifest || !runtime) {
    return null;
  }
  const pagePack = await getDistDataBrowserPagePack({
    page: params.page,
    pageSize: params.pageSize,
    modId: params.modId,
  });
  if (!pagePack) {
    return null;
  }
  return {
    manifest: buildPublicManifestFromDistData(manifest),
    mods: buildModsFromRuntime(runtime),
    pagePack,
  };
}

export async function getDistDataBrowserPagePack(params: {
  page?: number;
  pageSize?: number;
  search?: string;
  modId?: string;
  expandedGroups?: string[];
}): Promise<BrowserPagePackResponse | null> {
  const runtime = await getBrowserRuntime();
  if (!runtime) {
    return null;
  }
  const normalizedSearch = `${params.search ?? ""}`.trim();
  const baseEntries = normalizedSearch
    ? (await getDistDataSearchCatalog(normalizedSearch, params.modId))?.data ?? []
    : buildDefaultCatalog(runtime, params.modId);
  const expandedEntries = expandCatalogGroups(baseEntries, runtime, params.expandedGroups);
  const page = paginateBrowserEntries(expandedEntries, params.page, params.pageSize);
  return {
    ...page,
    atlas: null,
    mediaManifest: null,
    resourceManifest: buildResourceManifest(page.data),
  };
}

export async function getDistDataBrowserPagePackByIds(itemIds: string[]): Promise<BrowserByIdsPackResponse | null> {
  const runtime = await getBrowserRuntime();
  if (!runtime) {
    return null;
  }
  const seen = new Set<string>();
  const data = itemIds
    .map((itemId) => `${itemId ?? ""}`.trim())
    .filter((itemId) => {
      if (!itemId || seen.has(itemId)) {
        return false;
      }
      seen.add(itemId);
      return true;
    })
    .map((itemId) => runtime.itemById.get(itemId))
    .filter((item): item is Item => Boolean(item))
    .map((item) => ({ key: item.itemId, kind: "item" as const, item }));
  return {
    data,
    atlas: null,
    mediaManifest: null,
    resourceManifest: buildResourceManifest(data),
  };
}

export async function getDistDataGroupItems(groupKey: string, modId?: string): Promise<BrowserGroupItemsResponse | null> {
  const runtime = await getBrowserRuntime();
  const normalizedGroupKey = `${groupKey ?? ""}`.trim();
  if (!runtime || !normalizedGroupKey) {
    return null;
  }
  const items = (runtime.memberItemsByGroupKey.get(normalizedGroupKey) ?? [])
    .filter((item) => filterByModId(item, modId));
  if (!items.length) {
    return null;
  }
  return {
    groupKey: normalizedGroupKey,
    total: items.length,
    items,
  };
}

async function getRecipeItemIndex(): Promise<Map<string, DistDataRecipeItemIndexEntry> | null> {
  if (cachedRecipeItemIndex) {
    return cachedRecipeItemIndex;
  }
  if (recipeItemIndexRequest) {
    return recipeItemIndexRequest;
  }

  recipeItemIndexRequest = (async () => {
    const manifest = await getDistDataManifest();
    const indexPath = `${manifest?.files?.recipeItemIndex ?? ""}`.trim();
    if (!manifest || !indexPath) {
      return null;
    }
    const payload = await fetchJson<DistDataRecipeItemIndexPayload>(joinAssetPath(getConfiguredBasePath(), indexPath));
    const entries = Array.isArray(payload.items) ? payload.items.filter((entry) => entry?.itemId) : [];
    if (!entries.length) {
      return null;
    }
    cachedRecipeItemIndex = new Map(entries.map((entry) => [entry.itemId, entry]));
    return cachedRecipeItemIndex;
  })()
    .catch(() => null)
    .finally(() => {
      recipeItemIndexRequest = null;
    });

  return recipeItemIndexRequest;
}

function collectRecipeIds(entries?: Array<{ recipeId?: string }>): string[] {
  return Array.from(new Set(
    (entries ?? [])
      .map((entry) => `${entry?.recipeId ?? ""}`.trim())
      .filter(Boolean),
  ));
}

function buildCategorySummaries(entries?: Array<{ categoryId?: string; displayName?: string }>) {
  const byCategory = new Map<string, { name: string; recipeCount: number }>();
  for (const entry of entries ?? []) {
    const categoryKey = `${entry?.categoryId ?? ""}`.trim();
    if (!categoryKey) {
      continue;
    }
    const existing = byCategory.get(categoryKey);
    if (existing) {
      existing.recipeCount += 1;
      continue;
    }
    byCategory.set(categoryKey, {
      name: `${entry?.displayName ?? categoryKey}`.trim() || categoryKey,
      recipeCount: 1,
    });
  }
  return Array.from(byCategory.entries())
    .map(([categoryKey, summary]) => ({
      type: "machine" as const,
      name: summary.name,
      recipeType: categoryKey,
      recipeCount: summary.recipeCount,
      categoryKey,
      machineKey: categoryKey,
      voltageTier: null,
      machineIcon: null,
    }))
    .sort((left, right) => right.recipeCount - left.recipeCount || left.name.localeCompare(right.name));
}

export async function getDistDataRecipeBootstrap(itemId: string): Promise<RecipeBootstrapPayload | null> {
  const normalizedItemId = `${itemId ?? ""}`.trim();
  if (!normalizedItemId) {
    return null;
  }
  const [runtime, recipeIndex] = await Promise.all([getBrowserRuntime(), getRecipeItemIndex()]);
  const indexEntry = recipeIndex?.get(normalizedItemId);
  const item = runtime?.itemById.get(normalizedItemId);
  if (!indexEntry || !item) {
    return null;
  }

  const producedByRecipes = collectRecipeIds(indexEntry.producedBy);
  const usedInRecipes = collectRecipeIds(indexEntry.usedIn);
  const producedByCategoryGroups = buildCategorySummaries(indexEntry.producedBy);
  const usedInCategoryGroups = buildCategorySummaries(indexEntry.usedIn);
  return {
    item,
    recipeIndex: {
      producedByRecipes,
      usedInRecipes,
    },
    indexedCrafting: [],
    indexedUsage: [],
    indexedSummary: {
      itemId: normalizedItemId,
      itemName: item.localizedName,
      machineGroups: [],
      producedByMachineGroups: [],
      usedInMachineGroups: [],
      producedByCategoryGroups,
      usedInCategoryGroups,
      counts: {
        producedBy: producedByRecipes.length,
        usedIn: usedInRecipes.length,
        machineGroups: Math.max(producedByCategoryGroups.length, usedInCategoryGroups.length),
      },
    },
    mediaManifest: null,
  };
}

async function getRecipeUiPayloadIndex(): Promise<Map<string, DistDataRecipeUiPayloadIndexEntry> | null> {
  if (cachedRecipeUiPayloadIndex) {
    return cachedRecipeUiPayloadIndex;
  }
  if (recipeUiPayloadIndexRequest) {
    return recipeUiPayloadIndexRequest;
  }

  recipeUiPayloadIndexRequest = (async () => {
    const manifest = await getDistDataManifest();
    const indexPath = `${manifest?.files?.recipeUiPayloadIndex ?? ""}`.trim();
    if (!manifest || !indexPath) {
      return null;
    }
    const payload = await fetchJson<DistDataRecipeUiPayloadIndexPayload>(joinAssetPath(getConfiguredBasePath(), indexPath));
    const entries = Array.isArray(payload.recipes) ? payload.recipes.filter((entry) => entry?.recipeId && entry?.path) : [];
    if (!entries.length) {
      return null;
    }
    cachedRecipeUiPayloadIndex = new Map(entries.map((entry) => [entry.recipeId, entry]));
    return cachedRecipeUiPayloadIndex;
  })()
    .catch(() => null)
    .finally(() => {
      recipeUiPayloadIndexRequest = null;
    });

  return recipeUiPayloadIndexRequest;
}

export async function getDistDataRecipeUiPayload(recipeId: string): Promise<RecipeUiPayload | null> {
  const normalizedRecipeId = `${recipeId ?? ""}`.trim();
  if (!normalizedRecipeId) {
    return null;
  }
  const cached = cachedRecipeUiPayloads.get(normalizedRecipeId);
  if (cached) {
    return cached;
  }
  const index = await getRecipeUiPayloadIndex();
  const entry = index?.get(normalizedRecipeId);
  const payloadPath = `${entry?.path ?? ""}`.trim();
  if (!payloadPath) {
    return null;
  }
  const payload = await fetchJson<RecipeUiPayload>(joinAssetPath(getConfiguredBasePath(), payloadPath)).catch(() => null);
  if (!payload?.recipeId) {
    return null;
  }
  cachedRecipeUiPayloads.set(normalizedRecipeId, payload);
  return payload;
}
export async function getDistDataBrowserAtlasIndex(): Promise<BrowserAtlasIndexResponse | null> {
  if (cachedBrowserAtlasIndex) {
    return cachedBrowserAtlasIndex;
  }
  if (browserAtlasIndexRequest) {
    return browserAtlasIndexRequest;
  }

  browserAtlasIndexRequest = (async () => {
    const manifest = await getDistDataManifest();
    const atlasPath = `${manifest?.files?.browserAtlasIndex ?? ""}`.trim();
    if (!manifest || !atlasPath) {
      return null;
    }
    const payload = await fetchJson<BrowserAtlasIndexResponse>(joinAssetPath(getConfiguredBasePath(), atlasPath));
    if (!payload || !Array.isArray(payload.items)) {
      return null;
    }
    cachedBrowserAtlasIndex = payload;
    return cachedBrowserAtlasIndex;
  })()
    .catch(() => null)
    .finally(() => {
      browserAtlasIndexRequest = null;
    });

  return browserAtlasIndexRequest;
}
export function resetDistDataRuntimeCache(): void {
  manifestRequest = null;
  searchPackRequest = null;
  browserRuntimeRequest = null;
  cachedSearchPack = null;
  cachedBrowserRuntime = null;
  recipeItemIndexRequest = null;
  cachedRecipeItemIndex = null;
  recipeUiPayloadIndexRequest = null;
  cachedRecipeUiPayloadIndex = null;
  cachedRecipeUiPayloads.clear();
  browserAtlasIndexRequest = null;
  cachedBrowserAtlasIndex = null;
}

