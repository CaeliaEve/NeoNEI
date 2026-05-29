export interface PublicRuntimeManifest {
  version: number;
  sourceSignature: string;
  compiledAt: string | null;
  publishRevision?: string | null;
  publishCompiledAt?: string | null;
  browserLayoutKey?: string | null;
  runtimeCacheKey?: string;
  publishBundle?: PublishStaticBundleManifest | null;
}

export interface PublishBundleWindowPathEntry {
  scope: string;
  slotSize: number;
  path: string;
  offset: number;
  length: number;
}

export interface PublishBundleSearchShardPathEntry {
  scope: string;
  shardId: string;
  path: string;
  total: number;
}

export interface PublishStaticBundleManifest {
  version: number;
  sourceSignature: string;
  revision: string;
  compiledAt: string;
  publicBasePath: string;
  firstPageSize: number;
  slotSizes: number[];
  includeBrowserSearchPack: boolean;
  files: {
    manifest: string;
    modsList: string | null;
    browserSearchPack: string | null;
    browserSearchShards: PublishBundleSearchShardPathEntry[];
    recipeBootstrapBasePath: string | null;
    recipeBootstrapShardBasePath: string | null;
    recipeBootstrapItems: string[];
    recipeGroupIndexBasePath: string | null;
    recipeGroupWindowBasePath?: string | null;
    recipeSearchBasePath: string | null;
    recipeSearchItems: string[];
    itemRecipeBundleBasePath: string | null;
    itemRecipeBundleItems: string[];
    recipeUiBundleBasePath: string | null;
    recipeUiBundleItems: string[];
    browserPageWindows: PublishBundleWindowPathEntry[];
    homeBootstrapWindows: PublishBundleWindowPathEntry[];
  };
  recipeCoverage?: {
    recipeBootstrapItems: number;
    recipeGroupIndexItems: number;
    recipeGroupWindowItems: number;
    missingRecipeWindowItems: number;
    recipeGroupIndexPayloads: number;
    recipeGroupWindowPayloads: number;
    missingRecipeWindowItemIds: string[];
  };
}

export interface ItemRenderHint {
  renderMode: string | null;
  animationMode: string | null;
  playbackHint: string | null;
  frameCount: number | null;
  explicitStatic: boolean;
  prefersNativeSprite: boolean;
  prefersCapturedAtlas: boolean;
  hasAnimation: boolean;
}

export interface Item {
  itemId: string;
  modId: string;
  internalName: string;
  localizedName: string;
  renderAssetRef?: string | null;
  renderHint?: ItemRenderHint | null;
  preferredImageUrl?: string | null;
  unlocalizedName?: string;
  damage?: number;
  maxStackSize?: number;
  maxDamage?: number;
  imageFileName?: string | null;
  tooltip?: string | null;
  searchTerms?: string | null;
  toolClasses?: string | null;
  browserGroupKey?: string | null;
  browserGroupLabel?: string | null;
  browserGroupSize?: number | null;
  nbt?: string | null;
  [key: string]: unknown;
}

export interface Mod {
  modId: string;
  modName: string;
  itemCount: number;
}

export interface DimensionDTO {
  width: number;
  height: number;
}

export interface indexedItem {
  itemId: string;
  modId: string;
  internalName: string;
  localizedName: string;
  renderAssetRef?: string | null;
  renderHint?: ItemRenderHint | null;
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

export interface RecipeItem {
  itemId: string;
  count: number;
  renderAssetRef?: string | null;
  renderHint?: ItemRenderHint | null;
  localizedName?: string | null;
  imageFileName?: string | null;
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
    renderAssetRef?: string | null;
    renderHint?: ItemRenderHint | null;
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
  machineKey?: string;
  machineIcon?: indexedMachineInfo['machineIcon'] | null;
}

export interface indexedRecipeCategorySummary {
  type: 'crafting' | 'machine';
  name: string;
  recipeType: string;
  recipeCount: number;
  categoryKey: string;
  machineKey?: string | null;
  voltageTier?: string | null;
  machineIcon?: indexedMachineInfo['machineIcon'] | null;
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
  producedByMachineGroups?: indexedMachineGroupSummary[];
  usedInMachineGroups?: indexedMachineGroupSummary[];
  producedByCategoryGroups?: indexedRecipeCategorySummary[];
  usedInCategoryGroups?: indexedRecipeCategorySummary[];
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
  mediaManifest?: PageRichMediaManifest | null;
}

export interface RecipeBootstrapMachineGroupPayload {
  itemId: string;
  machineType: string;
  voltageTier: string | null;
  recipeCount: number;
  recipes: indexedRecipe[];
  recipeIds?: string[];
  offset?: number;
  limit?: number;
  hasMore?: boolean;
  mediaManifest?: PageRichMediaManifest | null;
}

export interface RecipeBootstrapCategoryGroupPayload {
  itemId: string;
  categoryKey: string;
  tab: 'usedIn' | 'producedBy';
  recipeCount: number;
  recipes: indexedRecipe[];
  recipeIds?: string[];
  offset?: number;
  limit?: number;
  hasMore?: boolean;
  mediaManifest?: PageRichMediaManifest | null;
}

export interface RecipeBootstrapSearchPayload {
  itemId: string;
  tab: 'usedIn' | 'producedBy';
  query: string;
  recipeIds: string[];
  itemMatches: ItemSearchBasic[];
}

export interface PublishedRecipeBootstrapSearchEntry {
  recipeId: string;
  machineType: string;
  referencedItemIds: string[];
  searchText: string;
}

export interface PublishedRecipeBootstrapSearchPack {
  version: number;
  sourceSignature: string;
  itemId: string;
  tab: 'usedIn' | 'producedBy';
  relation: 'produced-by' | 'used-in';
  recipeCount: number;
  entries: PublishedRecipeBootstrapSearchEntry[];
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

export interface BrowserVariantGroup {
  key: string;
  representative: Item;
  size: number;
  visibleCount: number;
  expandable: boolean;
  label: string;
}

export type BrowserGridEntry =
  | { key: string; kind: 'item'; item: Item }
  | { key: string; kind: 'group-collapsed' | 'group-header'; group: BrowserVariantGroup };

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

export interface PageRichMediaManifest {
  animatedAtlases: Record<string, AnimatedAtlasAssetEntry>;
}

export interface BrowserPageResourceManifest {
  itemIds: string[];
  renderAssetRefs: string[];
  atlasUrls: string[];
  animatedAtlasFiles: string[];
  atlasEntryCount: number;
  animatedAtlasCount: number;
}

export interface BrowserPagePackResponse extends PaginatedResponse<BrowserGridEntry> {
  atlas: PageAtlasResult | null;
  mediaManifest?: PageRichMediaManifest | null;
  resourceManifest?: BrowserPageResourceManifest;
  windowOffset?: number;
  windowLength?: number;
}

export interface HomeBootstrapResponse {
  manifest: PublicRuntimeManifest;
  mods: Mod[];
  pagePack: BrowserPagePackResponse;
}

export interface BrowserDefaultCatalogResponse extends PaginatedResponse<BrowserGridEntry> {}
export interface BrowserSearchCatalogResponse extends PaginatedResponse<BrowserGridEntry> {}

export interface BrowserGroupItemsResponse {
  groupKey: string;
  total: number;
  items: Item[];
}

export interface BrowserByIdsPackResponse {
  data: Array<{ key: string; kind: 'item'; item: Item }>;
  atlas: PageAtlasResult | null;
  mediaManifest?: PageRichMediaManifest | null;
  resourceManifest?: BrowserPageResourceManifest;
}

export interface BrowserSearchPackEntry {
  itemId: string;
  localizedName: string;
  modId: string;
  normalizedLocalizedName: string;
  normalizedInternalName: string;
  normalizedItemId: string;
  normalizedSearchTerms: string;
  pinyinFull: string;
  pinyinAcronym: string;
  aliases: string;
  popularityScore: number;
  searchRank: number;
}

export interface BrowserSearchPackResponse {
  version: number;
  signature?: string;
  total: number;
  items: BrowserSearchPackEntry[];
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface AnimatedAtlasFrameEntry {
  index: number;
  sourcePath: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface AnimatedAtlasTimelineEntry {
  timelineIndex: number;
  frameIndex: number;
  index: number;
  durationMs: number;
}

export interface AnimatedAtlasAssetEntry {
  assetId: string;
  variantKey: string;
  frameDurationMs: number | null;
  loopMode: string | null;
  frameCount: number;
  timeline: AnimatedAtlasTimelineEntry[];
  frames: AnimatedAtlasFrameEntry[];
  atlasFile: string;
  atlasGroup: string;
}

export interface BrowserAtlasStaticPlacement {
  atlasGroup?: string | null;
  atlasFile?: string | null;
  atlasWidth?: number | null;
  atlasHeight?: number | null;
  x?: number | null;
  y?: number | null;
  width?: number | null;
  height?: number | null;
  sourcePath?: string | null;
}

export interface BrowserAtlasAnimatedFrame {
  index?: number;
  frameIndex?: number;
  timelineIndex?: number;
  durationMs?: number;
  sourcePath?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}

export interface BrowserAtlasAnimatedPlacement {
  atlasGroup?: string | null;
  atlasFile?: string | null;
  atlasWidth?: number | null;
  atlasHeight?: number | null;
  variantKey?: string | null;
  frameDurationMs?: number | null;
  loopMode?: string | null;
  frameCount?: number | null;
  frames?: BrowserAtlasAnimatedFrame[] | null;
  timeline?: BrowserAtlasAnimatedFrame[] | null;
}

export interface BrowserAtlasItemEntry {
  itemId: string;
  assetId?: string | null;
  variantKey?: string | null;
  mode?: string | null;
  renderMode?: string | null;
  resolutionMode?: string | null;
  rendererFamily?: string | null;
  playbackHint?: string | null;
  hasStaticAtlas?: boolean;
  hasAnimatedAtlas?: boolean;
  staticAtlas?: BrowserAtlasStaticPlacement | null;
  animatedAtlas?: BrowserAtlasAnimatedPlacement | null;
}

export interface BrowserAtlasIndexResponse {
  schemaVersion?: string;
  generatedAt?: number;
  staticAtlasManifest?: string | null;
  animatedAtlasManifest?: string | null;
  renderIndex?: string | null;
  itemCount?: number;
  animatedItemCount?: number;
  missingAtlasCount?: number;
  layoutCoverage?: {
    layoutItemCount: number;
    atlasItemCount: number;
    coveredLayoutItemCount: number;
    missingLayoutItemCount: number;
    missingLayoutItemIds: string[];
  };
  items: BrowserAtlasItemEntry[];
}
