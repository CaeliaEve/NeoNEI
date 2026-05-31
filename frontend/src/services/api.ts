import { BACKEND_BASE_URL } from './api/core/http';
import { createPublishedJsonClient, getHomeBootstrapCompat } from '../runtime/publishClient';
import { createRuntimeManifestClient, getRuntimeCacheSignature } from '../runtime/manifestClient';
import type {
  AnimatedAtlasAssetEntry,
  BrowserAtlasIndexResponse,
  BrowserByIdsPackResponse,
  BrowserDefaultCatalogResponse,
  BrowserGridEntry,
  BrowserGroupItemsResponse,
  BrowserPagePackResponse,
  BrowserPageResourceManifest,
  BrowserSearchCatalogResponse,
  BrowserSearchPackEntry,
  BrowserSearchPackResponse,
  DimensionDTO,
  EcosystemOverview,
  Fluid,
  FluidGroup,
  FluidStack,
  ForestryGeneticsOverview,
  GTDiagramsOverview,
  GregTechMetadata,
  HomeBootstrapResponse,
  Item,
  ItemSearchBasic,
  Mod,
  PageAtlasResult,
  PageRichMediaManifest,
  PaginatedResponse,
  Pattern,
  PatternExportData,
  PatternGroup,
  PatternGroupWithPatterns,
  PatternWithDetails,
  PublicRuntimeManifest,
  PublishedRecipeBootstrapSearchPack,
  PublishBundleWindowPathEntry,
  RecipeBootstrapCategoryGroupPayload,
  RecipeBootstrapMachineGroupPayload,
  RecipeBootstrapPayload,
  RecipeBootstrapSearchPayload,
  RecipeInputCell,
  RecipeInputRow,
  RecipeItem,
  RecipeTypeDTO,
  RecipeUiPayload,
  RecipeVariantGroup,
  RenderContractAssetEntry,
  SearchItemsFastOptions,
  MultiblockBlueprint,
  indexedItem,
  indexedItemGroup,
  indexedItemMachinesResponse,
  indexedItemRecipeSummaryResponse,
  indexedItemStack,
  indexedMachineGroupSummary,
  indexedMachineInfo,
  indexedMachineOption,
  indexedRecipe,
  indexedRecipeCategorySummary,
  indexedRecipeMetadata,
} from '../runtime/types';
import { browserRuntimeClient } from '../runtime/browserClient';
import { searchRuntimeClient } from '../runtime/searchClient';
import {
  getStoredRuntimeSignature,
  primeRuntimeCacheSignature,
  readPersistentRuntimeCache,
  writePersistentRuntimeCache,
} from './persistentRuntimeCache';
import {
  reportMissingRuntimePayload,
  reportRuntimeContractGap,
  isStrictRuntimeContractsEnabled,
  setRuntimeDiagnosticIdentity,
} from '../runtime/diagnostics';
import { markPerfEvent } from './perfMarks';
import { canUsePublishedRecipeGroupIndex, canUsePublishedRecipeGroupWindow, canUsePublishedRecipeSearchPack, getRecipeBootstrapCategoryGroupCompat, getRecipeBootstrapCompat, getRecipeBootstrapProducedByGroupCompat, getRecipeBootstrapSearchCompat, getRecipeBootstrapShardCompat, getRecipeBootstrapUsedInGroupCompat, getRuntimeRecipeBootstrap, getRuntimeRecipeUiPayload, resolvePublishedRecipeGroupIndexPath, resolvePublishedRecipeGroupWindowPath, resolvePublishedRecipeSearchPath, resolveRuntimeRecipeBootstrapPath } from '../runtime/recipeClient';
import { createTextureRuntimeClient } from '../runtime/textureClient';
import { patternRuntimeClient, type CreatePatternPayload, type UpdatePatternPayload } from '../runtime/patternClient';
import { specialDataRuntimeClient } from '../runtime/specialDataClient';
import { renderContractRuntimeClient } from '../runtime/renderContractClient';
import { indexedRecipeRuntimeClient, type IndexedMachineRecipesResponse } from '../runtime/indexedRecipeClient';
import { itemRuntimeClient, type ItemMachinesResponse } from '../runtime/itemClient';
import { getDistDataHomeBootstrap } from './distDataRuntime';
import {
  browserEntryMatchesLocalSearch,
  buildBrowserByIdsPackCacheKey,
  buildPersistentBrowserPageKey,
  collectDisplayItemsFromBrowserEntries,
  deriveBrowserPagePackFromWindow,
  getBrowserDefaultCatalogCacheKey,
  getBrowserGroupItemsCacheKey,
  getBrowserSearchCatalogCacheKey,
  resolvePublishedWindowPath,
} from '../runtime/browserProjection';
import {
  mergeBrowserSearchPackEntries,
  searchBrowserSearchPackEntries,
} from '../runtime/browserSearchProjection';
import { buildRuntimePayloadCacheKey, setCacheWithLimit } from '../runtime/cacheUtils';
import { shouldPreferLiveRecipeBootstrap } from '../runtime/recipeBootstrapPreference';

export type {
  AnimatedAtlasAssetEntry,
  AnimatedAtlasFrameEntry,
  AnimatedAtlasTimelineEntry,
  BrowserAtlasAnimatedFrame,
  BrowserAtlasAnimatedPlacement,
  BrowserAtlasIndexResponse,
  BrowserAtlasItemEntry,
  BrowserAtlasStaticPlacement,
  BrowserByIdsPackResponse,
  BrowserDefaultCatalogResponse,
  BrowserGridEntry,
  BrowserGroupItemsResponse,
  BrowserPagePackResponse,
  BrowserPageResourceManifest,
  BrowserSearchCatalogResponse,
  BrowserSearchPackEntry,
  BrowserSearchPackResponse,
  BrowserVariantGroup,
  DimensionDTO,
  EcosystemLaneDetail,
  EcosystemLaneStatus,
  EcosystemOverview,
  Fluid,
  FluidGroup,
  FluidStack,
  ForestryGeneticsBranch,
  ForestryGeneticsItemDrop,
  ForestryGeneticsMutation,
  ForestryGeneticsOverview,
  ForestryGeneticsSpecies,
  GTCircuitLine,
  GTCircuitPartGroup,
  GTCircuitProgressionDocument,
  GTDiagramItemRef,
  GTDiagramsOverview,
  GTIndividualCircuit,
  GTMaterialFluidRef,
  GTMaterialPartRef,
  GTMaterialPartsDocument,
  GTMaterialPartsEntry,
  GregTechMetadata,
  HomeBootstrapResponse,
  Item,
  ItemRenderHint,
  ItemSearchBasic,
  Mod,
  PageAtlasResult,
  PageAtlasSpriteEntry,
  PageRichMediaManifest,
  PaginatedResponse,
  Pattern,
  PatternExportData,
  PatternGroup,
  PatternGroupWithPatterns,
  PatternWithDetails,
  PublicRuntimeManifest,
  PublishedRecipeBootstrapSearchEntry,
  PublishedRecipeBootstrapSearchPack,
  PublishBundleSearchShardPathEntry,
  PublishBundleWindowPathEntry,
  PublishStaticBundleManifest,
  Recipe,
  RecipeBootstrapCategoryGroupPayload,
  RecipeBootstrapMachineGroupPayload,
  RecipeBootstrapPayload,
  RecipeBootstrapSearchPayload,
  RecipeInputCell,
  RecipeInputRow,
  RecipeItem,
  RecipeTypeDTO,
  RecipeUiPayload,
  RecipeVariantGroup,
  RenderContractAssetEntry,
  SearchItemsFastOptions,
  MultiblockBlueprint,
  MultiblockDimensions,
  MultiblockVoxelBlueprint,
  MultiblockVoxelLegendEntry,
  indexedItem,
  indexedItemGroup,
  indexedItemMachinesResponse,
  indexedItemRecipeSummaryResponse,
  indexedItemStack,
  indexedMachineGroupSummary,
  indexedMachineInfo,
  indexedMachineOption,
  indexedRecipe,
  indexedRecipeCategorySummary,
  indexedRecipeMetadata,
} from '../runtime/types';

export { API_BASE_URL, BACKEND_BASE_URL } from './api/core/http';
export {
  getImageUrl,
  getImageUrlFromFileName,
  getImageUrlFromRenderAssetRef,
  getFluidImageUrl,
  getFluidImageUrlFromFluid,
  getItemImageUrlFromEntity,
  getPreferredStaticImageUrlFromEntity,
} from './api/images';

function getNow(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}

const indexedCraftingCache = new Map<string, indexedRecipe[]>();
const indexedUsageCache = new Map<string, indexedRecipe[]>();
const indexedSummaryCache = new Map<string, indexedItemRecipeSummaryResponse>();
const indexedCraftingInFlight = new Map<string, Promise<indexedRecipe[]>>();
const indexedUsageInFlight = new Map<string, Promise<indexedRecipe[]>>();
const indexedSummaryInFlight = new Map<string, Promise<indexedItemRecipeSummaryResponse>>();
const recipeBootstrapCache = new Map<string, RecipeBootstrapPayload>();
const recipeBootstrapInFlight = new Map<string, Promise<RecipeBootstrapPayload>>();
const recipeBootstrapShardCache = new Map<string, RecipeBootstrapPayload>();
const recipeBootstrapShardInFlight = new Map<string, Promise<RecipeBootstrapPayload>>();
const recipeBootstrapSearchPackCache = new Map<string, PublishedRecipeBootstrapSearchPack>();
const recipeBootstrapSearchPackInFlight = new Map<string, Promise<PublishedRecipeBootstrapSearchPack | null>>();
const browserSearchShardCache = new Map<string, BrowserSearchPackResponse>();
const browserSearchShardInFlight = new Map<string, Promise<BrowserSearchPackResponse | null>>();
const browserDefaultCatalogCache = new Map<string, BrowserDefaultCatalogResponse>();
const browserDefaultCatalogInFlight = new Map<string, Promise<BrowserDefaultCatalogResponse>>();
const browserSearchCatalogCache = new Map<string, BrowserSearchCatalogResponse>();
const browserSearchCatalogInFlight = new Map<string, Promise<BrowserSearchCatalogResponse>>();
const browserGroupItemsCache = new Map<string, BrowserGroupItemsResponse>();
const browserGroupItemsInFlight = new Map<string, Promise<BrowserGroupItemsResponse>>();
const browserByIdsPackCache = new Map<string, BrowserByIdsPackResponse>();
const browserByIdsPackInFlight = new Map<string, Promise<BrowserByIdsPackResponse>>();
const uiPayloadCache = new Map<string, RecipeUiPayload>();
const uiPayloadInFlight = new Map<string, Promise<RecipeUiPayload | null>>();
const missingUiPayloadCache = new Set<string>();
let browserAtlasIndexCache: BrowserAtlasIndexResponse | null = null;
let browserAtlasIndexInFlight: Promise<BrowserAtlasIndexResponse | null> | null = null;
const browserAtlasEntriesInFlight = new Map<string, Promise<BrowserAtlasIndexResponse | null>>();
const publishedJsonValueCache = new Map<string, unknown>();
const publishedJsonInFlight = new Map<string, Promise<unknown>>();
let publishManifestCache: PublicRuntimeManifest | null = null;
const runtimeManifestClient = createRuntimeManifestClient<PublicRuntimeManifest>({
  onManifest: (manifest) => {
    publishManifestCache = manifest;
    const runtimeCacheKey = getRuntimeCacheSignature(manifest);
    primeRuntimeCacheSignature(runtimeCacheKey);
    setRuntimeDiagnosticIdentity({
      sourceSignature: manifest.sourceSignature,
      runtimeCacheKey,
    });
  },
});

const CACHE_LIMITS = {
  indexedCrafting: 3000,
  indexedUsage: 3000,
  indexedSummary: 3000,
  recipeBootstrap: 512,
  recipeBootstrapShard: 512,
  recipeBootstrapSearchPack: 96,
  browserByIdsPack: 96,
  uiPayload: 256,
  publishedJson: 96,
} as const;

const PREFER_LIVE_RECIPE_BOOTSTRAP = shouldPreferLiveRecipeBootstrap();
const RECIPE_BOOTSTRAP_CACHE_SCHEMA = 'v3';

const STRICT_RUNTIME_V3 = isStrictRuntimeContractsEnabled();

function reportRuntimeDevCompatGap(
  scope: string,
  route: string,
  reason: string,
  context?: {
    itemId?: string | null;
    recipeId?: string | null;
    assetId?: string | null;
    path?: string | null;
    sourceSignature?: string | null;
    runtimeCacheKey?: string | null;
    details?: Record<string, unknown>;
  },
): void {
  reportRuntimeContractGap(scope, route, reason, {
    strict: STRICT_RUNTIME_V3,
    context,
  });
}

function getRuntimeDiagnosticIdentity(): {
  sourceSignature?: string | null;
  runtimeCacheKey?: string | null;
} {
  return {
    sourceSignature: publishManifestCache?.sourceSignature ?? null,
    runtimeCacheKey: getRuntimeCacheSignature(publishManifestCache) || getStoredRuntimeSignature(),
  };
}

function isHttpNotFoundError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const response = (error as { response?: { status?: number } }).response;
  return Number(response?.status ?? 0) === 404;
}

function withRecipeBootstrapCacheSchema<T extends Record<string, unknown>>(identity: T): T & { schema: string } {
  return {
    ...identity,
    schema: RECIPE_BOOTSTRAP_CACHE_SCHEMA,
  };
}

function isPublishedJsonWarm(assetPath: string | null | undefined): boolean {
  return publishedJsonClient.isWarm(assetPath);
}

async function fetchPublishedJson<T>(assetPath: string): Promise<T> {
  return publishedJsonClient.fetchJson<T>(assetPath);
}

async function resolveRuntimeSignature(): Promise<string | null> {
  const cached = getRuntimeCacheSignature(publishManifestCache);
  if (cached) {
    primeRuntimeCacheSignature(cached);
    return cached;
  }
  try {
    const manifest = await api.getPublishManifest();
    const signature = getRuntimeCacheSignature(manifest);
    if (signature) {
      primeRuntimeCacheSignature(signature);
    }
    return signature;
  } catch {
    return getStoredRuntimeSignature();
  }
}

async function readPersistentRuntimePayload<T>(
  kind: string,
  identity: Record<string, unknown>,
): Promise<T | null> {
  const signature = getRuntimeCacheSignature(publishManifestCache) || getStoredRuntimeSignature();
  if (!signature) {
    return null;
  }
  return readPersistentRuntimeCache<T>(buildRuntimePayloadCacheKey(kind, signature, identity));
}

function persistRuntimePayload(
  kind: string,
  identity: Record<string, unknown>,
  payload: unknown,
): void {
  void resolveRuntimeSignature()
    .then(async (signature) => {
      if (!signature) {
        return;
      }
      await writePersistentRuntimeCache(
        buildRuntimePayloadCacheKey(kind, signature, identity),
        payload,
      );
    })
    .catch(() => {
      // best-effort only
    });
}

const publishedJsonClient = createPublishedJsonClient({
  hasMemory: (url) => publishedJsonValueCache.has(url),
  getMemory: <T>(url: string) => publishedJsonValueCache.get(url) as T | undefined,
  setMemory: (url, payload) => setCacheWithLimit(publishedJsonValueCache, url, payload, CACHE_LIMITS.publishedJson),
  getInFlight: <T>(url: string) => publishedJsonInFlight.get(url) as Promise<T> | undefined,
  setInFlight: (url, request) => publishedJsonInFlight.set(url, request),
  deleteInFlight: (url) => publishedJsonInFlight.delete(url),
  readPersistent: <T>(url: string) => readPersistentRuntimePayload<T>('published-json', { url }),
  writePersistent: (url, payload) => persistRuntimePayload('published-json', { url }, payload),
});

const textureRuntimeClient = createTextureRuntimeClient({
  getCachedAtlasIndex: () => browserAtlasIndexCache,
  setCachedAtlasIndex: (index) => {
    browserAtlasIndexCache = index;
  },
  getAtlasIndexInFlight: () => browserAtlasIndexInFlight,
  setAtlasIndexInFlight: (request) => {
    browserAtlasIndexInFlight = request;
  },
  getAtlasEntriesInFlight: (key) => browserAtlasEntriesInFlight.get(key),
  setAtlasEntriesInFlight: (key, request) => browserAtlasEntriesInFlight.set(key, request),
  deleteAtlasEntriesInFlight: (key) => browserAtlasEntriesInFlight.delete(key),
  getDiagnosticIdentity: getRuntimeDiagnosticIdentity,
});

type PersistentBrowserPageCacheRecord = {
  data: BrowserGridEntry[];
  items: Item[];
  atlas: PageAtlasResult | null;
  mediaManifest?: PageRichMediaManifest | null;
  resourceManifest?: BrowserPageResourceManifest;
  total: number;
  totalPages: number;
  page: number;
};

function resolvePublishedRecipeBootstrapPath(
  manifest: PublicRuntimeManifest | null | undefined,
  itemId: string,
  kind: 'bootstrap' | 'shard',
): string | null {
  const normalizedItemId = `${itemId ?? ''}`.trim();
  if (!normalizedItemId) {
    return null;
  }

  const bundle = manifest?.publishBundle;
  const publishedItems = Array.isArray(bundle?.files.recipeBootstrapItems)
    ? bundle?.files.recipeBootstrapItems
    : [];
  if (!publishedItems.includes(normalizedItemId)) {
    return null;
  }

  return resolveRuntimeRecipeBootstrapPath(
    kind === 'bootstrap' ? bundle?.files.recipeBootstrapBasePath : bundle?.files.recipeBootstrapShardBasePath,
    normalizedItemId,
  );
}

function resolvePublishedItemRecipeBundlePath(
  manifest: PublicRuntimeManifest | null | undefined,
  itemId: string,
): string | null {
  const normalizedItemId = `${itemId ?? ''}`.trim();
  if (!normalizedItemId) {
    return null;
  }

  const bundle = manifest?.publishBundle;
  const publishedItems = Array.isArray(bundle?.files.itemRecipeBundleItems)
    ? bundle?.files.itemRecipeBundleItems
    : [];
  const basePath = `${bundle?.files.itemRecipeBundleBasePath ?? ''}`.trim();
  if (!basePath || !publishedItems.includes(normalizedItemId)) {
    return null;
  }

  return `${basePath.replace(/\/+$/g, '')}/${encodeURIComponent(normalizedItemId)}.json`;
}

function unwrapPublishedItemRecipeBundle(value: unknown): RecipeBootstrapPayload | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const record = value as {
    bootstrap?: unknown;
    item?: unknown;
    producedBy?: unknown;
    usedIn?: unknown;
    firstPageRecipes?: {
      producedBy?: unknown;
      usedIn?: unknown;
    };
  };
  if (!record.bootstrap || typeof record.bootstrap !== 'object') {
    return null;
  }
  const bootstrap = record.bootstrap as RecipeBootstrapPayload;
  const producedByRecipeIds = Array.isArray(record.producedBy)
    ? record.producedBy.map((entry) => `${entry ?? ''}`.trim()).filter(Boolean)
    : bootstrap.recipeIndex?.producedByRecipes ?? [];
  const usedInRecipeIds = Array.isArray(record.usedIn)
    ? record.usedIn.map((entry) => `${entry ?? ''}`.trim()).filter(Boolean)
    : bootstrap.recipeIndex?.usedInRecipes ?? [];
  const bundledProducedBy = Array.isArray(record.firstPageRecipes?.producedBy)
    ? record.firstPageRecipes.producedBy as indexedRecipe[]
    : bootstrap.indexedCrafting ?? [];
  const bundledUsedIn = Array.isArray(record.firstPageRecipes?.usedIn)
    ? record.firstPageRecipes.usedIn as indexedRecipe[]
    : bootstrap.indexedUsage ?? [];
  return {
    ...bootstrap,
    item: (record.item && typeof record.item === 'object' ? record.item : bootstrap.item) as Item,
    recipeIndex: {
      producedByRecipes: producedByRecipeIds,
      usedInRecipes: usedInRecipeIds,
    },
    indexedCrafting: bundledProducedBy,
    indexedUsage: bundledUsedIn,
  };
}
type RecipeBootstrapLoadSource =
  | 'dist-data-v3'
  | 'memory-cache'
  | 'in-flight'
  | 'persistent-cache'
  | 'item-recipe-bundle'
  | 'legacy-static-bootstrap'
  | 'dev-compat-api';

function markRecipeBootstrapResolved(
  itemId: string,
  source: RecipeBootstrapLoadSource,
  startedAt: number,
  payload: RecipeBootstrapPayload | null | undefined,
): void {
  const recipeIndex = payload?.recipeIndex;
  const producedByCount = Array.isArray(recipeIndex?.producedByRecipes) ? recipeIndex.producedByRecipes.length : 0;
  const usedInCount = Array.isArray(recipeIndex?.usedInRecipes) ? recipeIndex.usedInRecipes.length : 0;
  markPerfEvent('recipe-bootstrap-resolved', {
    itemId,
    source,
    durationMs: Math.max(0, getNow() - startedAt),
    producedByCount,
    usedInCount,
    indexedCraftingCount: Array.isArray(payload?.indexedCrafting) ? payload.indexedCrafting.length : 0,
    indexedUsageCount: Array.isArray(payload?.indexedUsage) ? payload.indexedUsage.length : 0,
  });
}
function buildRecipeBootstrapSearchPackKey(itemId: string, tab: 'usedIn' | 'producedBy'): string {
  return `${`${itemId ?? ''}`.trim()}::${tab}`;
}

function searchPublishedRecipeBootstrapPack(
  pack: PublishedRecipeBootstrapSearchPack,
  query: string,
  itemMatches: ItemSearchBasic[],
): RecipeBootstrapSearchPayload {
  const normalizedQuery = query.trim();
  const lowerQuery = normalizedQuery.toLowerCase();
  const candidateItemIds = new Set<string>([
    ...itemMatches.map((item) => `${item.itemId ?? ''}`.trim()).filter(Boolean),
    ...(normalizedQuery.includes('~') ? [normalizedQuery] : []),
  ]);

  const recipeIds = pack.entries
    .filter((entry) => {
      if (lowerQuery.startsWith('type:')) {
        const typeQuery = lowerQuery.slice('type:'.length).trim();
        return !typeQuery || `${entry.machineType ?? ''}`.toLowerCase().includes(typeQuery);
      }

      if (lowerQuery && `${entry.searchText ?? ''}`.includes(lowerQuery)) {
        return true;
      }
      if (candidateItemIds.size <= 0) {
        return false;
      }
      return (entry.referencedItemIds ?? []).some((itemId) => candidateItemIds.has(`${itemId ?? ''}`.trim()));
    })
    .map((entry) => entry.recipeId);

  return {
    itemId: pack.itemId,
    tab: pack.tab,
    query: normalizedQuery,
    recipeIds,
    itemMatches: itemMatches.slice(0, 12),
  };
}

async function searchPublishedItemMatches(
  query: string,
  limit: number,
  options?: SearchItemsFastOptions,
): Promise<ItemSearchBasic[]> {
  const normalizedQuery = query.trim();
  if (!normalizedQuery || normalizedQuery.toLowerCase().startsWith('type:')) {
    return [];
  }

  const ensureNotAborted = () => {
    if (options?.signal?.aborted) {
      throw new DOMException('The operation was aborted.', 'AbortError');
    }
  };

  ensureNotAborted();
  const hotShard = await api.getBrowserSearchPackShard('hot');
  ensureNotAborted();

  const hotMatches = searchBrowserSearchPackEntries(hotShard?.items ?? [], normalizedQuery, limit);
  if (hotMatches.length >= limit) {
    return hotMatches;
  }

  const tailShard = await api.getBrowserSearchPackShard('tail');
  ensureNotAborted();
  const mergedEntries = mergeBrowserSearchPackEntries(hotShard?.items ?? [], tailShard?.items ?? []);
  const mergedMatches = searchBrowserSearchPackEntries(mergedEntries, normalizedQuery, limit);
  if (mergedMatches.length > 0 || mergedEntries.length > 0) {
    return mergedMatches;
  }

  const fullPack = await api.getBrowserSearchPack().catch(() => null);
  ensureNotAborted();
  return searchBrowserSearchPackEntries(fullPack?.items ?? [], normalizedQuery, limit);
}

async function getPublishedRecipeBootstrapSearchPack(
  itemId: string,
  tab: 'usedIn' | 'producedBy',
): Promise<PublishedRecipeBootstrapSearchPack | null> {
  if (PREFER_LIVE_RECIPE_BOOTSTRAP) {
    return null;
  }

  const normalizedItemId = `${itemId ?? ''}`.trim();
  if (!normalizedItemId) {
    return null;
  }

  const cacheKey = buildRecipeBootstrapSearchPackKey(normalizedItemId, tab);
  const cached = recipeBootstrapSearchPackCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const existingRequest = recipeBootstrapSearchPackInFlight.get(cacheKey);
  if (existingRequest) {
    return existingRequest;
  }

  const request = (async () => {
    const persistent = await readPersistentRuntimePayload<PublishedRecipeBootstrapSearchPack>(
      'recipe-bootstrap-search-pack',
      { itemId: normalizedItemId, tab },
    );
    if (persistent) {
      setCacheWithLimit(
        recipeBootstrapSearchPackCache,
        cacheKey,
        persistent,
        CACHE_LIMITS.recipeBootstrapSearchPack,
      );
      return persistent;
    }

    const manifest = await api.getPublishManifest();
    if (!canUsePublishedRecipeSearchPack(manifest, normalizedItemId)) {
      return null;
    }

    const staticPath = resolvePublishedRecipeSearchPath(manifest, normalizedItemId, tab);
    if (!staticPath) {
      return null;
    }

    try {
      const published = await fetchPublishedJson<PublishedRecipeBootstrapSearchPack>(staticPath);
      setCacheWithLimit(
        recipeBootstrapSearchPackCache,
        cacheKey,
        published,
        CACHE_LIMITS.recipeBootstrapSearchPack,
      );
      persistRuntimePayload('recipe-bootstrap-search-pack', { itemId: normalizedItemId, tab }, published);
      return published;
    } catch {
      return null;
    }
  })().finally(() => {
    recipeBootstrapSearchPackInFlight.delete(cacheKey);
  });

  recipeBootstrapSearchPackInFlight.set(cacheKey, request);
  return request;
}

export const api = {
  trimPreheatRuntimeCaches(): void {
    itemRuntimeClient.clearCaches();
    recipeBootstrapCache.clear();
    recipeBootstrapInFlight.clear();
    recipeBootstrapShardCache.clear();
    recipeBootstrapShardInFlight.clear();
    recipeBootstrapSearchPackCache.clear();
    recipeBootstrapSearchPackInFlight.clear();
    browserSearchShardCache.clear();
    browserSearchShardInFlight.clear();
    browserSearchCatalogCache.clear();
    browserSearchCatalogInFlight.clear();
    uiPayloadCache.clear();
    uiPayloadInFlight.clear();
    missingUiPayloadCache.clear();
    publishedJsonValueCache.clear();
    publishedJsonInFlight.clear();
  },

  resetRuntimeCaches(): void {
    itemRuntimeClient.clearCaches();
    indexedCraftingCache.clear();
    indexedUsageCache.clear();
    indexedSummaryCache.clear();
    indexedCraftingInFlight.clear();
    indexedUsageInFlight.clear();
    indexedSummaryInFlight.clear();
    recipeBootstrapCache.clear();
    recipeBootstrapInFlight.clear();
    recipeBootstrapShardCache.clear();
    recipeBootstrapShardInFlight.clear();
    recipeBootstrapSearchPackCache.clear();
    recipeBootstrapSearchPackInFlight.clear();
    browserSearchShardCache.clear();
    browserSearchShardInFlight.clear();
    browserSearchCatalogCache.clear();
    browserSearchCatalogInFlight.clear();
    uiPayloadCache.clear();
    uiPayloadInFlight.clear();
    missingUiPayloadCache.clear();
    publishedJsonValueCache.clear();
    publishedJsonInFlight.clear();
    publishManifestCache = null;
    runtimeManifestClient.clear();
    specialDataRuntimeClient.clear();
  },

  async getPublishManifest(): Promise<PublicRuntimeManifest> {
    return runtimeManifestClient.getPublishManifest();
  },

  async getHomeBootstrap(params: {
    page?: number;
    pageSize?: number;
    slotSize?: number;
    modId?: string;
  }): Promise<HomeBootstrapResponse> {
    const distDataBootstrap = await getDistDataHomeBootstrap(params);
    if (distDataBootstrap) {
      return distDataBootstrap;
    }
    reportRuntimeDevCompatGap('home-bootstrap', '/publish/home-bootstrap', 'dist-data home bootstrap missing', {
      ...getRuntimeDiagnosticIdentity(),
      details: params,
    });

    const manifest = await api.getPublishManifest();
    const requestedPage = Math.max(1, Math.floor(params.page ?? 1));
    const requestedPageSize = Math.max(1, Math.floor(params.pageSize ?? 50));
    const staticPath = !params.modId
      ? resolvePublishedWindowPath(
          manifest.publishBundle?.files.homeBootstrapWindows,
          params.slotSize,
          requestedPage,
          requestedPageSize,
          isPublishedJsonWarm,
        )
      : null;
    if (staticPath) {
      try {
        const published = await fetchPublishedJson<{
          mods: Mod[];
          pagePack: BrowserPagePackResponse;
        }>(staticPath);
        const pagePack = deriveBrowserPagePackFromWindow(
          published.pagePack,
          requestedPage,
          requestedPageSize,
        );
        if (pagePack) {
          if (Array.isArray(published.mods)) {
            persistRuntimePayload('mods-list', { scope: 'all' }, published.mods);
          }
          return {
            manifest,
            mods: Array.isArray(published.mods) ? published.mods : [],
            pagePack,
          };
        }
      } catch {
        // Fall back to the API route when the static publish bundle is unavailable.
      }
    }

    const response = { data: await getHomeBootstrapCompat(params) };
    if (response.data?.manifest) {
      publishManifestCache = response.data.manifest;
      primeRuntimeCacheSignature(getRuntimeCacheSignature(response.data.manifest));
    }
    if (Array.isArray(response.data?.mods)) {
      persistRuntimePayload('mods-list', { scope: 'all' }, response.data.mods);
    }
    return response.data;
  },

  // Get items with pagination
  async getItems(params: {
    page?: number;
    pageSize?: number;
    search?: string;
    modId?: string;
  }): Promise<PaginatedResponse<Item>> {
    return itemRuntimeClient.getItems(params);
  },

  async getBrowserItems(params: {
    page?: number;
    pageSize?: number;
    search?: string;
    modId?: string;
    expandedGroups?: string[];
  }): Promise<PaginatedResponse<BrowserGridEntry>> {
    const distDataPage = await browserRuntimeClient.getPagePack(params);
    if (distDataPage) {
      return {
        data: distDataPage.data,
        total: distDataPage.total,
        page: distDataPage.page,
        pageSize: distDataPage.pageSize,
        totalPages: distDataPage.totalPages,
      };
    }
    reportRuntimeDevCompatGap('browser-items', '/items/browser', 'dist-data browser page missing', {
      ...getRuntimeDiagnosticIdentity(),
      details: params,
    });

    return browserRuntimeClient.getItemsPageCompat(params);
  },

  async getBrowserDefaultCatalog(params?: {
    modId?: string;
  }): Promise<BrowserDefaultCatalogResponse> {
    const cacheKey = getBrowserDefaultCatalogCacheKey(params?.modId);
    const cached = browserDefaultCatalogCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const inflight = browserDefaultCatalogInFlight.get(cacheKey);
    if (inflight) {
      return inflight;
    }

    const request = (async () => {
      const distDataCatalog = await browserRuntimeClient.getDefaultCatalog(params?.modId);
      if (distDataCatalog) {
        browserDefaultCatalogCache.set(cacheKey, distDataCatalog);
        return distDataCatalog;
      }
      reportRuntimeDevCompatGap('browser-default-catalog', '/items/browser/default-catalog', 'dist-data default catalog missing', {
        ...getRuntimeDiagnosticIdentity(),
        details: params,
      });

      const persistent = await readPersistentRuntimePayload<BrowserDefaultCatalogResponse>(
        'browser-default-catalog',
        { scope: cacheKey },
      );
      if (persistent?.data?.length) {
        browserDefaultCatalogCache.set(cacheKey, persistent);
        return persistent;
      }

      const payload = await browserRuntimeClient.getDefaultCatalogCompat(params);
      browserDefaultCatalogCache.set(cacheKey, payload);
      persistRuntimePayload('browser-default-catalog', { scope: cacheKey }, payload);
      return payload;
    })().finally(() => {
      browserDefaultCatalogInFlight.delete(cacheKey);
    });

    browserDefaultCatalogInFlight.set(cacheKey, request);
    return request;
  },

  peekBrowserDefaultCatalog(modId?: string): BrowserDefaultCatalogResponse | null {
    return browserDefaultCatalogCache.get(getBrowserDefaultCatalogCacheKey(modId)) ?? null;
  },

  async getBrowserSearchCatalog(params: {
    search: string;
    modId?: string;
  }): Promise<BrowserSearchCatalogResponse> {
    const normalizedSearch = `${params.search ?? ''}`.trim();
    if (!normalizedSearch) {
      return api.getBrowserDefaultCatalog({ modId: params.modId });
    }

    const distDataCatalog = await browserRuntimeClient.getSearchCatalog(normalizedSearch, params.modId);
    if (distDataCatalog) {
      browserSearchCatalogCache.set(getBrowserSearchCatalogCacheKey(normalizedSearch, params.modId), distDataCatalog);
      return distDataCatalog;
    }
    reportRuntimeDevCompatGap('browser-search-catalog', 'local default-catalog projection', 'dist-data search catalog missing', {
      ...getRuntimeDiagnosticIdentity(),
      details: params,
    });

    const cacheKey = getBrowserSearchCatalogCacheKey(normalizedSearch, params.modId);
    const cached = browserSearchCatalogCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const inflight = browserSearchCatalogInFlight.get(cacheKey);
    if (inflight) {
      return inflight;
    }

    const request = (async () => {
      const defaultCatalog = browserDefaultCatalogCache.get(getBrowserDefaultCatalogCacheKey(params.modId));
      const filtered = (defaultCatalog?.data ?? [])
        .filter((entry) => browserEntryMatchesLocalSearch(entry, normalizedSearch));
      const result: BrowserSearchCatalogResponse = {
        data: filtered,
        total: filtered.length,
        page: 1,
        pageSize: filtered.length,
        totalPages: 1,
      };
      browserSearchCatalogCache.set(cacheKey, result);
      return result;
    })().finally(() => {
      browserSearchCatalogInFlight.delete(cacheKey);
    });

    browserSearchCatalogInFlight.set(cacheKey, request);
    return request;
  },

  peekBrowserSearchCatalog(search: string, modId?: string): BrowserSearchCatalogResponse | null {
    const normalizedSearch = `${search ?? ''}`.trim();
    if (!normalizedSearch) {
      return api.peekBrowserDefaultCatalog(modId);
    }
    return browserSearchCatalogCache.get(getBrowserSearchCatalogCacheKey(normalizedSearch, modId)) ?? null;
  },

  async getBrowserGroupItems(groupKey: string, modId?: string): Promise<BrowserGroupItemsResponse> {
    const normalizedGroupKey = `${groupKey ?? ''}`.trim();
    if (!normalizedGroupKey) {
      return {
        groupKey: '',
        total: 0,
        items: [],
      };
    }

    const distDataGroupItems = await browserRuntimeClient.getGroupItems(normalizedGroupKey, modId);
    if (distDataGroupItems?.items?.length) {
      return distDataGroupItems;
    }
    reportRuntimeDevCompatGap('browser-group-items', `/items/browser/group/${normalizedGroupKey}`, 'dist-data group items missing', {
      ...getRuntimeDiagnosticIdentity(),
      details: { groupKey: normalizedGroupKey, modId },
    });

    const cacheKey = getBrowserGroupItemsCacheKey(normalizedGroupKey, modId);
    const cached = browserGroupItemsCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const inflight = browserGroupItemsInFlight.get(cacheKey);
    if (inflight) {
      return inflight;
    }

    const request = (async () => {
      const persistent = await readPersistentRuntimePayload<BrowserGroupItemsResponse>(
        'browser-group-items',
        { groupKey: normalizedGroupKey, scope: getBrowserDefaultCatalogCacheKey(modId) },
      );
      if (persistent?.items?.length) {
        browserGroupItemsCache.set(cacheKey, persistent);
        return persistent;
      }

      const payload = await browserRuntimeClient.getGroupItemsCompat(normalizedGroupKey, modId);
      browserGroupItemsCache.set(cacheKey, payload);
      persistRuntimePayload(
        'browser-group-items',
        { groupKey: normalizedGroupKey, scope: getBrowserDefaultCatalogCacheKey(modId) },
        payload,
      );
      return payload;
    })().finally(() => {
      browserGroupItemsInFlight.delete(cacheKey);
    });

    browserGroupItemsInFlight.set(cacheKey, request);
    return request;
  },

  peekBrowserGroupItems(groupKey: string, modId?: string): BrowserGroupItemsResponse | null {
    const normalizedGroupKey = `${groupKey ?? ''}`.trim();
    if (!normalizedGroupKey) {
      return null;
    }
    return browserGroupItemsCache.get(getBrowserGroupItemsCacheKey(normalizedGroupKey, modId)) ?? null;
  },

  async getBrowserPagePack(params: {
    page?: number;
    pageSize?: number;
    search?: string;
    modId?: string;
    expandedGroups?: string[];
    slotSize?: number;
  }): Promise<BrowserPagePackResponse> {
    const distDataPagePack = await browserRuntimeClient.getPagePack(params);
    if (distDataPagePack) {
      return distDataPagePack;
    }
    reportRuntimeDevCompatGap('browser-page-pack', '/items/browser/page-pack', 'dist-data page pack missing', {
      ...getRuntimeDiagnosticIdentity(),
      details: params,
    });

    const normalizedExpandedGroups = params.expandedGroups ?? [];
    const canUseStaticBundle = !params.search?.trim()
      && !params.modId
      && normalizedExpandedGroups.length === 0;
    if (canUseStaticBundle) {
      const manifest = await api.getPublishManifest();
      const staticPath = resolvePublishedWindowPath(
        manifest.publishBundle?.files.browserPageWindows,
        params.slotSize,
        Math.max(1, Math.floor(params.page ?? 1)),
        Math.max(1, Math.floor(params.pageSize ?? 50)),
        isPublishedJsonWarm,
      );
      if (staticPath) {
        try {
          const published = await fetchPublishedJson<BrowserPagePackResponse>(staticPath);
          const derived = deriveBrowserPagePackFromWindow(
            published,
            Math.max(1, Math.floor(params.page ?? 1)),
            Math.max(1, Math.floor(params.pageSize ?? 50)),
          );
          if (derived) {
            return derived;
          }
        } catch {
          // Fall back to the API route when the static publish bundle is unavailable.
        }
      }
    }

    return browserRuntimeClient.getPagePackCompat(params);
  },

  async primeDefaultBrowserPagePack(params: {
    page: number;
    pageSize: number;
    slotSize?: number;
  }): Promise<BrowserPagePackResponse> {
    const normalized = {
      page: Math.max(1, Math.floor(params.page)),
      pageSize: Math.max(1, Math.floor(params.pageSize)),
      slotSize: params.slotSize,
    };
    const response = await api.getBrowserPagePack(normalized);
    const signature = await resolveRuntimeSignature();
    if (signature) {
      primeRuntimeCacheSignature(signature);
      const payload: PersistentBrowserPageCacheRecord = {
        data: response.data,
        items: collectDisplayItemsFromBrowserEntries(response.data),
        atlas: response.atlas ?? null,
        mediaManifest: response.mediaManifest ?? null,
        resourceManifest: response.resourceManifest,
        total: response.total,
        totalPages: response.totalPages,
        page: response.page,
      };
      await writePersistentRuntimeCache(
        buildPersistentBrowserPageKey(signature, normalized),
        payload,
      );
    }
    return response;
  },

  async getBrowserSearchPack(): Promise<BrowserSearchPackResponse> {
    const distDataSearch = await searchRuntimeClient.getSearchPack();
    if (distDataSearch?.items?.length) {
      return distDataSearch;
    }
    reportRuntimeDevCompatGap('browser-search-pack', '/items/search/pack', 'dist-data search pack missing', {
      ...getRuntimeDiagnosticIdentity(),
    });

    const manifest = await api.getPublishManifest();
    const staticPath = manifest.publishBundle?.files.browserSearchPack;
    if (staticPath) {
      try {
        return await fetchPublishedJson<BrowserSearchPackResponse>(staticPath);
      } catch {
        // Fall back to the API route when the static publish bundle is unavailable.
      }
    }
    return browserRuntimeClient.getSearchPackCompat();
  },

  async getBrowserSearchPackShard(shardId: string): Promise<BrowserSearchPackResponse | null> {
    const normalizedShardId = `${shardId ?? ''}`.trim();
    if (!normalizedShardId) {
      return null;
    }

    const distDataSearch = await searchRuntimeClient.getSearchPack();
    if (distDataSearch?.items?.length) {
      return distDataSearch;
    }
    reportRuntimeDevCompatGap('browser-search-shard', `publish search shard ${normalizedShardId}`, 'dist-data search pack missing', {
      ...getRuntimeDiagnosticIdentity(),
      details: { shardId: normalizedShardId },
    });

    const cached = browserSearchShardCache.get(normalizedShardId);
    if (cached) {
      return cached;
    }
    const inflight = browserSearchShardInFlight.get(normalizedShardId);
    if (inflight) {
      return inflight;
    }

    const request = (async () => {
      const manifest = await api.getPublishManifest();
      const shardPath = manifest.publishBundle?.files.browserSearchShards?.find(
        (entry) => entry.scope === 'all' && entry.shardId === normalizedShardId,
      )?.path;
      if (!shardPath) {
        return null;
      }

      try {
        const shard = await fetchPublishedJson<BrowserSearchPackResponse>(shardPath);
        browserSearchShardCache.set(normalizedShardId, shard);
        return shard;
      } catch {
        return null;
      }
    })().finally(() => {
      browserSearchShardInFlight.delete(normalizedShardId);
    });

    browserSearchShardInFlight.set(normalizedShardId, request);
    return request;
  },

  async getBrowserPagePackByIds(params: {
    itemIds: string[];
    slotSize?: number;
  }): Promise<BrowserByIdsPackResponse> {
    const normalizedParams = {
      itemIds: params.itemIds.map((itemId) => `${itemId ?? ''}`.trim()).filter(Boolean),
      slotSize: params.slotSize,
    };
    const cacheKey = buildBrowserByIdsPackCacheKey(normalizedParams);
    const cached = browserByIdsPackCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const inflight = browserByIdsPackInFlight.get(cacheKey);
    if (inflight) {
      return inflight;
    }

    const request = (async () => {
      const distDataPack = await browserRuntimeClient.getByIdsPack(normalizedParams.itemIds);
      if (distDataPack) {
        return distDataPack;
      }
      reportRuntimeDevCompatGap('browser-by-ids-pack', '/items/browser/by-ids-pack', 'dist-data by-id pack missing', {
        ...getRuntimeDiagnosticIdentity(),
        details: { itemIds: normalizedParams.itemIds, slotSize: normalizedParams.slotSize },
      });
      return browserRuntimeClient.getByIdsPackCompat(normalizedParams);
    })()
      .then((data) => {
        setCacheWithLimit(browserByIdsPackCache, cacheKey, data, CACHE_LIMITS.browserByIdsPack);
        return data;
      })
      .finally(() => {
        browserByIdsPackInFlight.delete(cacheKey);
      });

    browserByIdsPackInFlight.set(cacheKey, request);
    return request;
  },

  peekBrowserPagePackByIds(params: {
    itemIds: string[];
    slotSize?: number;
  }): BrowserByIdsPackResponse | null {
    const normalizedParams = {
      itemIds: params.itemIds.map((itemId) => `${itemId ?? ''}`.trim()).filter(Boolean),
      slotSize: params.slotSize,
    };
    return browserByIdsPackCache.get(buildBrowserByIdsPackCacheKey(normalizedParams)) ?? null;
  },

  // Get item by ID
  async getItem(itemId: string): Promise<Item> {
    return itemRuntimeClient.getItem(itemId);
  },

  // Get all mods
  async getMods(): Promise<Mod[]> {
    const persistent = await readPersistentRuntimePayload<Mod[]>(
      'mods-list',
      { scope: 'all' },
    );
    if (persistent) {
      return persistent;
    }

    const manifest = await api.getPublishManifest();
    const staticPath = manifest.publishBundle?.files.modsList;
    if (staticPath) {
      try {
        const published = await fetchPublishedJson<Mod[]>(staticPath);
        persistRuntimePayload('mods-list', { scope: 'all' }, published);
        return published;
      } catch {
        // Fall back to the API route when the static publish bundle is unavailable.
      }
    }

    const payload = await itemRuntimeClient.getModsCompat();
    persistRuntimePayload('mods-list', { scope: 'all' }, payload);
    return payload;
  },

  async getItemsByIds(itemIds: string[]): Promise<Item[]> {
    return itemRuntimeClient.getItemsByIds(itemIds);
  },

  // === indexed Recipe API (with machine icons) ===

  // Get machines for an item (indexed recipe API with machineIcon support)
  async getItemMachines(itemId: string): Promise<ItemMachinesResponse> {
    return itemRuntimeClient.getItemMachines(itemId);
  },

  // === Pattern Management ===

  // Get all pattern groups
  async getPatternGroups(): Promise<PatternGroup[]> {
    return patternRuntimeClient.getGroups();
  },

  // Get single pattern group
  async getPatternGroup(groupId: string): Promise<PatternGroup> {
    return patternRuntimeClient.getGroup(groupId);
  },

  // Get pattern group with patterns
  async getPatternGroupWithPatterns(groupId: string): Promise<PatternGroupWithPatterns> {
    return patternRuntimeClient.getGroupWithPatterns(groupId);
  },

  // Create pattern group
  async createPatternGroup(groupName: string, description?: string): Promise<PatternGroup> {
    return patternRuntimeClient.createGroup(groupName, description);
  },

  // Update pattern group
  async updatePatternGroup(groupId: string, groupName: string, description?: string): Promise<void> {
    await patternRuntimeClient.updateGroup(groupId, groupName, description);
  },

  // Delete pattern group
  async deletePatternGroup(groupId: string): Promise<void> {
    await patternRuntimeClient.deleteGroup(groupId);
  },

  // Create pattern
  async createPattern(data: CreatePatternPayload): Promise<Pattern> {
    return patternRuntimeClient.createPattern(data);
  },

  // Delete pattern
  async deletePattern(patternId: string): Promise<void> {
    await patternRuntimeClient.deletePattern(patternId);
  },

  // Update pattern
  async updatePattern(patternId: string, updates: UpdatePatternPayload): Promise<void> {
    await patternRuntimeClient.updatePattern(patternId, updates);
  },

  // Export pattern group to OC-AE JSON
  async exportPatternGroup(groupId: string): Promise<PatternExportData> {
    return patternRuntimeClient.exportGroup(groupId);
  },

  async getEcosystemOverview(): Promise<EcosystemOverview> {
    return specialDataRuntimeClient.getEcosystemOverview();
  },

  async getAnimatedAtlasEntry(assetId: string): Promise<AnimatedAtlasAssetEntry> {
    return renderContractRuntimeClient.getAnimatedAtlasEntry(assetId);
  },

  async getRenderContractAsset(assetId: string): Promise<RenderContractAssetEntry> {
    return renderContractRuntimeClient.getAsset(assetId);
  },

  async getBrowserAtlasIndex(): Promise<BrowserAtlasIndexResponse | null> {
    return textureRuntimeClient.getBrowserAtlasIndex();
  },

  async getBrowserAtlasEntries(itemIds: string[]): Promise<BrowserAtlasIndexResponse | null> {
    return textureRuntimeClient.getBrowserAtlasEntries(itemIds);
  },

  async getOptionalRecipeUiPayload(recipeId: string): Promise<RecipeUiPayload | null> {
    const cached = uiPayloadCache.get(recipeId);
    if (cached) {
      return cached;
    }
    if (missingUiPayloadCache.has(recipeId)) {
      return null;
    }
    const existingRequest = uiPayloadInFlight.get(recipeId);
    if (existingRequest) {
      return existingRequest;
    }
    const request = (async () => {
      const distDataPayload = await getRuntimeRecipeUiPayload(recipeId);
      if (distDataPayload) {
        missingUiPayloadCache.delete(recipeId);
        setCacheWithLimit(uiPayloadCache, recipeId, distDataPayload, CACHE_LIMITS.uiPayload);
        return distDataPayload;
      }
      const runtimeSignature = await resolveRuntimeSignature();

      const persistent = await readPersistentRuntimePayload<RecipeUiPayload>(
        'recipe-ui-payload',
        { recipeId },
      );
      if (persistent) {
        setCacheWithLimit(uiPayloadCache, recipeId, persistent, CACHE_LIMITS.uiPayload);
        return persistent;
      }
      try {
        const payload = await renderContractRuntimeClient.getRecipeUiPayload(recipeId);
        missingUiPayloadCache.delete(recipeId);
        setCacheWithLimit(uiPayloadCache, recipeId, payload, CACHE_LIMITS.uiPayload);
        persistRuntimePayload('recipe-ui-payload', { recipeId }, payload);
        return payload;
      } catch (error) {
        if (isHttpNotFoundError(error)) {
          missingUiPayloadCache.add(recipeId);
          reportMissingRuntimePayload({
            recipeId,
            runtimeCacheKey: runtimeSignature,
            message: 'Recipe UI payload is missing from dist-data, persistent cache, and lab compatibility API',
            details: {
              labRoute: '/render-contract/ui-payload',
            },
          });
          return null;
        }
        throw error;
      }
    })().finally(() => {
      uiPayloadInFlight.delete(recipeId);
    });
    uiPayloadInFlight.set(recipeId, request);
    return request;
  },

  async getRecipeUiPayload(recipeId: string): Promise<RecipeUiPayload> {
    const payload = await api.getOptionalRecipeUiPayload(recipeId);
    if (!payload) {
      throw new Error(`Missing recipe UI payload for ${recipeId}`);
    }
    return payload;
  },

  async getRecipeBootstrap(itemId: string): Promise<RecipeBootstrapPayload> {
    const startedAt = getNow();
    const cached = recipeBootstrapCache.get(itemId);
    if (cached) {
      markRecipeBootstrapResolved(itemId, 'memory-cache', startedAt, cached);
      return cached;
    }
    const existingRequest = recipeBootstrapInFlight.get(itemId);
    if (existingRequest) {
      const payload = await existingRequest;
      markRecipeBootstrapResolved(itemId, 'in-flight', startedAt, payload);
      return payload;
    }
    const request = (async () => {
      const distDataBootstrap = await getRuntimeRecipeBootstrap(itemId);
      if (distDataBootstrap) {
        setCacheWithLimit(recipeBootstrapCache, itemId, distDataBootstrap, CACHE_LIMITS.recipeBootstrap);
        setCacheWithLimit(recipeBootstrapShardCache, itemId, distDataBootstrap, CACHE_LIMITS.recipeBootstrapShard);
        markRecipeBootstrapResolved(itemId, 'dist-data-v3', startedAt, distDataBootstrap);
        return distDataBootstrap;
      }

      if (!PREFER_LIVE_RECIPE_BOOTSTRAP) {
        const persistent = await readPersistentRuntimePayload<RecipeBootstrapPayload>(
          'recipe-bootstrap',
          withRecipeBootstrapCacheSchema({ itemId }),
        );
        if (persistent) {
          setCacheWithLimit(recipeBootstrapCache, itemId, persistent, CACHE_LIMITS.recipeBootstrap);
          markRecipeBootstrapResolved(itemId, 'persistent-cache', startedAt, persistent);
          return persistent;
        }

        const manifest = await api.getPublishManifest();
        const staticPath = resolvePublishedRecipeBootstrapPath(manifest, itemId, 'bootstrap');
        if (staticPath) {
          try {
            const published = await fetchPublishedJson<RecipeBootstrapPayload>(staticPath);
            setCacheWithLimit(recipeBootstrapCache, itemId, published, CACHE_LIMITS.recipeBootstrap);
            persistRuntimePayload('recipe-bootstrap', withRecipeBootstrapCacheSchema({ itemId }), published);
            markRecipeBootstrapResolved(itemId, 'legacy-static-bootstrap', startedAt, published);
            return published;
          } catch {
            // Fall back to the API route when the static publish bundle is unavailable.
          }
        }
        const itemRecipeBundlePath = resolvePublishedItemRecipeBundlePath(manifest, itemId);
        if (itemRecipeBundlePath) {
          try {
            const publishedBundle = await fetchPublishedJson<unknown>(itemRecipeBundlePath);
            const bundledBootstrap = unwrapPublishedItemRecipeBundle(publishedBundle);
            if (bundledBootstrap) {
              setCacheWithLimit(recipeBootstrapCache, itemId, bundledBootstrap, CACHE_LIMITS.recipeBootstrap);
              persistRuntimePayload('recipe-bootstrap', withRecipeBootstrapCacheSchema({ itemId }), bundledBootstrap);
              markRecipeBootstrapResolved(itemId, 'item-recipe-bundle', startedAt, bundledBootstrap);
              return bundledBootstrap;
            }
          } catch {
            // Fall back to the API route when the item-centric bundle is unavailable.
          }
        }
      }

      const payload = await getRecipeBootstrapCompat(itemId);
      setCacheWithLimit(recipeBootstrapCache, itemId, payload, CACHE_LIMITS.recipeBootstrap);
      persistRuntimePayload('recipe-bootstrap', withRecipeBootstrapCacheSchema({ itemId }), payload);
      markRecipeBootstrapResolved(itemId, 'dev-compat-api', startedAt, payload);
      return payload;
    })().finally(() => {
      recipeBootstrapInFlight.delete(itemId);
    });
    recipeBootstrapInFlight.set(itemId, request);
    return request;
  },

  async getRecipeBootstrapShard(itemId: string): Promise<RecipeBootstrapPayload> {
    const startedAt = getNow();
    const cached = recipeBootstrapShardCache.get(itemId);
    if (cached) {
      return cached;
    }
    const existingRequest = recipeBootstrapShardInFlight.get(itemId);
    if (existingRequest) {
      return existingRequest;
    }
    const request = (async () => {
      const distDataBootstrap = await getRuntimeRecipeBootstrap(itemId);
      if (distDataBootstrap) {
        setCacheWithLimit(recipeBootstrapCache, itemId, distDataBootstrap, CACHE_LIMITS.recipeBootstrap);
        setCacheWithLimit(recipeBootstrapShardCache, itemId, distDataBootstrap, CACHE_LIMITS.recipeBootstrapShard);
        markRecipeBootstrapResolved(itemId, 'dist-data-v3', startedAt, distDataBootstrap);
        return distDataBootstrap;
      }

      if (!PREFER_LIVE_RECIPE_BOOTSTRAP) {
        const persistent = await readPersistentRuntimePayload<RecipeBootstrapPayload>(
          'recipe-bootstrap-shard',
          withRecipeBootstrapCacheSchema({ itemId }),
        );
        if (persistent) {
          setCacheWithLimit(recipeBootstrapShardCache, itemId, persistent, CACHE_LIMITS.recipeBootstrapShard);
          return persistent;
        }

        const manifest = await api.getPublishManifest();
        const staticPath = resolvePublishedRecipeBootstrapPath(manifest, itemId, 'shard');
        if (staticPath) {
          try {
            const published = await fetchPublishedJson<RecipeBootstrapPayload>(staticPath);
            setCacheWithLimit(recipeBootstrapShardCache, itemId, published, CACHE_LIMITS.recipeBootstrapShard);
            persistRuntimePayload('recipe-bootstrap-shard', withRecipeBootstrapCacheSchema({ itemId }), published);
            return published;
          } catch {
            // Fall back to the API route when the static publish bundle is unavailable.
          }
        }
      }

      const payload = await getRecipeBootstrapShardCompat(itemId);
      setCacheWithLimit(recipeBootstrapShardCache, itemId, payload, CACHE_LIMITS.recipeBootstrapShard);
      persistRuntimePayload('recipe-bootstrap-shard', withRecipeBootstrapCacheSchema({ itemId }), payload);
      return payload;
    })().finally(() => {
      recipeBootstrapShardInFlight.delete(itemId);
    });
    recipeBootstrapShardInFlight.set(itemId, request);
    return request;
  },

  async getRecipeBootstrapProducedByGroup(
    itemId: string,
    machineType: string,
    voltageTier?: string | null,
    options?: { offset?: number; limit?: number; includeRecipeIds?: boolean; machineKey?: string | null },
  ): Promise<RecipeBootstrapMachineGroupPayload> {
    const normalizedMachineKey = `${options?.machineKey ?? ''}`.trim();
    const machineKey = normalizedMachineKey || (`${machineType ?? ''}`.trim() ? `${machineType}::${voltageTier ?? ''}` : '');
    if (!PREFER_LIVE_RECIPE_BOOTSTRAP) {
      const persistent = await readPersistentRuntimePayload<RecipeBootstrapMachineGroupPayload>(
        'recipe-bootstrap-produced-by-group',
        withRecipeBootstrapCacheSchema({
          itemId,
          machineType,
          machineKey: machineKey || null,
          voltageTier: voltageTier ?? null,
          offset: options?.offset ?? 0,
          limit: options?.limit ?? null,
          includeRecipeIds: options?.includeRecipeIds === true,
        }),
      );
      if (persistent) {
        return persistent;
      }

      const manifest = await api.getPublishManifest();
      if (canUsePublishedRecipeGroupIndex(manifest, itemId, options) && machineKey) {
        const staticPath = resolvePublishedRecipeGroupIndexPath({
          manifest,
          itemId,
          tab: 'producedBy',
          kind: 'machine',
          key: machineKey,
        });
        if (staticPath) {
          try {
            const published = await fetchPublishedJson<RecipeBootstrapMachineGroupPayload>(staticPath);
            persistRuntimePayload(
              'recipe-bootstrap-produced-by-group',
              withRecipeBootstrapCacheSchema({
                itemId,
                machineType,
                machineKey: machineKey || null,
                voltageTier: voltageTier ?? null,
                offset: options?.offset ?? 0,
                limit: options?.limit ?? null,
                includeRecipeIds: options?.includeRecipeIds === true,
              }),
              published,
            );
            return published;
          } catch {
            // Fall back to the API route when the static publish bundle is unavailable.
          }
        }
      }
      if (canUsePublishedRecipeGroupWindow(manifest, itemId, options) && machineKey) {
        const staticPath = resolvePublishedRecipeGroupWindowPath({
          manifest,
          itemId,
          tab: 'producedBy',
          kind: 'machine',
          key: machineKey,
          offset: options?.offset ?? 0,
          limit: options?.limit ?? 0,
        });
        if (staticPath) {
          try {
            const published = await fetchPublishedJson<RecipeBootstrapMachineGroupPayload>(staticPath);
            persistRuntimePayload(
              'recipe-bootstrap-produced-by-group',
              withRecipeBootstrapCacheSchema({
                itemId,
                machineType,
                machineKey: machineKey || null,
                voltageTier: voltageTier ?? null,
                offset: options?.offset ?? 0,
                limit: options?.limit ?? null,
                includeRecipeIds: options?.includeRecipeIds === true,
              }),
              published,
            );
            return published;
          } catch {
            // Fall back to the API route when the static publish bundle is unavailable.
          }
        }
      }
    }

    const payload = await getRecipeBootstrapProducedByGroupCompat(itemId, machineType, voltageTier, options);
    persistRuntimePayload(
      'recipe-bootstrap-produced-by-group',
      withRecipeBootstrapCacheSchema({
        itemId,
        machineType,
        machineKey: machineKey || null,
        voltageTier: voltageTier ?? null,
        offset: options?.offset ?? 0,
        limit: options?.limit ?? null,
        includeRecipeIds: options?.includeRecipeIds === true,
      }),
      payload,
    );
    return payload;
  },

  async getRecipeBootstrapUsedInGroup(
    itemId: string,
    machineType: string,
    voltageTier?: string | null,
    options?: { offset?: number; limit?: number; includeRecipeIds?: boolean; machineKey?: string | null },
  ): Promise<RecipeBootstrapMachineGroupPayload> {
    const normalizedMachineKey = `${options?.machineKey ?? ''}`.trim();
    const machineKey = normalizedMachineKey || (`${machineType ?? ''}`.trim() ? `${machineType}::${voltageTier ?? ''}` : '');
    if (!PREFER_LIVE_RECIPE_BOOTSTRAP) {
      const persistent = await readPersistentRuntimePayload<RecipeBootstrapMachineGroupPayload>(
        'recipe-bootstrap-used-in-group',
        withRecipeBootstrapCacheSchema({
          itemId,
          machineType,
          machineKey: machineKey || null,
          voltageTier: voltageTier ?? null,
          offset: options?.offset ?? 0,
          limit: options?.limit ?? null,
          includeRecipeIds: options?.includeRecipeIds === true,
        }),
      );
      if (persistent) {
        return persistent;
      }

      const manifest = await api.getPublishManifest();
      if (canUsePublishedRecipeGroupIndex(manifest, itemId, options) && machineKey) {
        const staticPath = resolvePublishedRecipeGroupIndexPath({
          manifest,
          itemId,
          tab: 'usedIn',
          kind: 'machine',
          key: machineKey,
        });
        if (staticPath) {
          try {
            const published = await fetchPublishedJson<RecipeBootstrapMachineGroupPayload>(staticPath);
            persistRuntimePayload(
              'recipe-bootstrap-used-in-group',
              withRecipeBootstrapCacheSchema({
                itemId,
                machineType,
                machineKey: machineKey || null,
                voltageTier: voltageTier ?? null,
                offset: options?.offset ?? 0,
                limit: options?.limit ?? null,
                includeRecipeIds: options?.includeRecipeIds === true,
              }),
              published,
            );
            return published;
          } catch {
            // Fall back to the API route when the static publish bundle is unavailable.
          }
        }
      }
      if (canUsePublishedRecipeGroupWindow(manifest, itemId, options) && machineKey) {
        const staticPath = resolvePublishedRecipeGroupWindowPath({
          manifest,
          itemId,
          tab: 'usedIn',
          kind: 'machine',
          key: machineKey,
          offset: options?.offset ?? 0,
          limit: options?.limit ?? 0,
        });
        if (staticPath) {
          try {
            const published = await fetchPublishedJson<RecipeBootstrapMachineGroupPayload>(staticPath);
            persistRuntimePayload(
              'recipe-bootstrap-used-in-group',
              withRecipeBootstrapCacheSchema({
                itemId,
                machineType,
                machineKey: machineKey || null,
                voltageTier: voltageTier ?? null,
                offset: options?.offset ?? 0,
                limit: options?.limit ?? null,
                includeRecipeIds: options?.includeRecipeIds === true,
              }),
              published,
            );
            return published;
          } catch {
            // Fall back to the API route when the static publish bundle is unavailable.
          }
        }
      }
    }

    const payload = await getRecipeBootstrapUsedInGroupCompat(itemId, machineType, voltageTier, options);
    persistRuntimePayload(
      'recipe-bootstrap-used-in-group',
      withRecipeBootstrapCacheSchema({
        itemId,
        machineType,
        machineKey: machineKey || null,
        voltageTier: voltageTier ?? null,
        offset: options?.offset ?? 0,
        limit: options?.limit ?? null,
        includeRecipeIds: options?.includeRecipeIds === true,
      }),
      payload,
    );
    return payload;
  },

  async getRecipeBootstrapCategoryGroup(
    itemId: string,
    tab: 'usedIn' | 'producedBy',
    categoryKey: string,
    options?: { offset?: number; limit?: number; includeRecipeIds?: boolean },
  ): Promise<RecipeBootstrapCategoryGroupPayload> {
    if (!PREFER_LIVE_RECIPE_BOOTSTRAP) {
      const persistent = await readPersistentRuntimePayload<RecipeBootstrapCategoryGroupPayload>(
        'recipe-bootstrap-category-group',
        withRecipeBootstrapCacheSchema({
          itemId,
          tab,
          categoryKey,
          offset: options?.offset ?? 0,
          limit: options?.limit ?? null,
          includeRecipeIds: options?.includeRecipeIds === true,
        }),
      );
      if (persistent) {
        return persistent;
      }

      const manifest = await api.getPublishManifest();
      if (canUsePublishedRecipeGroupIndex(manifest, itemId, options)) {
        const staticPath = resolvePublishedRecipeGroupIndexPath({
          manifest,
          itemId,
          tab,
          kind: 'category',
          key: categoryKey,
        });
        if (staticPath) {
          try {
            const published = await fetchPublishedJson<RecipeBootstrapCategoryGroupPayload>(staticPath);
            persistRuntimePayload(
              'recipe-bootstrap-category-group',
              withRecipeBootstrapCacheSchema({
                itemId,
                tab,
                categoryKey,
                offset: options?.offset ?? 0,
                limit: options?.limit ?? null,
                includeRecipeIds: options?.includeRecipeIds === true,
              }),
              published,
            );
            return published;
          } catch {
            // Fall back to the API route when the static publish bundle is unavailable.
          }
        }
      }
      if (canUsePublishedRecipeGroupWindow(manifest, itemId, options)) {
        const staticPath = resolvePublishedRecipeGroupWindowPath({
          manifest,
          itemId,
          tab,
          kind: 'category',
          key: categoryKey,
          offset: options?.offset ?? 0,
          limit: options?.limit ?? 0,
        });
        if (staticPath) {
          try {
            const published = await fetchPublishedJson<RecipeBootstrapCategoryGroupPayload>(staticPath);
            persistRuntimePayload(
              'recipe-bootstrap-category-group',
              withRecipeBootstrapCacheSchema({
                itemId,
                tab,
                categoryKey,
                offset: options?.offset ?? 0,
                limit: options?.limit ?? null,
                includeRecipeIds: options?.includeRecipeIds === true,
              }),
              published,
            );
            return published;
          } catch {
            // Fall back to the API route when the static publish bundle is unavailable.
          }
        }
      }
    }

    const payload = await getRecipeBootstrapCategoryGroupCompat(itemId, tab, categoryKey, options);
    persistRuntimePayload(
      'recipe-bootstrap-category-group',
      withRecipeBootstrapCacheSchema({
        itemId,
        tab,
        categoryKey,
        offset: options?.offset ?? 0,
        limit: options?.limit ?? null,
        includeRecipeIds: options?.includeRecipeIds === true,
      }),
      payload,
    );
    return payload;
  },

  async getRecipeBootstrapSearch(
    itemId: string,
    tab: 'usedIn' | 'producedBy',
    query: string,
    options?: SearchItemsFastOptions,
  ): Promise<RecipeBootstrapSearchPayload> {
    const normalizedQuery = query.trim();
    if (!normalizedQuery) {
      return {
        itemId,
        tab,
        query: normalizedQuery,
        recipeIds: [],
        itemMatches: [],
      };
    }

    if (!PREFER_LIVE_RECIPE_BOOTSTRAP) {
      const persistent = await readPersistentRuntimePayload<RecipeBootstrapSearchPayload>(
        'recipe-bootstrap-search',
        { itemId, tab, query: normalizedQuery },
      );
      if (persistent) {
        return persistent;
      }

      const publishedPack = await getPublishedRecipeBootstrapSearchPack(itemId, tab);
      if (publishedPack) {
        const itemMatches = await searchPublishedItemMatches(normalizedQuery, 80, { signal: options?.signal })
          .catch(() => []);
        const result = searchPublishedRecipeBootstrapPack(publishedPack, normalizedQuery, itemMatches);
        persistRuntimePayload('recipe-bootstrap-search', { itemId, tab, query: normalizedQuery }, result);
        return result;
      }
    }

    const payload = await getRecipeBootstrapSearchCompat(itemId, tab, normalizedQuery, options);
    persistRuntimePayload('recipe-bootstrap-search', { itemId, tab, query: normalizedQuery }, payload);
    return payload;
  },

  async prefetchRecipeBootstrapSearchPack(
    itemId: string,
    tab: 'usedIn' | 'producedBy',
  ): Promise<void> {
    await getPublishedRecipeBootstrapSearchPack(itemId, tab);
  },

  // === indexed Recipes API ===

  async getIndexedItemRecipeSummary(itemId: string): Promise<indexedItemRecipeSummaryResponse> {
    const cached = indexedSummaryCache.get(itemId);
    if (cached) {
      return cached;
    }
    const existingRequest = indexedSummaryInFlight.get(itemId);
    if (existingRequest) {
      return existingRequest;
    }
    const request = indexedRecipeRuntimeClient.getItemSummary(itemId)
      .then((payload) => {
        setCacheWithLimit(indexedSummaryCache, itemId, payload, CACHE_LIMITS.indexedSummary);
        return payload;
      })
      .finally(() => {
        indexedSummaryInFlight.delete(itemId);
      });
    indexedSummaryInFlight.set(itemId, request);
    return request;
  },

  // Get recipe by ID
  async getIndexedRecipe(recipeId: string): Promise<indexedRecipe> {
    return indexedRecipeRuntimeClient.getRecipe(recipeId);
  },

  async getIndexedRecipesByIds(recipeIds: string[], options?: SearchItemsFastOptions): Promise<indexedRecipe[]> {
    const uniqueIds = Array.from(new Set(recipeIds.map((id) => id.trim()).filter(Boolean)));
    if (uniqueIds.length === 0) {
      return [];
    }
    return indexedRecipeRuntimeClient.getRecipesByIds(uniqueIds, options);
  },

  // Get crafting recipes for item
  async getIndexedCraftingRecipes(itemId: string): Promise<indexedRecipe[]> {
    const cached = indexedCraftingCache.get(itemId);
    if (cached) {
      return cached;
    }
    const existingRequest = indexedCraftingInFlight.get(itemId);
    if (existingRequest) {
      return existingRequest;
    }
    const request = indexedRecipeRuntimeClient.getCraftingRecipes(itemId)
      .then((payload) => {
        setCacheWithLimit(indexedCraftingCache, itemId, payload, CACHE_LIMITS.indexedCrafting);
        return payload;
      })
      .finally(() => {
        indexedCraftingInFlight.delete(itemId);
      });
    indexedCraftingInFlight.set(itemId, request);
    return request;
  },

  // Get usage recipes for item
  async getIndexedUsageRecipes(itemId: string): Promise<indexedRecipe[]> {
    const cached = indexedUsageCache.get(itemId);
    if (cached) {
      return cached;
    }
    const existingRequest = indexedUsageInFlight.get(itemId);
    if (existingRequest) {
      return existingRequest;
    }
    const request = indexedRecipeRuntimeClient.getUsageRecipes(itemId)
      .then((payload) => {
        setCacheWithLimit(indexedUsageCache, itemId, payload, CACHE_LIMITS.indexedUsage);
        return payload;
      })
      .finally(() => {
        indexedUsageInFlight.delete(itemId);
      });
    indexedUsageInFlight.set(itemId, request);
    return request;
  },

  async searchItemsFast(keyword: string, limit: number = 60, options?: SearchItemsFastOptions): Promise<ItemSearchBasic[]> {
    return itemRuntimeClient.searchItemsFast(keyword, limit, options);
  },

  // Get all available machines for item
  async getIndexedMachinesForItem(itemId: string): Promise<indexedItemMachinesResponse> {
    return indexedRecipeRuntimeClient.getMachinesForItem(itemId);
  },

  // Get all machine types
  async getIndexedMachineTypes(): Promise<string[]> {
    return indexedRecipeRuntimeClient.getMachineTypes();
  },

  // Get recipes by machine type
  async getIndexedRecipesByMachine(machineType: string, voltageTier?: string): Promise<IndexedMachineRecipesResponse> {
    return indexedRecipeRuntimeClient.getRecipesByMachine(machineType, voltageTier);
  },

  // Get multiblock blueprint by controller item ID
  async getMultiblockBlueprint(controllerItemId: string): Promise<MultiblockBlueprint> {
    return specialDataRuntimeClient.getMultiblockBlueprint(controllerItemId);
  },

  async getGTDiagramsOverview(): Promise<GTDiagramsOverview> {
    return specialDataRuntimeClient.getGTDiagramsOverview();
  },

  async getForestryGeneticsOverview(): Promise<ForestryGeneticsOverview> {
    return specialDataRuntimeClient.getForestryGeneticsOverview();
  }
};
