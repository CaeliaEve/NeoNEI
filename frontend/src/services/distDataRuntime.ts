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
  NativeRenderIndex,
  NativeFramebufferCaptureEntry,
  NativeItemRendererEntry,
  NativeShaderItemEntry,
  NativeTextureSpriteEntry,
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
    rustSearchPack?: string;
    rustBrowserPack?: string;
    rustRecipePack?: string;
    rustTexturePack?: string;
    rustRuntimeManifest?: string;
    searchAll?: string;
    browserCatalog?: string;
    hiddenBrowserCatalog?: string;
    browserGroups?: string;
    recipeCategories?: string;
    recipeItemIndex?: string;
    recipeUiPayloadIndex?: string;
    textureManifest?: string;
    animationTable?: string;
    browserAtlasIndex?: string;
    nativeRenderIndex?: string;
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
  publicItemId?: string | null;
  variantId?: string | null;
  payloadHash?: string | null;
  semanticFamily?: string | null;
  semanticClassification?: string | null;
  facetSummary?: string | null;
};

type DistDataBrowserCatalogPayload = {
  schemaVersion?: string;
  items?: DistDataBrowserItem[];
};

type DistDataRustBrowserPackPayload = {
  schemaVersion?: string;
  items?: DistDataBrowserItem[];
  groups?: DistDataRawGroup[];
};

type BrowserCatalogMode = "default" | "advanced";

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

type DistDataRustRecipePackPayload = {
  schemaVersion?: string;
  itemIndex?: DistDataRecipeItemIndexEntry[];
  uiPayloadIndex?: DistDataRecipeUiPayloadIndexEntry[];
  categoryIndex?: unknown[];
  recipes?: unknown[];
  handlers?: unknown[];
};

type DistDataRecipeUiPayloadIndexEntry = {
  recipeId: string;
  path: string;
  payloadKey?: string;
  familyKey?: string;
  recipeType?: string;
  machineType?: string;
};

type DistDataRecipeUiPayloadIndexPayload = {
  schemaVersion?: string;
  recipes?: DistDataRecipeUiPayloadIndexEntry[];
};

type DistDataRecipeUiPayloadShard = {
  schemaVersion?: string;
  payloads?: Record<string, RecipeUiPayload>;
};

type DistDataBrowserRuntime = {
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
let rustRecipePackRequest: Promise<DistDataRustRecipePackPayload | null> | null = null;
let cachedRustRecipePack: DistDataRustRecipePackPayload | null = null;
let recipeUiPayloadIndexRequest: Promise<Map<string, DistDataRecipeUiPayloadIndexEntry> | null> | null = null;
let cachedRecipeUiPayloadIndex: Map<string, DistDataRecipeUiPayloadIndexEntry> | null = null;
const cachedRecipeUiPayloads = new Map<string, RecipeUiPayload>();
const cachedRecipeUiPayloadShards = new Map<string, Promise<DistDataRecipeUiPayloadShard | null>>();
let browserAtlasIndexRequest: Promise<BrowserAtlasIndexResponse | null> | null = null;
let cachedBrowserAtlasIndex: BrowserAtlasIndexResponse | null = null;
let nativeRenderIndexRequest: Promise<NativeRenderIndex | null> | null = null;
let cachedNativeRenderIndex: NativeRenderIndex | null = null;

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

function directlyMatchesVariant(entry: BrowserSearchPackEntry | undefined, query: string): boolean {
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
    publicItemId: entry.publicItemId ?? searchEntry?.publicItemId ?? null,
    variantId: entry.variantId ?? searchEntry?.variantId ?? null,
    payloadHash: entry.payloadHash ?? null,
    semanticFamily: entry.semanticFamily ?? searchEntry?.family ?? null,
    semanticClassification: entry.semanticClassification ?? searchEntry?.classification ?? null,
    facetSummary: entry.facetSummary ?? searchEntry?.facetSummary ?? null,
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

function getCatalogScopeKey(modId?: string, mode: BrowserCatalogMode = "default"): string {
  const scope = `${modId ?? "all"}`.trim() || "all";
  return `${mode}:${scope}`;
}

function getSearchCatalogScopeKey(search: string, modId?: string, mode: BrowserCatalogMode = "default"): string {
  return `${getCatalogScopeKey(modId, mode)}::${normalizeNeedle(search)}`;
}

function getRuntimeCatalog(runtime: DistDataBrowserRuntime, includeHidden?: boolean): DistDataBrowserItem[] {
  return includeHidden ? runtime.advancedCatalog : runtime.catalog;
}

function buildDefaultCatalog(runtime: DistDataBrowserRuntime, modId?: string, includeHidden = false): BrowserGridEntry[] {
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
    result.push({ key: `expanded:${entry.group.key}`, kind: "group-header", group: entry.group });
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
    const rustBrowserPath = `${manifest?.files?.rustBrowserPack ?? ""}`.trim();
    const catalogPath = `${manifest?.files?.browserCatalog ?? ""}`.trim();
    const hiddenCatalogPath = `${manifest?.files?.hiddenBrowserCatalog ?? ""}`.trim();
    const groupPath = `${manifest?.files?.browserGroups ?? ""}`.trim();
    if (!manifest || (!rustBrowserPath && (!catalogPath || !groupPath))) {
      return null;
    }

    const [rustBrowserPack, searchPack] = await Promise.all([
      rustBrowserPath
        ? fetchJson<DistDataRustBrowserPackPayload>(joinAssetPath(getConfiguredBasePath(), rustBrowserPath)).catch(() => null)
        : Promise.resolve(null),
      getDistDataSearchPack(),
    ]);
    const canUseRustBrowserPack = Boolean(
      rustBrowserPack
      && Array.isArray(rustBrowserPack.items)
      && Array.isArray(rustBrowserPack.groups)
      && rustBrowserPack.items.some((entry) => entry?.itemId),
    );
    const [catalogPayload, hiddenCatalogPayload, groupPayload] = canUseRustBrowserPack
      ? [
          { schemaVersion: rustBrowserPack?.schemaVersion, items: rustBrowserPack?.items ?? [] } satisfies DistDataBrowserCatalogPayload,
          { items: [] } satisfies DistDataBrowserCatalogPayload,
          { schemaVersion: rustBrowserPack?.schemaVersion, groups: rustBrowserPack?.groups ?? [] } satisfies DistDataGroupPayload,
        ]
      : await Promise.all([
          fetchJson<DistDataBrowserCatalogPayload>(joinAssetPath(getConfiguredBasePath(), catalogPath)),
          hiddenCatalogPath
            ? fetchJson<DistDataBrowserCatalogPayload>(joinAssetPath(getConfiguredBasePath(), hiddenCatalogPath)).catch(() => ({ items: [] }))
            : Promise.resolve({ items: [] } satisfies DistDataBrowserCatalogPayload),
          fetchJson<DistDataGroupPayload>(joinAssetPath(getConfiguredBasePath(), groupPath)),
        ]);
    const catalog = Array.isArray(catalogPayload.items) ? catalogPayload.items.filter((entry) => entry?.itemId) : [];
    const hiddenCatalog = Array.isArray(hiddenCatalogPayload.items) ? hiddenCatalogPayload.items.filter((entry) => entry?.itemId) : [];
    const advancedCatalog = [...catalog, ...hiddenCatalog].sort((left, right) => stableNumber(left.browserOrder, 0) - stableNumber(right.browserOrder, 0) || `${left.itemId}`.localeCompare(`${right.itemId}`));
    const hiddenItemIds = new Set(hiddenCatalog.map((entry) => entry.itemId).filter(Boolean));
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
    for (const entry of advancedCatalog) {
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
      advancedCatalog,
      hiddenItemIds,
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
    const searchPaths = Array.from(new Set([
      `${manifest?.files?.rustSearchPack ?? ""}`.trim(),
      `${manifest?.files?.searchAll ?? ""}`.trim(),
    ].filter(Boolean)));
    if (!manifest || searchPaths.length <= 0) {
      return null;
    }

    for (const searchPath of searchPaths) {
      const payload = await fetchJson<DistDataSearchPayload>(joinAssetPath(getConfiguredBasePath(), searchPath)).catch(() => null);
      if (!payload) {
        continue;
      }
      const pack = coerceSearchPack(manifest, payload);
      if (!pack.items.length) {
        continue;
      }

      cachedSearchPack = {
        manifest,
        runtimeCacheKey: buildRuntimeCacheKey(manifest),
        pack,
      };
      return cachedSearchPack;
    }

    return null;
  })()
    .catch(() => null)
    .finally(() => {
      searchPackRequest = null;
    });

  return searchPackRequest;
}

export async function getDistDataDefaultCatalog(modId?: string, includeHidden = false): Promise<BrowserDefaultCatalogResponse | null> {
  const runtime = await getBrowserRuntime();
  if (!runtime) {
    return null;
  }
  return paginate(buildDefaultCatalog(runtime, modId, includeHidden));
}

export async function getDistDataSearchCatalog(search: string, modId?: string, includeHidden = false): Promise<BrowserSearchCatalogResponse | null> {
  const runtime = await getBrowserRuntime();
  if (!runtime) {
    return null;
  }
  const normalizedSearch = `${search ?? ""}`.trim();
  if (!normalizedSearch) {
    return getDistDataDefaultCatalog(modId, includeHidden) as Promise<BrowserSearchCatalogResponse | null>;
  }
  const scopeKey = getSearchCatalogScopeKey(normalizedSearch, modId, includeHidden ? "advanced" : "default");
  const cached = runtime.searchCatalogByScope.get(scopeKey);
  if (cached) {
    return paginate(cached) as BrowserSearchCatalogResponse;
  }
  const searchPack = await getDistDataSearchPack();
  const emittedGroups = new Set<string>();
  const emittedItems = new Set<string>();
  const filtered: BrowserGridEntry[] = [];
  const sortedSearchEntries = [...(searchPack?.pack.items ?? [])].sort((a, b) => {
    const rankA = stableNumber((a as unknown as { searchRank?: number }).searchRank, Number.MAX_SAFE_INTEGER);
    const rankB = stableNumber((b as unknown as { searchRank?: number }).searchRank, Number.MAX_SAFE_INTEGER);
    if (rankA !== rankB) return rankA - rankB;
    return stableNumber((b as unknown as { popularityScore?: number }).popularityScore, 0)
      - stableNumber((a as unknown as { popularityScore?: number }).popularityScore, 0);
  });

  for (const searchEntry of sortedSearchEntries) {
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
    const shouldSurfaceVariant = groupKey && groupSize > 1 && !isRepresentative && directlyMatchesVariant(searchEntry, normalizedSearch);

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
  includeHidden?: boolean;
}): Promise<BrowserPagePackResponse | null> {
  const runtime = await getBrowserRuntime();
  if (!runtime) {
    return null;
  }
  const normalizedSearch = `${params.search ?? ""}`.trim();
  const baseEntries = normalizedSearch
    ? (await getDistDataSearchCatalog(normalizedSearch, params.modId, params.includeHidden))?.data ?? []
    : buildDefaultCatalog(runtime, params.modId, params.includeHidden);
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

export async function getDistDataGroupItems(groupKey: string, modId?: string, includeHidden = false): Promise<BrowserGroupItemsResponse | null> {
  const runtime = await getBrowserRuntime();
  const normalizedGroupKey = `${groupKey ?? ""}`.trim();
  if (!runtime || !normalizedGroupKey) {
    return null;
  }
  const items = (runtime.memberItemsByGroupKey.get(normalizedGroupKey) ?? [])
    .filter((item) => filterByModId(item, modId) && (includeHidden || !runtime.hiddenItemIds.has(item.itemId)));
  if (!items.length) {
    return null;
  }
  return {
    groupKey: normalizedGroupKey,
    total: items.length,
    items,
  };
}

async function getRustRecipePack(): Promise<DistDataRustRecipePackPayload | null> {
  if (cachedRustRecipePack) {
    return cachedRustRecipePack;
  }
  if (rustRecipePackRequest) {
    return rustRecipePackRequest;
  }

  rustRecipePackRequest = (async () => {
    const manifest = await getDistDataManifest();
    const recipePackPath = `${manifest?.files?.rustRecipePack ?? ""}`.trim();
    if (!manifest || !recipePackPath) {
      return null;
    }
    const payload = await fetchJson<DistDataRustRecipePackPayload>(
      joinAssetPath(getConfiguredBasePath(), recipePackPath),
    ).catch(() => null);
    if (!payload || !Array.isArray(payload.itemIndex) || payload.itemIndex.length <= 0) {
      return null;
    }
    cachedRustRecipePack = payload;
    return cachedRustRecipePack;
  })()
    .catch(() => null)
    .finally(() => {
      rustRecipePackRequest = null;
    });

  return rustRecipePackRequest;
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
    const rustRecipePack = await getRustRecipePack();
    const rustEntries = Array.isArray(rustRecipePack?.itemIndex)
      ? rustRecipePack.itemIndex.filter((entry) => entry?.itemId)
      : [];
    if (rustEntries.length > 0) {
      cachedRecipeItemIndex = new Map(rustEntries.map((entry) => [entry.itemId, entry]));
      return cachedRecipeItemIndex;
    }

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

function toIndexedMachineIcon(itemId: string, runtime: DistDataBrowserRuntime) {
  const normalizedItemId = `${itemId ?? ""}`.trim();
  if (!normalizedItemId) return null;
  const item = runtime.itemById.get(normalizedItemId);
  if (!item) return null;
  return {
    itemId: item.itemId,
    modId: item.modId,
    internalName: item.internalName,
    localizedName: item.localizedName,
    renderAssetRef: item.renderAssetRef ?? null,
    renderHint: item.renderHint ?? null,
    imageFileName: item.imageFileName ?? "",
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
  const handler = payload.handler && typeof payload.handler === "object"
    ? payload.handler as Record<string, unknown>
    : {};
  const payloadMachineInfo = payload.machineInfo && typeof payload.machineInfo === "object"
    ? payload.machineInfo as Record<string, unknown>
    : {};
  const handlerMachineItemId =
    `${handler.preferredMachineItemName ?? ""}`.trim()
    || `${handler.catalystItemName ?? ""}`.trim()
    || `${payloadMachineInfo.preferredMachineItemName ?? ""}`.trim()
    || `${payloadMachineInfo.catalystItemName ?? ""}`.trim();
  const handlerMachineIcon = toIndexedMachineIcon(handlerMachineItemId, runtime);

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
      ...(handlerMachineIcon ? { machineIcon: handlerMachineIcon } : {}),
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
    const rustRecipePack = await getRustRecipePack();
    const rustEntries = Array.isArray(rustRecipePack?.uiPayloadIndex)
      ? rustRecipePack.uiPayloadIndex.filter((entry) => entry?.recipeId && entry?.path)
      : [];
    if (rustEntries.length > 0) {
      cachedRecipeUiPayloadIndex = new Map(rustEntries.map((entry) => [entry.recipeId, entry]));
      return cachedRecipeUiPayloadIndex;
    }

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
  const payloadKey = `${entry?.payloadKey ?? ""}`.trim();
  let payload: RecipeUiPayload | null = null;
  if (payloadKey) {
    const shardUrl = joinAssetPath(getConfiguredBasePath(), preserveEncodedFileNamePath(payloadPath));
    let shardRequest = cachedRecipeUiPayloadShards.get(shardUrl);
    if (!shardRequest) {
      shardRequest = fetchJson<DistDataRecipeUiPayloadShard>(shardUrl).catch(() => null);
      cachedRecipeUiPayloadShards.set(shardUrl, shardRequest);
    }
    const shard = await shardRequest;
    payload = shard?.payloads?.[payloadKey] ?? null;
  } else {
    payload = await fetchJson<RecipeUiPayload>(
      joinAssetPath(getConfiguredBasePath(), preserveEncodedFileNamePath(payloadPath)),
    ).catch(() => null);
  }
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

export async function getDistDataNativeRenderIndex(): Promise<NativeRenderIndex | null> {
  if (cachedNativeRenderIndex) {
    return cachedNativeRenderIndex;
  }
  if (nativeRenderIndexRequest) {
    return nativeRenderIndexRequest;
  }

  nativeRenderIndexRequest = (async () => {
    const manifest = await getDistDataManifest();
    const indexPath = `${manifest?.files?.nativeRenderIndex ?? ""}`.trim();
    if (!manifest || !indexPath) {
      return null;
    }
    const payload = await fetchJson<NativeRenderIndex>(joinAssetPath(getConfiguredBasePath(), indexPath));
    if (!payload || typeof payload !== "object") {
      reportDistDataSchemaMismatch(manifest, indexPath, "Dist-data native render index is not an object", {
        schemaVersion: (payload as { schemaVersion?: unknown } | null)?.schemaVersion ?? null,
      });
      return null;
    }
    const hasRendererIndex = payload.itemRendererByItemId && typeof payload.itemRendererByItemId === "object";
    if (!hasRendererIndex) {
      reportDistDataSchemaMismatch(manifest, indexPath, "Dist-data native render index is missing itemRendererByItemId", {
        schemaVersion: payload.schemaVersion ?? null,
      });
    }
    cachedNativeRenderIndex = payload;
    return cachedNativeRenderIndex;
  })()
    .catch(() => null)
    .finally(() => {
      nativeRenderIndexRequest = null;
    });

  return nativeRenderIndexRequest;
}

function getItemAssetId(itemId?: string | null): string {
  const normalizedItemId = `${itemId ?? ""}`.trim();
  return normalizedItemId ? `nesqlpp:item/${normalizedItemId}` : "";
}

export async function getNativeRendererForItem(itemId?: string | null): Promise<NativeItemRendererEntry | null> {
  const normalizedItemId = `${itemId ?? ""}`.trim();
  if (!normalizedItemId) return null;
  const index = await getDistDataNativeRenderIndex();
  return index?.itemRendererByItemId?.[normalizedItemId] ?? null;
}

export async function getNativeShaderForItem(itemId?: string | null): Promise<NativeShaderItemEntry | null> {
  const normalizedItemId = `${itemId ?? ""}`.trim();
  if (!normalizedItemId) return null;
  const index = await getDistDataNativeRenderIndex();
  return index?.shaderByItemId?.[normalizedItemId] ?? null;
}

export async function getNativeCaptureByAssetId(assetId?: string | null): Promise<NativeFramebufferCaptureEntry | null> {
  const normalizedAssetId = `${assetId ?? ""}`.trim();
  if (!normalizedAssetId) return null;
  const index = await getDistDataNativeRenderIndex();
  return index?.capturesByAssetId?.[normalizedAssetId] ?? null;
}

export async function getNativeCaptureByVariantKey(variantKey?: string | null): Promise<NativeFramebufferCaptureEntry | null> {
  const normalizedVariantKey = `${variantKey ?? ""}`.trim();
  if (!normalizedVariantKey) return null;
  const index = await getDistDataNativeRenderIndex();
  return index?.capturesByVariantKey?.[normalizedVariantKey] ?? null;
}

export async function getNativeSpriteByIconName(iconName?: string | null): Promise<NativeTextureSpriteEntry | null> {
  const normalizedIconName = `${iconName ?? ""}`.trim();
  if (!normalizedIconName) return null;
  const index = await getDistDataNativeRenderIndex();
  return index?.spriteByIconName?.[normalizedIconName] ?? null;
}

export async function getNativeRenderFactsForItem(itemId?: string | null, renderAssetRef?: string | null): Promise<{
  renderer: NativeItemRendererEntry | null;
  shader: NativeShaderItemEntry | null;
  capture: NativeFramebufferCaptureEntry | null;
} | null> {
  const normalizedItemId = `${itemId ?? ""}`.trim();
  const normalizedAssetId = `${renderAssetRef ?? getItemAssetId(normalizedItemId)}`.trim();
  if (!normalizedItemId && !normalizedAssetId) return null;
  const index = await getDistDataNativeRenderIndex();
  if (!index) return null;
  return {
    renderer: normalizedItemId ? index.itemRendererByItemId?.[normalizedItemId] ?? null : null,
    shader: normalizedItemId ? index.shaderByItemId?.[normalizedItemId] ?? null : null,
    capture: (normalizedAssetId ? index.capturesByAssetId?.[normalizedAssetId] : null)
      ?? (normalizedItemId ? index.capturesByVariantKey?.[normalizedItemId] : null)
      ?? null,
  };
}
export function resetDistDataRuntimeCache(): void {
  manifestRequest = null;
  searchPackRequest = null;
  browserRuntimeRequest = null;
  cachedSearchPack = null;
  cachedBrowserRuntime = null;
  recipeItemIndexRequest = null;
  cachedRecipeItemIndex = null;
  rustRecipePackRequest = null;
  cachedRustRecipePack = null;
  recipeUiPayloadIndexRequest = null;
  cachedRecipeUiPayloadIndex = null;
  cachedRecipeUiPayloads.clear();
  cachedRecipeUiPayloadShards.clear();
  browserAtlasIndexRequest = null;
  cachedBrowserAtlasIndex = null;
  nativeRenderIndexRequest = null;
  cachedNativeRenderIndex = null;
}

