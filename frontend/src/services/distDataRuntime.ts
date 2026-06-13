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
  NativeRenderIndex,
  NativeFramebufferCaptureEntry,
  NativeItemRendererEntry,
  NativeShaderItemEntry,
  NativeTextureSpriteEntry,
  indexedRecipe,
} from "../runtime/types";
import { reportRuntimeSchemaMismatch } from "../runtime/diagnostics";
import {
  fetchDistDataArrayBuffer,
  fetchDistDataJson,
  getDistDataBasePath,
  joinDistDataAssetPath,
  preserveEncodedDistDataFileNamePath,
} from "./distDataRuntimeAssetResolver";
import { parseNativeBinaryPackEnvelope } from "./distDataNativeBinaryPack";
import { parseCompactRecipePayload } from "./distDataRuntimeBinaryRecipePack";
import { parseCompactTexturePayloadToAtlasIndex } from "./distDataRuntimeBinaryTexturePack";
import {
  parseNativeBrowserPackPayload,
  parseNativeGroupPackPayload,
  parseNativeSearchPackPayload,
} from "./distDataRuntimeBinaryBrowserPack";
import {
  buildPublicManifestFromDistData,
  buildRuntimeCacheKey,
  type DistDataManifest,
  type DistDataRustRuntimeManifest,
} from "./distDataRuntimeManifest";
import {
  buildDefaultCatalog,
  buildGroup,
  buildModsFromRuntime,
  buildResourceManifest,
  buildSearchCatalog,
  expandCatalogGroups,
  filterByModId,
  paginate,
  paginateBrowserEntries,
  stableNumber,
  toItem,
  type DistDataBrowserItem,
  type DistDataBrowserRuntime,
  type DistDataRawGroup,
} from "./distDataBrowserRuntime";
import { createDistDataRuntimeRenderApi } from "./distDataRuntimeRender";
export {
  resolveDistDataAssetPath,
  resolveDistDataNativeRuntimeManifestPath,
} from "./distDataRuntimeAssetResolver";

type DistDataSearchPayload = {
  schemaVersion?: string;
  version?: number;
  signature?: string;
  total?: number;
  items?: BrowserSearchPackEntry[];
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

type DistDataNativeBrowserPackPayload = {
  items: DistDataBrowserItem[];
};


type DistDataRustTexturePackPayload = {
  schemaVersion?: string;
  atlas?: BrowserAtlasIndexResponse | null;
  atlasMap?: Record<string, unknown>;
  animationTable?: unknown[];
  counts?: Record<string, unknown>;
};
type BrowserCatalogMode = "default" | "advanced";

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

type DistDataRustRecipeCategoryEntry = {
  categoryId?: string;
  recipeCount?: number;
  displayName?: string;
  sourceCategoryIds?: string[];
  handler?: Record<string, unknown> | null;
  nativeLayout?: Record<string, unknown> | null;
};

type DistDataRustRecipePackPayload = {
  schemaVersion?: string;
  itemIndex?: DistDataRecipeItemIndexEntry[];
  uiPayloadIndex?: DistDataRecipeUiPayloadIndexEntry[];
  categoryIndex?: DistDataRustRecipeCategoryEntry[];
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

const LEGACY_RUST_RECIPE_UI_SHARD_PREFIX = "rust/recipe-ui-payload-shards/";
const CURRENT_RECIPE_UI_SHARD_PREFIX = "recipes/ui-payload-shards/";

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
let rustRuntimeManifestRequest: Promise<DistDataRustRuntimeManifest | null> | null = null;
let cachedRustRuntimeManifest: DistDataRustRuntimeManifest | null = null;
let recipeUiPayloadIndexRequest: Promise<Map<string, DistDataRecipeUiPayloadIndexEntry> | null> | null = null;
let cachedRecipeUiPayloadIndex: Map<string, DistDataRecipeUiPayloadIndexEntry> | null = null;
const cachedRecipeUiPayloads = new Map<string, RecipeUiPayload>();
const cachedRecipeUiPayloadShards = new Map<string, Promise<DistDataRecipeUiPayloadShard | null>>();

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

async function getBrowserRuntime(): Promise<DistDataBrowserRuntime | null> {
  if (cachedBrowserRuntime) {
    return cachedBrowserRuntime;
  }
  if (browserRuntimeRequest) {
    return browserRuntimeRequest;
  }

  browserRuntimeRequest = (async () => {
    const manifest = await getDistDataManifest();
    const runtimeManifest = await getRustRuntimeManifest();
    const runtimeEntrypoints = runtimeManifest?.entrypoints ?? (!Array.isArray(runtimeManifest?.files) ? runtimeManifest?.files : undefined) ?? {};
    const rustBrowserPath = `${manifest?.files?.rustBrowserPack ?? manifest?.files?.rustBrowserBin ?? runtimeEntrypoints.browser ?? ""}`.trim();
    const rustGroupPath = `${manifest?.files?.rustGroupsBin ?? runtimeEntrypoints.groups ?? ""}`.trim();
    const catalogPath = `${manifest?.files?.browserCatalog ?? ""}`.trim();
    const hiddenCatalogPath = `${manifest?.files?.hiddenBrowserCatalog ?? ""}`.trim();
    const groupPath = `${manifest?.files?.browserGroups ?? ""}`.trim();
    if (!manifest || (!rustBrowserPath && (!catalogPath || !groupPath))) {
      return null;
    }

    const [nativeBrowserPack, nativeGroups, rustBrowserPack, searchPack] = await Promise.all([
      rustBrowserPath
        ? fetchDistDataArrayBuffer(joinDistDataAssetPath(getDistDataBasePath(), rustBrowserPath))
          .then((buffer) => parseNativeBinaryPackEnvelope(buffer, "neonei/browser-pack/current").payload)
          .then(parseNativeBrowserPackPayload)
          .catch(() => null)
        : Promise.resolve(null),
      rustGroupPath
        ? fetchDistDataArrayBuffer(joinDistDataAssetPath(getDistDataBasePath(), rustGroupPath))
          .then((buffer) => parseNativeBinaryPackEnvelope(buffer, "neonei/group-pack/current").payload)
          .then(parseNativeGroupPackPayload)
          .catch(() => [])
        : Promise.resolve(null),
      rustBrowserPath && rustBrowserPath.endsWith(".json")
        ? fetchDistDataJson<DistDataRustBrowserPackPayload>(joinDistDataAssetPath(getDistDataBasePath(), rustBrowserPath)).catch(() => null)
        : Promise.resolve(null),
      getDistDataSearchPack(),
    ]);
    const canUseNativeBrowserPack = Boolean(nativeBrowserPack?.items.some((entry) => entry?.itemId));
    const canUseRustBrowserPack = !canUseNativeBrowserPack && Boolean(
      rustBrowserPack
      && Array.isArray(rustBrowserPack.items)
      && Array.isArray(rustBrowserPack.groups)
      && rustBrowserPack.items.some((entry) => entry?.itemId),
    );
    if (rustBrowserPath && !canUseNativeBrowserPack && !canUseRustBrowserPack) {
      reportDistDataSchemaMismatch(manifest, rustBrowserPath, "Rust browser pack is missing usable items[]/groups[]", {
        schemaVersion: rustBrowserPack?.schemaVersion ?? null,
      });
      return null;
    }
    const [catalogPayload, hiddenCatalogPayload, groupPayload] = canUseNativeBrowserPack
      ? [
          { schemaVersion: "neonei/browser-pack/current", items: nativeBrowserPack?.items ?? [] } satisfies DistDataBrowserCatalogPayload,
          { items: [] } satisfies DistDataBrowserCatalogPayload,
          { schemaVersion: "neonei/group-pack/current", groups: nativeGroups ?? [] } satisfies DistDataGroupPayload,
        ]
      : canUseRustBrowserPack
      ? [
          { schemaVersion: rustBrowserPack?.schemaVersion, items: rustBrowserPack?.items ?? [] } satisfies DistDataBrowserCatalogPayload,
          { items: [] } satisfies DistDataBrowserCatalogPayload,
          { schemaVersion: rustBrowserPack?.schemaVersion, groups: rustBrowserPack?.groups ?? [] } satisfies DistDataGroupPayload,
        ]
      : await Promise.all([
          fetchDistDataJson<DistDataBrowserCatalogPayload>(joinDistDataAssetPath(getDistDataBasePath(), catalogPath)),
          hiddenCatalogPath
            ? fetchDistDataJson<DistDataBrowserCatalogPayload>(joinDistDataAssetPath(getDistDataBasePath(), hiddenCatalogPath)).catch(() => ({ items: [] }))
            : Promise.resolve({ items: [] } satisfies DistDataBrowserCatalogPayload),
          fetchDistDataJson<DistDataGroupPayload>(joinDistDataAssetPath(getDistDataBasePath(), groupPath)),
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

  manifestRequest = fetchDistDataJson<DistDataManifest>(joinDistDataAssetPath(getDistDataBasePath(), "manifest.json"))
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
    const runtimeManifest = await getRustRuntimeManifest();
    const runtimeEntrypoints = runtimeManifest?.entrypoints ?? (!Array.isArray(runtimeManifest?.files) ? runtimeManifest?.files : undefined) ?? {};
    const binarySearchPath = `${manifest?.files?.rustSearchBin ?? runtimeEntrypoints.search ?? ""}`.trim();
    if (manifest && binarySearchPath) {
      const binaryPack = await fetchDistDataArrayBuffer(joinDistDataAssetPath(getDistDataBasePath(), binarySearchPath))
        .then((buffer) => parseNativeBinaryPackEnvelope(buffer, "neonei/search-pack/current").payload)
        .then((payload) => parseNativeSearchPackPayload(buildRuntimeCacheKey(manifest), payload))
        .catch((error) => {
          reportDistDataSchemaMismatch(manifest, binarySearchPath, "Rust binary search pack is not readable", {
            message: error instanceof Error ? error.message : String(error),
          });
          return null;
        });
      if (binaryPack?.items.length) {
        cachedSearchPack = {
          manifest,
          runtimeCacheKey: buildRuntimeCacheKey(manifest),
          pack: binaryPack,
        };
        return cachedSearchPack;
      }
    }

    const searchPaths = Array.from(new Set([
      `${manifest?.files?.rustSearchPack ?? ""}`.trim(),
      `${manifest?.files?.searchAll ?? ""}`.trim(),
    ].filter(Boolean)));
    if (!manifest || searchPaths.length <= 0) {
      return null;
    }

    for (const searchPath of searchPaths) {
      const payload = await fetchDistDataJson<DistDataSearchPayload>(joinDistDataAssetPath(getDistDataBasePath(), searchPath)).catch(() => null);
      const pack = payload ? coerceSearchPack(manifest, payload) : null;
      if (!payload || !pack?.items.length) {
        if (searchPath === `${manifest.files?.rustSearchPack ?? ""}`.trim()) {
          reportDistDataSchemaMismatch(manifest, searchPath, "Rust search pack is missing usable items[]", {
            schemaVersion: payload?.schemaVersion ?? null,
          });
          return null;
        }
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
  const searchPack = await getDistDataSearchPack();
  const filtered = buildSearchCatalog(
    runtime,
    searchPack?.pack.items ?? [],
    normalizedSearch,
    modId,
    includeHidden,
  );
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

async function getRustRuntimeManifest(): Promise<DistDataRustRuntimeManifest | null> {
  if (cachedRustRuntimeManifest) {
    return cachedRustRuntimeManifest;
  }
  if (rustRuntimeManifestRequest) {
    return rustRuntimeManifestRequest;
  }

  rustRuntimeManifestRequest = (async () => {
    const manifest = await getDistDataManifest();
    const runtimeManifestPath = `${manifest?.files?.rustRuntimeManifest ?? ""}`.trim();
    if (!manifest || !runtimeManifestPath) {
      return null;
    }
    const payload = await fetchDistDataJson<DistDataRustRuntimeManifest>(joinDistDataAssetPath(getDistDataBasePath(), runtimeManifestPath)).catch(() => null);
    if (!payload || typeof payload !== "object") {
      reportDistDataSchemaMismatch(manifest, runtimeManifestPath, "Rust runtime manifest is missing or invalid");
      return null;
    }
    cachedRustRuntimeManifest = payload;
    return cachedRustRuntimeManifest;
  })()
    .catch(() => null)
    .finally(() => {
      rustRuntimeManifestRequest = null;
    });

  return rustRuntimeManifestRequest;
}

async function getRustRecipeBinaryPath(manifest: DistDataManifest): Promise<string | null> {
  const runtimeManifest = await getRustRuntimeManifest();
  const runtimeRecipePath = `${runtimeManifest?.entrypoints?.recipes ?? ""}`.trim();
  if (runtimeRecipePath) {
    return runtimeRecipePath;
  }
  const jsonRecipePath = `${manifest.files?.rustRecipePack ?? ""}`.trim();
  if (jsonRecipePath.endsWith("recipe-pack.json")) {
    return jsonRecipePath.replace(/recipe-pack\.json$/, "recipes.bin");
  }
  return null;
}

async function getRustTextureBinaryPath(manifest: DistDataManifest): Promise<string | null> {
  const runtimeManifest = await getRustRuntimeManifest();
  const runtimeTexturePath = `${runtimeManifest?.entrypoints?.textures ?? ""}`.trim();
  if (runtimeTexturePath) {
    return runtimeTexturePath;
  }
  const jsonTexturePath = `${manifest.files?.rustTexturePack ?? ""}`.trim();
  if (jsonTexturePath.endsWith("texture-pack.json")) {
    return jsonTexturePath.replace(/texture-pack\.json$/, "textures.bin");
  }
  return null;
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
    if (!manifest) {
      return null;
    }
    const recipeBinaryPath = await getRustRecipeBinaryPath(manifest);
    if (!recipeBinaryPath) {
      return null;
    }
    const buffer = await fetchDistDataArrayBuffer(joinDistDataAssetPath(getDistDataBasePath(), recipeBinaryPath)).catch(() => null);
    const payload = buffer
      ? (() => {
          const envelope = parseNativeBinaryPackEnvelope(buffer, "neonei/recipe-pack/current");
          return parseCompactRecipePayload(envelope.payload);
        })()
      : null;
    if (!payload || !Array.isArray(payload.itemIndex) || payload.itemIndex.length <= 0) {
      reportDistDataSchemaMismatch(manifest, recipeBinaryPath, "Binary recipes.bin is missing usable itemIndex[]", {
        schemaVersion: payload?.schemaVersion ?? null,
      });
      return null;
    }
    cachedRustRecipePack = payload;
    return cachedRustRecipePack;
  })()
    .catch((error) => {
      void getDistDataManifest().then((manifest) => {
        if (manifest) {
          reportDistDataSchemaMismatch(manifest, `${manifest.files?.rustRuntimeManifest ?? manifest.files?.rustRecipePack ?? "rust/recipes.bin"}`, "Binary recipes.bin failed to parse", {
            error: error instanceof Error ? error.message : `${error}`,
          });
        }
      });
      return null;
    })
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
    if (`${manifest?.files?.rustRecipePack ?? ""}`.trim()) {
      return null;
    }

    const indexPath = `${manifest?.files?.recipeItemIndex ?? ""}`.trim();
    if (!manifest || !indexPath) {
      return null;
    }
    const payload = await fetchDistDataJson<DistDataRecipeItemIndexPayload>(joinDistDataAssetPath(getDistDataBasePath(), indexPath));
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

function normalizeRecipeUiPayloadPath(path: string): string {
  const normalized = `${path ?? ""}`.trim().replace(/\\/g, "/").replace(/^\/+/g, "");
  return normalized;
}

function isLegacyRustRecipeUiPayloadPath(path: string): boolean {
  return normalizeRecipeUiPayloadPath(path).startsWith(LEGACY_RUST_RECIPE_UI_SHARD_PREFIX);
}

function leftRotate(value: number, bits: number): number {
  return ((value << bits) | (value >>> (32 - bits))) >>> 0;
}

function sha1Hex(value: string): string {
  const bytes = Array.from(new TextEncoder().encode(value));
  const bitLength = bytes.length * 8;
  bytes.push(0x80);
  while (bytes.length % 64 !== 56) {
    bytes.push(0);
  }
  for (let shift = 56; shift >= 0; shift -= 8) {
    bytes.push(Math.floor(bitLength / (2 ** shift)) & 0xff);
  }

  let h0 = 0x67452301;
  let h1 = 0xefcdab89;
  let h2 = 0x98badcfe;
  let h3 = 0x10325476;
  let h4 = 0xc3d2e1f0;

  for (let chunkStart = 0; chunkStart < bytes.length; chunkStart += 64) {
    const words = new Array<number>(80).fill(0);
    for (let index = 0; index < 16; index += 1) {
      const offset = chunkStart + index * 4;
      words[index] = (
        ((bytes[offset] ?? 0) << 24)
        | ((bytes[offset + 1] ?? 0) << 16)
        | ((bytes[offset + 2] ?? 0) << 8)
        | (bytes[offset + 3] ?? 0)
      ) >>> 0;
    }
    for (let index = 16; index < 80; index += 1) {
      words[index] = leftRotate(
        (words[index - 3] ^ words[index - 8] ^ words[index - 14] ^ words[index - 16]) >>> 0,
        1,
      );
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    for (let index = 0; index < 80; index += 1) {
      let f = 0;
      let k = 0;
      if (index <= 19) {
        f = (b & c) | ((~b) & d);
        k = 0x5a827999;
      } else if (index <= 39) {
        f = b ^ c ^ d;
        k = 0x6ed9eba1;
      } else if (index <= 59) {
        f = (b & c) | (b & d) | (c & d);
        k = 0x8f1bbcdc;
      } else {
        f = b ^ c ^ d;
        k = 0xca62c1d6;
      }
      const temp = (leftRotate(a, 5) + f + e + k + (words[index] ?? 0)) >>> 0;
      e = d;
      d = c;
      c = leftRotate(b, 30);
      b = a;
      a = temp;
    }

    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
  }

  return [h0, h1, h2, h3, h4]
    .map((word) => word.toString(16).padStart(8, "0"))
    .join("");
}

function resolveRecipeUiPayloadPath(entry: DistDataRecipeUiPayloadIndexEntry): string {
  const normalizedPath = normalizeRecipeUiPayloadPath(entry.path);
  if (!isLegacyRustRecipeUiPayloadPath(normalizedPath)) {
    return normalizedPath;
  }
  const hash = sha1Hex(`${entry.recipeId ?? ""}`);
  return `${CURRENT_RECIPE_UI_SHARD_PREFIX}${hash.slice(0, 2)}.json`;
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

function buildCategoryLookup(recipePack: DistDataRustRecipePackPayload | null | undefined): Map<string, DistDataRustRecipeCategoryEntry> {
  const categories = Array.isArray(recipePack?.categoryIndex) ? recipePack.categoryIndex : [];
  return new Map(
    categories
      .filter((category) => `${category?.categoryId ?? ""}`.trim())
      .map((category) => [`${category.categoryId}`.trim(), category]),
  );
}

function buildCategorySummaries(
  entries?: Array<{ categoryId?: string; displayName?: string }>,
  categoryLookup?: Map<string, DistDataRustRecipeCategoryEntry>,
) {
  const byCategory = new Map<string, { name: string; recipeCount: number }>();
  for (const entry of entries ?? []) {
    const categoryKey = `${entry?.categoryId ?? ""}`.trim();
    if (!categoryKey) {
      continue;
    }
    const category = categoryLookup?.get(categoryKey);
    const existing = byCategory.get(categoryKey);
    if (existing) {
      existing.recipeCount += 1;
      continue;
    }
    byCategory.set(categoryKey, {
      name: `${category?.displayName ?? entry?.displayName ?? categoryKey}`.trim() || categoryKey,
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
  const payloadRecipeType = `${payload.recipeType ?? payload.familyKey ?? "unknown"}`;
  const payloadMachineType = `${payload.machineType ?? payload.familyKey ?? payloadRecipeType}`;

  return {
    id: recipeId,
    recipeType: payloadRecipeType,
    recipeTypeData: {
      id: payloadRecipeType,
      category: payloadMachineType,
      type: payloadRecipeType,
      machineType: payloadMachineType,
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
      machineId: payloadRecipeType,
      category: payloadMachineType,
      machineType: payloadMachineType,
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
  const [runtime, recipeIndex, rustRecipePack] = await Promise.all([getBrowserRuntime(), getRecipeItemIndex(), getRustRecipePack()]);
  const indexEntry = recipeIndex?.get(normalizedItemId);
  const item = runtime?.itemById.get(normalizedItemId);
  if (!item) {
    return null;
  }

  const producedByRecipes = collectRecipeIds(indexEntry?.producedBy);
  const usedInRecipes = collectRecipeIds(indexEntry?.usedIn);
  const categoryLookup = buildCategoryLookup(rustRecipePack);
  const producedByCategoryGroups = buildCategorySummaries(indexEntry?.producedBy, categoryLookup);
  const usedInCategoryGroups = buildCategorySummaries(indexEntry?.usedIn, categoryLookup);
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
      cachedRecipeUiPayloadIndex = new Map(rustEntries.map((entry) => [
        entry.recipeId,
        {
          ...entry,
          path: normalizeRecipeUiPayloadPath(entry.path),
        },
      ]));
      return cachedRecipeUiPayloadIndex;
    }
    if (`${manifest?.files?.rustRecipePack ?? ""}`.trim()) {
      return null;
    }

    const indexPath = `${manifest?.files?.recipeUiPayloadIndex ?? ""}`.trim();
    if (!manifest || !indexPath) {
      return null;
    }
    const payload = await fetchDistDataJson<DistDataRecipeUiPayloadIndexPayload>(joinDistDataAssetPath(getDistDataBasePath(), indexPath));
    const entries = Array.isArray(payload.recipes) ? payload.recipes.filter((entry) => entry?.recipeId && entry?.path) : [];
    if (!Array.isArray(payload.recipes)) {
      reportDistDataSchemaMismatch(manifest, indexPath, "Dist-data recipe UI payload index is missing recipes[]", {
        schemaVersion: payload.schemaVersion ?? null,
      });
    }
    if (!entries.length) {
      return null;
    }
    cachedRecipeUiPayloadIndex = new Map(entries.map((entry) => [
      entry.recipeId,
      {
        ...entry,
        path: normalizeRecipeUiPayloadPath(entry.path),
      },
    ]));
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
  const payloadPath = entry ? await resolveRecipeUiPayloadPath(entry) : "";
  if (!payloadPath) {
    return null;
  }
  const payloadKey = `${entry?.payloadKey ?? ""}`.trim();
  let payload: RecipeUiPayload | null = null;
  if (payloadKey) {
    const shardUrl = joinDistDataAssetPath(getDistDataBasePath(), preserveEncodedDistDataFileNamePath(payloadPath));
    let shardRequest = cachedRecipeUiPayloadShards.get(shardUrl);
    if (!shardRequest) {
      shardRequest = fetchDistDataJson<DistDataRecipeUiPayloadShard>(shardUrl).catch(() => null);
      cachedRecipeUiPayloadShards.set(shardUrl, shardRequest);
    }
    const shard = await shardRequest;
    payload = shard?.payloads?.[payloadKey] ?? null;
  } else {
    payload = await fetchDistDataJson<RecipeUiPayload>(
      joinDistDataAssetPath(getDistDataBasePath(), preserveEncodedDistDataFileNamePath(payloadPath)),
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
const renderRuntimeApi = createDistDataRuntimeRenderApi({
  getDistDataManifest,
  getRustTextureBinaryPath,
  reportDistDataSchemaMismatch,
});

export const getDistDataBrowserAtlasIndex = renderRuntimeApi.getDistDataBrowserAtlasIndex;
export const getDistDataNativeRenderIndex = renderRuntimeApi.getDistDataNativeRenderIndex;
export const getNativeRendererForItem = renderRuntimeApi.getNativeRendererForItem;
export const getNativeShaderForItem = renderRuntimeApi.getNativeShaderForItem;
export const getNativeCaptureByAssetId = renderRuntimeApi.getNativeCaptureByAssetId;
export const getNativeCaptureByVariantKey = renderRuntimeApi.getNativeCaptureByVariantKey;
export const getNativeSpriteByIconName = renderRuntimeApi.getNativeSpriteByIconName;
export const getNativeRenderFactsForItem = renderRuntimeApi.getNativeRenderFactsForItem;

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
  rustRuntimeManifestRequest = null;
  cachedRustRuntimeManifest = null;
  recipeUiPayloadIndexRequest = null;
  cachedRecipeUiPayloadIndex = null;
  cachedRecipeUiPayloads.clear();
  cachedRecipeUiPayloadShards.clear();
  renderRuntimeApi.reset();
}



