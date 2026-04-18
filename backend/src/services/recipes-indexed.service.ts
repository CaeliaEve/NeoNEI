import { logger } from '../utils/logger';
import { getAccelerationDatabaseManager, type DatabaseManager } from '../models/database';
import { getMachineIconItem } from './machine-icon-mapping.service';
import { getNesqlSplitExportService } from './nesql-split-export.service';
import { transformRecipeMetadata } from './recipe-metadata';

export interface IndexedItem {
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
}

const BOTANIA_TERRASTEEL_ITEM_ID = 'i~Botania~manaResource~4';
type RecipeIndexColumn = 'produced_by_recipes' | 'used_in_recipes';

type MaterializedBootstrapRow = {
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

export interface IndexedRecipesServiceOptions {
  databaseManager?: DatabaseManager;
  splitExportFallback?: boolean;
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
];

function expandMachineTypeAliases(machineType: string): string[] {
  const normalized = machineType.trim();
  if (!normalized) return [];
  const group = MACHINE_TYPE_ALIAS_GROUPS.find((aliases) => aliases.includes(normalized));
  if (!group) return [normalized];
  return Array.from(new Set(group));
}

export class IndexedRecipesService {
  private databaseManager: DatabaseManager;
  private splitExportFallback: boolean;
  private splitExportService = getNesqlSplitExportService();
  private readonly indexCacheTtlMs = Number(process.env.RECIPE_INDEX_CACHE_TTL_MS || 15_000);
  private readonly machineTypesCacheTtlMs = Number(process.env.MACHINE_TYPES_CACHE_TTL_MS || 60_000);
  private readonly summaryCacheTtlMs = Number(process.env.RECIPE_SUMMARY_CACHE_TTL_MS || 10_000);
  private readonly transformedRecipeCacheTtlMs = Number(process.env.TRANSFORMED_RECIPE_CACHE_TTL_MS || 10 * 60 * 1000);
  private readonly recipeCollectionCacheTtlMs = Number(process.env.RECIPE_COLLECTION_CACHE_TTL_MS || 5 * 60 * 1000);
  private readonly recipeIndexCache = new Map<string, { expiresAt: number; recipeIds: string[] }>();
  private readonly recipeSummaryCache = new Map<string, { expiresAt: number; value: ItemRecipeSummaryResponse }>();
  private readonly transformedRecipeCache = new Map<string, { expiresAt: number; value: IndexedRecipe }>();
  private readonly recipeCollectionCache = new Map<string, { expiresAt: number; value: IndexedRecipe[] }>();
  private machineTypesCache: { expiresAt: number; value: string[] } | null = null;

  constructor(options: IndexedRecipesServiceOptions = {}) {
    this.databaseManager = options.databaseManager ?? getAccelerationDatabaseManager();
    this.splitExportFallback = options.splitExportFallback ?? true;
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
        SELECT produced_by_payload, used_in_payload, summary_payload
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

  private getCachedIndexRecipeIds(itemId: string, column: RecipeIndexColumn): string[] {
    this.ensureSplitRecipesAvailable();
    const key = `${column}:${itemId}`;
    const now = Date.now();
    const cached = this.recipeIndexCache.get(key);
    if (cached && cached.expiresAt > now) {
      return cached.recipeIds;
    }

    const recipeIds = column === 'produced_by_recipes'
      ? this.splitExportService.getProducedByRecipeIds(itemId)
      : this.splitExportService.getUsedInRecipeIds(itemId);

    this.recipeIndexCache.set(key, {
      expiresAt: now + this.indexCacheTtlMs,
      recipeIds,
    });
    return recipeIds;
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

  async getRecipeById(recipeId: string): Promise<IndexedRecipe | null> {
    const db = this.getAccelerationDatabase();
    if (this.canUseMaterializedRecipesCore(db)) {
      const row = db
        .prepare('SELECT payload FROM recipes_core WHERE recipe_id = ?')
        .get(recipeId) as MaterializedRecipeCoreRow | undefined;
      if (row?.payload) {
        return JSON.parse(row.payload) as IndexedRecipe;
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
    this.ensureSplitRecipesAvailable();
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
      for (const raw of this.splitExportService.getRecipesByIds(missingIds)) {
        const transformed = this.transformAndCacheSplitRecipe(raw);
        cachedRecipes.set(transformed.id, transformed);
      }
    }

    return normalizedIds
      .map((recipeId) => cachedRecipes.get(recipeId))
      .filter((recipe): recipe is IndexedRecipe => Boolean(recipe));
  }

  async getCraftingRecipesForItem(itemId: string): Promise<IndexedRecipe[]> {
    const cacheKey = `crafting:${itemId}`;
    const cached = this.getCachedRecipeCollection(cacheKey);
    if (cached) {
      return cached;
    }

    const materialized = this.getMaterializedBootstrapRow(itemId);
    if (materialized?.produced_by_payload) {
      const recipes = JSON.parse(materialized.produced_by_payload) as IndexedRecipe[];
      return this.setCachedRecipeCollection(cacheKey, recipes);
    }

    if (!this.splitExportFallback) {
      return [];
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
    if (materialized?.used_in_payload) {
      const recipes = JSON.parse(materialized.used_in_payload) as IndexedRecipe[];
      return this.setCachedRecipeCollection(cacheKey, recipes);
    }

    if (!this.splitExportFallback) {
      return [];
    }

    const recipeIds = this.getCachedIndexRecipeIds(itemId, 'used_in_recipes');
    if (recipeIds.length === 0) return [];
    return this.setCachedRecipeCollection(cacheKey, await this.getRecipesByIds(recipeIds));
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
        const summary = JSON.parse(summaryRow.summary_payload) as ItemRecipeSummaryResponse;
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
        this.recipeSummaryCache.set(normalizedItemId, {
          expiresAt: now + this.summaryCacheTtlMs,
          value: payload.indexedSummary,
        });
        return payload.indexedSummary;
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
    const machineGroups = this.toSummaryMachineGroups(this.groupRecipesByMachine(producedBy));

    const summary: ItemRecipeSummaryResponse = {
      itemId: String(splitItem.itemId ?? normalizedItemId),
      itemName: String(splitItem.localizedName ?? splitItem.localized_name ?? ''),
      counts: {
        producedBy: producedByRecipeIds.length,
        usedIn: usedInRecipeIds.length,
        machineGroups: machineGroups.length,
      },
      machineGroups,
    };

    this.recipeSummaryCache.set(normalizedItemId, {
      expiresAt: now + this.summaryCacheTtlMs,
      value: summary,
    });
    return summary;
  }

  private groupRecipesByMachine(recipes: IndexedRecipe[]): MachineOption[] {
    const machinesMap = new Map<string, IndexedRecipe[]>();

    for (const recipe of recipes) {
      if (!recipe.machineInfo) continue;
      const machineType = recipe.machineInfo.machineType || 'Unknown';
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
        machineType: machineInfo.machineType,
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
