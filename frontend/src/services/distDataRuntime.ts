import type {
  HomeBootstrapResponse,
  Item,
  Mod,
  RecipeBootstrapPayload,
  RecipeBootstrapCategoryGroupPayload,
  RecipeBootstrapMachineGroupPayload,
  RecipeUiPayload,
  BrowserAtlasIndexResponse,
  BrowserByIdsPackResponse,
  BrowserDefaultCatalogResponse,
  BrowserGridEntry,
  BrowserGroupItemsResponse,
  BrowserPagePackResponse,
  BrowserSearchCatalogResponse,
  BrowserSearchPackEntry,
  BrowserSearchPackResponse,
  BrowserVariantGroup,
  PublicRuntimeManifest,
  indexedRecipe,
} from "../runtime/types";
import { reportRuntimeSchemaMismatch } from "../runtime/diagnostics";

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
  semanticFamily?: string | null;
  semanticClassification?: string | null;
  groupSource?: string | null;
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

function preserveEncodedFileNamePath(assetPath: string): string {
  // Raw-export payload indexes store filenames that already contain percent-encoded
  // recipe IDs (for example "%3D%3D"). Browsers/Express decode one URL layer
  // before static-file lookup, so encode literal percent signs once more to
  // address the on-disk filename instead of a decoded variant.
  return assetPath.replace(/%/g, "%25");
}

export function resolveDistDataAssetPath(assetPath?: string | null): string | null {
  const normalizedAssetPath = `${assetPath ?? ""}`.trim();
  if (!normalizedAssetPath) {
    return null;
  }
  return joinAssetPath(getConfiguredBasePath(), normalizedAssetPath);
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

function reportDistDataSchemaMismatch(
  manifest: DistDataManifest,
  path: string,
  message: string,
  details?: Record<string, unknown>,
): void {
  reportRuntimeSchemaMismatch({
    path,
    sourceSignature: manifest.sourceSignature ?? manifest.runtimeCacheKey ?? null,
    runtimeCacheKey: buildRuntimeCacheKey(manifest),
    message,
    details,
  });
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
    semanticFamily: group.semanticFamily ?? null,
    semanticClassification: group.semanticClassification ?? null,
    groupSource: group.groupSource ?? null,
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
    if (!Array.isArray(catalogPayload.items)) {
      reportDistDataSchemaMismatch(manifest, catalogPath, "Dist-data browser catalog is missing items[]", {
        schemaVersion: catalogPayload.schemaVersion ?? null,
      });
    }
    if (!Array.isArray(groupPayload.groups)) {
      reportDistDataSchemaMismatch(manifest, groupPath, "Dist-data browser groups payload is missing groups[]", {
        schemaVersion: groupPayload.schemaVersion ?? null,
      });
    }
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
    if (!Array.isArray(payload.items)) {
      reportDistDataSchemaMismatch(manifest, indexPath, "Dist-data recipe item index is missing items[]", {
        schemaVersion: payload.schemaVersion ?? null,
      });
    }
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

function normalizeRecipeCategoryKey(value: unknown): string {
  let key = `${value ?? ""}`.trim();
  if (key.startsWith("machine:")) {
    key = key.slice("machine:".length).trim();
  }
  if (key.endsWith("::")) {
    key = key.slice(0, -2).trim();
  }
  return key;
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

function toRecipeItemStack(itemId: string, runtime: DistDataBrowserRuntime, count = 1) {
  const item = runtime.itemById.get(itemId);
  return {
    item: {
      itemId,
      modId: item?.modId ?? "unknown",
      internalName: item?.internalName ?? itemId,
      localizedName: item?.localizedName ?? itemId,
      renderAssetRef: item?.renderAssetRef ?? null,
      renderHint: item?.renderHint ?? null,
      damage: 0,
      stackSize: count,
      maxStackSize: 64,
      maxDamage: 0,
      nbt: null,
      imageFileName: null,
      tooltip: null,
    },
    probability: 1,
    stackSize: count,
  };
}

function stableSlotDimension(value: unknown, fallback: number): number {
  const parsed = Math.floor(Number(value));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function buildIndexedRecipeFromUiPayload(
  payload: RecipeUiPayload,
  runtime: DistDataBrowserRuntime,
): indexedRecipe | null {
  const recipeId = `${payload.recipeId ?? ""}`.trim();
  if (!recipeId) {
    return null;
  }

  const layout = payload.layout && typeof payload.layout === "object"
    ? payload.layout as {
        itemInputWidth?: unknown;
        itemInputHeight?: unknown;
        itemOutputWidth?: unknown;
        itemOutputHeight?: unknown;
        itemSlots?: Array<{
          role?: unknown;
          itemId?: unknown;
          count?: unknown;
          stackSize?: unknown;
          slotIndex?: unknown;
        }>;
      }
    : null;
  const metadata = payload.metadata && typeof payload.metadata === "object"
    ? payload.metadata as Record<string, unknown>
    : {};

  const inputWidth = stableSlotDimension(layout?.itemInputWidth, Math.min(3, Math.max(1, Number(payload.slotCount?.input ?? 1) || 1)));
  const inputHeight = stableSlotDimension(
    layout?.itemInputHeight,
    Math.max(1, Math.ceil((Number(payload.slotCount?.input ?? payload.inputItemIds?.length ?? 1) || 1) / inputWidth)),
  );
  const outputWidth = stableSlotDimension(layout?.itemOutputWidth, Math.min(3, Math.max(1, Number(payload.slotCount?.output ?? 1) || 1)));
  const outputHeight = stableSlotDimension(
    layout?.itemOutputHeight,
    Math.max(1, Math.ceil((Number(payload.slotCount?.output ?? payload.outputItemIds?.length ?? 1) || 1) / outputWidth)),
  );

  const inputSlots = Array.isArray(layout?.itemSlots)
    ? layout!.itemSlots.filter((slot) => `${slot?.role ?? ""}`.toLowerCase() === "input")
    : [];
  const outputSlots = Array.isArray(layout?.itemSlots)
    ? layout!.itemSlots.filter((slot) => `${slot?.role ?? ""}`.toLowerCase() === "output")
    : [];

  const inputItemIds = inputSlots.length > 0
    ? inputSlots.map((slot) => `${slot.itemId ?? ""}`.trim()).filter(Boolean)
    : (payload.inputItemIds ?? []).map((itemId) => `${itemId ?? ""}`.trim()).filter(Boolean);
  const outputItemIds = outputSlots.length > 0
    ? outputSlots.map((slot) => `${slot.itemId ?? ""}`.trim()).filter(Boolean)
    : (payload.outputItemIds ?? []).map((itemId) => `${itemId ?? ""}`.trim()).filter(Boolean);

  const inputs = inputItemIds.map((itemId, index) => ({
    slotIndex: index,
    items: [toRecipeItemStack(itemId, runtime, 1)],
    isOreDictionary: false,
    oreDictName: null,
  }));
  const outputs = outputItemIds.map((itemId) => toRecipeItemStack(itemId, runtime, 1));

  return {
    id: recipeId,
    recipeType: `${payload.recipeType ?? payload.familyKey ?? "unknown"}`,
    recipeTypeData: {
      id: `${payload.recipeType ?? payload.familyKey ?? "unknown"}`,
      category: `${payload.machineType ?? payload.familyKey ?? "unknown"}`,
      type: `${payload.recipeType ?? payload.familyKey ?? "unknown"}`,
      machineType: `${payload.recipeType ?? payload.familyKey ?? "unknown"}`,
      itemInputDimension: { width: inputWidth, height: inputHeight },
      itemOutputDimension: { width: outputWidth, height: outputHeight },
      fluidInputDimension: { width: 0, height: 0 },
      fluidOutputDimension: { width: 0, height: 0 },
      shapeless: Boolean(metadata.shapeless),
    },
    inputs,
    outputs,
    fluidInputs: Array.isArray((payload as { fluidInputs?: unknown[] }).fluidInputs)
      ? (payload as { fluidInputs?: unknown[] }).fluidInputs
      : [],
    fluidOutputs: Array.isArray((payload as { fluidOutputs?: unknown[] }).fluidOutputs)
      ? (payload as { fluidOutputs?: unknown[] }).fluidOutputs
      : [],
    machineInfo: {
      machineId: `${payload.recipeType ?? payload.familyKey ?? "unknown"}`,
      category: `${payload.machineType ?? payload.familyKey ?? "unknown"}`,
      machineType: `${payload.recipeType ?? payload.familyKey ?? "unknown"}`,
      iconInfo: `${metadata.handlerIcon ?? ""}`,
      shapeless: Boolean(metadata.shapeless),
      parsedVoltageTier: null,
      parsedVoltage: null,
    },
    metadata: {
      voltageTier: null,
      voltage: null,
      amperage: null,
      duration: null,
      totalEU: null,
      requiresCleanroom: null,
      requiresLowGravity: null,
      additionalInfo: null,
      ...metadata,
      uiPayload: payload,
      specialRecipeType: metadata.specialRecipeType ?? "NEI_Handler",
    },
  };
}

async function getIndexedRecipesFromUiPayloads(recipeIds: string[]): Promise<indexedRecipe[]> {
  const runtime = await getBrowserRuntime();
  if (!runtime || recipeIds.length <= 0) {
    return [];
  }
  const payloads = await Promise.all(recipeIds.map((recipeId) => getDistDataRecipeUiPayload(recipeId)));
  return payloads
    .map((payload) => (payload ? buildIndexedRecipeFromUiPayload(payload, runtime) : null))
    .filter((recipe): recipe is indexedRecipe => Boolean(recipe));
}

async function buildDistDataCategoryGroupPayload(
  itemId: string,
  tab: "usedIn" | "producedBy",
  categoryKey: string,
  options?: { offset?: number; limit?: number; includeRecipeIds?: boolean },
): Promise<RecipeBootstrapCategoryGroupPayload | null> {
  const normalizedItemId = `${itemId ?? ""}`.trim();
  const normalizedCategoryKey = normalizeRecipeCategoryKey(categoryKey);
  if (!normalizedItemId || !normalizedCategoryKey) {
    return null;
  }
  const recipeIndex = await getRecipeItemIndex();
  const indexEntry = recipeIndex?.get(normalizedItemId);
  if (!indexEntry) {
    return null;
  }
  const entries = (tab === "usedIn" ? indexEntry.usedIn : indexEntry.producedBy) ?? [];
  const recipeIds = collectRecipeIds(entries.filter((entry) => `${entry.categoryId ?? ""}`.trim() === normalizedCategoryKey));
  if (recipeIds.length <= 0) {
    return null;
  }

  const offset = Math.max(0, Math.floor(Number(options?.offset ?? 0) || 0));
  const requestedLimit = Math.floor(Number(options?.limit ?? recipeIds.length) || 0);
  const limit = requestedLimit > 0 ? requestedLimit : 0;
  const windowRecipeIds = options?.includeRecipeIds && limit <= 0
    ? []
    : recipeIds.slice(offset, limit > 0 ? offset + limit : recipeIds.length);

  return {
    itemId: normalizedItemId,
    categoryKey: normalizedCategoryKey,
    tab,
    recipeCount: recipeIds.length,
    recipes: await getIndexedRecipesFromUiPayloads(windowRecipeIds),
    recipeIds,
    offset,
    limit,
    hasMore: limit > 0 ? offset + limit < recipeIds.length : false,
    mediaManifest: null,
  };
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

export async function getDistDataRecipeBootstrapCategoryGroup(
  itemId: string,
  tab: "usedIn" | "producedBy",
  categoryKey: string,
  options?: { offset?: number; limit?: number; includeRecipeIds?: boolean },
): Promise<RecipeBootstrapCategoryGroupPayload | null> {
  return buildDistDataCategoryGroupPayload(itemId, tab, categoryKey, options);
}

export async function getDistDataRecipeBootstrapProducedByGroup(
  itemId: string,
  machineType: string,
  _voltageTier?: string | null,
  options?: { offset?: number; limit?: number; includeRecipeIds?: boolean; machineKey?: string | null },
): Promise<RecipeBootstrapMachineGroupPayload | null> {
  const categoryKey = normalizeRecipeCategoryKey(options?.machineKey ?? machineType ?? "");
  const payload = await buildDistDataCategoryGroupPayload(itemId, "producedBy", categoryKey, options);
  if (!payload) {
    return null;
  }
  return {
    itemId: payload.itemId,
    machineType,
    voltageTier: _voltageTier ?? null,
    recipeCount: payload.recipeCount,
    recipes: payload.recipes,
    recipeIds: payload.recipeIds,
    offset: payload.offset,
    limit: payload.limit,
    hasMore: payload.hasMore,
    mediaManifest: payload.mediaManifest,
  };
}

export async function getDistDataRecipeBootstrapUsedInGroup(
  itemId: string,
  machineType: string,
  _voltageTier?: string | null,
  options?: { offset?: number; limit?: number; includeRecipeIds?: boolean; machineKey?: string | null },
): Promise<RecipeBootstrapMachineGroupPayload | null> {
  const categoryKey = normalizeRecipeCategoryKey(options?.machineKey ?? machineType ?? "");
  const payload = await buildDistDataCategoryGroupPayload(itemId, "usedIn", categoryKey, options);
  if (!payload) {
    return null;
  }
  return {
    itemId: payload.itemId,
    machineType,
    voltageTier: _voltageTier ?? null,
    recipeCount: payload.recipeCount,
    recipes: payload.recipes,
    recipeIds: payload.recipeIds,
    offset: payload.offset,
    limit: payload.limit,
    hasMore: payload.hasMore,
    mediaManifest: payload.mediaManifest,
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
    if (!Array.isArray(payload.recipes)) {
      reportDistDataSchemaMismatch(manifest, indexPath, "Dist-data recipe UI payload index is missing recipes[]", {
        schemaVersion: payload.schemaVersion ?? null,
      });
    }
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
  const payload = await fetchJson<RecipeUiPayload>(
    joinAssetPath(getConfiguredBasePath(), preserveEncodedFileNamePath(payloadPath)),
  ).catch(() => null);
  if (!payload?.recipeId) {
    const manifest = await getDistDataManifest();
    if (manifest) {
      reportDistDataSchemaMismatch(manifest, payloadPath, "Dist-data recipe UI payload is missing recipeId", {
        requestedRecipeId: normalizedRecipeId,
      });
    }
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
      reportDistDataSchemaMismatch(manifest, atlasPath, "Dist-data browser atlas index is missing items[]", {
        schemaVersion: payload?.schemaVersion ?? null,
      });
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

