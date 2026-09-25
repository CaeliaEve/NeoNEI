export interface PublicRuntimeManifest {
  version: number;
  status?: 'ready' | 'blocked' | 'stale';
  probes?: PublishManifestProbeSummary;
  sourceSignature: string;
  compiledAt: string | null;
  publishRevision?: string | null;
  publishCompiledAt?: string | null;
  browserLayoutKey?: string | null;
  runtimeCacheKey?: string;
  publishBundle?: PublishStaticBundleManifest | null;
}

export type PublishManifestProbeStatus = 'ready' | 'missing' | 'invalid' | 'stale';
export type PublishManifestProbeName =
  | 'database'
  | 'sourceSignature'
  | 'publishRevision'
  | 'publishCompiledAt'
  | 'browserLayoutKey'
  | 'publishBundle'
  | 'runtimeCacheKey';

export interface PublishManifestProbe {
  name: PublishManifestProbeName;
  status: PublishManifestProbeStatus;
  required: true;
  path: string | null;
  value: string | null;
  message: string | null;
}

export interface PublishManifestProbeSummary {
  status: 'ready' | 'blocked' | 'stale';
  probes: Record<PublishManifestProbeName, PublishManifestProbe>;
  missing: PublishManifestProbeName[];
  invalid: PublishManifestProbeName[];
  stale: PublishManifestProbeName[];
  errors: string[];
}

export type RuntimeHealthArtifactProbeStatus = 'present' | 'missing' | 'invalid';
export type RuntimeHealthArtifactProbeName =
  | 'manifest'
  | 'validationReport'
  | 'migrationReadiness'
  | 'neiBrowserContract'
  | 'recipeFragmentation'
  | 'exportPathHygiene'
  | 'externalRuntimePromotionReport';

export interface RuntimeHealthArtifactProbe {
  name: RuntimeHealthArtifactProbeName;
  key: string;
  status: RuntimeHealthArtifactProbeStatus;
  path: string | null;
  relativePath: string | null;
  bytes: number | null;
  mtimeMs: number | null;
  error: string | null;
}

export interface RuntimeHealthSummary {
  schemaVersion: 'neonei/runtime-health-summary/current';
  status: 'ok' | 'warning' | 'blocked' | 'degraded';
  generatedAt: string;
  contractVersion?: string;
  distData: {
    exists: boolean;
    manifestExists: boolean;
    source: string | null;
    sourceRepository: string | null;
    generatedAt: string | null;
    runtime: Record<string, unknown> | null;
  };
  artifacts: {
    status: 'ok' | 'missing' | 'invalid';
    probes: Record<RuntimeHealthArtifactProbeName, RuntimeHealthArtifactProbe>;
    errors: string[];
  };
  counts: Record<string, number | null>;
  coverage: Record<string, number | null>;
  validation: {
    migrationReadinessStatus: string | null;
    neiBrowserContractStatus: string | null;
    recipeFragmentationStatus: string | null;
    exportPathHygieneStatus: string | null;
    compilerValidationBlocked: boolean;
    blockedGates: string[];
    warnings: string[];
    nativeUiProofStatus?: 'ok' | 'blocked' | 'missing';
    nativeUiProofBlocked?: boolean;
  };
  files: {
    declared: number;
    present: number;
    missing: Array<{ key: string; path: string }>;
    totalBytes: number;
  };
  runtimeSnapshot?: {
    status: 'ready' | 'missing' | 'invalid';
    available: boolean;
    revision: number | null;
    runtimeId: string | null;
    runtimeSchemaRevision: string | null;
    manifestPath: string | null;
    fingerprint: string | null;
    declaredFiles: number;
    presentArtifacts: number;
    missingArtifacts: string[];
    totalBytes: number;
    errors: readonly string[];
  };
  compiler?: unknown;
  nativeUi?: NativeUiRuntimeProofSummary;
  nativeRender?: NativeRenderRuntimeDiagnostics;
}

export interface NativeUiRuntimeProofSummary {
  schemaVersion: 'neonei/native-ui-runtime-proof/current';
  status: 'ok' | 'blocked' | 'missing';
  reports: {
    nativeUiExportAbi: NativeUiProofReportSummary;
    uiPackAbi: NativeUiProofReportSummary;
  };
  checks: Record<string, boolean>;
  counts: Record<string, number | null>;
  missing: string[];
  blocked: string[];
}

export interface NativeUiProofReportSummary {
  logicalName: string;
  displayName: string;
  path: string;
  declared: boolean;
  present: boolean;
  bytes: number | null;
  mtimeMs: number | null;
  schemaVersion: string | null;
  status: 'ok' | 'blocked' | 'missing';
  reportStatus: string | null;
  blocked: string[];
  counts: Record<string, number | null>;
}

export type NativeRenderRuntimeDiagnosticStatus = 'ok' | 'degraded' | 'missing' | 'invalid';
export type NativeRenderRuntimeArtifactProbeStatus = 'present' | 'missing' | 'invalid';
export type NativeRenderRuntimeArtifactName = 'manifest' | 'nativeRenderIndex';

export interface NativeRenderRuntimeArtifactProbe {
  name: NativeRenderRuntimeArtifactName;
  status: NativeRenderRuntimeArtifactProbeStatus;
  path: string | null;
  relativePath: string | null;
  bytes: number | null;
  mtimeMs: number | null;
  error: string | null;
}

export interface NativeRenderRuntimeDiagnostics {
  schemaVersion: 'neonei/native-render-runtime-diagnostics/current';
  status: NativeRenderRuntimeDiagnosticStatus;
  distDataRoot: string;
  manifestPath: string;
  nativeRenderIndexPath: string | null;
  artifacts: Record<NativeRenderRuntimeArtifactName, NativeRenderRuntimeArtifactProbe>;
  checks: Record<string, boolean>;
  counts: Record<string, number>;
  validation: {
    status: string | null;
    shaderItemsNeedingCapture: number;
    framebufferCaptures: number;
    summary: string | null;
  };
  missing: string[];
  errors: string[];
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

export interface PublishBundleAssetMetadata {
  path: string;
  contentAddressedPath: string;
  relativePath: string;
  contentType: string;
  sizeBytes: number;
  sha256: string;
}

export interface PublishBundleIdentity {
  algorithm: 'sha256';
  assetCount: number;
  totalBytes: number;
  contentHash: string;
  categories: Record<string, string>;
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
  identity?: PublishBundleIdentity;
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
  compression?: {
    sidecars: Array<'br' | 'gzip'>;
    assets: Record<string, PublishBundleAssetMetadata>;
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
  publicItemId?: string | null;
  variantId?: string | null;
  payloadHash?: string | null;
  semanticFamily?: string | null;
  semanticClassification?: string | null;
  facetSummary?: string | null;
  facets?: Record<string, unknown> | null;
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
  captureKey: string;
  machineType?: string;
  recipeType?: string;
  nativeFrame?: {
    status?: string;
    assetRef?: string;
    width?: number;
    height?: number;
    coordinateSpace?: string;
    source?: string | null;
    handlerKey?: string | null;
    handlerClass?: string | null;
    recipeIndex?: number | null;
    [key: string]: unknown;
  } | null;
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

export interface NativeRenderBackendInfo {
  schemaVersion?: string;
  backend?: string | null;
  angelicaPresent?: boolean;
  optifinePresent?: boolean;
  shaderPackInUse?: boolean;
  shadersEnabled?: boolean;
  [key: string]: unknown;
}

export interface NativeItemRendererEntry {
  rendererClass?: string | null;
  rendererKind?: string | null;
  usesShader?: boolean;
  requiresFramebufferCapture?: boolean;
  supportsNativeAtlas?: boolean;
  stackResolved?: boolean;
  hasNbt?: boolean;
  [key: string]: unknown;
}

export interface NativeShaderItemEntry {
  rendererKind?: string | null;
  rendererClass?: string | null;
  shaderFamily?: string | null;
  timeSource?: string | null;
  captureRequired?: boolean;
  preferredExport?: string | null;
  browserReimplementationAllowed?: boolean;
  [key: string]: unknown;
}

export interface NativeCaptureFrameEntry {
  index?: number;
  frameIndex?: number;
  timelineIndex?: number;
  durationMs?: number | null;
  path?: string | null;
  sourcePath?: string | null;
  [key: string]: unknown;
}

export interface NativeFramebufferCaptureEntry {
  assetId: string;
  variantKey: string;
  rendererFamily?: string | null;
  renderMode?: string | null;
  animationMode?: string | null;
  captureMethod?: string | null;
  primaryArtifact?: string | null;
  framePattern?: string | null;
  frameCount?: number | null;
  frameDurationMs?: number | null;
  timeline?: NativeCaptureFrameEntry[];
  frames?: NativeCaptureFrameEntry[];
  [key: string]: unknown;
}

export interface NativeTextureSpriteTimelineEntry {
  frameIndex?: number;
  durationMs?: number;
  [key: string]: unknown;
}

export interface NativeTextureSpriteEntry {
  atlas?: string | null;
  spriteKey?: string | null;
  iconName?: string | null;
  spriteClass?: string | null;
  originX?: number | null;
  originY?: number | null;
  width?: number | null;
  height?: number | null;
  animated?: boolean;
  frameCount?: number | null;
  defaultFrameTimeTicks?: number | null;
  metadataFrameCount?: number | null;
  interpolate?: boolean;
  timeline?: NativeTextureSpriteTimelineEntry[];
  [key: string]: unknown;
}

export interface NativeRenderIndex {
  schemaVersion?: string;
  backend?: NativeRenderBackendInfo | null;
  counts?: Record<string, number>;
  itemRendererByItemId?: Record<string, NativeItemRendererEntry>;
  shaderByItemId?: Record<string, NativeShaderItemEntry>;
  capturesByAssetId?: Record<string, NativeFramebufferCaptureEntry>;
  capturesByVariantKey?: Record<string, NativeFramebufferCaptureEntry>;
  spriteByIconName?: Record<string, NativeTextureSpriteEntry>;
  validation?: {
    status?: string;
    shaderItemsNeedingCapture?: number;
    framebufferCaptures?: number;
    summary?: string;
    [key: string]: unknown;
  };
}

export interface BrowserVariantGroup {
  key: string;
  representative: Item;
  size: number;
  visibleCount: number;
  expandable: boolean;
  label: string;
  semanticFamily?: string | null;
  semanticClassification?: string | null;
  groupSource?: string | null;
}

export type BrowserGridEntry =
  | { key: string; kind: 'item'; item: Item }
  | { key: string; kind: 'group-collapsed' | 'group-header'; group: BrowserVariantGroup };

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
  groupKey?: string | null;
  groupLabel?: string | null;
  groupSize?: number | null;
  representativeItemId?: string | null;
  groupSource?: string | null;
  publicItemId?: string | null;
  variantId?: string | null;
  family?: string | null;
  classification?: string | null;
  facetSummary?: string | null;
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
