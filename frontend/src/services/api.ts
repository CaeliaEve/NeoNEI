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
import { createTextureRuntimeClient } from '../runtime/textureClient';
import { patternRuntimeClient, type CreatePatternPayload, type UpdatePatternPayload } from '../runtime/patternClient';
import { specialDataRuntimeClient } from '../runtime/specialDataClient';
import { renderContractRuntimeClient } from '../runtime/renderContractClient';
import { indexedRecipeRuntimeClient, type IndexedMachineRecipesResponse } from '../runtime/indexedRecipeClient';
import { itemRuntimeClient, type ItemMachinesResponse } from '../runtime/itemClient';
import { getDistDataHomeBootstrap } from './distDataRuntime';
import {
  deriveBrowserPagePackFromWindow,
  resolvePublishedWindowPath,
} from '../runtime/browserProjection';
import { buildRuntimePayloadCacheKey, setCacheWithLimit } from '../runtime/cacheUtils';
import { createBrowserCatalogClient } from '../runtime/browserCatalogClient';
import { createRecipeUiPayloadClient } from '../runtime/recipeUiPayloadClient';
import { shouldPreferLiveRecipeBootstrap } from '../runtime/recipeBootstrapPreference';
import { createRecipeBootstrapClient } from '../runtime/recipeBootstrapClient';

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
  publishedJson: 96,
} as const;

const PREFER_LIVE_RECIPE_BOOTSTRAP = shouldPreferLiveRecipeBootstrap();

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


const browserCatalogClient = createBrowserCatalogClient({
  getManifest: () => runtimeManifestClient.getPublishManifest(),
  fetchPublishedJson,
  isPublishedJsonWarm,
  reportGap: (scope, route, reason, context) => reportRuntimeDevCompatGap(scope, route, reason, {
    ...getRuntimeDiagnosticIdentity(),
    details: context?.details,
  }),
  readPersistent: readPersistentRuntimePayload,
  persist: persistRuntimePayload,
  resolveRuntimeSignature,
  primeRuntimeSignature: primeRuntimeCacheSignature,
  writePersistentRuntimeCache,
});
const recipeUiPayloadClient = createRecipeUiPayloadClient({
  readPersistent: readPersistentRuntimePayload,
  persist: persistRuntimePayload,
  resolveRuntimeSignature,
  reportMissing: reportMissingRuntimePayload,
  isHttpNotFoundError,
});
const recipeBootstrapClient = createRecipeBootstrapClient({
  preferLive: PREFER_LIVE_RECIPE_BOOTSTRAP,
  getManifest: () => runtimeManifestClient.getPublishManifest(),
  fetchPublishedJson,
  readPersistent: readPersistentRuntimePayload,
  persist: persistRuntimePayload,
  getBrowserSearchPackShard: (shardId) => browserCatalogClient.getBrowserSearchPackShard(shardId),
  getBrowserSearchPack: () => browserCatalogClient.getBrowserSearchPack(),
});
export const api = {
  trimPreheatRuntimeCaches(): void {
    itemRuntimeClient.clearCaches();
    recipeBootstrapClient.clearCaches();
    browserCatalogClient.clearSearchCaches();
    recipeUiPayloadClient.clearCaches();
    publishedJsonValueCache.clear();
    publishedJsonInFlight.clear();
  },

  resetRuntimeCaches(): void {
    itemRuntimeClient.clearCaches();
    indexedRecipeRuntimeClient.clearCaches();
    recipeBootstrapClient.clearCaches();
    browserCatalogClient.clearAllCaches();
    recipeUiPayloadClient.clearCaches();
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
    return browserCatalogClient.getBrowserItems(params);
  },

  async getBrowserDefaultCatalog(params?: {
    modId?: string;
  }): Promise<BrowserDefaultCatalogResponse> {
    return browserCatalogClient.getBrowserDefaultCatalog(params);
  },

  peekBrowserDefaultCatalog(modId?: string): BrowserDefaultCatalogResponse | null {
    return browserCatalogClient.peekBrowserDefaultCatalog(modId);
  },

  async getBrowserSearchCatalog(params: {
    search: string;
    modId?: string;
  }): Promise<BrowserSearchCatalogResponse> {
    return browserCatalogClient.getBrowserSearchCatalog(params);
  },

  peekBrowserSearchCatalog(search: string, modId?: string): BrowserSearchCatalogResponse | null {
    return browserCatalogClient.peekBrowserSearchCatalog(search, modId);
  },

  async getBrowserGroupItems(groupKey: string, modId?: string): Promise<BrowserGroupItemsResponse> {
    return browserCatalogClient.getBrowserGroupItems(groupKey, modId);
  },

  peekBrowserGroupItems(groupKey: string, modId?: string): BrowserGroupItemsResponse | null {
    return browserCatalogClient.peekBrowserGroupItems(groupKey, modId);
  },

  async getBrowserPagePack(params: {
    page?: number;
    pageSize?: number;
    search?: string;
    modId?: string;
    expandedGroups?: string[];
    slotSize?: number;
  }): Promise<BrowserPagePackResponse> {
    return browserCatalogClient.getBrowserPagePack(params);
  },

  async primeDefaultBrowserPagePack(params: {
    page: number;
    pageSize: number;
    slotSize?: number;
  }): Promise<BrowserPagePackResponse> {
    return browserCatalogClient.primeDefaultBrowserPagePack(params);
  },

  async getBrowserSearchPack(): Promise<BrowserSearchPackResponse> {
    return browserCatalogClient.getBrowserSearchPack();
  },

  async getBrowserSearchPackShard(shardId: string): Promise<BrowserSearchPackResponse | null> {
    return browserCatalogClient.getBrowserSearchPackShard(shardId);
  },

  async getBrowserPagePackByIds(params: {
    itemIds: string[];
    slotSize?: number;
  }): Promise<BrowserByIdsPackResponse> {
    return browserCatalogClient.getBrowserPagePackByIds(params);
  },

  peekBrowserPagePackByIds(params: {
    itemIds: string[];
    slotSize?: number;
  }): BrowserByIdsPackResponse | null {
    return browserCatalogClient.peekBrowserPagePackByIds(params);
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
    return recipeUiPayloadClient.getOptionalRecipeUiPayload(recipeId);
  },

  async getRecipeUiPayload(recipeId: string): Promise<RecipeUiPayload> {
    return recipeUiPayloadClient.getRecipeUiPayload(recipeId);
  },
  async getRecipeBootstrap(itemId: string): Promise<RecipeBootstrapPayload> {
    return recipeBootstrapClient.getRecipeBootstrap(itemId);
  },

  async getRecipeBootstrapShard(itemId: string): Promise<RecipeBootstrapPayload> {
    return recipeBootstrapClient.getRecipeBootstrapShard(itemId);
  },

  async getRecipeBootstrapProducedByGroup(
    itemId: string,
    machineType: string,
    voltageTier?: string | null,
    options?: { offset?: number; limit?: number; includeRecipeIds?: boolean; machineKey?: string | null },
  ): Promise<RecipeBootstrapMachineGroupPayload> {
    return recipeBootstrapClient.getRecipeBootstrapProducedByGroup(itemId, machineType, voltageTier, options);
  },

  async getRecipeBootstrapUsedInGroup(
    itemId: string,
    machineType: string,
    voltageTier?: string | null,
    options?: { offset?: number; limit?: number; includeRecipeIds?: boolean; machineKey?: string | null },
  ): Promise<RecipeBootstrapMachineGroupPayload> {
    return recipeBootstrapClient.getRecipeBootstrapUsedInGroup(itemId, machineType, voltageTier, options);
  },

  async getRecipeBootstrapCategoryGroup(
    itemId: string,
    tab: 'usedIn' | 'producedBy',
    categoryKey: string,
    options?: { offset?: number; limit?: number; includeRecipeIds?: boolean },
  ): Promise<RecipeBootstrapCategoryGroupPayload> {
    return recipeBootstrapClient.getRecipeBootstrapCategoryGroup(itemId, tab, categoryKey, options);
  },

  async getRecipeBootstrapSearch(
    itemId: string,
    tab: 'usedIn' | 'producedBy',
    query: string,
    options?: SearchItemsFastOptions,
  ): Promise<RecipeBootstrapSearchPayload> {
    return recipeBootstrapClient.getRecipeBootstrapSearch(itemId, tab, query, options);
  },

  async prefetchRecipeBootstrapSearchPack(
    itemId: string,
    tab: 'usedIn' | 'producedBy',
  ): Promise<void> {
    return recipeBootstrapClient.prefetchRecipeBootstrapSearchPack(itemId, tab);
  },
  // === indexed Recipes API ===

  async getIndexedItemRecipeSummary(itemId: string): Promise<indexedItemRecipeSummaryResponse> {
    return indexedRecipeRuntimeClient.getItemSummary(itemId);
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
    return indexedRecipeRuntimeClient.getCraftingRecipes(itemId);
  },

  // Get usage recipes for item
  async getIndexedUsageRecipes(itemId: string): Promise<indexedRecipe[]> {
    return indexedRecipeRuntimeClient.getUsageRecipes(itemId);
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
