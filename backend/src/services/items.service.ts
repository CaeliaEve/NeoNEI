import type Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { getAccelerationDatabaseManager, type DatabaseManager } from '../models/database';
import { getNesqlSplitExportService } from './nesql-split-export.service';
import { IMAGES_PATH } from '../config/runtime-paths';

export interface Item {
  itemId: string;
  modId: string;
  internalName: string;
  localizedName: string;
  renderAssetRef?: string | null;
  preferredImageUrl?: string | null;
  unlocalizedName: string;
  damage: number;
  maxStackSize: number;
  maxDamage: number;
  imageFileName: string | null;
  tooltip: string | null;
  searchTerms: string | null;
  toolClasses: string | null;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

type ItemRow = {
  item_id: string;
  mod_id: string;
  internal_name: string;
  localized_name: string;
  unlocalized_name: string;
  damage: number;
  image_file_name: string | null;
  render_asset_ref: string | null;
  preferred_image_url: string | null;
  tooltip: string | null;
  search_terms: string | null;
};

type ModRow = {
  mod_id: string;
  item_count: number;
};

export interface ItemsServiceOptions {
  databaseManager?: DatabaseManager;
  splitExportFallback?: boolean;
}

export class ItemsService {
  private splitExportService = getNesqlSplitExportService();
  private databaseManager: DatabaseManager;
  private splitExportFallback: boolean;
  private static itemCache = new Map<string, { value: Item; expiresAt: number }>();
  private static imageUrlCache = new Map<string, string>();
  private static readonly ITEM_CACHE_TTL_MS = 60 * 1000;

  constructor(options: ItemsServiceOptions = {}) {
    this.databaseManager = options.databaseManager ?? getAccelerationDatabaseManager();
    this.splitExportFallback = options.splitExportFallback ?? true;
  }

  private ensureSplitItemsAvailable(): void {
    if (!this.splitExportService.hasSplitItems()) {
      throw new Error('Split item export is unavailable');
    }
  }

  private getAccelerationDatabase(): Database.Database | null {
    try {
      return this.databaseManager.getDatabase();
    } catch {
      return null;
    }
  }

  private canUseAccelerationItems(db: Database.Database | null): db is Database.Database {
    if (!db) return false;
    try {
      const row = db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'items_core'")
        .get() as { name?: string } | undefined;
      return row?.name === 'items_core';
    } catch {
      return false;
    }
  }

  private getCachedItem(itemId: string): Item | null {
    const hit = ItemsService.itemCache.get(itemId);
    if (!hit) return null;
    if (Date.now() > hit.expiresAt) {
      ItemsService.itemCache.delete(itemId);
      return null;
    }
    return hit.value;
  }

  private setCachedItem(item: Item): void {
    ItemsService.itemCache.set(item.itemId, {
      value: item,
      expiresAt: Date.now() + ItemsService.ITEM_CACHE_TTL_MS,
    });
  }

  private transformDatabaseItem(row: ItemRow): Item {
    const item: Item = {
      itemId: row.item_id,
      modId: row.mod_id,
      internalName: row.internal_name,
      localizedName: row.localized_name,
      renderAssetRef: row.render_asset_ref,
      preferredImageUrl: row.preferred_image_url,
      unlocalizedName: row.unlocalized_name,
      damage: Number(row.damage ?? 0),
      maxStackSize: 64,
      maxDamage: 0,
      imageFileName: row.image_file_name,
      tooltip: row.tooltip,
      searchTerms: row.search_terms,
      toolClasses: null,
    };
    item.preferredImageUrl = item.preferredImageUrl || this.resolvePreferredStaticImageUrl(item);
    return item;
  }

  async getItems(params: {
    page?: number;
    pageSize?: number;
    search?: string;
    modId?: string;
  }): Promise<PaginatedResponse<Item>> {
    const page = params.page || 1;
    const pageSize = Math.min(params.pageSize || 50, 500);
    const offset = (page - 1) * pageSize;
    const normalizedSearch = (params.search || '').trim().toLowerCase();
    const normalizedModId = (params.modId || '').trim();

    const db = this.getAccelerationDatabase();
    if (this.canUseAccelerationItems(db)) {
      const conditions: string[] = [];
      const bindings: Record<string, unknown> = { limit: pageSize, offset };

      if (normalizedModId && normalizedModId !== 'all') {
        conditions.push('ic.mod_id = @modId');
        bindings.modId = normalizedModId;
      }

      if (normalizedSearch) {
        conditions.push(`
          (
            ic.localized_name LIKE @searchContains
            OR ic.internal_name LIKE @searchContains
            OR ic.item_id LIKE @searchContains
            OR EXISTS (
              SELECT 1
              FROM items_search AS s
              WHERE s.item_id = ic.item_id
              AND (
                s.localized_name_norm LIKE @searchContains
                OR s.internal_name_norm LIKE @searchContains
                OR s.item_id_norm LIKE @searchContains
                OR s.search_terms_norm LIKE @searchContains
                OR s.pinyin_full LIKE @searchContains
                OR s.pinyin_acronym LIKE @searchContains
                OR COALESCE(s.aliases, '') LIKE @searchContains
              )
            )
          )
        `);
        bindings.searchContains = `%${normalizedSearch}%`;
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      const totalRow = db
        .prepare(`SELECT COUNT(*) AS total FROM items_core AS ic ${whereClause}`)
        .get(bindings) as { total: number };

      const rows = db
        .prepare(`
          SELECT
            ic.item_id,
            ic.mod_id,
            ic.internal_name,
            ic.localized_name,
            ic.unlocalized_name,
            ic.damage,
            ic.image_file_name,
            ic.render_asset_ref,
            ic.preferred_image_url,
            ic.tooltip,
            ic.search_terms
          FROM items_core AS ic
          ${whereClause}
          ORDER BY ic.localized_name COLLATE NOCASE ASC
          LIMIT @limit OFFSET @offset
        `)
        .all(bindings) as ItemRow[];

      const data = rows.map((row) => this.transformDatabaseItem(row));
      for (const item of data) {
        this.setCachedItem(item);
      }

      return {
        data,
        total: totalRow.total,
        page,
        pageSize,
        totalPages: Math.max(1, Math.ceil(totalRow.total / pageSize)),
      };
    }

    if (!this.splitExportFallback) {
      throw new Error('Acceleration item tables are unavailable');
    }

    this.ensureSplitItemsAvailable();

    if (!normalizedSearch && (!normalizedModId || normalizedModId === 'all')) {
      const fastPage = this.splitExportService.getItemsPageFast(page, pageSize);
      const total = fastPage.total ?? 0;
      return {
        data: fastPage.items.map((raw) => this.transformSplitItem(raw)),
        total,
        page,
        pageSize,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      };
    }

    let items = this.splitExportService.getAllItems().map((raw) => this.transformSplitItem(raw));

    if (normalizedModId && normalizedModId !== 'all') {
      items = items.filter((item) => item.modId === normalizedModId);
    }

    if (normalizedSearch) {
      items = items.filter((item) =>
        item.localizedName.toLowerCase().includes(normalizedSearch) ||
        item.internalName.toLowerCase().includes(normalizedSearch) ||
        item.itemId.toLowerCase().includes(normalizedSearch),
      );
    }

    const total = items.length;
    const pageItems = items.slice(offset, offset + pageSize);

    return {
      data: pageItems,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  async getItemById(itemId: string): Promise<Item | null> {
    const cached = this.getCachedItem(itemId);
    if (cached) return cached;

    const db = this.getAccelerationDatabase();
    if (this.canUseAccelerationItems(db)) {
      const row = db
        .prepare(`
          SELECT
            item_id,
            mod_id,
            internal_name,
            localized_name,
            unlocalized_name,
            damage,
            image_file_name,
            render_asset_ref,
            preferred_image_url,
            tooltip,
            search_terms
          FROM items_core
          WHERE item_id = ?
        `)
        .get(itemId) as ItemRow | undefined;
      if (row) {
        const item = this.transformDatabaseItem(row);
        this.setCachedItem(item);
        return item;
      }
    }

    if (!this.splitExportFallback) {
      return null;
    }

    this.ensureSplitItemsAvailable();

    const splitItem = this.splitExportService.getItemById(itemId);
    if (!splitItem) {
      return null;
    }

    const item = this.transformSplitItem(splitItem);
    this.setCachedItem(item);
    return item;
  }

  async getItemsByIds(itemIds: string[]): Promise<Item[]> {
    if (!itemIds.length) return [];

    const uniqueIds = Array.from(new Set(itemIds));
    const byId = new Map<string, Item>();
    const missing: string[] = [];

    for (const id of uniqueIds) {
      const cached = this.getCachedItem(id);
      if (cached) {
        byId.set(id, cached);
      } else {
        missing.push(id);
      }
    }

    const db = this.getAccelerationDatabase();
    if (missing.length > 0 && this.canUseAccelerationItems(db)) {
      const placeholders = missing.map(() => '?').join(', ');
      const rows = db
        .prepare(`
          SELECT
            item_id,
            mod_id,
            internal_name,
            localized_name,
            unlocalized_name,
            damage,
            image_file_name,
            render_asset_ref,
            preferred_image_url,
            tooltip,
            search_terms
          FROM items_core
          WHERE item_id IN (${placeholders})
        `)
        .all(...missing) as ItemRow[];
      for (const row of rows) {
        const item = this.transformDatabaseItem(row);
        byId.set(item.itemId, item);
        this.setCachedItem(item);
      }
    }

    const stillMissing = missing.filter((id) => !byId.has(id));
    if (stillMissing.length > 0 && this.splitExportFallback) {
      this.ensureSplitItemsAvailable();
      const splitItems = this.splitExportService.getItemsByIds(stillMissing);
      for (const raw of splitItems) {
        const item = this.transformSplitItem(raw);
        byId.set(item.itemId, item);
        this.setCachedItem(item);
      }
    }

    return itemIds
      .map((id) => byId.get(id))
      .filter((item): item is Item => item !== undefined);
  }

  resolvePreferredStaticImageUrl(item: Pick<Item, 'itemId' | 'imageFileName' | 'renderAssetRef'>): string {
    const cacheKey = `${item.itemId}|${item.imageFileName ?? ''}|${item.renderAssetRef ?? ''}`;
    const cached = ItemsService.imageUrlCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const resolved = this.resolvePreferredStaticImageUrlUncached(item);
    ItemsService.imageUrlCache.set(cacheKey, resolved);
    return resolved;
  }

  private resolvePreferredStaticImageUrlUncached(item: Pick<Item, 'itemId' | 'imageFileName' | 'renderAssetRef'>): string {
    const fromImageFile = this.resolveFromImageFileName(item.imageFileName);
    if (fromImageFile) {
      return fromImageFile;
    }

    const parts = item.itemId.split('~');
    if (parts.length >= 4) {
      const modId = parts[1];
      const internalName = parts[2];
      const damage = parts[3];
      const nbt = parts[4] || null;
      const candidates = [
        nbt ? `${internalName}~${damage}~${nbt}.png` : '',
        `${internalName}~${damage}.png`,
        nbt ? `${internalName}~${damage}~${nbt}.gif` : '',
        `${internalName}~${damage}.gif`,
      ].filter(Boolean);
      for (const candidate of candidates) {
        const relativePath = `${modId}/${candidate}`;
        if (this.imageExists(relativePath)) {
          return `/images/item/${this.encodeRelativePath(relativePath)}`;
        }
      }
    }

    return '/images/item/minecraft/barrier~0.png';
  }

  private resolveFromImageFileName(imageFileName: string | null | undefined): string | null {
    if (!imageFileName) return null;
    const normalized = imageFileName
      .replace(/\\/g, '/')
      .replace(/^\/+/, '')
      .replace(/^images\/item\//, '')
      .replace(/^api\/images\/item\//, '');

    if (!normalized) return null;

    if (/\.gif$/i.test(normalized)) {
      const staticCandidate = normalized.replace(/\.gif$/i, '.png');
      if (this.imageExists(staticCandidate)) {
        return `/images/item/${this.encodeRelativePath(staticCandidate)}`;
      }
    }

    if (this.imageExists(normalized)) {
      return `/images/item/${this.encodeRelativePath(normalized)}`;
    }

    return null;
  }

  private imageExists(relativePath: string): boolean {
    const absolute = path.resolve(IMAGES_PATH, 'item', relativePath);
    const itemRoot = path.resolve(IMAGES_PATH, 'item');
    return absolute.startsWith(itemRoot) && fs.existsSync(absolute);
  }

  private encodeRelativePath(relativePath: string): string {
    return relativePath
      .split('/')
      .filter(Boolean)
      .map((part) => encodeURIComponent(part))
      .join('/');
  }

  async getMods(): Promise<Array<{ modId: string; modName: string; itemCount: number }>> {
    const db = this.getAccelerationDatabase();
    if (this.canUseAccelerationItems(db)) {
      const rows = db
        .prepare(`
          SELECT mod_id, COUNT(*) AS item_count
          FROM items_core
          GROUP BY mod_id
          ORDER BY mod_id COLLATE NOCASE ASC
        `)
        .all() as ModRow[];

      return rows.map((row) => ({
        modId: row.mod_id,
        modName: row.mod_id,
        itemCount: row.item_count,
      }));
    }

    if (!this.splitExportFallback) {
      throw new Error('Acceleration item tables are unavailable');
    }

    this.ensureSplitItemsAvailable();
    return this.splitExportService.getModsFast();
  }

  private transformSplitItem(raw: Record<string, unknown>): Item {
    const item: Item = {
      itemId: String(raw.itemId ?? raw.id ?? ''),
      modId: String(raw.modId ?? raw.mod_id ?? ''),
      internalName: String(raw.internalName ?? raw.internal_name ?? ''),
      localizedName: String(raw.localizedName ?? raw.localized_name ?? ''),
      renderAssetRef: typeof raw.renderAssetRef === 'string' ? raw.renderAssetRef : null,
      preferredImageUrl: null,
      unlocalizedName: String(raw.unlocalizedName ?? raw.unlocalized_name ?? ''),
      damage: Number(raw.damage ?? 0),
      maxStackSize: Number(raw.maxStackSize ?? raw.max_stack_size ?? 64),
      maxDamage: Number(raw.maxDamage ?? raw.max_damage ?? 0),
      imageFileName: typeof raw.imageFileName === 'string' ? raw.imageFileName : null,
      tooltip: typeof raw.tooltip === 'string' ? raw.tooltip : null,
      searchTerms: typeof raw.searchTerms === 'string' ? raw.searchTerms : null,
      toolClasses: typeof raw.toolClasses === 'string' ? raw.toolClasses : null,
    };
    item.preferredImageUrl = this.resolvePreferredStaticImageUrl(item);
    return item;
  }
}
