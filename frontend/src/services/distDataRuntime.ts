import type {
  HomeBootstrapResponse,
  Item,
  Mod,
  RecipeBootstrapPayload,
  RecipeBootstrapCategoryGroupPayload,
  RecipeBootstrapMachineGroupPayload,
  RecipeUiPayload,
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
  indexedMachineInfo,
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
  buildBrowserByIdsPack,
  buildBrowserGroupItems,
  buildBrowserPagePack,
  buildCatalogByModId,
  buildDefaultCatalog,
  buildGroup,
  buildModsFromRuntime,
  buildSearchCatalog,
  buildSortedSearchEntries,
  paginate,
  stableNumber,
  toItem,
  type DistDataBrowserItem,
  type DistDataBrowserRuntime,
  type DistDataRawGroup,
} from "./distDataBrowserRuntime";
import { createDistDataRuntimeRenderApi } from "./distDataRuntimeRender";
import {
  RUNTIME_PACK_CONTRACTS,
  resolveNativePackPath,
  resolvePackValidationReportPath,
  validatePackAbiReport,
  type PackValidationReport,
  type RuntimePackContract,
} from "./distDataRuntimePackAbi";
import {
  registerRuntimeArtifactContentHashes,
  setRuntimeArtifactManifestIdentity,
} from "./runtimeArtifactClient.ts";
export {
  resolveDistDataAssetPath,
  resolveDistDataNativeRuntimeManifestPath,
} from "./distDataRuntimeAssetResolver";

type BrowserCatalogMode = "default" | "advanced";

type DistDataRecipeItemIndexEntry = {
  itemId: string;
  producedBy?: Array<{ recipeId?: string; categoryId?: string; displayName?: string }>;
  usedIn?: Array<{ recipeId?: string; categoryId?: string; displayName?: string }>;
};


type DistDataRustRecipeCategoryEntry = {
  categoryId?: string;
  recipeCount?: number;
  displayName?: string;
  sourceCategoryIds?: string[];
  handler?: Record<string, unknown> | null;
  nativeLayout?: Record<string, unknown> | null;
  machineIcon?: {
    itemId?: string | null;
    renderAssetRef?: string | null;
    imageFileName?: string | null;
  } | null;
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
  captureKey?: string;
  recipeType?: string;
  machineType?: string;
};


type DistDataRecipeUiPayloadShard = {
  schemaVersion?: string;
  payloads?: Record<string, RecipeUiPayload>;
};

type DistDataRecipeItemRoleIndexEntry = {
  producedByItemIds: string[];
  usedInItemIds: string[];
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
let recipeItemRoleIndexRequest: Promise<Map<string, DistDataRecipeItemRoleIndexEntry> | null> | null = null;
let cachedRecipeItemRoleIndex: Map<string, DistDataRecipeItemRoleIndexEntry> | null = null;
let rustRecipePackRequest: Promise<DistDataRustRecipePackPayload | null> | null = null;
let cachedRustRecipePack: DistDataRustRecipePackPayload | null = null;
let rustRuntimeManifestRequest: Promise<DistDataRustRuntimeManifest | null> | null = null;
let cachedRustRuntimeManifest: DistDataRustRuntimeManifest | null = null;
let packValidationReportRequest: Promise<PackValidationReport | null> | null = null;
let cachedPackValidationReport: PackValidationReport | null = null;
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

async function getBrowserRuntime(): Promise<DistDataBrowserRuntime | null> {
  if (cachedBrowserRuntime) {
    return cachedBrowserRuntime;
  }
  if (browserRuntimeRequest) {
    return browserRuntimeRequest;
  }

  browserRuntimeRequest = (async () => {
    const manifest = await getDistDataManifest();
    if (!manifest) {
      return null;
    }
    const declaredNativeBrowserPath = await getDeclaredNativeBinaryPackPath(manifest, RUNTIME_PACK_CONTRACTS.browser);
    const declaredNativeGroupPath = await getDeclaredNativeBinaryPackPath(manifest, RUNTIME_PACK_CONTRACTS.groups);
    if (!declaredNativeBrowserPath || !declaredNativeGroupPath) {
      reportDistDataSchemaMismatch(
        manifest,
        declaredNativeBrowserPath ?? declaredNativeGroupPath ?? "rust/browser.bin",
        "Native browser runtime requires declared browser.bin and groups.bin artifacts",
        {
          declaredBrowserPath: declaredNativeBrowserPath,
          declaredGroupPath: declaredNativeGroupPath,
        },
      );
      return null;
    }

    const nativeBrowserPath = await assertNativeBinaryPackContract(manifest, RUNTIME_PACK_CONTRACTS.browser);
    const nativeGroupPath = await assertNativeBinaryPackContract(manifest, RUNTIME_PACK_CONTRACTS.groups);
    if (!nativeBrowserPath || !nativeGroupPath) {
      reportDistDataSchemaMismatch(
        manifest,
        declaredNativeBrowserPath,
        "Native browser runtime requires ABI-approved browser.bin and groups.bin artifacts",
        {
          declaredBrowserPath: declaredNativeBrowserPath,
          declaredGroupPath: declaredNativeGroupPath,
          approvedBrowserPath: nativeBrowserPath,
          approvedGroupPath: nativeGroupPath,
        },
      );
      return null;
    }

    let nativeBrowserPack: { items: DistDataBrowserItem[] } | null = null;
    let nativeGroups: DistDataRawGroup[] | null = null;
    try {
      const [browserBuffer, groupBuffer] = await Promise.all([
        fetchDistDataArrayBuffer(joinDistDataAssetPath(getDistDataBasePath(), nativeBrowserPath)),
        fetchDistDataArrayBuffer(joinDistDataAssetPath(getDistDataBasePath(), nativeGroupPath)),
      ]);
      nativeBrowserPack = parseNativeBrowserPackPayload(
        parseNativeBinaryPackEnvelope(browserBuffer, RUNTIME_PACK_CONTRACTS.browser.schema).payload,
      );
      nativeGroups = parseNativeGroupPackPayload(
        parseNativeBinaryPackEnvelope(groupBuffer, RUNTIME_PACK_CONTRACTS.groups.schema).payload,
      );
    } catch (error) {
      reportDistDataSchemaMismatch(manifest, nativeBrowserPath, "Native browser binary packs failed to parse", {
        error: error instanceof Error ? error.message : `${error}`,
        browserPath: nativeBrowserPath,
        groupPath: nativeGroupPath,
      });
      return null;
    }

    const searchPack = await getDistDataSearchPack();
    const canUseNativeBrowserPack = Boolean(nativeBrowserPack?.items.some((entry) => entry?.itemId));
    if (!canUseNativeBrowserPack) {
      reportDistDataSchemaMismatch(manifest, nativeBrowserPath, "Native browser.bin is missing usable items[]", {
        schemaVersion: RUNTIME_PACK_CONTRACTS.browser.schema,
      });
      return null;
    }
    if (!Array.isArray(nativeGroups)) {
      reportDistDataSchemaMismatch(manifest, nativeGroupPath, "Native groups.bin is missing usable groups[]", {
        schemaVersion: RUNTIME_PACK_CONTRACTS.groups.schema,
      });
      return null;
    }

    const catalog = nativeBrowserPack.items.filter((entry) => entry?.itemId);
    const hiddenCatalog: DistDataBrowserItem[] = [];
    const advancedCatalog = [...catalog, ...hiddenCatalog].sort((left, right) => stableNumber(left.browserOrder, 0) - stableNumber(right.browserOrder, 0) || `${left.itemId}`.localeCompare(`${right.itemId}`));
    const hiddenItemIds = new Set(hiddenCatalog.map((entry) => entry.itemId).filter(Boolean));
    const groups = nativeGroups.filter((entry) => entry?.groupKey);
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

    const runtime: DistDataBrowserRuntime = {
      catalog,
      advancedCatalog,
      hiddenItemIds,
      groups,
      catalogByModId: buildCatalogByModId(catalog, itemById),
      advancedCatalogByModId: buildCatalogByModId(advancedCatalog, itemById),
      itemById,
      catalogEntryByItemId,
      searchEntryByItemId,
      memberItemsByGroupKey,
      groupByKey,
      defaultCatalogByScope: new Map(),
      searchCatalogByScope: new Map(),
      pagePackByScope: new Map(),
      byIdsPackByScope: new Map(),
      groupItemsByScope: new Map(),
      sortedSearchEntries: buildSortedSearchEntries(searchPack?.pack.items ?? []),
      mods: [],
    };
    runtime.mods = buildModsFromRuntime(runtime);
    cachedBrowserRuntime = runtime;
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

  manifestRequest = fetchDistDataJson<DistDataManifest>(
    joinDistDataAssetPath(getDistDataBasePath(), "manifest.json"),
    { persistent: false, memory: false },
  )
    .then(async (manifest) => {
      const manifestIdentity = `${
        manifest.runtimeCacheKey ?? manifest.sourceSignature ?? buildRuntimeCacheKey(manifest)
      }`;
      setRuntimeArtifactManifestIdentity(manifestIdentity);
      const integrityPath = `${manifest.files?.rustIntegrity ?? ''}`.trim();
      if (integrityPath) {
        const integrity = await fetchDistDataJson<{ files?: Record<string, string> }>(
          joinDistDataAssetPath(getDistDataBasePath(), integrityPath),
          { persistent: false, memory: false },
        ).catch(() => null);
        if (integrity?.files) {
          registerRuntimeArtifactContentHashes(manifestIdentity, integrity.files);
        }
      }
      return manifest;
    })
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
    if (!manifest) {
      return null;
    }
    const declaredBinarySearchPath = await getDeclaredNativeBinaryPackPath(manifest, RUNTIME_PACK_CONTRACTS.search);
    if (!declaredBinarySearchPath) {
      reportDistDataSchemaMismatch(
        manifest,
        "rust/search.bin",
        "Native search runtime requires declared search.bin artifact",
      );
      return null;
    }

    const binarySearchPath = await assertNativeBinaryPackContract(manifest, RUNTIME_PACK_CONTRACTS.search);
    if (!binarySearchPath) {
      reportDistDataSchemaMismatch(
        manifest,
        declaredBinarySearchPath,
        "Native search runtime requires an ABI-approved search.bin artifact",
      );
      return null;
    }

    try {
      const buffer = await fetchDistDataArrayBuffer(joinDistDataAssetPath(getDistDataBasePath(), binarySearchPath));
      const binaryPack = parseNativeSearchPackPayload(
        buildRuntimeCacheKey(manifest),
        parseNativeBinaryPackEnvelope(buffer, RUNTIME_PACK_CONTRACTS.search.schema).payload,
      );
      if (!binaryPack.items.length) {
        reportDistDataSchemaMismatch(manifest, binarySearchPath, "Rust binary search pack is missing usable items[]", {
          schemaVersion: RUNTIME_PACK_CONTRACTS.search.schema,
        });
        return null;
      }
      cachedSearchPack = {
        manifest,
        runtimeCacheKey: buildRuntimeCacheKey(manifest),
        pack: binaryPack,
      };
      return cachedSearchPack;
    } catch (error) {
      reportDistDataSchemaMismatch(manifest, binarySearchPath, "Rust binary search pack is not readable", {
        message: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
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
  const filtered = buildSearchCatalog(
    runtime,
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
    mods: runtime.mods,
    pagePack,
  };
}

export async function getDistDataMods(): Promise<Mod[] | null> {
  const runtime = await getBrowserRuntime();
  if (!runtime) {
    return null;
  }
  return runtime.mods;
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
  return buildBrowserPagePack(runtime, params);
}

export async function getDistDataBrowserPagePackByIds(itemIds: string[]): Promise<BrowserByIdsPackResponse | null> {
  const runtime = await getBrowserRuntime();
  if (!runtime) {
    return null;
  }
  return buildBrowserByIdsPack(runtime, itemIds);
}

export async function getDistDataGroupItems(groupKey: string, modId?: string, includeHidden = false): Promise<BrowserGroupItemsResponse | null> {
  const runtime = await getBrowserRuntime();
  if (!runtime) {
    return null;
  }
  return buildBrowserGroupItems(runtime, groupKey, modId, includeHidden);
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

async function getPackValidationReport(
  manifest: DistDataManifest,
  runtimeManifest: DistDataRustRuntimeManifest | null,
): Promise<PackValidationReport | null> {
  if (cachedPackValidationReport) {
    return cachedPackValidationReport;
  }
  if (packValidationReportRequest) {
    return packValidationReportRequest;
  }

  const reportPath = resolvePackValidationReportPath(runtimeManifest);
  if (!reportPath) {
    reportDistDataSchemaMismatch(manifest, "rust/pack-validation-report.json", "Pack ABI validation report is not declared by runtime manifest");
    return null;
  }

  packValidationReportRequest = fetchDistDataJson<PackValidationReport>(joinDistDataAssetPath(getDistDataBasePath(), reportPath))
    .then((payload) => {
      if (!payload || typeof payload !== "object") {
        reportDistDataSchemaMismatch(manifest, reportPath, "Pack ABI validation report is missing or invalid");
        return null;
      }
      cachedPackValidationReport = payload;
      return cachedPackValidationReport;
    })
    .catch((error) => {
      reportDistDataSchemaMismatch(manifest, reportPath, "Pack ABI validation report is not readable", {
        error: error instanceof Error ? error.message : `${error}`,
      });
      return null;
    })
    .finally(() => {
      packValidationReportRequest = null;
    });
  return packValidationReportRequest;
}

async function assertNativeBinaryPackContract(
  manifest: DistDataManifest,
  contract: RuntimePackContract,
): Promise<string | null> {
  const runtimeManifest = await getRustRuntimeManifest();
  const binaryPath = resolveNativePackPath(runtimeManifest, contract);
  if (!binaryPath) {
    return null;
  }
  const report = await getPackValidationReport(manifest, runtimeManifest);
  if (!report) {
    return null;
  }
  const validation = validatePackAbiReport(report, contract, binaryPath);
  if (!validation.ok) {
    const reportPath = resolvePackValidationReportPath(runtimeManifest);
    reportDistDataSchemaMismatch(manifest, binaryPath, `${contract.description} is not allowed by pack ABI validation report`, {
      reportPath,
      violations: validation.violations,
    });
    return null;
  }
  return binaryPath;
}

async function getDeclaredNativeBinaryPackPath(
  manifest: DistDataManifest,
  contract: RuntimePackContract,
): Promise<string | null> {
  const runtimeManifest = await getRustRuntimeManifest();
  return resolveNativePackPath(runtimeManifest, contract);
}

async function getRequiredNativeBinaryPackPath(
  manifest: DistDataManifest,
  contract: RuntimePackContract,
): Promise<string | null> {
  const declaredPath = await getDeclaredNativeBinaryPackPath(manifest, contract);
  if (!declaredPath) {
    return null;
  }
  const approvedPath = await assertNativeBinaryPackContract(manifest, contract);
  if (!approvedPath) {
    throw new Error(`${contract.description} is declared but not approved by pack ABI validation report`);
  }
  return approvedPath;
}

async function getRustRecipeBinaryPath(manifest: DistDataManifest): Promise<string | null> {
  return getRequiredNativeBinaryPackPath(manifest, RUNTIME_PACK_CONTRACTS.recipes);
}

async function getRustTextureBinaryPath(manifest: DistDataManifest): Promise<string | null> {
  return getRequiredNativeBinaryPackPath(manifest, RUNTIME_PACK_CONTRACTS.textures);
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
    let payload: DistDataRustRecipePackPayload | null = null;
    try {
      const buffer = await fetchDistDataArrayBuffer(joinDistDataAssetPath(getDistDataBasePath(), recipeBinaryPath));
      const envelope = parseNativeBinaryPackEnvelope(buffer, RUNTIME_PACK_CONTRACTS.recipes.schema);
      payload = parseCompactRecipePayload(envelope.payload);
    } catch (error) {
      reportDistDataSchemaMismatch(manifest, recipeBinaryPath, "Binary recipes.bin failed to parse", {
        error: error instanceof Error ? error.message : `${error}`,
      });
      return null;
    }
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
          reportDistDataSchemaMismatch(manifest, `${manifest.files?.rustRuntimeManifest ?? "rust/runtime-manifest.json"}`, "Binary recipes.bin failed to parse", {
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
    const rustRecipePack = await getRustRecipePack();
    const rustEntries = Array.isArray(rustRecipePack?.itemIndex)
      ? rustRecipePack.itemIndex.filter((entry) => entry?.itemId)
      : [];
    if (!rustEntries.length) {
      return null;
    }
    cachedRecipeItemIndex = new Map(rustEntries.map((entry) => [entry.itemId, entry]));
    return cachedRecipeItemIndex;
  })()
    .catch(() => null)
    .finally(() => {
      recipeItemIndexRequest = null;
    });

  return recipeItemIndexRequest;
}

function getOrCreateRecipeItemRoleIndexEntry(
  index: Map<string, DistDataRecipeItemRoleIndexEntry>,
  recipeId: string,
): DistDataRecipeItemRoleIndexEntry {
  let entry = index.get(recipeId);
  if (!entry) {
    entry = { producedByItemIds: [], usedInItemIds: [] };
    index.set(recipeId, entry);
  }
  return entry;
}

function appendUniqueItemId(target: string[], itemId: string): void {
  if (itemId && !target.includes(itemId)) {
    target.push(itemId);
  }
}

async function getRecipeItemRoleIndex(): Promise<Map<string, DistDataRecipeItemRoleIndexEntry> | null> {
  if (cachedRecipeItemRoleIndex) {
    return cachedRecipeItemRoleIndex;
  }
  if (recipeItemRoleIndexRequest) {
    return recipeItemRoleIndexRequest;
  }

  recipeItemRoleIndexRequest = (async () => {
    const recipeItemIndex = await getRecipeItemIndex();
    if (!recipeItemIndex?.size) {
      return null;
    }

    const roleIndex = new Map<string, DistDataRecipeItemRoleIndexEntry>();
    for (const entry of recipeItemIndex.values()) {
      const itemId = `${entry.itemId ?? ""}`.trim();
      if (!itemId) {
        continue;
      }
      for (const producedBy of entry.producedBy ?? []) {
        const recipeId = `${producedBy?.recipeId ?? ""}`.trim();
        if (recipeId) {
          appendUniqueItemId(getOrCreateRecipeItemRoleIndexEntry(roleIndex, recipeId).producedByItemIds, itemId);
        }
      }
      for (const usedIn of entry.usedIn ?? []) {
        const recipeId = `${usedIn?.recipeId ?? ""}`.trim();
        if (recipeId) {
          appendUniqueItemId(getOrCreateRecipeItemRoleIndexEntry(roleIndex, recipeId).usedInItemIds, itemId);
        }
      }
    }

    cachedRecipeItemRoleIndex = roleIndex;
    return cachedRecipeItemRoleIndex;
  })()
    .catch(() => null)
    .finally(() => {
      recipeItemRoleIndexRequest = null;
    });

  return recipeItemRoleIndexRequest;
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
  runtime?: DistDataBrowserRuntime,
) {
  const byCategory = new Map<string, { name: string; recipeCount: number; machineIcon: indexedMachineInfo["machineIcon"] | null }>();
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
      machineIcon: runtime ? toIndexedMachineIconFromRaw(category?.machineIcon, runtime) : null,
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
      machineIcon: summary.machineIcon,
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

function normalizeMachineIconItemId(value: unknown): string {
  const raw = `${value ?? ""}`.trim();
  if (!raw) return "";
  if (raw.startsWith("nesqlpp:item/")) return normalizeMachineIconItemId(raw.slice("nesqlpp:item/".length));
  if (raw.startsWith("item:")) return normalizeMachineIconItemId(raw.slice("item:".length));
  if (raw.startsWith("i~")) return raw;
  const parts = raw.split(":");
  if (parts.length >= 2 && parts[0] && parts[1]) {
    return `i~${parts[0]}~${parts[1]}~${parts[2] || "0"}`;
  }
  return "";
}

function buildIndexedMachineIcon(
  itemId: string,
  runtime: DistDataBrowserRuntime,
  extras?: { renderAssetRef?: string | null; imageFileName?: string | null },
): indexedMachineInfo["machineIcon"] | null {
  const normalizedItemId = normalizeMachineIconItemId(itemId);
  if (!normalizedItemId) return null;
  const item = runtime.itemById.get(normalizedItemId);
  if (!item && !extras?.renderAssetRef && !extras?.imageFileName) return null;
  return {
    itemId: item?.itemId ?? normalizedItemId,
    modId: item?.modId ?? "unknown",
    internalName: item?.internalName ?? normalizedItemId,
    localizedName: item?.localizedName ?? normalizedItemId,
    renderAssetRef: extras?.renderAssetRef ?? item?.renderAssetRef ?? null,
    renderHint: item?.renderHint ?? null,
    imageFileName: extras?.imageFileName ?? item?.imageFileName ?? "",
  };
}

function toIndexedMachineIcon(itemId: string, runtime: DistDataBrowserRuntime) {
  return buildIndexedMachineIcon(itemId, runtime);
}

function toIndexedMachineIconFromRaw(raw: unknown, runtime: DistDataBrowserRuntime): indexedMachineInfo["machineIcon"] | null {
  if (!raw || typeof raw !== "object") {
    return buildIndexedMachineIcon(`${raw ?? ""}`, runtime);
  }
  const icon = raw as Record<string, unknown>;
  const renderAssetRef = `${icon.renderAssetRef ?? ""}`.trim();
  const imageFileName = `${icon.imageFileName ?? ""}`.trim();
  const itemId =
    normalizeMachineIconItemId(icon.itemId)
    || normalizeMachineIconItemId(renderAssetRef)
    || normalizeMachineIconItemId(icon.internalName);
  return buildIndexedMachineIcon(itemId, runtime, { renderAssetRef, imageFileName });
}

function stableSlotDimension(value: unknown, defaultValue: number): number {
  const parsed = Math.floor(Number(value));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultValue;
}

function buildIndexedRecipeFromUiPayload(
  payload: RecipeUiPayload,
  runtime: DistDataBrowserRuntime,
  itemRoleIndex?: DistDataRecipeItemRoleIndexEntry | null,
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
  const handlerMachineIcon =
    toIndexedMachineIconFromRaw(payloadMachineInfo.machineIcon, runtime)
    || toIndexedMachineIconFromRaw((payload as Record<string, unknown>).machineIcon, runtime)
    || toIndexedMachineIconFromRaw((handler as Record<string, unknown>).machineIcon, runtime)
    || toIndexedMachineIcon(handlerMachineItemId, runtime);

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
  const indexedInputItemIds = itemRoleIndex?.usedInItemIds ?? [];
  const indexedOutputItemIds = itemRoleIndex?.producedByItemIds ?? [];
  const resolvedInputItemIds = inputItemIds.length > 0 ? inputItemIds : indexedInputItemIds;
  const resolvedOutputItemIds = outputItemIds.length > 0 ? outputItemIds : indexedOutputItemIds;

  const inputs = resolvedInputItemIds.map((itemId, index) => ({
    slotIndex: index,
    items: [toRecipeItemStack(itemId, runtime, 1)],
    isOreDictionary: false,
    oreDictName: null,
  }));
  const outputs = resolvedOutputItemIds.map((itemId) => toRecipeItemStack(itemId, runtime, 1));
  const payloadRecipeType = `${payload.recipeType ?? "unknown"}`;
  const payloadMachineType = `${payload.machineType ?? payloadRecipeType}`;

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
      ...(handlerMachineIcon ? { machineIcon: handlerMachineIcon } : {}),
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
  const [runtime, recipeItemRoleIndex] = await Promise.all([getBrowserRuntime(), getRecipeItemRoleIndex()]);
  if (!runtime || recipeIds.length <= 0) {
    return [];
  }
  const payloads = await Promise.all(recipeIds.map((recipeId) => getDistDataRecipeUiPayload(recipeId)));
  return payloads
    .map((payload) => (payload ? buildIndexedRecipeFromUiPayload(payload, runtime, recipeItemRoleIndex?.get(payload.recipeId)) : null))
    .filter((recipe): recipe is indexedRecipe => Boolean(recipe));
}

export async function getDistDataRecipeById(recipeId: string): Promise<indexedRecipe | null> {
  const normalizedRecipeId = `${recipeId ?? ""}`.trim();
  if (!normalizedRecipeId) return null;
  const [runtime, recipeItemRoleIndex, payload] = await Promise.all([
    getBrowserRuntime(),
    getRecipeItemRoleIndex(),
    getDistDataRecipeUiPayload(normalizedRecipeId),
  ]);
  if (!runtime || !payload) return null;
  return buildIndexedRecipeFromUiPayload(payload, runtime, recipeItemRoleIndex?.get(normalizedRecipeId));
}

function resolveRecipeBrowserItem(runtime: DistDataBrowserRuntime, itemId: string): Item | null {
  const exact = runtime.itemById.get(itemId);
  if (exact) return exact;
  const baseIdentity = itemId.split("~").slice(0, 4).join("~");
  if (!baseIdentity || baseIdentity === itemId) return null;
  const representative = Array.from(runtime.itemById.values()).find((item) =>
    item.itemId === baseIdentity || item.itemId.startsWith(`${baseIdentity}~`),
  );
  if (!representative) return null;
  return {
    ...representative,
    itemId,
    publicItemId: itemId,
    renderAssetRef: `nesqlpp:item/${itemId}`,
  };
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
  const item = runtime ? resolveRecipeBrowserItem(runtime, normalizedItemId) : null;
  if (!item) {
    return null;
  }

  const producedByRecipes = collectRecipeIds(indexEntry?.producedBy);
  const usedInRecipes = collectRecipeIds(indexEntry?.usedIn);
  const categoryLookup = buildCategoryLookup(rustRecipePack);
  const producedByCategoryGroups = buildCategorySummaries(indexEntry?.producedBy, categoryLookup, runtime);
  const usedInCategoryGroups = buildCategorySummaries(indexEntry?.usedIn, categoryLookup, runtime);
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
    const rustRecipePack = await getRustRecipePack();
    const rustEntries = Array.isArray(rustRecipePack?.uiPayloadIndex)
      ? rustRecipePack.uiPayloadIndex.filter((entry) => entry?.recipeId && entry?.path)
      : [];
    if (!rustEntries.length) {
      return null;
    }
    cachedRecipeUiPayloadIndex = new Map(rustEntries.map((entry) => [
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
  const payloadPath = entry ? normalizeRecipeUiPayloadPath(entry.path) : "";
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
  recipeItemRoleIndexRequest = null;
  cachedRecipeItemRoleIndex = null;
  rustRecipePackRequest = null;
  cachedRustRecipePack = null;
  rustRuntimeManifestRequest = null;
  cachedRustRuntimeManifest = null;
  packValidationReportRequest = null;
  cachedPackValidationReport = null;
  recipeUiPayloadIndexRequest = null;
  cachedRecipeUiPayloadIndex = null;
  cachedRecipeUiPayloads.clear();
  cachedRecipeUiPayloadShards.clear();
  renderRuntimeApi.reset();
}
