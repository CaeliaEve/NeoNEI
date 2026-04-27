import fs from 'fs';
import path from 'path';
import type Database from 'better-sqlite3';
import { ItemsService, type Item } from './items.service';
import type { BrowserPageRichMediaManifest } from './browser-render-hints.service';
import { buildRichMediaManifestFromUnknown } from './browser-render-hints.service';
import {
  getIndexedRecipesService,
  type IndexedRecipe,
  type IndexedRecipesService,
  type ItemRecipeSummaryResponse,
  type RecipeGroupPackOptions,
  type RecipeGroupPackResponse,
  normalizeItemRecipeSummary,
} from './recipes-indexed.service';
import { getNesqlSplitExportService } from './nesql-split-export.service';
import { getAccelerationDatabaseManager, type DatabaseManager } from '../models/database';
import { SPLIT_ITEMS_DIR, SPLIT_RECIPES_DIR } from '../config/runtime-paths';
import { getMachineIconItem } from './machine-icon-mapping.service';
import { getRenderContractService, type RenderAnimationHint } from './render-contract.service';
import { logger } from '../utils/logger';

export interface RecipeBootstrapPayload {
  item: Item;
  recipeIndex: {
    usedInRecipes: string[];
    producedByRecipes: string[];
  };
  indexedCrafting: IndexedRecipe[];
  indexedUsage: IndexedRecipe[];
  indexedSummary: ItemRecipeSummaryResponse | null;
  mediaManifest?: BrowserPageRichMediaManifest | null;
}

export interface RecipeBootstrapMachineGroupPayload {
  itemId: string;
  machineType: string;
  voltageTier: string | null;
  recipeCount: number;
  recipes: IndexedRecipe[];
  recipeIds?: string[];
  offset?: number;
  limit?: number;
  hasMore?: boolean;
  mediaManifest?: BrowserPageRichMediaManifest | null;
}

export interface RecipeBootstrapCategoryGroupPayload {
  itemId: string;
  categoryKey: string;
  tab: 'usedIn' | 'producedBy';
  recipeCount: number;
  recipes: IndexedRecipe[];
  recipeIds?: string[];
  offset?: number;
  limit?: number;
  hasMore?: boolean;
  mediaManifest?: BrowserPageRichMediaManifest | null;
}

type CompactRecipeBootstrapPayload = {
  item: Item;
  recipeIndex: {
    usedInRecipes: string[];
    producedByRecipes: string[];
  };
  indexedSummary: ItemRecipeSummaryResponse | null;
};

type RecipeBootstrapRow = {
  produced_by_ids: string | null;
  used_in_ids: string | null;
  produced_by_payload: string | null;
  used_in_payload: string | null;
  summary_payload: string | null;
  signature: string | null;
};

type RecipeUiPayloadRow = {
  recipe_id: string;
  payload_json: string | null;
};

const BOOTSTRAP_EAGER_MISSING_RECIPE_LIMIT = Number(
  process.env.RECIPE_BOOTSTRAP_EAGER_MISSING_RECIPE_LIMIT || 6,
);
const RECIPE_MEDIA_MANIFEST_MAX_ASSETS = Number(
  process.env.RECIPE_MEDIA_MANIFEST_MAX_ASSETS || 24,
);

export interface RecipeBootstrapServiceOptions {
  databaseManager?: DatabaseManager;
  itemsService?: ItemsService;
  indexedRecipesService?: IndexedRecipesService;
  splitExportFallback?: boolean;
}

export class RecipeBootstrapService {
  private itemsService: ItemsService;
  private indexedRecipesService: IndexedRecipesService;
  private databaseManager: DatabaseManager;
  private splitExportFallback: boolean;
  private splitExportService = getNesqlSplitExportService();
  private cache = new Map<string, { expiresAt: number; value: RecipeBootstrapPayload | null }>();
  private fullCache = new Map<string, { expiresAt: number; value: RecipeBootstrapPayload | null }>();
  private readonly cacheTtlMs = Number(process.env.RECIPE_BOOTSTRAP_CACHE_TTL_MS || 60 * 60 * 1000);

  constructor(options: RecipeBootstrapServiceOptions = {}) {
    this.databaseManager = options.databaseManager ?? getAccelerationDatabaseManager();
    this.splitExportFallback = options.splitExportFallback ?? true;
    this.itemsService =
      options.itemsService ??
      new ItemsService({
        databaseManager: this.databaseManager,
        splitExportFallback: this.splitExportFallback,
      });
    this.indexedRecipesService = options.indexedRecipesService ?? getIndexedRecipesService();
  }

  private getAccelerationDatabase(): Database.Database | null {
    try {
      return this.databaseManager.getDatabase();
    } catch {
      return null;
    }
  }

  private canUseMaterializedBootstrap(db: Database.Database | null): db is Database.Database {
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

  private buildRecipeIndex(indexedCrafting: IndexedRecipe[], indexedUsage: IndexedRecipe[]) {
    return {
      usedInRecipes: indexedUsage.map((recipe) => recipe.id),
      producedByRecipes: indexedCrafting.map((recipe) => recipe.id),
    };
  }

  private buildRecipeIndexFromIds(producedByRecipes: string[], usedInRecipes: string[]) {
    return {
      usedInRecipes: Array.from(new Set(usedInRecipes.map((recipeId) => recipeId.trim()).filter(Boolean))),
      producedByRecipes: Array.from(new Set(producedByRecipes.map((recipeId) => recipeId.trim()).filter(Boolean))),
    };
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

  private attachRenderHintToBootstrapItem(item: Item | null | undefined): void {
    if (!item) return;
    const assetId = `${item.renderAssetRef ?? ''}`.trim();
    item.renderHint = assetId ? (getRenderContractService().getRenderAnimationHint(assetId) ?? null) : null;
  }

  private attachRenderHintToIndexedItem(item: { renderAssetRef?: string | null; renderHint?: RenderAnimationHint | null } | null | undefined): void {
    if (!item) return;
    const assetId = `${item.renderAssetRef ?? ''}`.trim();
    item.renderHint = assetId ? (getRenderContractService().getRenderAnimationHint(assetId) ?? null) : null;
  }

  private attachRenderHintToIndexedFluid(fluid: { renderAssetRef?: string | null; renderHint?: RenderAnimationHint | null } | null | undefined): void {
    if (!fluid) return;
    const assetId = `${fluid.renderAssetRef ?? ''}`.trim();
    fluid.renderHint = assetId ? (getRenderContractService().getRenderAnimationHint(assetId) ?? null) : null;
  }

  private attachRenderHintsToIndexedRecipe(recipe: IndexedRecipe): IndexedRecipe {
    for (const output of recipe.outputs ?? []) {
      this.attachRenderHintToIndexedItem(output?.item);
    }

    const visitInputGroup = (group: IndexedRecipe['inputs'][number] | null | undefined) => {
      if (!group) return;
      if (Array.isArray(group)) {
        for (const nested of group) {
          visitInputGroup(nested as IndexedRecipe['inputs'][number]);
        }
        return;
      }
      for (const itemStack of group.items ?? []) {
        this.attachRenderHintToIndexedItem(itemStack?.item);
      }
    };

    for (const input of recipe.inputs ?? []) {
      visitInputGroup(input as IndexedRecipe['inputs'][number]);
    }

    for (const fluidGroup of recipe.fluidInputs ?? []) {
      for (const fluidStack of fluidGroup.fluids ?? []) {
        this.attachRenderHintToIndexedFluid(fluidStack?.fluid);
      }
    }

    for (const fluidStack of recipe.fluidOutputs ?? []) {
      this.attachRenderHintToIndexedFluid(fluidStack?.fluid);
    }

    if (recipe.machineInfo?.machineIcon) {
      this.attachRenderHintToIndexedItem(recipe.machineInfo.machineIcon);
    }

    const specialItems = Array.isArray(recipe.metadata?.specialItems) ? recipe.metadata.specialItems : [];
    for (const item of specialItems) {
      this.attachRenderHintToIndexedItem(item);
    }

    return recipe;
  }

  private attachRenderHintsToSummary(summary: ItemRecipeSummaryResponse | null): ItemRecipeSummaryResponse | null {
    if (!summary) return summary;

    const visitGroups = (
      groups:
        | Array<{ machineIcon?: { renderAssetRef?: string | null; renderHint?: RenderAnimationHint | null } | null }>
        | undefined,
    ) => {
      for (const group of groups ?? []) {
        this.attachRenderHintToIndexedItem(group.machineIcon ?? undefined);
      }
    };

    visitGroups(summary.machineGroups);
    visitGroups(summary.producedByMachineGroups);
    visitGroups(summary.usedInMachineGroups);
    visitGroups(summary.producedByCategoryGroups);
    visitGroups(summary.usedInCategoryGroups);
    return summary;
  }

  private attachRenderHints(payload: RecipeBootstrapPayload): RecipeBootstrapPayload {
    this.attachRenderHintToBootstrapItem(payload.item);
    for (const recipe of payload.indexedCrafting) {
      this.attachRenderHintsToIndexedRecipe(recipe);
    }
    for (const recipe of payload.indexedUsage) {
      this.attachRenderHintsToIndexedRecipe(recipe);
    }
    this.attachRenderHintsToSummary(payload.indexedSummary);
    payload.mediaManifest = buildRichMediaManifestFromUnknown(payload, {
      maxAssets: RECIPE_MEDIA_MANIFEST_MAX_ASSETS,
    });
    return payload;
  }

  private enrichIndexedRecipes(recipes: IndexedRecipe[]): IndexedRecipe[] {
    return recipes.map((recipe) => this.attachRenderHintsToIndexedRecipe(this.normalizeRecipeMachineIcon(recipe)));
  }

  private buildMachineGroupPayload(
    itemId: string,
    machineType: string,
    voltageTier: string | null | undefined,
    pack: RecipeGroupPackResponse,
  ): RecipeBootstrapMachineGroupPayload {
    const recipes = this.enrichIndexedRecipes(pack.recipes);
    return {
      itemId,
      machineType,
      voltageTier: voltageTier ?? null,
      recipeCount: pack.recipeCount,
      recipes,
      recipeIds: pack.recipeIds,
      offset: pack.offset,
      limit: pack.limit,
      hasMore: pack.hasMore,
      mediaManifest: buildRichMediaManifestFromUnknown(recipes, {
        maxAssets: RECIPE_MEDIA_MANIFEST_MAX_ASSETS,
      }),
    };
  }

  private buildCategoryGroupPayload(
    itemId: string,
    tab: 'usedIn' | 'producedBy',
    categoryKey: string,
    pack: RecipeGroupPackResponse,
  ): RecipeBootstrapCategoryGroupPayload {
    const recipes = this.enrichIndexedRecipes(pack.recipes);
    return {
      itemId,
      categoryKey,
      tab,
      recipeCount: pack.recipeCount,
      recipes,
      recipeIds: pack.recipeIds,
      offset: pack.offset,
      limit: pack.limit,
      hasMore: pack.hasMore,
      mediaManifest: buildRichMediaManifestFromUnknown(recipes, {
        maxAssets: RECIPE_MEDIA_MANIFEST_MAX_ASSETS,
      }),
    };
  }

  private getBootstrapSignature(itemId: string): string {
    const signatures: string[] = [];

    if (SPLIT_RECIPES_DIR) {
      const recipeIndexCachePath = path.join(SPLIT_RECIPES_DIR, '.hub-recipe-index-cache.json.gz');
      if (fs.existsSync(recipeIndexCachePath)) {
        const stat = fs.statSync(recipeIndexCachePath);
        signatures.push(`recipes:${stat.size}:${stat.mtimeMs}`);
      }
    }

    const parts = itemId.split('~');
    const modId = parts.length >= 3 ? parts[1] : '';
    if (modId && SPLIT_ITEMS_DIR) {
      const itemFilePath = path.join(SPLIT_ITEMS_DIR, modId, 'items.json.gz');
      if (fs.existsSync(itemFilePath)) {
        const stat = fs.statSync(itemFilePath);
        signatures.push(`items:${modId}:${stat.size}:${stat.mtimeMs}`);
      }
    }

    return signatures.join('|');
  }

  getCacheToken(itemId: string): string {
    const normalizedItemId = `${itemId ?? ''}`.trim();
    if (!normalizedItemId) {
      return 'missing-item-id';
    }

    const db = this.getAccelerationDatabase();
    if (this.canUseMaterializedBootstrap(db)) {
      const row = db.prepare(`
        SELECT signature
        FROM recipe_bootstrap
        WHERE item_id = ?
      `).get(normalizedItemId) as { signature?: string | null } | undefined;
      const signature = `${row?.signature ?? ''}`.trim();
      if (signature) {
        return signature;
      }
    }

    return this.getBootstrapSignature(normalizedItemId) || normalizedItemId;
  }

  private readMaterializedBootstrap(itemId: string): RecipeBootstrapPayload | null {
    const db = this.getAccelerationDatabase();
    if (!this.canUseMaterializedBootstrap(db)) {
      return null;
    }

    const row = db
      .prepare(`
        SELECT produced_by_ids, used_in_ids, produced_by_payload, used_in_payload, summary_payload, signature
        FROM recipe_bootstrap
        WHERE item_id = ?
      `)
      .get(itemId) as RecipeBootstrapRow | undefined;

    if (!row?.summary_payload) {
      return null;
    }

    try {
      const payload = JSON.parse(row.summary_payload) as CompactRecipeBootstrapPayload;
      const hydrated: RecipeBootstrapPayload = {
        item: payload.item,
        recipeIndex: {
          usedInRecipes: row.used_in_ids ? JSON.parse(row.used_in_ids) as string[] : payload.recipeIndex.usedInRecipes,
          producedByRecipes: row.produced_by_ids ? JSON.parse(row.produced_by_ids) as string[] : payload.recipeIndex.producedByRecipes,
        },
        indexedCrafting: [],
        indexedUsage: [],
        indexedSummary: payload.indexedSummary ? normalizeItemRecipeSummary(payload.indexedSummary) : null,
      };
      if (row.produced_by_payload) {
        hydrated.indexedCrafting = (JSON.parse(row.produced_by_payload) as IndexedRecipe[])
          .map((recipe) => this.normalizeRecipeMachineIcon(recipe));
      }
      if (row.used_in_payload) {
        hydrated.indexedUsage = (JSON.parse(row.used_in_payload) as IndexedRecipe[])
          .map((recipe) => this.normalizeRecipeMachineIcon(recipe));
      }
      return hydrated;
    } catch {
      return null;
    }
  }

  private canUseUiPayloads(db: Database.Database | null): db is Database.Database {
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
    `).all(...normalizedRecipeIds) as RecipeUiPayloadRow[];

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

  private attachUiPayloads(payload: RecipeBootstrapPayload): RecipeBootstrapPayload {
    const recipes = [...payload.indexedCrafting, ...payload.indexedUsage];
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
      return payload;
    }

    const uiPayloadsByRecipeId = this.readUiPayloads(missingUiRecipeIds);
    if (uiPayloadsByRecipeId.size === 0) {
      return payload;
    }

    const enrichRecipe = (recipe: IndexedRecipe): IndexedRecipe => {
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

      return {
        ...recipe,
        additionalData,
      };
    };

    return {
      ...payload,
      indexedCrafting: payload.indexedCrafting.map(enrichRecipe),
      indexedUsage: payload.indexedUsage.map(enrichRecipe),
    };
  }

  private collectOrderedMissingRecipeIds(payload: RecipeBootstrapPayload): string[] {
    const existingRecipeIds = new Set<string>();
    for (const recipe of [...payload.indexedCrafting, ...payload.indexedUsage]) {
      existingRecipeIds.add(recipe.id);
    }

    const orderedMissingRecipeIds: string[] = [];
    const seenRecipeIds = new Set<string>();
    for (const recipeId of [
      ...payload.recipeIndex.producedByRecipes,
      ...payload.recipeIndex.usedInRecipes,
    ]) {
      if (!recipeId || seenRecipeIds.has(recipeId) || existingRecipeIds.has(recipeId)) {
        continue;
      }
      seenRecipeIds.add(recipeId);
      orderedMissingRecipeIds.push(recipeId);
    }

    return orderedMissingRecipeIds;
  }

  private async ensureBootstrapSummaryCoverage(
    itemId: string,
    payload: RecipeBootstrapPayload,
  ): Promise<RecipeBootstrapPayload> {
    const summary = payload.indexedSummary;
    if (
      !summary
      || typeof this.indexedRecipesService.getItemRecipeSummary !== 'function'
    ) {
      return payload;
    }

    const needsProducedByCategoryGroups = (summary.counts.producedBy ?? 0) > 0 && (summary.producedByCategoryGroups?.length ?? 0) <= 0;
    const needsUsedInMachineGroups = (summary.counts.usedIn ?? 0) > 0 && (summary.usedInMachineGroups?.length ?? 0) <= 0;
    const needsUsedInCategoryGroups = (summary.counts.usedIn ?? 0) > 0 && (summary.usedInCategoryGroups?.length ?? 0) <= 0;
    if (!needsProducedByCategoryGroups && !needsUsedInMachineGroups && !needsUsedInCategoryGroups) {
      return payload;
    }

    const hydratedSummary = await this.indexedRecipesService.getItemRecipeSummary(itemId).catch(() => summary);
    return {
      ...payload,
      indexedSummary: hydratedSummary ? normalizeItemRecipeSummary(hydratedSummary) : summary,
    };
  }

  private async topUpBootstrapSeedRecipes(payload: RecipeBootstrapPayload): Promise<RecipeBootstrapPayload> {
    if (BOOTSTRAP_EAGER_MISSING_RECIPE_LIMIT <= 0) {
      return payload;
    }

    const orderedMissingRecipeIds = this.collectOrderedMissingRecipeIds(payload);
    if (orderedMissingRecipeIds.length === 0) {
      return payload;
    }

    const eagerRecipeIds = orderedMissingRecipeIds.slice(0, BOOTSTRAP_EAGER_MISSING_RECIPE_LIMIT);
    if (eagerRecipeIds.length === 0) {
      return payload;
    }

    const recipesById = new Map<string, IndexedRecipe>();
    for (const recipe of [...payload.indexedCrafting, ...payload.indexedUsage]) {
      recipesById.set(recipe.id, recipe);
    }

    const hydratedRecipes = await this.indexedRecipesService.getRecipesByIds(eagerRecipeIds);
    for (const recipe of hydratedRecipes) {
      recipesById.set(recipe.id, this.normalizeRecipeMachineIcon(recipe));
    }

    return {
      ...payload,
      indexedCrafting: payload.recipeIndex.producedByRecipes
        .map((recipeId) => recipesById.get(recipeId))
        .filter((recipe): recipe is IndexedRecipe => Boolean(recipe)),
      indexedUsage: payload.recipeIndex.usedInRecipes
        .map((recipeId) => recipesById.get(recipeId))
        .filter((recipe): recipe is IndexedRecipe => Boolean(recipe)),
    };
  }

  async getBootstrap(itemId: string): Promise<RecipeBootstrapPayload | null> {
    const cached = this.cache.get(itemId);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value;
    }

    const materialized = this.readMaterializedBootstrap(itemId);
    if (materialized) {
      try {
        const toppedUp = await this.topUpBootstrapSeedRecipes(materialized);
        const enriched = await this.ensureBootstrapSummaryCoverage(
          itemId,
          this.attachRenderHints(this.attachUiPayloads(toppedUp)),
        );
        this.cache.set(itemId, { value: enriched, expiresAt: Date.now() + this.cacheTtlMs });
        return enriched;
      } catch (error) {
        logger.warn('Recipe bootstrap eager top-up failed; serving materialized seed payload only', {
          itemId,
          error: error instanceof Error ? error.message : String(error),
        });
        const enriched = await this.ensureBootstrapSummaryCoverage(
          itemId,
          this.attachRenderHints(this.attachUiPayloads(materialized)),
        );
        this.cache.set(itemId, { value: enriched, expiresAt: Date.now() + this.cacheTtlMs });
        return enriched;
      }
    }

    const item = await this.itemsService.getItemById(itemId);
    if (!item) {
      this.cache.set(itemId, { value: null, expiresAt: Date.now() + this.cacheTtlMs });
      return null;
    }

    const [producedByRecipeIds, usedInRecipeIds, indexedSummary] = await Promise.all([
      this.indexedRecipesService.getCraftingRecipeIdsForItem(itemId),
      this.indexedRecipesService.getUsageRecipeIdsForItem(itemId),
      this.indexedRecipesService.getItemRecipeSummary(itemId).catch(() => null),
    ]);
    const recipeIndex = this.buildRecipeIndexFromIds(producedByRecipeIds, usedInRecipeIds);

    const payload = this.attachRenderHints(this.attachUiPayloads(await this.topUpBootstrapSeedRecipes({
      item,
      recipeIndex,
      indexedCrafting: [],
      indexedUsage: [],
      indexedSummary: indexedSummary ? normalizeItemRecipeSummary(indexedSummary) : null,
    })));
    this.cache.set(itemId, { value: payload, expiresAt: Date.now() + this.cacheTtlMs });
    return payload;
  }

  async getBootstrapShard(itemId: string): Promise<RecipeBootstrapPayload | null> {
    const cached = this.fullCache.get(itemId);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value;
    }

    const bootstrap = await this.getBootstrap(itemId);
    if (!bootstrap) {
      this.fullCache.set(itemId, { value: null, expiresAt: Date.now() + this.cacheTtlMs });
      return null;
    }

    const recipeIds = Array.from(
      new Set([
        ...bootstrap.recipeIndex.producedByRecipes,
        ...bootstrap.recipeIndex.usedInRecipes,
      ]),
    );

    const recipesById = new Map<string, IndexedRecipe>();
    for (const recipe of [...bootstrap.indexedCrafting, ...bootstrap.indexedUsage]) {
      recipesById.set(recipe.id, recipe);
    }

    const missingRecipeIds = recipeIds.filter((recipeId) => !recipesById.has(recipeId));
    if (missingRecipeIds.length > 0) {
      const hydratedRecipes = await this.indexedRecipesService.getRecipesByIds(missingRecipeIds);
      for (const recipe of hydratedRecipes) {
        recipesById.set(recipe.id, this.normalizeRecipeMachineIcon(recipe));
      }
    }

    const payload = this.attachRenderHints(this.attachUiPayloads({
      item: bootstrap.item,
      recipeIndex: bootstrap.recipeIndex,
      indexedCrafting: bootstrap.recipeIndex.producedByRecipes
        .map((recipeId) => recipesById.get(recipeId))
        .filter((recipe): recipe is IndexedRecipe => Boolean(recipe)),
      indexedUsage: bootstrap.recipeIndex.usedInRecipes
        .map((recipeId) => recipesById.get(recipeId))
        .filter((recipe): recipe is IndexedRecipe => Boolean(recipe)),
      indexedSummary: bootstrap.indexedSummary,
    }));

    this.fullCache.set(itemId, { value: payload, expiresAt: Date.now() + this.cacheTtlMs });
    return payload;
  }

  async getProducedByGroup(
    itemId: string,
    machineType: string,
    voltageTier?: string | null,
    options?: RecipeGroupPackOptions,
  ): Promise<RecipeBootstrapMachineGroupPayload> {
    const pack = await this.indexedRecipesService.getProducedByRecipePackForMachineGroup(
      itemId,
      machineType,
      voltageTier,
      options,
    );
    return this.buildMachineGroupPayload(itemId, machineType, voltageTier ?? null, pack);
  }

  async getUsedInGroup(
    itemId: string,
    machineType: string,
    voltageTier?: string | null,
    options?: RecipeGroupPackOptions,
  ): Promise<RecipeBootstrapMachineGroupPayload> {
    const pack = await this.indexedRecipesService.getUsedInRecipePackForMachineGroup(
      itemId,
      machineType,
      voltageTier,
      options,
    );
    return this.buildMachineGroupPayload(itemId, machineType, voltageTier ?? null, pack);
  }

  async getCategoryGroup(
    itemId: string,
    tab: 'usedIn' | 'producedBy',
    categoryKey: string,
    options?: RecipeGroupPackOptions,
  ): Promise<RecipeBootstrapCategoryGroupPayload> {
    const pack = await this.indexedRecipesService.getRecipePackForCategoryGroup(
      itemId,
      tab === 'usedIn' ? 'used_in' : 'produced_by',
      categoryKey,
      options,
    );
    return this.buildCategoryGroupPayload(itemId, tab, categoryKey, pack);
  }

  async prewarmBootstrapCache(options?: { limit?: number }): Promise<{ warmed: number; skipped: number }> {
    this.splitExportService.loadRecipesIfNeeded();
    const sortedItemIds = this.splitExportService
      .getAllItemIds()
      .sort((a, b) => this.splitExportService.getRecipeLinkCount(b) - this.splitExportService.getRecipeLinkCount(a));
    const limit = typeof options?.limit === 'number' && options.limit > 0
      ? Math.min(options.limit, sortedItemIds.length)
      : sortedItemIds.length;

    let warmed = 0;
    let skipped = 0;
    for (const itemId of sortedItemIds.slice(0, limit)) {
      if (!itemId) {
        skipped += 1;
        continue;
      }
      if (this.readMaterializedBootstrap(itemId)) {
        skipped += 1;
        continue;
      }
      await this.getBootstrap(itemId);
      warmed += 1;
    }

    return { warmed, skipped };
  }

  async prewarmShardCache(options?: { limit?: number }): Promise<{ warmed: number; skipped: number }> {
    this.splitExportService.loadRecipesIfNeeded();
    const sortedItemIds = this.splitExportService
      .getAllItemIds()
      .sort((a, b) => this.splitExportService.getRecipeLinkCount(b) - this.splitExportService.getRecipeLinkCount(a));
    const limit = typeof options?.limit === 'number' && options.limit > 0
      ? Math.min(options.limit, sortedItemIds.length)
      : Math.min(24, sortedItemIds.length);

    let warmed = 0;
    let skipped = 0;
    for (const itemId of sortedItemIds.slice(0, limit)) {
      if (!itemId) {
        skipped += 1;
        continue;
      }
      const cached = this.fullCache.get(itemId);
      if (cached && cached.expiresAt > Date.now()) {
        skipped += 1;
        continue;
      }
      await this.getBootstrapShard(itemId);
      warmed += 1;
      await new Promise<void>((resolve) => setImmediate(resolve));
    }

    return { warmed, skipped };
  }
}

let instance: RecipeBootstrapService | null = null;

export function getRecipeBootstrapService(): RecipeBootstrapService {
  if (!instance) {
    instance = new RecipeBootstrapService({ splitExportFallback: false });
  }
  return instance;
}
