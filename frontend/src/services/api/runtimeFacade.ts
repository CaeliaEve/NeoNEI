import type {
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
  PageRichMediaManifest,
  PaginatedResponse,
  PublicRuntimeManifest,
  RuntimeHealthSummary,
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
  SearchItemsFastOptions,
  MultiblockBlueprint,
  indexedItem,
  indexedItemGroup,
  indexedItemStack,
  indexedMachineGroupSummary,
  indexedMachineInfo,
  indexedMachineOption,
  indexedRecipe,
  indexedRecipeCategorySummary,
  indexedRecipeMetadata,
} from '../../runtime/types';
import { specialDataRuntimeClient } from '../../runtime/specialDataClient';
import { indexedRecipeRuntimeClient, type CurrentRecipePageResponse } from '../../runtime/indexedRecipeClient';
import {
  browserCatalogClient,
  clearPublishedRuntimeCaches,
  recipeBootstrapClient,
  recipeUiPayloadClient,
  resetRuntimeSessionCaches,
  runtimeManifestClient,
  textureRuntimeClient,
  getRuntimeHomeBootstrap,
  getRuntimeHealth,
  getRuntimeMods,
} from './runtimeSession';

export const api = {
  trimPreheatRuntimeCaches(): void {
    recipeBootstrapClient.clearCaches();
    browserCatalogClient.clearSearchCaches();
    recipeUiPayloadClient.clearCaches();
    clearPublishedRuntimeCaches();
  },

  resetRuntimeCaches(): void {
    indexedRecipeRuntimeClient.clearCaches();
    recipeBootstrapClient.clearCaches();
    browserCatalogClient.clearAllCaches();
    recipeUiPayloadClient.clearCaches();
    resetRuntimeSessionCaches();
    specialDataRuntimeClient.clear();
  },

  async getPublishManifest(): Promise<PublicRuntimeManifest> {
    return runtimeManifestClient.getPublishManifest();
  },

  async getRuntimeHealth(): Promise<RuntimeHealthSummary> {
    return getRuntimeHealth();
  },

  async getHomeBootstrap(params: {
    page?: number;
    pageSize?: number;
    slotSize?: number;
    modId?: string;
  }): Promise<HomeBootstrapResponse> {
    return getRuntimeHomeBootstrap(params);
  },

  async getBrowserItems(params: {
    page?: number;
    pageSize?: number;
    search?: string;
    modId?: string;
    expandedGroups?: string[];
    includeHidden?: boolean;
  }): Promise<PaginatedResponse<BrowserGridEntry>> {
    return browserCatalogClient.getBrowserItems(params);
  },

  async getBrowserDefaultCatalog(params?: {
    modId?: string;
    includeHidden?: boolean;
  }): Promise<BrowserDefaultCatalogResponse> {
    return browserCatalogClient.getBrowserDefaultCatalog(params);
  },

  peekBrowserDefaultCatalog(modId?: string, includeHidden = false): BrowserDefaultCatalogResponse | null {
    return browserCatalogClient.peekBrowserDefaultCatalog(modId, includeHidden);
  },

  async getBrowserSearchCatalog(params: {
    search: string;
    modId?: string;
    includeHidden?: boolean;
  }): Promise<BrowserSearchCatalogResponse> {
    return browserCatalogClient.getBrowserSearchCatalog(params);
  },

  peekBrowserSearchCatalog(search: string, modId?: string, includeHidden = false): BrowserSearchCatalogResponse | null {
    return browserCatalogClient.peekBrowserSearchCatalog(search, modId, includeHidden);
  },

  async getBrowserGroupItems(groupKey: string, modId?: string, includeHidden = false): Promise<BrowserGroupItemsResponse> {
    return browserCatalogClient.getBrowserGroupItems(groupKey, modId, includeHidden);
  },

  peekBrowserGroupItems(groupKey: string, modId?: string, includeHidden = false): BrowserGroupItemsResponse | null {
    return browserCatalogClient.peekBrowserGroupItems(groupKey, modId, includeHidden);
  },

  async getBrowserPagePack(params: {
    page?: number;
    pageSize?: number;
    search?: string;
    modId?: string;
    expandedGroups?: string[];
    includeHidden?: boolean;
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
  // Get all mods
  async getMods(): Promise<Mod[]> {
    return getRuntimeMods();
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

  async getCurrentRecipePage(recipePageId: string, options?: SearchItemsFastOptions): Promise<CurrentRecipePageResponse> {
    return indexedRecipeRuntimeClient.getCurrentRecipePage(recipePageId, options);
  },

  async getIndexedRecipesByIds(recipeIds: string[], options?: SearchItemsFastOptions): Promise<indexedRecipe[]> {
    const uniqueIds = Array.from(new Set(recipeIds.map((id) => id.trim()).filter(Boolean)));
    if (uniqueIds.length === 0) {
      return [];
    }
    return indexedRecipeRuntimeClient.getRecipesByIds(uniqueIds, options);
  },

  async searchItemsFast(keyword: string, limit: number = 60, options?: SearchItemsFastOptions): Promise<ItemSearchBasic[]> {
    return browserCatalogClient.searchItemsFast(keyword, limit, options);
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
