import { logger } from '../utils/logger';
import { getAccelerationDatabaseManager, type DatabaseManager } from '../models/database';
import { getMachineIconItem } from './machine-icon-mapping.service';
import { getItemsSearchService, type ItemBasicInfo, type ItemsSearchService } from './items-search.service';
import { getNesqlSplitExportService } from './nesql-split-export.service';
import { transformRecipeMetadata } from './recipe-metadata';
import {
  buildRecipeCategorySummaries,
  describeRecipeCategory,
  type RecipeCategorySummary,
} from './recipe-category-grouping.service';
import { getRenderContractService, type RenderAnimationHint } from './render-contract.service';

export interface IndexedItem {
  itemId: string;
  modId: string;
  internalName: string;
  localizedName: string;
  renderAssetRef?: string | null;
  renderHint?: RenderAnimationHint | null;
  damage: number;
  stackSize: number;
  maxStackSize: number;
  maxDamage: number;
  nbt: string | null;
  imageFileName: string | null;
  tooltip: string | null;
}

export interface IndexedItemStack {
  item: IndexedItem;
  stackSize: number;
  probability: number;
}

export interface IndexedItemGroup {
  slotIndex: number;
  items: IndexedItemStack[];
  isOreDictionary: boolean;
  oreDictName: string | null;
}

export interface IndexedFluid {
  fluidId: string;
  modId: string;
  internalName: string;
  localizedName: string;
  renderAssetRef?: string | null;
  renderHint?: RenderAnimationHint | null;
  temperature: number;
}

export interface IndexedFluidStack {
  fluid: IndexedFluid;
  amount: number;
  probability: number;
}

export interface IndexedFluidGroup {
  slotIndex: number;
  fluids: IndexedFluidStack[];
}

export interface IndexedMachineInfo {
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
    renderHint?: RenderAnimationHint | null;
    imageFileName: string;
  };
}

export interface IndexedRecipeMetadata {
  voltageTier: string | null;
  voltage: number | null;
  amperage: number | null;
  duration: number | null;
  totalEU: number | null;
  requiresCleanroom: boolean | null;
  requiresLowGravity: boolean | null;
  additionalInfo: string | null;
  specialItems?: IndexedItem[];
  aspects?: Record<string, unknown>;
  specialRecipeType?: unknown;
  research?: unknown;
  centralItemId?: unknown;
  centerInputSlotIndex?: unknown;
  instability?: unknown;
  componentSlotOrder?: unknown[];
  [key: string]: unknown;
}

type IndexedRecipeDimension = { width: number; height: number };

type IndexedRecipeMachineIcon = {
  itemId: string;
  modId: string;
  internalName: string;
  localizedName: string;
  renderAssetRef?: string | null;
  renderHint?: RenderAnimationHint | null;
  imageFileName: string;
};

export type RecipeTypeData = {
  id?: string;
  category?: string;
  type?: string;
  iconInfo?: string;
  shapeless?: boolean;
  machineIcon?: IndexedRecipeMachineIcon;
  machineType?: string;
  itemInputDimension?: IndexedRecipeDimension;
  fluidInputDimension?: IndexedRecipeDimension;
  itemOutputDimension?: IndexedRecipeDimension;
  fluidOutputDimension?: IndexedRecipeDimension;
  [key: string]: unknown;
};

export interface IndexedRecipe {
  id: string;
  recipeType: string;
  outputs: IndexedItemStack[];
  inputs: IndexedItemGroup[] | IndexedItemGroup[][];
  fluidInputs: IndexedFluidGroup[];
  fluidOutputs: IndexedFluidStack[];
  machineInfo: IndexedMachineInfo | null;
  metadata: IndexedRecipeMetadata | null;
  additionalData?: Record<string, unknown> | null;
  recipeTypeData?: RecipeTypeData;
}

export interface MachineOption {
  machineType: string;
  category: string;
  voltageTier: string | null;
  voltage: number | null;
  recipeCount: number;
  recipes: IndexedRecipe[];
}

export interface MachineGroupSummary {
  machineType: string;
  category: string;
  voltageTier: string | null;
  voltage: number | null;
  recipeCount: number;
  machineKey?: string;
  machineIcon?: IndexedRecipeMachineIcon | null;
}

export interface ItemMachinesResponse {
  itemId: string;
  itemName: string;
  machines: MachineOption[];
}

export interface ItemRecipeSummaryResponse {
  itemId: string;
  itemName: string;
  counts: {
    producedBy: number;
    usedIn: number;
    machineGroups: number;
  };
  machineGroups: MachineGroupSummary[];
  producedByMachineGroups?: MachineGroupSummary[];
  usedInMachineGroups?: MachineGroupSummary[];
  producedByCategoryGroups?: RecipeCategorySummary[];
  usedInCategoryGroups?: RecipeCategorySummary[];
}

export interface RecipeGroupPackOptions {
  offset?: number;
  limit?: number;
  includeRecipeIds?: boolean;
}

export interface RecipeGroupPackResponse {
  recipeCount: number;
  recipes: IndexedRecipe[];
  recipeIds?: string[];
  offset: number;
  limit: number;
  hasMore: boolean;
}

const BOTANIA_TERRASTEEL_ITEM_ID = 'i~Botania~manaResource~4';
type RecipeIndexColumn = 'produced_by_recipes' | 'used_in_recipes';

type MaterializedBootstrapRow = {
  produced_by_ids: string | null;
  used_in_ids: string | null;
  produced_by_payload: string | null;
  used_in_payload: string | null;
  summary_payload: string | null;
};

type MaterializedRecipeCoreRow = {
  payload: string | null;
};

type MaterializedSummaryRow = {
  summary_payload: string | null;
};

type MaterializedMachineGroupRow = {
  relation_type: string | null;
  machine_key: string;
  family: string | null;
  voltage_tier: string | null;
  recipe_ids_blob: string | null;
  recipe_count: number | null;
};

type MaterializedCategoryGroupRow = {
  relation_type: string | null;
  category_key: string;
  category_type: string | null;
  category_name: string | null;
  machine_key: string | null;
  voltage_tier: string | null;
  recipe_ids_blob: string | null;
  recipe_count: number | null;
};

type MaterializedRecipeDescriptorRow = {
  recipe_id: string;
  recipe_type: string | null;
  family: string | null;
  machine_type: string | null;
  voltage_tier: string | null;
};

type RelationRecipeDescriptorState = {
  rows: MaterializedRecipeDescriptorRow[];
  occurrences: Map<string, number>;
};

type RecipeRelationType = 'produced_by' | 'used_in';

type UiPayloadRow = {
  recipe_id: string;
  payload_json: string | null;
};

export interface IndexedRecipesServiceOptions {
  databaseManager?: DatabaseManager;
  splitExportFallback?: boolean;
  itemsSearchService?: Pick<ItemsSearchService, 'searchItems'>;
}

const MACHINE_TYPE_ALIAS_GROUPS: string[][] = [
  ['Terra Plate', '泰拉凝聚板'],
  ['Rune Altar', '符文祭坛'],
  ['Mana Pool', '魔力池'],
  ['Pure Daisy', '白雏菊'],
  ['Binding Ritual', '绑定仪式'],
  ['Blood Altar', '血之祭坛', '血祭坛'],
  ['Alchemy Array', '炼金阵', '炼金法阵'],
  ['Alchemy Table', '炼金台'],
  ['Arcane Infusion', '奥术注魔'],
  ['Arcane Worktable', '奥术工作台', '奥术合成'],
  ['Crucible', '坩埚'],
  ['真空冷冻机', '凛冰冷冻机'],
  ['电解机', '工业电解机'],
  ['离心机', '工业离心机'],
  ['化学反应釜', '大型化学反应釜'],
  ['高炉', '工业高炉'],
  ['搅拌机', '工业搅拌机'],
];

export function normalizeMachineFamilyName(machineType: string): string {
  const normalized = machineType.trim();
  if (!normalized) return normalized;

  const withoutTier = normalized.replace(/\s*\((ULV|LV|MV|HV|EV|IV|LuV|ZPM|UV|UHV|UEV|UIV|UMV|UXV|MAX)\)\s*$/i, '').trim();
  const group = MACHINE_TYPE_ALIAS_GROUPS.find((aliases) => aliases.includes(withoutTier));
  return group?.[0] ?? withoutTier;
}

function normalizeMachineGroups(groups: MachineGroupSummary[]): MachineGroupSummary[] {
  const merged = new Map<string, MachineGroupSummary>();

  for (const group of groups) {
    const normalizedMachineType = normalizeMachineFamilyName(group.machineType);
    const key = `${normalizedMachineType}::${group.voltageTier ?? ''}`;
    const existing = merged.get(key);
    if (existing) {
      existing.recipeCount += group.recipeCount;
      continue;
    }

    merged.set(key, {
      ...group,
      machineType: normalizedMachineType,
      machineKey: `${normalizedMachineType}::${group.voltageTier ?? ''}`,
      machineIcon: group.machineIcon ?? getMachineIconItem(normalizedMachineType) ?? null,
    });
  }

  return Array.from(merged.values());
}

export function normalizeItemRecipeSummary(summary: ItemRecipeSummaryResponse): ItemRecipeSummaryResponse {
  const producedByMachineGroups = normalizeMachineGroups(summary.producedByMachineGroups || summary.machineGroups || []);
  const usedInMachineGroups = normalizeMachineGroups(summary.usedInMachineGroups || []);
  const producedByCategoryGroups = Array.isArray(summary.producedByCategoryGroups)
    ? summary.producedByCategoryGroups
    : [];
  const usedInCategoryGroups = Array.isArray(summary.usedInCategoryGroups)
    ? summary.usedInCategoryGroups
    : [];
  return {
    ...summary,
    counts: {
      ...summary.counts,
      machineGroups: producedByMachineGroups.length,
    },
    machineGroups: producedByMachineGroups,
    producedByMachineGroups,
    usedInMachineGroups,
    producedByCategoryGroups,
    usedInCategoryGroups,
  };
}

function expandMachineTypeAliases(machineType: string): string[] {
  const normalized = normalizeMachineFamilyName(machineType);
  if (!normalized) return [];
  const group = MACHINE_TYPE_ALIAS_GROUPS.find((aliases) => aliases[0] === normalized || aliases.includes(machineType.trim()));
  if (!group) return [normalized];
  return Array.from(new Set(group));
}

function chunkStrings(values: string[], maxChunkSize: number): string[][] {
  if (values.length === 0) return [];
  const chunkSize = Math.max(1, Math.floor(maxChunkSize));
  const chunks: string[][] = [];
  for (let index = 0; index < values.length; index += chunkSize) {
    chunks.push(values.slice(index, index + chunkSize));
  }
  return chunks;
}

export class IndexedRecipesService {
  private databaseManager: DatabaseManager;
  private splitExportFallback: boolean;
  private itemsSearchService: Pick<ItemsSearchService, 'searchItems'>;
  private splitExportService = getNesqlSplitExportService();
  private readonly indexCacheTtlMs = Number(process.env.RECIPE_INDEX_CACHE_TTL_MS || 15_000);
  private readonly machineTypesCacheTtlMs = Number(process.env.MACHINE_TYPES_CACHE_TTL_MS || 60_000);
  private readonly summaryCacheTtlMs = Number(process.env.RECIPE_SUMMARY_CACHE_TTL_MS || 10_000);
  private readonly transformedRecipeCacheTtlMs = Number(process.env.TRANSFORMED_RECIPE_CACHE_TTL_MS || 10 * 60 * 1000);
  private readonly recipeCollectionCacheTtlMs = Number(process.env.RECIPE_COLLECTION_CACHE_TTL_MS || 5 * 60 * 1000);
  private readonly relationDescriptorCacheTtlMs = Number(process.env.RELATION_DESCRIPTOR_CACHE_TTL_MS || 5 * 60 * 1000);
  private readonly recipeIndexCache = new Map<string, { expiresAt: number; recipeIds: string[] }>();
  private readonly recipeSummaryCache = new Map<string, { expiresAt: number; value: ItemRecipeSummaryResponse }>();
  private readonly transformedRecipeCache = new Map<string, { expiresAt: number; value: IndexedRecipe }>();
  private readonly recipeCollectionCache = new Map<string, { expiresAt: number; value: IndexedRecipe[] }>();
  private readonly relationDescriptorCache = new Map<string, { expiresAt: number; value: RelationRecipeDescriptorState }>();
  private machineTypesCache: { expiresAt: number; value: string[] } | null = null;

  constructor(options: IndexedRecipesServiceOptions = {}) {
    this.databaseManager = options.databaseManager ?? getAccelerationDatabaseManager();
    this.splitExportFallback = options.splitExportFallback ?? true;
    this.itemsSearchService = options.itemsSearchService ?? getItemsSearchService();
  }

  private ensureSplitRecipesAvailable(): void {
    if (!this.splitExportService.hasSplitRecipes()) {
      throw new Error('Split recipe export is unavailable');
    }
  }

  private getAccelerationDatabase() {
    try {
      return this.databaseManager.getDatabase();
    } catch {
      return null;
    }
  }

  private canUseMaterializedBootstrap(db: ReturnType<IndexedRecipesService['getAccelerationDatabase']>): db is NonNullable<ReturnType<IndexedRecipesService['getAccelerationDatabase']>> {
    if (!db) return false;
    try {
      const row = db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'recipe_bootstrap'")
        .get() as { name?: string } | undefined;
      return row?.name === 'recipe_bootstrap';
    } catch {
      return false;
    }
  }

  private getMaterializedBootstrapRow(itemId: string): MaterializedBootstrapRow | null {
    const db = this.getAccelerationDatabase();
    if (!this.canUseMaterializedBootstrap(db)) {
      return null;
    }

    const row = db
      .prepare(`
        SELECT produced_by_ids, used_in_ids, produced_by_payload, used_in_payload, summary_payload
        FROM recipe_bootstrap
        WHERE item_id = ?
      `)
      .get(itemId) as MaterializedBootstrapRow | undefined;

    return row ?? null;
  }

  private canUseMaterializedRecipesCore(db: ReturnType<IndexedRecipesService['getAccelerationDatabase']>): db is NonNullable<ReturnType<IndexedRecipesService['getAccelerationDatabase']>> {
    if (!db) return false;
    try {
      const row = db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'recipes_core'")
        .get() as { name?: string } | undefined;
      return row?.name === 'recipes_core';
    } catch {
      return false;
    }
  }

  private canUseMaterializedSummary(db: ReturnType<IndexedRecipesService['getAccelerationDatabase']>): db is NonNullable<ReturnType<IndexedRecipesService['getAccelerationDatabase']>> {
    if (!db) return false;
    try {
      const row = db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'recipe_summary_compact'")
        .get() as { name?: string } | undefined;
      return row?.name === 'recipe_summary_compact';
    } catch {
      return false;
    }
  }

  private canUseMaterializedMachineGroups(db: ReturnType<IndexedRecipesService['getAccelerationDatabase']>): db is NonNullable<ReturnType<IndexedRecipesService['getAccelerationDatabase']>> {
    if (!db) return false;
    try {
      const row = db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'recipe_machine_groups'")
        .get() as { name?: string } | undefined;
      return row?.name === 'recipe_machine_groups';
    } catch {
      return false;
    }
  }

  private canUseMaterializedRecipeEdges(db: ReturnType<IndexedRecipesService['getAccelerationDatabase']>): db is NonNullable<ReturnType<IndexedRecipesService['getAccelerationDatabase']>> {
    if (!db) return false;
    try {
      const row = db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'recipe_edges'")
        .get() as { name?: string } | undefined;
      return row?.name === 'recipe_edges';
    } catch {
      return false;
    }
  }

  private canUseMaterializedCategoryGroups(db: ReturnType<IndexedRecipesService['getAccelerationDatabase']>): db is NonNullable<ReturnType<IndexedRecipesService['getAccelerationDatabase']>> {
    if (!db) return false;
    try {
      const row = db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'recipe_category_groups'")
        .get() as { name?: string } | undefined;
      return row?.name === 'recipe_category_groups';
    } catch {
      return false;
    }
  }

  private canUseUiPayloads(db: ReturnType<IndexedRecipesService['getAccelerationDatabase']>): db is NonNullable<ReturnType<IndexedRecipesService['getAccelerationDatabase']>> {
    if (!db) return false;
    try {
      const row = db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'ui_payloads'")
        .get() as { name?: string } | undefined;
      return row?.name === 'ui_payloads';
    } catch {
      return false;
    }
  }

  private readUiPayloads(recipeIds: string[]): Map<string, Record<string, unknown>> {
    const normalizedRecipeIds = Array.from(new Set(recipeIds.map((recipeId) => recipeId.trim()).filter(Boolean)));
    if (normalizedRecipeIds.length === 0) {
      return new Map<string, Record<string, unknown>>();
    }

    const db = this.getAccelerationDatabase();
    if (!this.canUseUiPayloads(db)) {
      return new Map<string, Record<string, unknown>>();
    }

    const placeholders = normalizedRecipeIds.map(() => '?').join(', ');
    const rows = db.prepare(`
      SELECT recipe_id, payload_json
      FROM ui_payloads
      WHERE recipe_id IN (${placeholders})
    `).all(...normalizedRecipeIds) as UiPayloadRow[];

    const payloads = new Map<string, Record<string, unknown>>();
    for (const row of rows) {
      if (!row.recipe_id || !row.payload_json) continue;
      try {
        payloads.set(row.recipe_id, JSON.parse(row.payload_json) as Record<string, unknown>);
      } catch {
        continue;
      }
    }
    return payloads;
  }

  private attachUiPayloadsToRecipes(recipes: IndexedRecipe[]): IndexedRecipe[] {
    const missingUiRecipeIds = recipes
      .filter((recipe) => {
        const additionalData =
          recipe.additionalData && typeof recipe.additionalData === 'object'
            ? recipe.additionalData as Record<string, unknown>
            : null;
        return !additionalData?.uiPayload;
      })
      .map((recipe) => recipe.id);
    if (missingUiRecipeIds.length === 0) {
      return this.attachRenderHintsToRecipes(recipes);
    }

    const uiPayloadsByRecipeId = this.readUiPayloads(missingUiRecipeIds);
    if (uiPayloadsByRecipeId.size === 0) {
      return this.attachRenderHintsToRecipes(recipes);
    }

    return this.attachRenderHintsToRecipes(recipes.map((recipe) => {
      const uiPayload = uiPayloadsByRecipeId.get(recipe.id);
      if (!uiPayload) {
        return recipe;
      }

      const additionalData =
        recipe.additionalData && typeof recipe.additionalData === 'object'
          ? { ...(recipe.additionalData as Record<string, unknown>) }
          : {};
      additionalData.uiPayload = uiPayload;
      if (typeof uiPayload.familyKey === 'string' && uiPayload.familyKey.trim()) {
        additionalData.uiFamilyKey = uiPayload.familyKey.trim();
      }

      const enriched: IndexedRecipe = {
        ...recipe,
        additionalData,
      };
      this.setCachedTransformedRecipe(enriched);
      return enriched;
    }));
  }

  private attachRenderHintToItem(item: IndexedItem | null | undefined): void {
    if (!item) return;
    const assetId = `${item.renderAssetRef ?? ''}`.trim();
    item.renderHint = assetId ? (getRenderContractService().getRenderAnimationHint(assetId) ?? null) : null;
  }

  private attachRenderHintToFluid(fluid: IndexedFluid | null | undefined): void {
    if (!fluid) return;
    const assetId = `${fluid.renderAssetRef ?? ''}`.trim();
    fluid.renderHint = assetId ? (getRenderContractService().getRenderAnimationHint(assetId) ?? null) : null;
  }

  private attachRenderHintsToRecipe(recipe: IndexedRecipe): IndexedRecipe {
    for (const output of recipe.outputs ?? []) {
      this.attachRenderHintToItem(output?.item);
    }

    const visitInputGroup = (group: IndexedItemGroup | IndexedItemGroup[] | null | undefined) => {
      if (!group) return;
      if (Array.isArray(group)) {
        for (const nested of group) {
          visitInputGroup(nested);
        }
        return;
      }
      for (const itemStack of group.items ?? []) {
        this.attachRenderHintToItem(itemStack?.item);
      }
    };

    for (const input of recipe.inputs ?? []) {
      visitInputGroup(input as IndexedItemGroup | IndexedItemGroup[]);
    }

    for (const fluidGroup of recipe.fluidInputs ?? []) {
      for (const fluidStack of fluidGroup.fluids ?? []) {
        this.attachRenderHintToFluid(fluidStack?.fluid);
      }
    }

    for (const fluidStack of recipe.fluidOutputs ?? []) {
      this.attachRenderHintToFluid(fluidStack?.fluid);
    }

    if (recipe.machineInfo?.machineIcon) {
      const machineIcon = recipe.machineInfo.machineIcon;
      const assetId = `${machineIcon.renderAssetRef ?? ''}`.trim();
      machineIcon.renderHint = assetId ? (getRenderContractService().getRenderAnimationHint(assetId) ?? null) : null;
    }

    const specialItems = Array.isArray(recipe.metadata?.specialItems) ? recipe.metadata?.specialItems : [];
    for (const item of specialItems ?? []) {
      this.attachRenderHintToItem(item);
    }

    return recipe;
  }

  private attachRenderHintsToRecipes(recipes: IndexedRecipe[]): IndexedRecipe[] {
    for (const recipe of recipes) {
      this.attachRenderHintsToRecipe(recipe);
    }
    return recipes;
  }

  public peekRecipeIndexCache(itemId: string, column: RecipeIndexColumn): boolean {
    const cached = this.recipeIndexCache.get(`${column}:${itemId}`);
    return Boolean(cached && cached.expiresAt > Date.now());
  }

  public peekMachineTypesCache(): boolean {
    return Boolean(this.machineTypesCache && this.machineTypesCache.expiresAt > Date.now());
  }

  public peekItemRecipeSummaryCache(itemId: string): boolean {
    const cached = this.recipeSummaryCache.get(itemId.trim());
    return Boolean(cached && cached.expiresAt > Date.now());
  }

  async getCraftingRecipeIdsForItem(itemId: string): Promise<string[]> {
    return this.getCachedIndexRecipeIds(itemId, 'produced_by_recipes');
  }

  async getUsageRecipeIdsForItem(itemId: string): Promise<string[]> {
    return this.getCachedIndexRecipeIds(itemId, 'used_in_recipes');
  }

  private getCachedIndexRecipeIds(itemId: string, column: RecipeIndexColumn): string[] {
    const key = `${column}:${itemId}`;
    const now = Date.now();
    const cached = this.recipeIndexCache.get(key);
    if (cached && cached.expiresAt > now) {
      return cached.recipeIds;
    }
    const db = this.getAccelerationDatabase();
    let recipeIds: string[] = [];

    if (this.canUseMaterializedRecipeEdges(db)) {
      const relationType = column === 'produced_by_recipes' ? 'produced_by' : 'used_in';
      recipeIds = (db.prepare(`
        SELECT recipe_id
        FROM recipe_edges
        WHERE item_id = ? AND relation_type = ?
        ORDER BY slot_index ASC, recipe_id ASC
      `).all(itemId, relationType) as Array<{ recipe_id: string }>).map((row) => row.recipe_id);
    } else {
      this.ensureSplitRecipesAvailable();
      recipeIds = column === 'produced_by_recipes'
        ? this.splitExportService.getProducedByRecipeIds(itemId)
        : this.splitExportService.getUsedInRecipeIds(itemId);
    }

    this.recipeIndexCache.set(key, {
      expiresAt: now + this.indexCacheTtlMs,
      recipeIds,
    });
    return recipeIds;
  }

  private getMaterializedRecipeGroupRecipeIds(
    itemId: string,
    relationType: RecipeRelationType,
    machineType: string,
    voltageTier?: string | null,
  ): string[] | null {
    const db = this.getAccelerationDatabase();
    if (!this.canUseMaterializedMachineGroups(db)) {
      return null;
    }

    const normalizedMachineType = normalizeMachineFamilyName(machineType);
    const machineAliases = expandMachineTypeAliases(normalizedMachineType);
    if (machineAliases.length === 0) {
      return [];
    }

    const normalizedVoltageTier = voltageTier?.trim() || '';
    const machineKeys = machineAliases.map((alias) => `${alias}::${normalizedVoltageTier}`);
    const placeholders = machineKeys.map(() => '?').join(', ');
    const rows = db.prepare(`
      SELECT relation_type, machine_key, family, voltage_tier, recipe_ids_blob, recipe_count
      FROM recipe_machine_groups
      WHERE item_id = ? AND relation_type = ? AND machine_key IN (${placeholders})
      ORDER BY id ASC
    `).all(itemId, relationType, ...machineKeys) as MaterializedMachineGroupRow[];

    if (rows.length === 0) {
      return [];
    }

    const orderedRecipeIds: string[] = [];
    const seenRecipeIds = new Set<string>();
    for (const row of rows) {
      if (!row.recipe_ids_blob) continue;
      try {
        for (const recipeId of JSON.parse(row.recipe_ids_blob) as string[]) {
          const normalizedRecipeId = `${recipeId ?? ''}`.trim();
          if (!normalizedRecipeId || seenRecipeIds.has(normalizedRecipeId)) {
            continue;
          }
          seenRecipeIds.add(normalizedRecipeId);
          orderedRecipeIds.push(normalizedRecipeId);
        }
      } catch {
        continue;
      }
    }

    return orderedRecipeIds;
  }

  private getMaterializedCategoryGroupRecipeIds(
    itemId: string,
    relationType: RecipeRelationType,
    categoryKey: string,
  ): string[] | null {
    const db = this.getAccelerationDatabase();
    if (!this.canUseMaterializedCategoryGroups(db)) {
      return null;
    }

    const row = db.prepare(`
      SELECT relation_type, category_key, category_type, category_name, machine_key, voltage_tier, recipe_ids_blob, recipe_count
      FROM recipe_category_groups
      WHERE item_id = ? AND relation_type = ? AND category_key = ?
      ORDER BY id ASC
    `).get(itemId, relationType, categoryKey) as MaterializedCategoryGroupRow | undefined;

    if (!row?.recipe_ids_blob) {
      return [];
    }

    try {
      return (JSON.parse(row.recipe_ids_blob) as string[])
        .map((recipeId) => `${recipeId ?? ''}`.trim())
        .filter(Boolean);
    } catch {
      return [];
    }
  }

  private getMaterializedMachineGroupSummaries(
    itemId: string,
    relationType: RecipeRelationType,
  ): MachineGroupSummary[] | null {
    const db = this.getAccelerationDatabase();
    if (!this.canUseMaterializedMachineGroups(db)) {
      return null;
    }

    const rows = db.prepare(`
      SELECT relation_type, machine_key, family, voltage_tier, recipe_ids_blob, recipe_count
      FROM recipe_machine_groups
      WHERE item_id = ? AND relation_type = ?
      ORDER BY id ASC
    `).all(itemId, relationType) as MaterializedMachineGroupRow[];

    if (rows.length === 0) {
      return [];
    }

    const groups: MachineGroupSummary[] = [];
    for (const row of rows) {
      const rawMachineKey = `${row.machine_key ?? ''}`.trim();
      const rawMachineType = rawMachineKey.includes('::')
        ? rawMachineKey.slice(0, rawMachineKey.lastIndexOf('::'))
        : rawMachineKey;
      const machineType = normalizeMachineFamilyName(rawMachineType);
      if (!machineType) {
        continue;
      }

      const voltageTier = `${row.voltage_tier ?? ''}`.trim() || null;
      groups.push({
        machineType,
        category: `${row.family ?? ''}`.trim(),
        voltageTier,
        voltage: null,
        recipeCount: Math.max(0, Number(row.recipe_count ?? 0)),
        machineKey: `${machineType}::${voltageTier ?? ''}`,
        machineIcon: getMachineIconItem(machineType) ?? null,
      });
    }

    return normalizeMachineGroups(groups);
  }

  private getMaterializedCategoryGroupSummaries(
    itemId: string,
    relationType: RecipeRelationType,
  ): RecipeCategorySummary[] | null {
    const db = this.getAccelerationDatabase();
    if (!this.canUseMaterializedCategoryGroups(db)) {
      return null;
    }

    const rows = db.prepare(`
      SELECT relation_type, category_key, category_type, category_name, machine_key, voltage_tier, recipe_ids_blob, recipe_count
      FROM recipe_category_groups
      WHERE item_id = ? AND relation_type = ?
      ORDER BY id ASC
    `).all(itemId, relationType) as MaterializedCategoryGroupRow[];

    if (rows.length === 0) {
      return [];
    }

    const groups: RecipeCategorySummary[] = [];
    for (const row of rows) {
      const categoryKey = `${row.category_key ?? ''}`.trim();
      const name = `${row.category_name ?? ''}`.trim() || categoryKey;
      if (!categoryKey) {
        continue;
      }

      groups.push({
        type: row.category_type === 'crafting' ? 'crafting' : 'machine',
        name,
        recipeType: name,
        recipeCount: Math.max(0, Number(row.recipe_count ?? 0)),
        categoryKey,
        machineKey: `${row.machine_key ?? ''}`.trim() || null,
        voltageTier: `${row.voltage_tier ?? ''}`.trim() || null,
        machineIcon: null,
      });
    }

    return groups;
  }

  private getMaterializedBootstrapRelationRecipeIds(
    itemId: string,
    relationType: RecipeRelationType,
  ): string[] | null {
    const materialized = this.getMaterializedBootstrapRow(itemId);
    const payload = relationType === 'produced_by'
      ? materialized?.produced_by_ids
      : materialized?.used_in_ids;
    if (!payload) {
      return null;
    }

    try {
      return (JSON.parse(payload) as string[])
        .map((recipeId) => `${recipeId ?? ''}`.trim())
        .filter(Boolean);
    } catch {
      return null;
    }
  }

  private readMaterializedRecipeDescriptors(recipeIds: string[]): MaterializedRecipeDescriptorRow[] | null {
    const orderedUniqueRecipeIds = Array.from(new Set(recipeIds.map((recipeId) => recipeId.trim()).filter(Boolean)));
    if (orderedUniqueRecipeIds.length === 0) {
      return [];
    }

    const db = this.getAccelerationDatabase();
    if (!this.canUseMaterializedRecipesCore(db)) {
      return null;
    }

    const rowsById = new Map<string, MaterializedRecipeDescriptorRow>();
    for (const recipeChunk of chunkStrings(orderedUniqueRecipeIds, 900)) {
      const placeholders = recipeChunk.map(() => '?').join(', ');
      const rows = db.prepare(`
        SELECT recipe_id, recipe_type, family, machine_type, voltage_tier
        FROM recipes_core
        WHERE recipe_id IN (${placeholders})
      `).all(...recipeChunk) as MaterializedRecipeDescriptorRow[];
      for (const row of rows) {
        rowsById.set(row.recipe_id, row);
      }
    }

    return orderedUniqueRecipeIds
      .map((recipeId) => rowsById.get(recipeId))
      .filter((row): row is MaterializedRecipeDescriptorRow => Boolean(row));
  }

  private getCachedRelationRecipeDescriptors(key: string): RelationRecipeDescriptorState | null {
    const cached = this.relationDescriptorCache.get(key);
    if (!cached) return null;
    if (cached.expiresAt <= Date.now()) {
      this.relationDescriptorCache.delete(key);
      return null;
    }
    return cached.value;
  }

  private setCachedRelationRecipeDescriptors(key: string, value: RelationRecipeDescriptorState): RelationRecipeDescriptorState {
    this.relationDescriptorCache.set(key, {
      expiresAt: Date.now() + this.relationDescriptorCacheTtlMs,
      value,
    });
    return value;
  }

  private getRelationRecipeDescriptors(
    itemId: string,
    relationType: RecipeRelationType,
  ): RelationRecipeDescriptorState | null {
    const normalizedItemId = itemId.trim();
    const cacheKey = `${relationType}:descriptor:${normalizedItemId}`;
    const cached = this.getCachedRelationRecipeDescriptors(cacheKey);
    if (cached) {
      return cached;
    }

    const relationRecipeIds = this.getMaterializedBootstrapRelationRecipeIds(normalizedItemId, relationType)
      ?? this.getCachedIndexRecipeIds(
        normalizedItemId,
        relationType === 'produced_by' ? 'produced_by_recipes' : 'used_in_recipes',
      );
    if (relationRecipeIds.length === 0) {
      return this.setCachedRelationRecipeDescriptors(cacheKey, {
        rows: [],
        occurrences: new Map<string, number>(),
      });
    }

    const occurrences = new Map<string, number>();
    const orderedUniqueRecipeIds: string[] = [];
    for (const rawRecipeId of relationRecipeIds) {
      const recipeId = `${rawRecipeId ?? ''}`.trim();
      if (!recipeId) continue;
      const nextCount = (occurrences.get(recipeId) ?? 0) + 1;
      occurrences.set(recipeId, nextCount);
      if (nextCount === 1) {
        orderedUniqueRecipeIds.push(recipeId);
      }
    }

    const rows = this.readMaterializedRecipeDescriptors(orderedUniqueRecipeIds);
    if (rows === null) {
      return null;
    }

    return this.setCachedRelationRecipeDescriptors(cacheKey, {
      rows,
      occurrences,
    });
  }

  private buildMachineGroupSummariesFromDescriptors(
    descriptors: RelationRecipeDescriptorState | null,
  ): MachineGroupSummary[] {
    if (!descriptors || descriptors.rows.length === 0) {
      return [];
    }

    const groups = new Map<string, MachineGroupSummary>();
    for (const row of descriptors.rows) {
      const rawMachineType = `${row.machine_type ?? ''}`.trim();
      if (!rawMachineType) {
        continue;
      }

      const machineType = normalizeMachineFamilyName(rawMachineType);
      const voltageTier = `${row.voltage_tier ?? ''}`.trim() || null;
      const recipeCount = Math.max(0, Number(descriptors.occurrences.get(row.recipe_id) ?? 0));
      if (!machineType || recipeCount <= 0) {
        continue;
      }

      const machineKey = `${machineType}::${voltageTier ?? ''}`;
      const existing = groups.get(machineKey);
      if (existing) {
        existing.recipeCount += recipeCount;
        continue;
      }

      groups.set(machineKey, {
        machineType,
        category: `${row.family ?? ''}`.trim(),
        voltageTier,
        voltage: null,
        recipeCount,
        machineKey,
        machineIcon: getMachineIconItem(machineType) ?? null,
      });
    }

    return Array.from(groups.values());
  }

  private buildCategoryGroupSummariesFromDescriptors(
    descriptors: RelationRecipeDescriptorState | null,
  ): RecipeCategorySummary[] {
    if (!descriptors || descriptors.rows.length === 0) {
      return [];
    }

    const groups = new Map<string, RecipeCategorySummary>();
    for (const row of descriptors.rows) {
      const recipeCount = Math.max(0, Number(descriptors.occurrences.get(row.recipe_id) ?? 0));
      if (recipeCount <= 0) {
        continue;
      }

      const descriptor = describeRecipeCategory({
        recipeType: `${row.recipe_type ?? ''}`.trim(),
        machineInfo: {
          machineType: `${row.machine_type ?? ''}`.trim(),
          parsedVoltageTier: `${row.voltage_tier ?? ''}`.trim() || null,
        },
      });
      const existing = groups.get(descriptor.categoryKey);
      if (existing) {
        existing.recipeCount += recipeCount;
        continue;
      }

      groups.set(descriptor.categoryKey, {
        ...descriptor,
        recipeCount,
      });
    }

    return Array.from(groups.values());
  }

  private getRecipeIdsForMachineGroupFromDescriptors(
    itemId: string,
    relationType: RecipeRelationType,
    machineType: string,
    voltageTier?: string | null,
  ): string[] | null {
    const descriptors = this.getRelationRecipeDescriptors(itemId, relationType);
    if (!descriptors) {
      return null;
    }

    const normalizedVoltageTier = voltageTier?.trim() || null;
    const machineAliases = new Set(
      expandMachineTypeAliases(machineType)
        .flatMap((alias) => [alias.trim(), normalizeMachineFamilyName(alias)])
        .filter(Boolean),
    );

    return descriptors.rows
      .filter((row) => {
        const rowMachineType = `${row.machine_type ?? ''}`.trim();
        if (!rowMachineType) {
          return false;
        }

        const rowVoltageTier = `${row.voltage_tier ?? ''}`.trim() || null;
        if (rowVoltageTier !== normalizedVoltageTier) {
          return false;
        }

        return machineAliases.has(rowMachineType) || machineAliases.has(normalizeMachineFamilyName(rowMachineType));
      })
      .map((row) => row.recipe_id);
  }

  private getRecipeIdsForCategoryGroupFromDescriptors(
    itemId: string,
    relationType: RecipeRelationType,
    categoryKey: string,
  ): string[] | null {
    const descriptors = this.getRelationRecipeDescriptors(itemId, relationType);
    if (!descriptors) {
      return null;
    }

    const normalizedCategoryKey = categoryKey.trim();
    if (!normalizedCategoryKey) {
      return [];
    }

    return descriptors.rows
      .filter((row) => describeRecipeCategory({
        recipeType: `${row.recipe_type ?? ''}`.trim(),
        machineInfo: {
          machineType: `${row.machine_type ?? ''}`.trim(),
          parsedVoltageTier: `${row.voltage_tier ?? ''}`.trim() || null,
        },
      }).categoryKey === normalizedCategoryKey)
      .map((row) => row.recipe_id);
  }

  private normalizeRecipeGroupPackOptions(options?: RecipeGroupPackOptions): Required<Pick<RecipeGroupPackOptions, 'offset' | 'limit' | 'includeRecipeIds'>> {
    const rawOffset = Number(options?.offset ?? 0);
    const offset = Math.max(0, Math.floor(Number.isFinite(rawOffset) ? rawOffset : 0));
    const providedLimit = options?.limit;
    const numericLimit = providedLimit == null ? 48 : Number(providedLimit);
    const rawLimit = Math.floor(Number.isFinite(numericLimit) ? numericLimit : 48);
    const limit = Math.max(0, Math.min(256, rawLimit));
    return {
      offset,
      limit,
      includeRecipeIds: options?.includeRecipeIds === true,
    };
  }

  private getCachedRecipeCollection(key: string): IndexedRecipe[] | null {
    const cached = this.recipeCollectionCache.get(key);
    if (!cached) return null;
    if (cached.expiresAt <= Date.now()) {
      this.recipeCollectionCache.delete(key);
      return null;
    }
    return cached.value;
  }

  private setCachedRecipeCollection(key: string, recipes: IndexedRecipe[]): IndexedRecipe[] {
    this.recipeCollectionCache.set(key, {
      expiresAt: Date.now() + this.recipeCollectionCacheTtlMs,
      value: recipes,
    });
    return recipes;
  }

  private async hydrateMaterializedRecipeCollection(
    recipeIds: string[],
    inlinePayload: string | null,
  ): Promise<IndexedRecipe[]> {
    const orderedIds = Array.from(new Set(recipeIds.map((id) => id.trim()).filter(Boolean)));
    if (orderedIds.length === 0) {
      return [];
    }

    const recipesById = new Map<string, IndexedRecipe>();
    if (inlinePayload) {
      for (const recipe of (JSON.parse(inlinePayload) as IndexedRecipe[]).map((entry) => this.normalizeRecipeMachineIcon(entry))) {
        recipesById.set(recipe.id, recipe);
      }
    }

    const missingIds = orderedIds.filter((recipeId) => !recipesById.has(recipeId));
    if (missingIds.length > 0) {
      const hydrated = await this.getRecipesByIds(missingIds);
      for (const recipe of hydrated) {
        recipesById.set(recipe.id, this.normalizeRecipeMachineIcon(recipe));
      }
    }

    return this.attachUiPayloadsToRecipes(orderedIds
      .map((recipeId) => recipesById.get(recipeId))
      .filter((recipe): recipe is IndexedRecipe => Boolean(recipe)));
  }

  private getCachedTransformedRecipe(recipeId: string): IndexedRecipe | null {
    const cached = this.transformedRecipeCache.get(recipeId);
    if (!cached) return null;
    if (cached.expiresAt <= Date.now()) {
      this.transformedRecipeCache.delete(recipeId);
      return null;
    }
    return cached.value;
  }

  private setCachedTransformedRecipe(recipe: IndexedRecipe): IndexedRecipe {
    this.transformedRecipeCache.set(recipe.id, {
      expiresAt: Date.now() + this.transformedRecipeCacheTtlMs,
      value: recipe,
    });
    return recipe;
  }

  private transformAndCacheSplitRecipe(raw: unknown): IndexedRecipe {
    const value = (raw ?? {}) as Record<string, unknown>;
    const recipeId = String(value.id ?? value.recipeId ?? '');
    const cached = recipeId ? this.getCachedTransformedRecipe(recipeId) : null;
    if (cached) {
      return cached;
    }
    return this.setCachedTransformedRecipe(this.transformSplitRecipe(raw));
  }

  private normalizeRecipeMachineIcon(recipe: IndexedRecipe): IndexedRecipe {
    const machineType = recipe.machineInfo?.machineType?.trim();
    if (!machineType) {
      return recipe;
    }

    const machineIcon = getMachineIconItem(machineType);
    if (!machineIcon) {
      return recipe;
    }

    return {
      ...recipe,
      machineInfo: {
        ...recipe.machineInfo!,
        machineIcon,
      },
    };
  }

  async getRecipeById(recipeId: string): Promise<IndexedRecipe | null> {
    const db = this.getAccelerationDatabase();
    if (this.canUseMaterializedRecipesCore(db)) {
      const row = db
        .prepare('SELECT payload FROM recipes_core WHERE recipe_id = ?')
        .get(recipeId) as MaterializedRecipeCoreRow | undefined;
      if (row?.payload) {
        return this.attachUiPayloadsToRecipes([
          this.normalizeRecipeMachineIcon(JSON.parse(row.payload) as IndexedRecipe),
        ])[0] ?? null;
      }
    }

    if (!this.splitExportFallback) {
      return null;
    }

    this.ensureSplitRecipesAvailable();
    const cached = this.getCachedTransformedRecipe(recipeId);
    if (cached) {
      return cached;
    }
    const splitRecipe = this.splitExportService.getRecipeById(recipeId);
    return splitRecipe ? this.transformAndCacheSplitRecipe(splitRecipe) : null;
  }

  async getRecipesByIds(recipeIds: string[]): Promise<IndexedRecipe[]> {
    const normalizedIds = Array.from(new Set(recipeIds.map((id) => id.trim()).filter(Boolean)));
    const cachedRecipes = new Map<string, IndexedRecipe>();
    const missingIds: string[] = [];

    for (const recipeId of normalizedIds) {
      const cached = this.getCachedTransformedRecipe(recipeId);
      if (cached) {
        cachedRecipes.set(recipeId, cached);
      } else {
        missingIds.push(recipeId);
      }
    }

    if (missingIds.length > 0) {
      const db = this.getAccelerationDatabase();
      if (this.canUseMaterializedRecipesCore(db)) {
        const placeholders = missingIds.map(() => '?').join(', ');
        const rows = db.prepare(`
          SELECT payload
          FROM recipes_core
          WHERE recipe_id IN (${placeholders})
        `).all(...missingIds) as MaterializedRecipeCoreRow[];

        for (const row of rows) {
          if (!row.payload) continue;
          const recipe = this.normalizeRecipeMachineIcon(JSON.parse(row.payload) as IndexedRecipe);
          this.setCachedTransformedRecipe(recipe);
          cachedRecipes.set(recipe.id, recipe);
        }
      }

      const stillMissingIds = missingIds.filter((recipeId) => !cachedRecipes.has(recipeId));
      if (stillMissingIds.length > 0 && this.splitExportFallback) {
        this.ensureSplitRecipesAvailable();
        for (const raw of this.splitExportService.getRecipesByIds(stillMissingIds)) {
          const transformed = this.transformAndCacheSplitRecipe(raw);
          cachedRecipes.set(transformed.id, transformed);
        }
      }
    }

    return this.attachUiPayloadsToRecipes(normalizedIds
      .map((recipeId) => cachedRecipes.get(recipeId))
      .filter((recipe): recipe is IndexedRecipe => Boolean(recipe)));
  }

  async getCraftingRecipesForItem(itemId: string): Promise<IndexedRecipe[]> {
    const cacheKey = `crafting:${itemId}`;
    const cached = this.getCachedRecipeCollection(cacheKey);
    if (cached) {
      return cached;
    }

    const materialized = this.getMaterializedBootstrapRow(itemId);
    if (materialized?.produced_by_payload || materialized?.produced_by_ids) {
      const recipeIds = materialized.produced_by_ids
        ? JSON.parse(materialized.produced_by_ids) as string[]
        : this.getCachedIndexRecipeIds(itemId, 'produced_by_recipes');
      const recipes = await this.hydrateMaterializedRecipeCollection(recipeIds, materialized.produced_by_payload);
      return this.setCachedRecipeCollection(cacheKey, this.injectBotaniaFallbacks(itemId, recipes));
    }

    const recipeIds = this.getCachedIndexRecipeIds(itemId, 'produced_by_recipes');
    if (recipeIds.length === 0) return [];
    const parsed = await this.getRecipesByIds(recipeIds);
    return this.setCachedRecipeCollection(cacheKey, this.injectBotaniaFallbacks(itemId, parsed));
  }

  async getUsageRecipesForItem(itemId: string): Promise<IndexedRecipe[]> {
    const cacheKey = `usage:${itemId}`;
    const cached = this.getCachedRecipeCollection(cacheKey);
    if (cached) {
      return cached;
    }

    const materialized = this.getMaterializedBootstrapRow(itemId);
    if (materialized?.used_in_payload || materialized?.used_in_ids) {
      const recipeIds = materialized.used_in_ids
        ? JSON.parse(materialized.used_in_ids) as string[]
        : this.getCachedIndexRecipeIds(itemId, 'used_in_recipes');
      const recipes = await this.hydrateMaterializedRecipeCollection(recipeIds, materialized.used_in_payload);
      return this.setCachedRecipeCollection(cacheKey, recipes);
    }

    const recipeIds = this.getCachedIndexRecipeIds(itemId, 'used_in_recipes');
    if (recipeIds.length === 0) return [];
    return this.setCachedRecipeCollection(cacheKey, await this.getRecipesByIds(recipeIds));
  }

  private async getOrderedRecipeIdsForMachineGroup(
    itemId: string,
    relationType: RecipeRelationType,
    machineType: string,
    voltageTier?: string | null,
  ): Promise<string[]> {
    const normalizedItemId = itemId.trim();
    const normalizedMachineType = normalizeMachineFamilyName(machineType);
    const normalizedVoltageTier = voltageTier?.trim() || null;

    const materializedRecipeIds = this.getMaterializedRecipeGroupRecipeIds(
      normalizedItemId,
      relationType,
      normalizedMachineType,
      normalizedVoltageTier,
    );
    if (materializedRecipeIds && materializedRecipeIds.length > 0) {
      return materializedRecipeIds;
    }

    const descriptorMatchedRecipeIds = this.getRecipeIdsForMachineGroupFromDescriptors(
      normalizedItemId,
      relationType,
      normalizedMachineType,
      normalizedVoltageTier,
    );
    if (descriptorMatchedRecipeIds && descriptorMatchedRecipeIds.length > 0) {
      return descriptorMatchedRecipeIds;
    }

    const groupedRecipes = relationType === 'produced_by'
      ? await this.getCraftingRecipesForItem(normalizedItemId)
      : await this.getUsageRecipesForItem(normalizedItemId);
    const machineAliases = new Set(expandMachineTypeAliases(normalizedMachineType).map((alias) => alias.trim()).filter(Boolean));
    return groupedRecipes
      .filter((recipe) => {
        const recipeMachineType = `${recipe.machineInfo?.machineType ?? ''}`.trim();
        if (!recipeMachineType || (!machineAliases.has(normalizeMachineFamilyName(recipeMachineType)) && !machineAliases.has(recipeMachineType))) {
          return false;
        }
        const recipeVoltageTier = recipe.machineInfo?.parsedVoltageTier?.trim() || null;
        return recipeVoltageTier === normalizedVoltageTier;
      })
      .map((recipe) => recipe.id);
  }

  private async getOrderedRecipeIdsForCategoryGroup(
    itemId: string,
    relationType: RecipeRelationType,
    categoryKey: string,
  ): Promise<string[]> {
    const normalizedItemId = itemId.trim();
    const normalizedCategoryKey = categoryKey.trim();

    const materializedRecipeIds = this.getMaterializedCategoryGroupRecipeIds(normalizedItemId, relationType, normalizedCategoryKey);
    if (materializedRecipeIds && materializedRecipeIds.length > 0) {
      return materializedRecipeIds;
    }

    const descriptorMatchedRecipeIds = this.getRecipeIdsForCategoryGroupFromDescriptors(
      normalizedItemId,
      relationType,
      normalizedCategoryKey,
    );
    if (descriptorMatchedRecipeIds && descriptorMatchedRecipeIds.length > 0) {
      return descriptorMatchedRecipeIds;
    }

    const recipes = relationType === 'produced_by'
      ? await this.getCraftingRecipesForItem(normalizedItemId)
      : await this.getUsageRecipesForItem(normalizedItemId);
    return recipes
      .filter((recipe) => describeRecipeCategory(recipe).categoryKey === normalizedCategoryKey)
      .map((recipe) => recipe.id);
  }

  private async getRecipesForMachineGroup(
    itemId: string,
    relationType: RecipeRelationType,
    machineType: string,
    voltageTier?: string | null,
  ): Promise<IndexedRecipe[]> {
    const normalizedItemId = itemId.trim();
    const normalizedMachineType = normalizeMachineFamilyName(machineType);
    const normalizedVoltageTier = voltageTier?.trim() || null;
    const cacheKey = `${relationType}-group:${normalizedItemId}:${normalizedMachineType}::${normalizedVoltageTier ?? ''}`;
    const cached = this.getCachedRecipeCollection(cacheKey);
    if (cached) {
      return cached;
    }

    const recipeIds = await this.getOrderedRecipeIdsForMachineGroup(
      normalizedItemId,
      relationType,
      normalizedMachineType,
      normalizedVoltageTier,
    );
    return this.setCachedRecipeCollection(cacheKey, await this.getRecipesByIds(recipeIds));
  }

  async getProducedByRecipesForMachineGroup(
    itemId: string,
    machineType: string,
    voltageTier?: string | null,
  ): Promise<IndexedRecipe[]> {
    return this.getRecipesForMachineGroup(itemId, 'produced_by', machineType, voltageTier);
  }

  async getUsedInRecipesForMachineGroup(
    itemId: string,
    machineType: string,
    voltageTier?: string | null,
  ): Promise<IndexedRecipe[]> {
    return this.getRecipesForMachineGroup(itemId, 'used_in', machineType, voltageTier);
  }

  async getRecipesForCategoryGroup(
    itemId: string,
    relationType: RecipeRelationType,
    categoryKey: string,
  ): Promise<IndexedRecipe[]> {
    const normalizedItemId = itemId.trim();
    const normalizedCategoryKey = categoryKey.trim();
    const cacheKey = `category-group:${relationType}:${normalizedItemId}:${normalizedCategoryKey}`;
    const cached = this.getCachedRecipeCollection(cacheKey);
    if (cached) {
      return cached;
    }

    const recipeIds = await this.getOrderedRecipeIdsForCategoryGroup(
      normalizedItemId,
      relationType,
      normalizedCategoryKey,
    );
    return this.setCachedRecipeCollection(cacheKey, await this.getRecipesByIds(recipeIds));
  }

  async getProducedByRecipePackForMachineGroup(
    itemId: string,
    machineType: string,
    voltageTier?: string | null,
    options?: RecipeGroupPackOptions,
  ): Promise<RecipeGroupPackResponse> {
    return this.getRecipePackForMachineGroup(itemId, 'produced_by', machineType, voltageTier, options);
  }

  async getUsedInRecipePackForMachineGroup(
    itemId: string,
    machineType: string,
    voltageTier?: string | null,
    options?: RecipeGroupPackOptions,
  ): Promise<RecipeGroupPackResponse> {
    return this.getRecipePackForMachineGroup(itemId, 'used_in', machineType, voltageTier, options);
  }

  async getRecipePackForCategoryGroup(
    itemId: string,
    relationType: RecipeRelationType,
    categoryKey: string,
    options?: RecipeGroupPackOptions,
  ): Promise<RecipeGroupPackResponse> {
    const normalizedOptions = this.normalizeRecipeGroupPackOptions(options);
    const recipeIds = await this.getOrderedRecipeIdsForCategoryGroup(itemId, relationType, categoryKey);
    const slicedRecipeIds = recipeIds.slice(normalizedOptions.offset, normalizedOptions.offset + normalizedOptions.limit);
    const recipes = slicedRecipeIds.length > 0
      ? await this.getRecipesByIds(slicedRecipeIds)
      : [];
    return {
      recipeCount: recipeIds.length,
      recipes,
      recipeIds: normalizedOptions.includeRecipeIds ? recipeIds : undefined,
      offset: normalizedOptions.offset,
      limit: normalizedOptions.limit,
      hasMore: normalizedOptions.offset + normalizedOptions.limit < recipeIds.length,
    };
  }

  private async getRecipePackForMachineGroup(
    itemId: string,
    relationType: RecipeRelationType,
    machineType: string,
    voltageTier?: string | null,
    options?: RecipeGroupPackOptions,
  ): Promise<RecipeGroupPackResponse> {
    const normalizedOptions = this.normalizeRecipeGroupPackOptions(options);
    const recipeIds = await this.getOrderedRecipeIdsForMachineGroup(itemId, relationType, machineType, voltageTier);
    const slicedRecipeIds = recipeIds.slice(normalizedOptions.offset, normalizedOptions.offset + normalizedOptions.limit);
    const recipes = slicedRecipeIds.length > 0
      ? await this.getRecipesByIds(slicedRecipeIds)
      : [];
    return {
      recipeCount: recipeIds.length,
      recipes,
      recipeIds: normalizedOptions.includeRecipeIds ? recipeIds : undefined,
      offset: normalizedOptions.offset,
      limit: normalizedOptions.limit,
      hasMore: normalizedOptions.offset + normalizedOptions.limit < recipeIds.length,
    };
  }

  private searchMaterializedRecipeIdsByType(recipeIds: string[], typeQuery: string): string[] | null {
    const db = this.getAccelerationDatabase();
    if (!this.canUseMaterializedRecipesCore(db)) {
      return null;
    }

    const orderedRecipeIds = Array.from(new Set(recipeIds.map((recipeId) => recipeId.trim()).filter(Boolean)));
    if (orderedRecipeIds.length === 0) {
      return [];
    }

    const normalizedTypeQuery = typeQuery.trim().toLowerCase();
    if (!normalizedTypeQuery) {
      return orderedRecipeIds;
    }

    const matchedRecipeIds = new Set<string>();
    const pattern = `%${normalizedTypeQuery}%`;
    for (const recipeChunk of chunkStrings(orderedRecipeIds, 900)) {
      const placeholders = recipeChunk.map(() => '?').join(', ');
      const rows = db.prepare(`
        SELECT recipe_id
        FROM recipes_core
        WHERE recipe_id IN (${placeholders})
          AND LOWER(COALESCE(recipe_type, '')) LIKE ?
      `).all(...recipeChunk, pattern) as Array<{ recipe_id: string }>;
      for (const row of rows) {
        matchedRecipeIds.add(row.recipe_id);
      }
    }

    return orderedRecipeIds.filter((recipeId) => matchedRecipeIds.has(recipeId));
  }

  private searchMaterializedRecipeIdsByText(recipeIds: string[], query: string): string[] | null {
    const db = this.getAccelerationDatabase();
    if (!this.canUseMaterializedRecipesCore(db)) {
      return null;
    }

    const orderedRecipeIds = Array.from(new Set(recipeIds.map((recipeId) => recipeId.trim()).filter(Boolean)));
    if (orderedRecipeIds.length === 0) {
      return [];
    }

    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return [];
    }

    const matchedRecipeIds = new Set<string>();
    const pattern = `%${normalizedQuery}%`;
    for (const recipeChunk of chunkStrings(orderedRecipeIds, 880)) {
      const placeholders = recipeChunk.map(() => '?').join(', ');
      const rows = db.prepare(`
        SELECT recipe_id
        FROM recipes_core
        WHERE recipe_id IN (${placeholders})
          AND (
            LOWER(COALESCE(recipe_type, '')) LIKE ?
            OR LOWER(COALESCE(machine_type, '')) LIKE ?
            OR LOWER(COALESCE(family, '')) LIKE ?
            OR LOWER(COALESCE(recipe_id, '')) LIKE ?
          )
      `).all(...recipeChunk, pattern, pattern, pattern, pattern) as Array<{ recipe_id: string }>;
      for (const row of rows) {
        matchedRecipeIds.add(row.recipe_id);
      }
    }

    return orderedRecipeIds.filter((recipeId) => matchedRecipeIds.has(recipeId));
  }

  private searchMaterializedRecipeIdsByItems(recipeIds: string[], candidateItemIds: string[]): string[] | null {
    const db = this.getAccelerationDatabase();
    if (!this.canUseMaterializedRecipeEdges(db)) {
      return null;
    }

    const orderedRecipeIds = Array.from(new Set(recipeIds.map((recipeId) => recipeId.trim()).filter(Boolean)));
    const normalizedCandidateItemIds = Array.from(new Set(candidateItemIds.map((itemId) => itemId.trim()).filter(Boolean)));
    if (orderedRecipeIds.length === 0 || normalizedCandidateItemIds.length === 0) {
      return [];
    }

    const matchedRecipeIds = new Set<string>();
    const maxRecipeChunkSize = Math.max(1, 900 - normalizedCandidateItemIds.length);
    for (const recipeChunk of chunkStrings(orderedRecipeIds, maxRecipeChunkSize)) {
      const itemPlaceholders = normalizedCandidateItemIds.map(() => '?').join(', ');
      const recipePlaceholders = recipeChunk.map(() => '?').join(', ');
      const rows = db.prepare(`
        SELECT DISTINCT recipe_id
        FROM recipe_edges
        WHERE item_id IN (${itemPlaceholders})
          AND recipe_id IN (${recipePlaceholders})
      `).all(...normalizedCandidateItemIds, ...recipeChunk) as Array<{ recipe_id: string }>;
      for (const row of rows) {
        matchedRecipeIds.add(row.recipe_id);
      }
    }

    return orderedRecipeIds.filter((recipeId) => matchedRecipeIds.has(recipeId));
  }

  private async searchRecipeIdsByTypeFallback(recipeIds: string[], typeQuery: string): Promise<string[]> {
    const orderedRecipeIds = Array.from(new Set(recipeIds.map((recipeId) => recipeId.trim()).filter(Boolean)));
    const normalizedTypeQuery = typeQuery.trim().toLowerCase();
    if (!normalizedTypeQuery) {
      return orderedRecipeIds;
    }

    const recipes = await this.getRecipesByIds(orderedRecipeIds);
    const matchedRecipeIds = new Set(
      recipes
        .filter((recipe) => `${recipe.recipeType ?? ''}`.toLowerCase().includes(normalizedTypeQuery))
        .map((recipe) => recipe.id),
    );
    return orderedRecipeIds.filter((recipeId) => matchedRecipeIds.has(recipeId));
  }

  private async searchRecipeIdsByTextFallback(recipeIds: string[], query: string): Promise<string[]> {
    const orderedRecipeIds = Array.from(new Set(recipeIds.map((recipeId) => recipeId.trim()).filter(Boolean)));
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return [];
    }

    const recipes = await this.getRecipesByIds(orderedRecipeIds);
    const matchedRecipeIds = new Set<string>();
    for (const recipe of recipes) {
      if (
        `${recipe.recipeType ?? ''}`.toLowerCase().includes(normalizedQuery)
        || `${recipe.machineInfo?.machineType ?? ''}`.toLowerCase().includes(normalizedQuery)
        || `${recipe.id ?? ''}`.toLowerCase().includes(normalizedQuery)
      ) {
        matchedRecipeIds.add(recipe.id);
      }
    }
    return orderedRecipeIds.filter((recipeId) => matchedRecipeIds.has(recipeId));
  }

  private getRecipeReferencedItemIds(recipe: IndexedRecipe): Set<string> {
    const itemIds = new Set<string>();
    for (const output of recipe.outputs ?? []) {
      if (output.item?.itemId) {
        itemIds.add(output.item.itemId);
      }
    }
    for (const entry of recipe.inputs ?? []) {
      const groups = Array.isArray(entry) ? entry : [entry];
      for (const group of groups) {
        for (const stack of group?.items ?? []) {
          if (stack.item?.itemId) {
            itemIds.add(stack.item.itemId);
          }
        }
      }
    }
    return itemIds;
  }

  private async searchRecipeIdsByItemsFallback(recipeIds: string[], candidateItemIds: string[]): Promise<string[]> {
    const orderedRecipeIds = Array.from(new Set(recipeIds.map((recipeId) => recipeId.trim()).filter(Boolean)));
    const candidateItemIdSet = new Set(candidateItemIds.map((itemId) => itemId.trim()).filter(Boolean));
    if (orderedRecipeIds.length === 0 || candidateItemIdSet.size === 0) {
      return [];
    }

    const recipes = await this.getRecipesByIds(orderedRecipeIds);
    const matchedRecipeIds = new Set<string>();
    for (const recipe of recipes) {
      const referencedItemIds = this.getRecipeReferencedItemIds(recipe);
      if (Array.from(referencedItemIds).some((itemId) => candidateItemIdSet.has(itemId))) {
        matchedRecipeIds.add(recipe.id);
      }
    }
    return orderedRecipeIds.filter((recipeId) => matchedRecipeIds.has(recipeId));
  }

  async searchRecipesForItem(
    itemId: string,
    relationType: RecipeRelationType,
    query: string,
  ): Promise<{ recipeIds: string[]; itemMatches: ItemBasicInfo[] }> {
    const normalizedItemId = itemId.trim();
    const normalizedQuery = query.trim();
    if (!normalizedItemId || !normalizedQuery) {
      return { recipeIds: [], itemMatches: [] };
    }

    const recipeIds = relationType === 'produced_by'
      ? this.getCachedIndexRecipeIds(normalizedItemId, 'produced_by_recipes')
      : this.getCachedIndexRecipeIds(normalizedItemId, 'used_in_recipes');
    if (recipeIds.length === 0) {
      return { recipeIds: [], itemMatches: [] };
    }

    const lowerQuery = normalizedQuery.toLowerCase();
    if (lowerQuery.startsWith('type:')) {
      const typeQuery = lowerQuery.slice('type:'.length).trim();
      const matchedRecipeIds = this.searchMaterializedRecipeIdsByType(recipeIds, typeQuery)
        ?? await this.searchRecipeIdsByTypeFallback(recipeIds, typeQuery);
      return { recipeIds: matchedRecipeIds, itemMatches: [] };
    }

    const itemMatches = await this.itemsSearchService.searchItems(normalizedQuery, 80).catch(() => [] as ItemBasicInfo[]);
    const candidateItemIds = Array.from(new Set([
      ...itemMatches.map((item) => item.itemId),
      ...(normalizedQuery.includes('~') ? [normalizedQuery] : []),
    ]));

    const matchedRecipeIds = new Set<string>();
    for (const recipeId of this.searchMaterializedRecipeIdsByText(recipeIds, lowerQuery)
      ?? await this.searchRecipeIdsByTextFallback(recipeIds, lowerQuery)) {
      matchedRecipeIds.add(recipeId);
    }
    for (const recipeId of this.searchMaterializedRecipeIdsByItems(recipeIds, candidateItemIds)
      ?? await this.searchRecipeIdsByItemsFallback(recipeIds, candidateItemIds)) {
      matchedRecipeIds.add(recipeId);
    }

    return {
      recipeIds: recipeIds.filter((recipeId) => matchedRecipeIds.has(recipeId)),
      itemMatches: itemMatches.slice(0, 12),
    };
  }

  async getItemRecipeSummary(itemId: string): Promise<ItemRecipeSummaryResponse> {
    const normalizedItemId = itemId.trim();
    if (!normalizedItemId) {
      const error = new Error('Item not found') as Error & { statusCode?: number; code?: string };
      error.statusCode = 404;
      error.code = 'NOT_FOUND';
      throw error;
    }

    const now = Date.now();
    const cached = this.recipeSummaryCache.get(normalizedItemId);
    if (cached && cached.expiresAt > now) {
      return cached.value;
    }

    const db = this.getAccelerationDatabase();
    if (this.canUseMaterializedSummary(db)) {
      const summaryRow = db
        .prepare('SELECT summary_payload FROM recipe_summary_compact WHERE item_id = ?')
        .get(normalizedItemId) as MaterializedSummaryRow | undefined;
      if (summaryRow?.summary_payload) {
        const summary = await this.hydrateMissingSummaryMachineGroups(
          normalizedItemId,
          JSON.parse(summaryRow.summary_payload) as ItemRecipeSummaryResponse,
        );
        this.recipeSummaryCache.set(normalizedItemId, {
          expiresAt: now + this.summaryCacheTtlMs,
          value: summary,
        });
        return summary;
      }
    }

    const materialized = this.getMaterializedBootstrapRow(normalizedItemId);
    if (materialized?.summary_payload) {
      const payload = JSON.parse(materialized.summary_payload) as { indexedSummary?: ItemRecipeSummaryResponse };
      if (payload.indexedSummary) {
        const normalizedSummary = await this.hydrateMissingSummaryMachineGroups(normalizedItemId, payload.indexedSummary);
        this.recipeSummaryCache.set(normalizedItemId, {
          expiresAt: now + this.summaryCacheTtlMs,
          value: normalizedSummary,
        });
        return normalizedSummary;
      }
    }

    if (!this.splitExportFallback) {
      const error = new Error('Item not found') as Error & { statusCode?: number; code?: string };
      error.statusCode = 404;
      error.code = 'NOT_FOUND';
      throw error;
    }

    this.ensureSplitRecipesAvailable();

    const splitItem = this.splitExportService.getItemById(normalizedItemId);
    if (!splitItem) {
      const error = new Error('Item not found') as Error & { statusCode?: number; code?: string };
      error.statusCode = 404;
      error.code = 'NOT_FOUND';
      throw error;
    }

    const producedByRecipeIds = this.getCachedIndexRecipeIds(normalizedItemId, 'produced_by_recipes');
    const usedInRecipeIds = this.getCachedIndexRecipeIds(normalizedItemId, 'used_in_recipes');
    const producedBy = producedByRecipeIds.length > 0
      ? await this.getCraftingRecipesForItem(normalizedItemId)
      : [];
    const usedIn = usedInRecipeIds.length > 0
      ? await this.getUsageRecipesForItem(normalizedItemId)
      : [];
    const producedByMachineGroups = this.toSummaryMachineGroups(this.groupRecipesByMachine(producedBy));
    const usedInMachineGroups = this.toSummaryMachineGroups(this.groupRecipesByMachine(usedIn));
    const producedByCategoryGroups = buildRecipeCategorySummaries(producedBy);
    const usedInCategoryGroups = buildRecipeCategorySummaries(usedIn);

    const summary: ItemRecipeSummaryResponse = {
      itemId: String(splitItem.itemId ?? normalizedItemId),
      itemName: String(splitItem.localizedName ?? splitItem.localized_name ?? ''),
      counts: {
        producedBy: producedByRecipeIds.length,
        usedIn: usedInRecipeIds.length,
        machineGroups: producedByMachineGroups.length,
      },
      machineGroups: producedByMachineGroups,
      producedByMachineGroups,
      usedInMachineGroups,
      producedByCategoryGroups,
      usedInCategoryGroups,
    };

    this.recipeSummaryCache.set(normalizedItemId, {
      expiresAt: now + this.summaryCacheTtlMs,
      value: normalizeItemRecipeSummary(summary),
    });
    return normalizeItemRecipeSummary(summary);
  }

  private groupRecipesByMachine(recipes: IndexedRecipe[]): MachineOption[] {
    const machinesMap = new Map<string, IndexedRecipe[]>();

    for (const recipe of recipes) {
      if (!recipe.machineInfo) continue;
      const machineType = normalizeMachineFamilyName(recipe.machineInfo.machineType || 'Unknown') || 'Unknown';
      const voltageTier = recipe.machineInfo.parsedVoltageTier || '';
      const key = `${machineType}-${voltageTier}`;
      if (!machinesMap.has(key)) {
        machinesMap.set(key, []);
      }
      machinesMap.get(key)!.push(recipe);
    }

    const machines: MachineOption[] = [];
    for (const groupedRecipes of machinesMap.values()) {
      const firstRecipe = groupedRecipes[0];
      const machineInfo = firstRecipe.machineInfo!;
      machines.push({
        machineType: normalizeMachineFamilyName(machineInfo.machineType),
        category: machineInfo.category,
        voltageTier: machineInfo.parsedVoltageTier,
        voltage: machineInfo.parsedVoltage,
        recipeCount: groupedRecipes.length,
        recipes: groupedRecipes,
      });
    }

    const voltageOrder: Record<string, number> = {
      ULV: 0, LV: 1, MV: 2, HV: 3, EV: 4,
      IV: 5, LuV: 6, ZPM: 7, UV: 8, MAX: 9,
    };

    machines.sort((a, b) => {
      const orderA = a.voltageTier ? (voltageOrder[a.voltageTier] ?? 999) : 999;
      const orderB = b.voltageTier ? (voltageOrder[b.voltageTier] ?? 999) : 999;
      return orderA - orderB;
    });

    return machines;
  }

  private toSummaryMachineGroups(machines: MachineOption[]): MachineGroupSummary[] {
    return machines.map((machine) => ({
      machineType: machine.machineType,
      category: machine.category,
      voltageTier: machine.voltageTier,
      voltage: machine.voltage,
      recipeCount: machine.recipeCount,
    }));
  }

  private async hydrateMissingSummaryMachineGroups(
    itemId: string,
    summary: ItemRecipeSummaryResponse,
  ): Promise<ItemRecipeSummaryResponse> {
    const normalized = normalizeItemRecipeSummary(summary);
    const hasProducedByMachineGroups = (normalized.producedByMachineGroups?.length ?? 0) > 0 || (normalized.counts.producedBy ?? 0) <= 0;
    const hasProducedByCategoryGroups = (normalized.producedByCategoryGroups?.length ?? 0) > 0 || (normalized.counts.producedBy ?? 0) <= 0;
    const hasUsedInMachineGroups = (normalized.usedInMachineGroups?.length ?? 0) > 0 || (normalized.counts.usedIn ?? 0) <= 0;
    const hasUsedInCategoryGroups = (normalized.usedInCategoryGroups?.length ?? 0) > 0 || (normalized.counts.usedIn ?? 0) <= 0;
    if (hasProducedByMachineGroups && hasProducedByCategoryGroups && hasUsedInMachineGroups && hasUsedInCategoryGroups) {
      return normalized;
    }

    const producedByDescriptors = (!hasProducedByMachineGroups || !hasProducedByCategoryGroups)
      ? this.getRelationRecipeDescriptors(itemId, 'produced_by')
      : null;
    const usedInDescriptors = (!hasUsedInMachineGroups || !hasUsedInCategoryGroups)
      ? this.getRelationRecipeDescriptors(itemId, 'used_in')
      : null;
    const materializedProducedByMachineGroups = !hasProducedByMachineGroups
      ? this.getMaterializedMachineGroupSummaries(itemId, 'produced_by')
      : null;
    const materializedUsedInMachineGroups = !hasUsedInMachineGroups
      ? this.getMaterializedMachineGroupSummaries(itemId, 'used_in')
      : null;
    const materializedProducedByCategoryGroups = !hasProducedByCategoryGroups
      ? this.getMaterializedCategoryGroupSummaries(itemId, 'produced_by')
      : null;
    const materializedUsedInCategoryGroups = !hasUsedInCategoryGroups
      ? this.getMaterializedCategoryGroupSummaries(itemId, 'used_in')
      : null;

    const producedByMachineGroups = hasProducedByMachineGroups
      ? (normalized.producedByMachineGroups ?? normalized.machineGroups ?? [])
      : (
        materializedProducedByMachineGroups?.length
          ? materializedProducedByMachineGroups
          : this.buildMachineGroupSummariesFromDescriptors(producedByDescriptors)
      );
    const usedInMachineGroups = hasUsedInMachineGroups
      ? (normalized.usedInMachineGroups ?? [])
      : (
        materializedUsedInMachineGroups?.length
          ? materializedUsedInMachineGroups
          : this.buildMachineGroupSummariesFromDescriptors(usedInDescriptors)
      );
    const producedByCategoryGroups = hasProducedByCategoryGroups
      ? (normalized.producedByCategoryGroups ?? [])
      : (
        materializedProducedByCategoryGroups?.length
          ? materializedProducedByCategoryGroups
          : this.buildCategoryGroupSummariesFromDescriptors(producedByDescriptors)
      );
    const usedInCategoryGroups = hasUsedInCategoryGroups
      ? (normalized.usedInCategoryGroups ?? [])
      : (
        materializedUsedInCategoryGroups?.length
          ? materializedUsedInCategoryGroups
          : this.buildCategoryGroupSummariesFromDescriptors(usedInDescriptors)
      );

    return normalizeItemRecipeSummary({
      ...normalized,
      machineGroups: producedByMachineGroups,
      producedByMachineGroups,
      producedByCategoryGroups,
      usedInMachineGroups,
      usedInCategoryGroups,
    });
  }

  async getMachinesForItem(itemId: string): Promise<ItemMachinesResponse> {
    this.ensureSplitRecipesAvailable();
    const splitItem = this.splitExportService.getItemById(itemId);
    if (!splitItem) {
      const error = new Error('Item not found') as Error & { statusCode?: number; code?: string };
      error.statusCode = 404;
      error.code = 'NOT_FOUND';
      throw error;
    }

    const recipes = await this.getCraftingRecipesForItem(itemId);
    return {
      itemId,
      itemName: String(splitItem.localizedName ?? splitItem.localized_name ?? ''),
      machines: this.groupRecipesByMachine(recipes),
    };
  }

  async getRecipesByMachine(machineType: string, voltageTier?: string): Promise<IndexedRecipe[]> {
    const normalizedMachineType = machineType.trim();
    const normalizedVoltageTier = voltageTier?.trim() || undefined;
    if (!normalizedMachineType) return [];
    const machineAliases = expandMachineTypeAliases(normalizedMachineType);

    const cacheKey = `machine:${normalizedMachineType}::${normalizedVoltageTier ?? ''}`;
    const cached = this.getCachedRecipeCollection(cacheKey);
    if (cached) {
      return cached;
    }

    const db = this.getAccelerationDatabase();
    if (this.canUseMaterializedRecipesCore(db)) {
      const bindings: Record<string, unknown> = {
        machineType: normalizedMachineType,
      };
      const aliasBindings = machineAliases.reduce<Record<string, unknown>>((acc, alias, index) => {
        acc[`machineType${index}`] = alias;
        return acc;
      }, {});
      Object.assign(bindings, aliasBindings);
      const aliasWhere = machineAliases.map((_, index) => `machine_type = @machineType${index}`).join(' OR ');
      let whereClause = `WHERE (${aliasWhere})`;
      if (normalizedVoltageTier) {
        whereClause += ' AND voltage_tier = @voltageTier';
        bindings.voltageTier = normalizedVoltageTier;
      }

      const rows = db.prepare(`
        SELECT payload
        FROM recipes_core
        ${whereClause}
        ORDER BY recipe_id ASC
      `).all(bindings) as MaterializedRecipeCoreRow[];

      const recipes = rows
        .map((row) => (row.payload ? JSON.parse(row.payload) as IndexedRecipe : null))
        .filter((recipe): recipe is IndexedRecipe => Boolean(recipe));

      return this.setCachedRecipeCollection(cacheKey, recipes);
    }

    if (!this.splitExportFallback) {
      return [];
    }

    this.ensureSplitRecipesAvailable();

    const startedAt = Date.now();
    const recipeMap = new Map<string, IndexedRecipe>();
    for (const alias of machineAliases) {
      const aliasRecipes = this.splitExportService
        .getRecipesByMachine(alias, normalizedVoltageTier)
        .map((raw) => this.transformAndCacheSplitRecipe(raw))
        .filter((recipe) => Boolean(recipe.machineInfo?.machineType?.trim()));
      for (const recipe of aliasRecipes) {
        recipeMap.set(recipe.id, recipe);
      }
    }
    const recipes = Array.from(recipeMap.values());

    logger.info('[RECIPES_INDEXED] getRecipesByMachine(split-only)', {
      machineType: normalizedMachineType,
      aliases: machineAliases,
      voltageTier: normalizedVoltageTier || null,
      recipeCount: recipes.length,
      durationMs: Date.now() - startedAt,
    });
    return this.setCachedRecipeCollection(cacheKey, recipes);
  }

  async getAllMachineTypes(): Promise<string[]> {
    const now = Date.now();
    if (this.machineTypesCache && this.machineTypesCache.expiresAt > now) {
      return this.machineTypesCache.value;
    }

    const db = this.getAccelerationDatabase();
    if (this.canUseMaterializedRecipesCore(db)) {
      const machineTypes = (db.prepare(`
        SELECT DISTINCT machine_type
        FROM recipes_core
        WHERE machine_type IS NOT NULL AND machine_type != ''
        ORDER BY machine_type COLLATE NOCASE ASC
      `).all() as Array<{ machine_type: string }>).map((row) => row.machine_type);

      this.machineTypesCache = {
        expiresAt: now + this.machineTypesCacheTtlMs,
        value: machineTypes,
      };
      return machineTypes;
    }

    if (!this.splitExportFallback) {
      return [];
    }

    this.ensureSplitRecipesAvailable();

    const machineTypes = this.splitExportService.getAllMachineTypes();
    this.machineTypesCache = {
      expiresAt: now + this.machineTypesCacheTtlMs,
      value: machineTypes,
    };
    return machineTypes;
  }

  private injectBotaniaFallbacks(itemId: string, recipes: IndexedRecipe[]): IndexedRecipe[] {
    if (itemId !== BOTANIA_TERRASTEEL_ITEM_ID) {
      return recipes;
    }

    const hasTerraPlateRecipe = recipes.some((recipe) => {
      const machineType = recipe.machineInfo?.machineType?.toLowerCase() || '';
      const type = recipe.recipeType?.toLowerCase() || '';
      return machineType.includes('娉版媺鍑濊仛') || machineType.includes('terra plate') || type.includes('terra plate');
    });

    if (hasTerraPlateRecipe) {
      return recipes;
    }

    return [...recipes, this.buildTerrasteelFallbackRecipe()];
  }

  private buildTerrasteelFallbackRecipe(): IndexedRecipe {
    const mkItem = (itemId: string, localizedName: string): IndexedItem => {
      const parts = itemId.split('~');
      const modId = parts[1] || '';
      const internalName = parts[2] || '';
      const damage = Number(parts[3] || 0) || 0;
      return {
      itemId,
      modId,
      internalName,
      localizedName,
      renderAssetRef: null,
      damage,
        stackSize: 0,
        maxStackSize: 64,
        maxDamage: 0,
        nbt: null,
        imageFileName: null,
        tooltip: null,
      };
    };

    const toSlot = (slotIndex: number, itemId: string, localizedName: string): IndexedItemGroup => ({
      slotIndex,
      isOreDictionary: false,
      oreDictName: null,
      items: [
        {
          item: mkItem(itemId, localizedName),
          stackSize: 1,
          probability: 1,
        },
      ],
    });

    return {
      id: 'fallback~botania~terra_plate~terrasteel',
      recipeType: 'botania - terra plate',
      inputs: [[
        toSlot(0, 'i~Botania~manaResource~0', '榄斿姏閽㈤敪'),
        toSlot(1, 'i~Botania~manaResource~1', '榄斿姏鐝嶇彔'),
        toSlot(2, 'i~Botania~manaResource~2', '榄斿姏閽荤煶'),
      ]],
      outputs: [
        {
          item: mkItem(BOTANIA_TERRASTEEL_ITEM_ID, '娉版媺閽㈤敪'),
          stackSize: 1,
          probability: 1,
        },
      ],
      fluidInputs: [],
      fluidOutputs: [],
      machineInfo: {
        machineId: 'm~botania~terra_plate',
        category: 'botania',
        machineType: '娉版媺鍑濊仛鏉?',
        iconInfo: 'botania',
        shapeless: true,
        parsedVoltageTier: null,
        parsedVoltage: null,
        machineIcon: {
          itemId: 'i~Botania~terraPlate~0',
          modId: 'Botania',
          internalName: 'terraPlate',
          localizedName: '娉版媺鍑濊仛鏉?',
          renderAssetRef: null,
          imageFileName: 'Botania/terraPlate~0.png',
        },
      },
      metadata: {
        voltageTier: null,
        voltage: null,
        amperage: null,
        duration: null,
        totalEU: null,
        requiresCleanroom: null,
        requiresLowGravity: null,
        additionalInfo: 'Fallback: synthetic Botania terra plate recipe',
      },
      recipeTypeData: {
        itemInputDimension: { width: 3, height: 1 },
      },
    };
  }

  private transformSplitIndexedItem(raw: unknown): IndexedItem {
    const value = (raw ?? {}) as Record<string, unknown>;
    return {
      itemId: String(value.itemId ?? ''),
      modId: String(value.modId ?? value.mod_id ?? ''),
      internalName: String(value.internalName ?? value.internal_name ?? ''),
      localizedName: String(value.localizedName ?? value.localized_name ?? ''),
      renderAssetRef: typeof value.renderAssetRef === 'string' ? value.renderAssetRef : null,
      damage: Number(value.damage ?? 0),
      stackSize: Number(value.stackSize ?? value.maxStackSize ?? 1),
      maxStackSize: Number(value.maxStackSize ?? value.stackSize ?? 1),
      maxDamage: Number(value.maxDamage ?? 0),
      nbt: typeof value.nbt === 'string' ? value.nbt : null,
      imageFileName: typeof value.imageFileName === 'string' ? value.imageFileName : null,
      tooltip: typeof value.tooltip === 'string' ? value.tooltip : null,
    };
  }

  private transformSplitItemStack(raw: unknown): IndexedItemStack {
    const value = (raw ?? {}) as Record<string, unknown>;
    return {
      item: this.transformSplitIndexedItem(value.item),
      stackSize: Number(value.stackSize ?? 1),
      probability: Number(value.probability ?? 1),
    };
  }

  private transformSplitItemGroup(raw: unknown): IndexedItemGroup {
    const value = (raw ?? {}) as Record<string, unknown>;
    const items = Array.isArray(value.items) ? value.items.map((entry) => this.transformSplitItemStack(entry)) : [];
    return {
      slotIndex: Number(value.slotIndex ?? 0),
      items,
      isOreDictionary: Boolean(value.isOreDictionary),
      oreDictName: typeof value.oreDictName === 'string' ? value.oreDictName : null,
    };
  }

  private transformSplitFluid(raw: unknown): IndexedFluid {
    const value = (raw ?? {}) as Record<string, unknown>;
    return {
      fluidId: String(value.fluidId ?? ''),
      modId: String(value.modId ?? value.mod_id ?? ''),
      internalName: String(value.internalName ?? value.internal_name ?? ''),
      localizedName: String(value.localizedName ?? value.localized_name ?? ''),
      renderAssetRef: typeof value.renderAssetRef === 'string' ? value.renderAssetRef : null,
      temperature: Number(value.temperature ?? 0),
    };
  }

  private transformSplitFluidStack(raw: unknown): IndexedFluidStack {
    const value = (raw ?? {}) as Record<string, unknown>;
    return {
      fluid: this.transformSplitFluid(value.fluid),
      amount: Number(value.amount ?? 0),
      probability: Number(value.probability ?? 1),
    };
  }

  private transformSplitFluidGroup(raw: unknown): IndexedFluidGroup {
    const value = (raw ?? {}) as Record<string, unknown>;
    const fluids = Array.isArray(value.fluids) ? value.fluids.map((entry) => this.transformSplitFluidStack(entry)) : [];
    return {
      slotIndex: Number(value.slotIndex ?? 0),
      fluids,
    };
  }

  private transformSplitRecipe(raw: unknown): IndexedRecipe {
    const value = (raw ?? {}) as Record<string, unknown>;
    const machineInfoValue = (value.machineInfo ?? null) as Record<string, unknown> | null;
    const metadataValue = (value.metadata ?? null) as Record<string, unknown> | null;
    const additionalDataValue = (value.additionalData ?? null) as Record<string, unknown> | null;
    const recipeTypeDataValue = (value.recipeTypeData ?? undefined) as RecipeTypeData | undefined;

    const machineInfo = machineInfoValue
      ? {
          machineId: String(machineInfoValue.machineId ?? ''),
          category: String(machineInfoValue.category ?? ''),
          machineType: String(machineInfoValue.machineType ?? ''),
          iconInfo: String(machineInfoValue.iconInfo ?? ''),
          shapeless: Boolean(machineInfoValue.shapeless),
          parsedVoltageTier: typeof machineInfoValue.parsedVoltageTier === 'string' ? machineInfoValue.parsedVoltageTier : null,
          parsedVoltage: typeof machineInfoValue.parsedVoltage === 'number' ? machineInfoValue.parsedVoltage : null,
          machineIcon: machineInfoValue.machineIcon
            ? {
                itemId: String((machineInfoValue.machineIcon as Record<string, unknown>).itemId ?? ''),
                modId: String((machineInfoValue.machineIcon as Record<string, unknown>).modId ?? ''),
                internalName: String((machineInfoValue.machineIcon as Record<string, unknown>).internalName ?? ''),
                localizedName: String((machineInfoValue.machineIcon as Record<string, unknown>).localizedName ?? ''),
                imageFileName: String((machineInfoValue.machineIcon as Record<string, unknown>).imageFileName ?? ''),
              }
            : undefined,
        }
      : null;

    if (machineInfo && machineInfo.machineType) {
      const machineIcon = getMachineIconItem(machineInfo.machineType);
      if (machineIcon) {
        machineInfo.machineIcon = machineIcon;
      }
    }

    return {
      id: String(value.id ?? value.recipeId ?? ''),
      recipeType: String(value.recipeType ?? ''),
      outputs: Array.isArray(value.outputs) ? value.outputs.map((entry) => this.transformSplitItemStack(entry)) : [],
      inputs: Array.isArray(value.inputs) ? value.inputs.map((entry) => this.transformSplitItemGroup(entry)) : [],
      fluidInputs: Array.isArray(value.fluidInputs) ? value.fluidInputs.map((entry) => this.transformSplitFluidGroup(entry)) : [],
      fluidOutputs: Array.isArray(value.fluidOutputs) ? value.fluidOutputs.map((entry) => this.transformSplitFluidStack(entry)) : [],
      machineInfo,
      metadata: transformRecipeMetadata(metadataValue, (entry) => this.transformSplitIndexedItem(entry)),
      additionalData: additionalDataValue,
      recipeTypeData: recipeTypeDataValue,
    };
  }
}

let serviceInstance: IndexedRecipesService | null = null;

export function getIndexedRecipesService(): IndexedRecipesService {
  if (!serviceInstance) {
    serviceInstance = new IndexedRecipesService({ splitExportFallback: false });
  }
  return serviceInstance;
}
