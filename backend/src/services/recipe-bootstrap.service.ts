import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { ItemsService, type Item } from './items.service';
import {
  getIndexedRecipesService,
  type IndexedRecipe,
  type ItemRecipeSummaryResponse,
} from './recipes-indexed.service';
import { getNesqlSplitExportService } from './nesql-split-export.service';
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

type RecipeBootstrapCacheFile = {
  version: 2;
  signature: string;
  payload: RecipeBootstrapPayload | null;
};

export class RecipeBootstrapService {
  private itemsService = new ItemsService();
  private indexedRecipesService = getIndexedRecipesService();
  private splitExportService = getNesqlSplitExportService();
  private cache = new Map<string, { expiresAt: number; value: RecipeBootstrapPayload | null }>();
  private readonly cacheTtlMs = Number(process.env.RECIPE_BOOTSTRAP_CACHE_TTL_MS || 60 * 60 * 1000);

  private buildRecipeIndex(indexedCrafting: IndexedRecipe[], indexedUsage: IndexedRecipe[]) {
    return {
      usedInRecipes: indexedUsage.map((recipe) => recipe.id),
      producedByRecipes: indexedCrafting.map((recipe) => recipe.id),
    };
  }

  private getBootstrapCacheDir(): string | null {
    return SPLIT_RECIPES_DIR ? path.join(SPLIT_RECIPES_DIR, '.hub-bootstrap-cache') : null;
  }

  private getBootstrapCacheFilePath(itemId: string): string | null {
    const cacheDir = this.getBootstrapCacheDir();
    if (!cacheDir) return null;
    return path.join(cacheDir, `${encodeURIComponent(itemId)}.json.gz`);
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

  private readDiskCache(itemId: string, signature: string): RecipeBootstrapPayload | null {
    const cacheFilePath = this.getBootstrapCacheFilePath(itemId);
    if (!cacheFilePath || !fs.existsSync(cacheFilePath)) {
      return null;
    }

    try {
      const buffer = fs.readFileSync(cacheFilePath);
      const payload = JSON.parse(zlib.gunzipSync(buffer).toString('utf-8')) as RecipeBootstrapCacheFile;
      if (payload.version !== 2 || payload.signature !== signature) {
        return null;
      }
      return payload.payload ?? null;
    } catch {
      return null;
    }
  }

  private writeDiskCache(itemId: string, signature: string, payload: RecipeBootstrapPayload | null): void {
    const cacheDir = this.getBootstrapCacheDir();
    const cacheFilePath = this.getBootstrapCacheFilePath(itemId);
    if (!cacheDir || !cacheFilePath) {
      return;
    }

    try {
      fs.mkdirSync(cacheDir, { recursive: true });
      const cacheFile: RecipeBootstrapCacheFile = {
        version: 2,
        signature,
        payload,
      };
      fs.writeFileSync(cacheFilePath, zlib.gzipSync(Buffer.from(JSON.stringify(cacheFile))));
    } catch {
      // Best-effort disk cache only.
    }
  }

  async getBootstrap(itemId: string): Promise<RecipeBootstrapPayload | null> {
    const cached = this.cache.get(itemId);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value;
    }

    const signature = this.getBootstrapSignature(itemId);
    const diskCached = this.readDiskCache(itemId, signature);
    if (diskCached) {
      this.cache.set(itemId, { value: diskCached, expiresAt: Date.now() + this.cacheTtlMs });
      return diskCached;
    }

    const item = await this.itemsService.getItemById(itemId);
    if (!item) {
      this.cache.set(itemId, { value: null, expiresAt: Date.now() + this.cacheTtlMs });
      this.writeDiskCache(itemId, signature, null);
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
    this.writeDiskCache(itemId, signature, payload);
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
      const signature = this.getBootstrapSignature(itemId);
      const diskCached = this.readDiskCache(itemId, signature);
      if (diskCached) {
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
    instance = new RecipeBootstrapService();
  }
  return instance;
}
