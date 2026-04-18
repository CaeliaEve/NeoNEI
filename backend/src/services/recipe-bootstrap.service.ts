import fs from 'fs';
import path from 'path';
import type Database from 'better-sqlite3';
import { ItemsService, type Item } from './items.service';
import {
  getIndexedRecipesService,
  type IndexedRecipe,
  type IndexedRecipesService,
  type ItemRecipeSummaryResponse,
} from './recipes-indexed.service';
import { getNesqlSplitExportService } from './nesql-split-export.service';
import { getAccelerationDatabaseManager, type DatabaseManager } from '../models/database';
import { SPLIT_ITEMS_DIR, SPLIT_RECIPES_DIR } from '../config/runtime-paths';

export interface RecipeBootstrapPayload {
  item: Item;
  recipeIndex: {
    usedInRecipes: string[];
    producedByRecipes: string[];
  };
  indexedCrafting: IndexedRecipe[];
  indexedUsage: IndexedRecipe[];
  indexedSummary: ItemRecipeSummaryResponse | null;
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
  produced_by_payload: string | null;
  used_in_payload: string | null;
  summary_payload: string | null;
  signature: string | null;
};

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

  private readMaterializedBootstrap(itemId: string): RecipeBootstrapPayload | null {
    const db = this.getAccelerationDatabase();
    if (!this.canUseMaterializedBootstrap(db)) {
      return null;
    }

    const row = db
      .prepare(`
        SELECT produced_by_payload, used_in_payload, summary_payload, signature
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
        recipeIndex: payload.recipeIndex,
        indexedCrafting: [],
        indexedUsage: [],
        indexedSummary: payload.indexedSummary,
      };
      if (row.produced_by_payload) {
        hydrated.indexedCrafting = JSON.parse(row.produced_by_payload) as IndexedRecipe[];
      }
      if (row.used_in_payload) {
        hydrated.indexedUsage = JSON.parse(row.used_in_payload) as IndexedRecipe[];
      }
      return hydrated;
    } catch {
      return null;
    }
  }

  async getBootstrap(itemId: string): Promise<RecipeBootstrapPayload | null> {
    const cached = this.cache.get(itemId);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value;
    }

    const materialized = this.readMaterializedBootstrap(itemId);
    if (materialized) {
      this.cache.set(itemId, { value: materialized, expiresAt: Date.now() + this.cacheTtlMs });
      return materialized;
    }

    if (!this.splitExportFallback) {
      return null;
    }

    const item = await this.itemsService.getItemById(itemId);
    if (!item) {
      this.cache.set(itemId, { value: null, expiresAt: Date.now() + this.cacheTtlMs });
      return null;
    }

    const [indexedCrafting, indexedUsage] = await Promise.all([
      this.indexedRecipesService.getCraftingRecipesForItem(itemId),
      this.indexedRecipesService.getUsageRecipesForItem(itemId),
    ]);
    const recipeIndex = this.buildRecipeIndex(indexedCrafting, indexedUsage);

    const payload = {
      item,
      recipeIndex,
      indexedCrafting,
      indexedUsage,
      indexedSummary: null,
    };
    this.cache.set(itemId, { value: payload, expiresAt: Date.now() + this.cacheTtlMs });
    return payload;
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
}

let instance: RecipeBootstrapService | null = null;

export function getRecipeBootstrapService(): RecipeBootstrapService {
  if (!instance) {
    instance = new RecipeBootstrapService({ splitExportFallback: false });
  }
  return instance;
}
