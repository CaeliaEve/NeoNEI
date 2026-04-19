import { http } from './api/core/http';

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

const BATCH_SIZE = 800;

const itemDetailCache = new Map<string, Item>();
const indexedCraftingCache = new Map<string, indexedRecipe[]>();
const indexedUsageCache = new Map<string, indexedRecipe[]>();
const indexedSummaryCache = new Map<string, indexedItemRecipeSummaryResponse>();
const itemDetailInFlight = new Map<string, Promise<Item>>();
const indexedCraftingInFlight = new Map<string, Promise<indexedRecipe[]>>();
const indexedUsageInFlight = new Map<string, Promise<indexedRecipe[]>>();
const indexedSummaryInFlight = new Map<string, Promise<indexedItemRecipeSummaryResponse>>();
const recipeBootstrapCache = new Map<string, RecipeBootstrapPayload>();
const recipeBootstrapInFlight = new Map<string, Promise<RecipeBootstrapPayload>>();
const uiPayloadCache = new Map<string, RecipeUiPayload>();
const uiPayloadInFlight = new Map<string, Promise<RecipeUiPayload>>();
let ecosystemOverviewCache: EcosystemOverview | null = null;
let ecosystemOverviewInFlight: Promise<EcosystemOverview> | null = null;

const CACHE_LIMITS = {
  itemDetail: 10000,
  indexedCrafting: 3000,
  indexedUsage: 3000,
  indexedSummary: 3000
} as const;

function setCacheWithLimit<K, V>(cache: Map<K, V>, key: K, value: V, limit: number): void {
  if (cache.has(key)) {
    cache.delete(key);
  }
  cache.set(key, value);
  if (cache.size > limit) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) {
      cache.delete(oldest);
    }
  }
}

export interface RecipeItem {
  itemId: string;
  count: number;
  renderAssetRef?: string | null;
  damage?: number;
  nbt?: string;
  probability?: number;
  items?: indexedItemStack[];
  [key: string]: unknown;
}

export type RecipeInputCell = RecipeItem | RecipeItem[] | null;
export type RecipeInputRow = RecipeInputCell[];

export interface RecipeVariantGroup {
  slotKey: string;
  row: number;
  col: number;
  isOreDictionary: boolean;
  oreDictName: string | null;
  options: RecipeItem[];
}

export interface DimensionDTO {
  width: number;
  height: number;
}

export interface RecipeTypeDTO {
  id?: string;
  category?: string;
  type?: string;
  iconInfo?: string;
  shapeless?: boolean;
  machineIcon?: {
    itemId: string;
    modId: string;
    internalName: string;
    localizedName: string;
    renderAssetRef?: string | null;
    imageFileName?: string;
  };
  itemInputDimension?: DimensionDTO;
  fluidInputDimension?: DimensionDTO;
  itemOutputDimension?: DimensionDTO;
  fluidOutputDimension?: DimensionDTO;
  machineType?: string;
  [key: string]: unknown;
}

export interface GregTechMetadata {
  voltageTier?: string;
  voltage?: number;
  amperage?: number;
  duration?: number;
  totalEU?: number;
  requiresCleanroom?: boolean;
  requiresLowGravity?: boolean;
  additionalInfo?: string;
  specialItems?: RecipeItem[];
  heatCapacity?: number;
  catalyst?: string;
  fluidInputs?: Array<{ name: string; amount: number }>;
  fluidOutputs?: Array<{ name: string; amount: number }>;
  machineInfo?: {
    machineIcon?: {
      itemId?: string;
      imageFileName?: string;
      [key: string]: unknown;
    };
    [key: string]: unknown;
  };
  variantGroups?: RecipeVariantGroup[];
  [key: string]: unknown;
}

export interface Fluid {
  fluidId: string;
  modId: string;
  internalName: string;
  localizedName: string;
  renderAssetRef?: string | null;
  temperature: number;
}

export interface FluidStack {
  fluid: Fluid;
  amount: number;
  probability: number;
}

export interface FluidGroup {
  slotIndex: number;
  fluids: FluidStack[];
}

export interface Recipe {
  recipeId: string;
  recipeType: string;
  recipeTypeData?: RecipeTypeDTO;
  inputs: RecipeInputRow[];
  outputs: RecipeItem[];
  fluidInputs?: FluidGroup[];
  fluidOutputs?: FluidStack[];
  additionalData?: GregTechMetadata;
  machineInfo?: {
    machineId: string;
    category: string;
    machineType: string;
    iconInfo: string;
    shapeless: boolean;
    parsedVoltageTier: string | null;
    parsedVoltage: number | null;
    machineIcon?: {
      itemId: string;
      modId: string;
      internalName: string;
      localizedName: string;
      renderAssetRef?: string | null;
      imageFileName: string;
    };
  };
  metadata?: GregTechMetadata;
}

export interface Item {
  itemId: string;
  modId: string;
  internalName: string;
  localizedName: string;
  renderAssetRef?: string | null;
  preferredImageUrl?: string | null;
  unlocalizedName?: string;
  damage?: number;
  maxStackSize?: number;
  maxDamage?: number;
  imageFileName?: string | null;
  tooltip?: string | null;
  searchTerms?: string | null;
  toolClasses?: string | null;
  nbt?: string | null;
  [key: string]: unknown;
}

export interface PageAtlasSpriteEntry {
  atlasUrl: string;
  atlasWidth: number;
  atlasHeight: number;
  slotSize: number;
  x: number;
  y: number;
}

export interface PageAtlasResult {
  atlasUrl: string;
  atlasWidth: number;
  atlasHeight: number;
  slotSize: number;
  entries: Record<string, PageAtlasSpriteEntry>;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface Mod {
  modId: string;
  modName: string;
  itemCount: number;
}

// Pattern Management Interfaces
export interface PatternGroup {
  groupId: string;
  groupName: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Pattern {
  patternId: string;
  groupId: string | null;
  recipeId: string;
  patternName: string;
  outputItemId: string | null;
  priority: number;
  enabled: number;
  crafting: number;
  substitute: number;
  beSubstitute: number;
  createdAt: string;
  updatedAt: string;
}

export interface PatternWithDetails extends Pattern {
  recipe: Recipe | null;
  outputItem: Item | null;
}

export interface PatternGroupWithPatterns extends PatternGroup {
  patterns: PatternWithDetails[];
  patternCount: number;
}

// Indexed recipe types
export interface indexedItem {
  itemId: string;
  modId: string;
  internalName: string;
  localizedName: string;
  renderAssetRef?: string | null;
  damage: number;
  stackSize: number;
  maxStackSize: number;
  maxDamage: number;
  nbt: string | null;
  imageFileName: string | null;
  tooltip: string | null;
}

export interface indexedItemStack {
  item: indexedItem;
  stackSize: number;
  probability: number;
}

export interface indexedItemGroup {
  slotIndex: number;
  items: indexedItemStack[];
  isOreDictionary: boolean;
  oreDictName: string | null;
}

export interface ItemSearchBasic {
  itemId: string;
  localizedName: string;
  modId: string;
}

export interface SearchItemsFastOptions {
  signal?: AbortSignal;
}

export interface indexedMachineInfo {
  machineId: string;
  category: string;
  machineType: string;
  iconInfo: string;
  shapeless: boolean;
  parsedVoltageTier: string | null;
  parsedVoltage: number | null;
  machineIcon?: {
    itemId: string;
    modId: string;
    internalName: string;
    localizedName: string;
    imageFileName: string;
  };
}

export interface indexedRecipeMetadata {
  voltageTier: string | null;
  voltage: number | null;
  amperage: number | null;
  duration: number | null;
  totalEU: number | null;
  requiresCleanroom: boolean | null;
  requiresLowGravity: boolean | null;
  additionalInfo: string | null;
  aspects?: Record<string, unknown>;
  specialRecipeType?: unknown;
  research?: unknown;
  centralItemId?: unknown;
  centerInputSlotIndex?: unknown;
  instability?: unknown;
  componentSlotOrder?: unknown[];
  [key: string]: unknown;
}

export interface indexedRecipe {
  id: string;
  recipeType: string;
  recipeTypeData?: RecipeTypeDTO;
  outputs: indexedItemStack[];
  inputs: indexedItemGroup[] | indexedItemGroup[][];
  fluidInputs?: unknown[];
  fluidOutputs?: unknown[];
  machineInfo: indexedMachineInfo | null;
  metadata: indexedRecipeMetadata | null;
  [key: string]: unknown;
}

export interface indexedMachineOption {
  machineType: string;
  category: string;
  voltageTier: string | null;
  voltage: number | null;
  recipeCount: number;
  recipes: indexedRecipe[];
}

export interface indexedMachineGroupSummary {
  machineType: string;
  category: string;
  voltageTier: string | null;
  voltage: number | null;
  recipeCount: number;
}

export interface indexedItemMachinesResponse {
  itemId: string;
  itemName: string;
  machines: indexedMachineOption[];
}

export interface indexedItemRecipeSummaryResponse {
  itemId: string;
  itemName: string;
  machineGroups: indexedMachineGroupSummary[];
  counts: {
    producedBy: number;
    usedIn: number;
    machineGroups: number;
  };
}

export interface RecipeBootstrapPayload {
  item: Item;
  recipeIndex: {
    usedInRecipes: string[];
    producedByRecipes: string[];
  };
  indexedCrafting: indexedRecipe[];
  indexedUsage: indexedRecipe[];
  indexedSummary: indexedItemRecipeSummaryResponse | null;
}

export interface RecipeUiPayload {
  recipeId: string;
  familyKey: string;
  machineType?: string;
  recipeType?: string;
  inputItemIds?: string[];
  outputItemIds?: string[];
  slotCount?: {
    input?: number;
    output?: number;
  };
  presentation?: {
    surface?: string;
    density?: string;
  };
  [key: string]: unknown;
}

export interface GTDiagramItemRef {
  itemId: string;
  localizedName: string;
  tier?: number | null;
  tierName?: string | null;
}

export interface GTCircuitLine {
  startTier: number;
  boards: GTDiagramItemRef[];
  circuits: GTDiagramItemRef[];
}

export interface GTIndividualCircuit {
  tier: number;
  boards: GTDiagramItemRef[];
  circuit: GTDiagramItemRef | null;
}

export interface GTCircuitPartGroup {
  key: string;
  parts: Array<{
    prefix: string;
    itemId: string;
    localizedName: string;
  }>;
}

export interface GTCircuitProgressionDocument {
  generatedFrom: string;
  circuitLines: GTCircuitLine[];
  individualCircuits: GTIndividualCircuit[];
  circuitParts: GTCircuitPartGroup[];
}

export interface GTMaterialPartRef {
  prefix: string;
  itemId: string;
  localizedName: string;
}

export interface GTMaterialFluidRef {
  kind: string;
  fluidId: string;
  localizedName: string;
}

export interface GTMaterialPartsEntry {
  materialName: string;
  materialId: string;
  sections: Record<string, GTMaterialPartRef[]>;
  fluids: GTMaterialFluidRef[];
}

export interface GTMaterialPartsDocument {
  generatedFrom: string;
  materials: GTMaterialPartsEntry[];
}

export interface GTDiagramsOverview {
  circuits: GTCircuitProgressionDocument | null;
  materials: GTMaterialPartsDocument | null;
}

export interface ForestryGeneticsItemDrop {
  itemId: string;
  localizedName: string;
  chance: number;
}

export interface ForestryGeneticsSpecies {
  uid: string;
  name: string;
  memberItemId: string;
  products: ForestryGeneticsItemDrop[];
  specialties: ForestryGeneticsItemDrop[];
}

export interface ForestryGeneticsMutation {
  allele0: string;
  allele1: string;
  result: string;
  chance: number;
  restricted: boolean;
  dimensions?: string[];
  biomes?: string[];
}

export interface ForestryGeneticsBranch {
  species: ForestryGeneticsSpecies[];
  mutations: ForestryGeneticsMutation[];
}

export interface ForestryGeneticsOverview {
  generatedFrom: string;
  bees: ForestryGeneticsBranch | null;
  trees: ForestryGeneticsBranch | null;
}

export interface MultiblockDimensions {
  x: number;
  y: number;
  z: number;
  raw?: string;
}

export interface MultiblockVoxelLegendEntry {
  label: string;
  color?: string;
  textureUrl?: string;
  blockId?: string;
  faceIcons?: Record<string, string>;
  faceTextureUrls?: Record<string, string>;
  faceUv?: Record<
    string,
    {
      minU: number;
      maxU: number;
      minV: number;
      maxV: number;
    }
  >;
  orientationKind?: string;
}

export interface MultiblockVoxelBlueprint {
  size: { x: number; y: number; z: number };
  // layers[ y ][ z ] = row string (x-axis tokens)
  layers: string[][];
  legend: Record<string, MultiblockVoxelLegendEntry>;
}

export interface MultiblockBlueprint {
  metaTileId: number;
  className: string;
  controllerItemId: string;
  controllerLocalizedName: string;
  structureSource?: string;
  supports?: {
    inputSeparation?: boolean;
    batchMode?: boolean;
    recipeLocking?: boolean;
    voidProtection?: boolean;
  };
  dimensions?: MultiblockDimensions | null;
  information?: string[];
  structureInformation?: string[];
  structureHints?: string[];
  voxelBlueprint?: MultiblockVoxelBlueprint;
}

export interface PatternExportData {
  version: number;
  modVersion: string;
  exportedAt?: string;
  patternCount: number;
  compatibility?: {
    target: 'oc-pattern';
    itemIdFormat: 'minecraft-registry';
    beSubstitute: 'pattern-field';
    crafterUUID: 'synthetic-pattern-id';
    author: 'default-exporter';
  };
  warnings?: string[];
  patterns?: Array<{
    crafting: boolean;
    substitute: boolean;
    beSubstitute: boolean;
    patternId: string;
    crafterUUID: string;
    author: string;
  }>;
  [key: string]: unknown;
}

export interface EcosystemLaneDetail {
  label: string;
  value: string;
  ok: boolean;
}

export interface EcosystemLaneStatus {
  id: 'nesql-exporter-main' | 'neonei' | 'oc-pattern';
  label: string;
  role: string;
  repoPath: string;
  detected: boolean;
  details: EcosystemLaneDetail[];
}

export interface EcosystemOverview {
  hub: string;
  workflow: string[];
  lanes: EcosystemLaneStatus[];
}

export interface AnimatedAtlasFrameEntry {
  index: number;
  sourcePath: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface AnimatedAtlasAssetEntry {
  assetId: string;
  variantKey: string;
  frameDurationMs: number | null;
  loopMode: string | null;
  frameCount: number;
  frames: AnimatedAtlasFrameEntry[];
  atlasFile: string;
  atlasGroup: string;
}

export const api = {
  // Get items with pagination
  async getItems(params: {
    page?: number;
    pageSize?: number;
    search?: string;
    modId?: string;
  }): Promise<PaginatedResponse<Item>> {
    const response = await http.get('/items', { params });
    return response.data;
  },

  // Get item by ID
  async getItem(itemId: string): Promise<Item> {
    const cached = itemDetailCache.get(itemId);
    if (cached) {
      return cached;
    }
    const existingRequest = itemDetailInFlight.get(itemId);
    if (existingRequest) {
      return existingRequest;
    }
    const request = http.get(`/items/${itemId}`)
      .then((response) => {
        setCacheWithLimit(itemDetailCache, itemId, response.data, CACHE_LIMITS.itemDetail);
        return response.data;
      })
      .finally(() => {
        itemDetailInFlight.delete(itemId);
      });
    itemDetailInFlight.set(itemId, request);
    return request;
  },

  // Get all mods
  async getMods(): Promise<Mod[]> {
    const response = await http.get('/items/mods');
    return response.data;
  },

  async getItemsByIds(itemIds: string[]): Promise<Item[]> {
    const uniqueIds = Array.from(new Set(itemIds));
    const missingIds = uniqueIds.filter((id) => !itemDetailCache.has(id));

    if (missingIds.length > 0) {
      for (let i = 0; i < missingIds.length; i += BATCH_SIZE) {
        const chunk = missingIds.slice(i, i + BATCH_SIZE);
        const response = await http.post('/items/batch', { itemIds: chunk });
        for (const item of response.data as Item[]) {
          itemDetailCache.set(item.itemId, item);
        }
      }
    }

    return itemIds
      .map((id) => itemDetailCache.get(id))
      .filter((item): item is Item => item !== undefined);
  },

  async postPageAtlas(itemIds: string[], slotSize: number): Promise<PageAtlasResult | null> {
    const response = await http.post('/items/page-atlas', { itemIds, slotSize });
    return response.data;
  },

  async getPrecomputedPageAtlas(params: {
    page: number;
    pageSize: number;
    slotSize: number;
    modId?: string;
  }): Promise<PageAtlasResult | null> {
    const response = await http.get('/items/page-atlas/precomputed', {
      params,
    });
    return response.data;
  },


  // === indexed Recipe API (with machine icons) ===

  // Get machines for an item (indexed recipe API with machineIcon support)
  async getItemMachines(itemId: string): Promise<{
    itemId: string;
    itemName: string;
    machines: {
      machineType: string;
      category: string;
      voltageTier: string | null;
      voltage: number | null;
      recipeCount: number;
      recipes: Recipe[];
    }[];
  }> {
    const response = await http.get(`/recipes-indexed/${itemId}/machines`);
    return response.data;
  },

  // === Pattern Management ===

  // Get all pattern groups
  async getPatternGroups(): Promise<PatternGroup[]> {
    const response = await http.get('/patterns/groups');
    return response.data;
  },

  // Get single pattern group
  async getPatternGroup(groupId: string): Promise<PatternGroup> {
    const response = await http.get(`/patterns/groups/${groupId}`);
    return response.data;
  },

  // Get pattern group with patterns
  async getPatternGroupWithPatterns(groupId: string): Promise<PatternGroupWithPatterns> {
    const response = await http.get(`/patterns/groups/${groupId}/detail`);
    return response.data;
  },

  // Create pattern group
  async createPatternGroup(groupName: string, description?: string): Promise<PatternGroup> {
    const response = await http.post('/patterns/groups', {
      groupName,
      description
    });
    return response.data;
  },

  // Update pattern group
  async updatePatternGroup(groupId: string, groupName: string, description?: string): Promise<void> {
    await http.put(`/patterns/groups/${groupId}`, {
      groupName,
      description
    });
  },

  // Delete pattern group
  async deletePatternGroup(groupId: string): Promise<void> {
    await http.delete(`/patterns/groups/${groupId}`);
  },

  // Create pattern
  async createPattern(data: {
    groupId?: string;
    recipeId: string;
    patternName: string;
    outputItemId?: string;
    crafting?: number;
    substitute?: number;
    beSubstitute?: number;
    priority?: number;
  }): Promise<Pattern> {
    const response = await http.post('/patterns', data);
    return response.data;
  },

  // Delete pattern
  async deletePattern(patternId: string): Promise<void> {
    await http.delete(`/patterns/${patternId}`);
  },

  // Update pattern
  async updatePattern(patternId: string, updates: {
    patternName?: string;
    priority?: number;
    enabled?: number;
    crafting?: number;
    substitute?: number;
    beSubstitute?: number;
  }): Promise<void> {
    await http.put(`/patterns/${patternId}`, updates);
  },

  // Export pattern group to OC-AE JSON
  async exportPatternGroup(groupId: string): Promise<PatternExportData> {
    const response = await http.get(`/patterns/groups/${groupId}/export`);
    return response.data;
  },

  async getEcosystemOverview(): Promise<EcosystemOverview> {
    if (ecosystemOverviewCache) {
      return ecosystemOverviewCache;
    }
    if (ecosystemOverviewInFlight) {
      return ecosystemOverviewInFlight;
    }
    const request = http.get('/ecosystem/overview')
      .then((response) => {
        ecosystemOverviewCache = response.data;
        return response.data;
      })
      .finally(() => {
        ecosystemOverviewInFlight = null;
      });
    ecosystemOverviewInFlight = request;
    return request;
  },

  async getAnimatedAtlasEntry(assetId: string): Promise<AnimatedAtlasAssetEntry> {
    const response = await http.get('/render-contract/animated-atlas', {
      params: { assetId },
    });
    return response.data;
  },

  async getRecipeUiPayload(recipeId: string): Promise<RecipeUiPayload> {
    const cached = uiPayloadCache.get(recipeId);
    if (cached) {
      return cached;
    }
    const existingRequest = uiPayloadInFlight.get(recipeId);
    if (existingRequest) {
      return existingRequest;
    }
    const request = http.get('/render-contract/ui-payload', {
      params: { recipeId },
    })
      .then((response) => {
        uiPayloadCache.set(recipeId, response.data);
        return response.data;
      })
      .finally(() => {
        uiPayloadInFlight.delete(recipeId);
      });
    uiPayloadInFlight.set(recipeId, request);
    return request;
  },

  async getRecipeBootstrap(itemId: string): Promise<RecipeBootstrapPayload> {
    const cached = recipeBootstrapCache.get(itemId);
    if (cached) {
      return cached;
    }
    const existingRequest = recipeBootstrapInFlight.get(itemId);
    if (existingRequest) {
      return existingRequest;
    }
    const request = http.get(`/recipe-bootstrap/${encodeURIComponent(itemId)}`)
      .then((response) => {
        setCacheWithLimit(recipeBootstrapCache, itemId, response.data, CACHE_LIMITS.indexedSummary);
        return response.data;
      })
      .finally(() => {
        recipeBootstrapInFlight.delete(itemId);
      });
    recipeBootstrapInFlight.set(itemId, request);
    return request;
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
    const request = http.get(`/recipes-indexed/item/${encodeURIComponent(itemId)}/summary`)
      .then((response) => {
        setCacheWithLimit(indexedSummaryCache, itemId, response.data, CACHE_LIMITS.indexedSummary);
        return response.data;
      })
      .finally(() => {
        indexedSummaryInFlight.delete(itemId);
      });
    indexedSummaryInFlight.set(itemId, request);
    return request;
  },

  // Get recipe by ID
  async getIndexedRecipe(recipeId: string): Promise<indexedRecipe> {
    const response = await http.get(`/recipes-indexed/${recipeId}`);
    return response.data;
  },

  async getIndexedRecipesByIds(recipeIds: string[]): Promise<indexedRecipe[]> {
    const uniqueIds = Array.from(new Set(recipeIds.map((id) => id.trim()).filter(Boolean)));
    if (uniqueIds.length === 0) {
      return [];
    }
    const response = await http.post('/recipes-indexed/batch', { recipeIds: uniqueIds });
    return response.data;
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
    const request = http.get(`/recipes-indexed/${itemId}/crafting`)
      .then((response) => {
        setCacheWithLimit(indexedCraftingCache, itemId, response.data, CACHE_LIMITS.indexedCrafting);
        return response.data;
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
    const request = http.get(`/recipes-indexed/${itemId}/usage`)
      .then((response) => {
        setCacheWithLimit(indexedUsageCache, itemId, response.data, CACHE_LIMITS.indexedUsage);
        return response.data;
      })
      .finally(() => {
        indexedUsageInFlight.delete(itemId);
      });
    indexedUsageInFlight.set(itemId, request);
    return request;
  },

  async searchItemsFast(keyword: string, limit: number = 60, options?: SearchItemsFastOptions): Promise<ItemSearchBasic[]> {
    if (!keyword || !keyword.trim()) {
      return [];
    }
    const response = await http.get('/items/search/fast', {
      params: {
        q: keyword.trim(),
        limit,
      },
      signal: options?.signal,
    });
    return response.data;
  },

  // Get all available machines for item
  async getIndexedMachinesForItem(itemId: string): Promise<indexedItemMachinesResponse> {
    const response = await http.get(`/recipes-indexed/${itemId}/machines`);
    return response.data;
  },

  // Get all machine types
  async getIndexedMachineTypes(): Promise<string[]> {
    const response = await http.get('/recipes-indexed/machines/list');
    return response.data;
  },

  // Get recipes by machine type
  async getIndexedRecipesByMachine(machineType: string, voltageTier?: string): Promise<{
    machineType: string;
    voltageTier: string;
    recipeCount: number;
    recipes: indexedRecipe[];
  }> {
    const params = voltageTier ? { voltageTier } : {};
    const response = await http.get(`/recipes-indexed/machines/${encodeURIComponent(machineType)}/recipes`, { params });
    return response.data;
  },

  // Get multiblock blueprint by controller item ID
  async getMultiblockBlueprint(controllerItemId: string): Promise<MultiblockBlueprint> {
    const response = await http.get(`/multiblocks/${encodeURIComponent(controllerItemId)}`);
    return response.data;
  },

  async getGTDiagramsOverview(): Promise<GTDiagramsOverview> {
    const response = await http.get('/gt-diagrams/overview');
    return response.data;
  },

  async getForestryGeneticsOverview(): Promise<ForestryGeneticsOverview> {
    const response = await http.get('/forestry-genetics/overview');
    return response.data;
  }
};
