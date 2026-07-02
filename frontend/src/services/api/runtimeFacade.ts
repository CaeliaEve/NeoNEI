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
  PageRichMediaManifest,
  PaginatedResponse,
  Pattern,
  PatternExportData,
  PatternGroup,
  PatternGroupWithPatterns,
  PatternWithDetails,
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
  indexedItemMachinesResponse,
  indexedItemRecipeSummaryResponse,
  indexedItemStack,
  indexedMachineGroupSummary,
  indexedMachineInfo,
  indexedMachineOption,
  indexedRecipe,
  indexedRecipeCategorySummary,
  indexedRecipeMetadata,
} from '../../runtime/types';
import { patternRuntimeClient, type CreatePatternPayload, type UpdatePatternPayload } from '../../runtime/patternClient';
import { specialDataRuntimeClient } from '../../runtime/specialDataClient';
import { indexedRecipeRuntimeClient, type CurrentRecipePageResponse, type IndexedMachineRecipesResponse } from '../../runtime/indexedRecipeClient';
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

  // Get crafting recipes for item
  async getIndexedCraftingRecipes(itemId: string): Promise<indexedRecipe[]> {
    return indexedRecipeRuntimeClient.getCraftingRecipes(itemId);
  },

  // Get usage recipes for item
  async getIndexedUsageRecipes(itemId: string): Promise<indexedRecipe[]> {
    return indexedRecipeRuntimeClient.getUsageRecipes(itemId);
  },

  async searchItemsFast(keyword: string, limit: number = 60, options?: SearchItemsFastOptions): Promise<ItemSearchBasic[]> {
    return browserCatalogClient.searchItemsFast(keyword, limit, options);
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
