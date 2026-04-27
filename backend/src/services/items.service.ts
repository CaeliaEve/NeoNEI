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
  renderHint?: {
    renderMode: string | null;
    animationMode: string | null;
    playbackHint: string | null;
    frameCount: number | null;
    explicitStatic: boolean;
    prefersNativeSprite: boolean;
    prefersCapturedAtlas: boolean;
    hasAnimation: boolean;
  } | null;
  preferredImageUrl?: string | null;
  unlocalizedName: string;
  damage: number;
  maxStackSize: number;
  maxDamage: number;
  imageFileName: string | null;
  tooltip: string | null;
  searchTerms: string | null;
  toolClasses: string | null;
  browserGroupKey?: string | null;
  browserGroupLabel?: string | null;
  browserGroupSize?: number | null;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface BrowserGroupSummary {
  key: string;
  representative: Item;
  size: number;
  visibleCount: number;
  expandable: boolean;
  label: string;
}

export type BrowserPageEntry =
  | { key: string; kind: 'item'; item: Item }
  | { key: string; kind: 'group-collapsed' | 'group-header'; group: BrowserGroupSummary };

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
  browser_group_key: string | null;
  browser_group_label: string | null;
  browser_group_size: number | null;
};

type BrowserCatalogRow = ItemRow & {
  browser_group_sort_order: number | null;
};

type ModRow = {
  mod_id: string;
  mod_name?: string;
  item_count: number;
};

type BrowserDefaultEntryRow = ItemRow & {
  entry_order: number;
  entry_kind: 'item' | 'group-collapsed';
  browser_group_sort_order: number | null;
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
  private static browserCatalogCache = new Map<
    string,
    { value: BrowserCatalogRow[]; expiresAt: number }
  >();
  private static imageUrlCache = new Map<string, string>();
  private static modsCache: { value: Array<{ modId: string; modName: string; itemCount: number }>; expiresAt: number } | null = null;
  private static readonly ITEM_CACHE_TTL_MS = 60 * 1000;
  private static readonly BROWSER_CATALOG_CACHE_TTL_MS = 60 * 1000;
  private static readonly MODS_CACHE_TTL_MS = 5 * 60 * 1000;

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

  private canUseModsSummary(db: Database.Database | null): boolean {
    if (!db) return false;
    try {
      const row = db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'mods_summary'")
        .get() as { name?: string } | undefined;
      return row?.name === 'mods_summary';
    } catch {
      return false;
    }
  }

  private canUseBrowserDefaultEntries(db: Database.Database | null): boolean {
    if (!db) return false;
    try {
      const row = db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'browser_default_entries'")
        .get() as { name?: string } | undefined;
      return row?.name === 'browser_default_entries';
    } catch {
      return false;
    }
  }

  private getCachedMods(): Array<{ modId: string; modName: string; itemCount: number }> | null {
    const hit = ItemsService.modsCache;
    if (!hit) return null;
    if (Date.now() > hit.expiresAt) {
      ItemsService.modsCache = null;
      return null;
    }
    return hit.value;
  }

  private setCachedMods(mods: Array<{ modId: string; modName: string; itemCount: number }>): void {
    ItemsService.modsCache = {
      value: mods,
      expiresAt: Date.now() + ItemsService.MODS_CACHE_TTL_MS,
    };
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

  private getBrowserCatalogCacheKey(params: {
    search?: string;
    modId?: string;
  }): string {
    return JSON.stringify({
      search: `${params.search ?? ''}`.trim().toLowerCase(),
      modId: `${params.modId ?? ''}`.trim().toLowerCase(),
    });
  }

  private getCachedBrowserCatalog(cacheKey: string): BrowserCatalogRow[] | null {
    const hit = ItemsService.browserCatalogCache.get(cacheKey);
    if (!hit) return null;
    if (Date.now() > hit.expiresAt) {
      ItemsService.browserCatalogCache.delete(cacheKey);
      return null;
    }
    return hit.value;
  }

  private setCachedBrowserCatalog(cacheKey: string, rows: BrowserCatalogRow[]): void {
    ItemsService.browserCatalogCache.set(cacheKey, {
      value: rows,
      expiresAt: Date.now() + ItemsService.BROWSER_CATALOG_CACHE_TTL_MS,
    });
  }

  private ensureModsSummaryMaterialized(db: Database.Database): void {
    if (!this.canUseModsSummary(db) || !this.canUseAccelerationItems(db)) {
      return;
    }

    const countRow = db.prepare('SELECT COUNT(*) AS c FROM mods_summary').get() as { c?: number } | undefined;
    if (Number(countRow?.c ?? 0) > 0) {
      return;
    }

    const writeTransaction = db.transaction(() => {
      db.exec('DELETE FROM mods_summary');
      db.prepare(`
        INSERT INTO mods_summary (mod_id, mod_name, item_count, updated_at)
        SELECT
          mod_id,
          mod_id AS mod_name,
          COUNT(*) AS item_count,
          CURRENT_TIMESTAMP
        FROM items_core
        GROUP BY mod_id
        ORDER BY mod_id COLLATE NOCASE ASC
      `).run();
    });

    writeTransaction();
  }

  private ensureBrowserDefaultEntriesMaterialized(db: Database.Database): void {
    if (!this.canUseBrowserDefaultEntries(db) || !this.canUseAccelerationItems(db)) {
      return;
    }

    const countRow = db
      .prepare('SELECT COUNT(*) AS c FROM browser_default_entries')
      .get() as { c?: number } | undefined;
    if (Number(countRow?.c ?? 0) > 0) {
      return;
    }

    const rows = db.prepare(`
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
        ic.search_terms,
        bg.group_key AS browser_group_key,
        bg.group_label AS browser_group_label,
        bg.group_size AS browser_group_size,
        bg.group_sort_order AS browser_group_sort_order
      FROM items_core AS ic
      LEFT JOIN item_browser_groups AS bg
        ON bg.item_id = ic.item_id
      ORDER BY
        COALESCE(bg.group_sort_order, 2147483647) ASC,
        ic.damage ASC,
        ic.localized_name COLLATE NOCASE ASC,
        ic.item_id COLLATE NOCASE ASC
    `).all() as BrowserCatalogRow[];

    const writeTransaction = db.transaction((catalog: BrowserCatalogRow[]) => {
      db.exec('DELETE FROM browser_default_entries');
      const insertEntry = db.prepare(`
        INSERT INTO browser_default_entries (
          entry_order,
          entry_kind,
          item_id,
          mod_id,
          group_key,
          group_label,
          group_size,
          updated_at
        ) VALUES (
          @entry_order,
          @entry_kind,
          @item_id,
          @mod_id,
          @group_key,
          @group_label,
          @group_size,
          CURRENT_TIMESTAMP
        )
      `);

      const seenGroups = new Set<string>();
      let entryOrder = 0;
      for (const row of catalog) {
        const groupKey = `${row.browser_group_key ?? ''}`.trim();
        const groupSize = Math.max(1, Number(row.browser_group_size ?? 1));
        if (!groupKey || groupSize <= 1) {
          insertEntry.run({
            entry_order: entryOrder,
            entry_kind: 'item',
            item_id: row.item_id,
            mod_id: row.mod_id,
            group_key: null,
            group_label: null,
            group_size: 1,
          });
          entryOrder += 1;
          continue;
        }

        if (seenGroups.has(groupKey)) {
          continue;
        }
        seenGroups.add(groupKey);
        insertEntry.run({
          entry_order: entryOrder,
          entry_kind: 'group-collapsed',
          item_id: row.item_id,
          mod_id: row.mod_id,
          group_key: groupKey,
          group_label: `${row.browser_group_label ?? ''}`.trim() || row.localized_name,
          group_size: groupSize,
        });
        entryOrder += 1;
      }
    });

    writeTransaction(rows);
  }

  private transformDatabaseItem(
    row: ItemRow,
    options?: { trustPreferredImageUrl?: boolean },
  ): Item {
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
      browserGroupKey: row.browser_group_key,
      browserGroupLabel: row.browser_group_label,
      browserGroupSize: row.browser_group_size != null ? Number(row.browser_group_size) : null,
    };
    item.preferredImageUrl = options?.trustPreferredImageUrl
      ? (item.preferredImageUrl || this.resolvePreferredStaticImageUrl(item))
      : this.resolveUsablePreferredImageUrl(item.preferredImageUrl, item);
    return item;
  }

  private getBrowserCatalog(params: {
    search?: string;
    modId?: string;
  }): BrowserCatalogRow[] {
    const db = this.getAccelerationDatabase();
    if (!this.canUseAccelerationItems(db)) {
      throw new Error('Acceleration item tables are unavailable');
    }

    const normalizedSearch = `${params.search ?? ''}`.trim().toLowerCase();
    const normalizedModId = `${params.modId ?? ''}`.trim();
    const cacheKey = this.getBrowserCatalogCacheKey({
      search: normalizedSearch,
      modId: normalizedModId,
    });
    const cached = this.getCachedBrowserCatalog(cacheKey);
    if (cached) {
      return cached;
    }

    const conditions: string[] = [];
    const bindings: Record<string, unknown> = {};

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
          ic.search_terms,
          bg.group_key AS browser_group_key,
          bg.group_label AS browser_group_label,
          bg.group_size AS browser_group_size,
          bg.group_sort_order AS browser_group_sort_order
        FROM items_core AS ic
        LEFT JOIN item_browser_groups AS bg
          ON bg.item_id = ic.item_id
        ${whereClause}
        ORDER BY
          COALESCE(bg.group_sort_order, 2147483647) ASC,
          ic.damage ASC,
          ic.localized_name COLLATE NOCASE ASC,
          ic.item_id COLLATE NOCASE ASC
      `)
      .all(bindings) as BrowserCatalogRow[];

    this.setCachedBrowserCatalog(cacheKey, rows);
    return rows;
  }

  private resolveForcedExpandedGroupKey(catalog: BrowserCatalogRow[]): string | null {
    let groupKey: string | null = null;

    for (const row of catalog) {
      const candidateKey = `${row.browser_group_key ?? ''}`.trim();
      const candidateSize = Number(row.browser_group_size ?? 0);
      if (!candidateKey || candidateSize <= 1) {
        return null;
      }
      if (!groupKey) {
        groupKey = candidateKey;
        continue;
      }
      if (groupKey !== candidateKey) {
        return null;
      }
    }

    return groupKey;
  }

  private buildBrowserGroupSummary(
    row: BrowserCatalogRow,
    representative: Item,
    expanded: boolean,
  ): BrowserGroupSummary {
    const size = Math.max(1, Number(row.browser_group_size ?? 1));
    const label = `${row.browser_group_label ?? ''}`.trim() || representative.localizedName;

    return {
      key: `${row.browser_group_key ?? ''}`.trim(),
      representative,
      size,
      visibleCount: expanded ? size : 1,
      expandable: size > 1,
      label,
    };
  }

  private getBrowserDefaultEntriesPage(params: {
    page: number;
    pageSize: number;
    modId?: string;
  }): PaginatedResponse<BrowserPageEntry> | null {
    const db = this.getAccelerationDatabase();
    if (!this.canUseBrowserDefaultEntries(db) || !this.canUseAccelerationItems(db)) {
      return null;
    }

    this.ensureBrowserDefaultEntriesMaterialized(db);

    const page = Math.max(1, params.page);
    const pageSize = Math.min(Math.max(1, params.pageSize), 500);
    const normalizedModId = `${params.modId ?? ''}`.trim();
    const bindings: Record<string, unknown> = {};
    const whereClause =
      normalizedModId && normalizedModId !== 'all'
        ? 'WHERE e.mod_id = @modId'
        : '';

    if (whereClause) {
      bindings.modId = normalizedModId;
    }

    const totalRow = db.prepare(`
      SELECT COUNT(*) AS total
      FROM browser_default_entries AS e
      ${whereClause}
    `).get(bindings) as { total?: number } | undefined;

    const total = Math.max(0, Number(totalRow?.total ?? 0));
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const normalizedPage = Math.min(page, totalPages);
    const offset = Math.max(0, (normalizedPage - 1) * pageSize);

    const rows = db.prepare(`
      SELECT
        e.entry_order,
        e.entry_kind,
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
        ic.search_terms,
        e.group_key AS browser_group_key,
        e.group_label AS browser_group_label,
        e.group_size AS browser_group_size,
        NULL AS browser_group_sort_order
      FROM browser_default_entries AS e
      INNER JOIN items_core AS ic
        ON ic.item_id = e.item_id
      ${whereClause}
      ORDER BY e.entry_order ASC
      LIMIT @limit OFFSET @offset
    `).all({
      ...bindings,
      limit: pageSize,
      offset,
    }) as BrowserDefaultEntryRow[];

    const entries = this.mapBrowserDefaultEntryRows(rows);

    return {
      data: entries,
      total,
      page: normalizedPage,
      pageSize,
      totalPages,
    };
  }

  private mapBrowserDefaultEntryRows(rows: BrowserDefaultEntryRow[]): BrowserPageEntry[] {
    return rows.map((row) => {
      const item = this.transformDatabaseItem(row, { trustPreferredImageUrl: true });
      if (row.entry_kind === 'item') {
        this.setCachedItem(item);
        return {
          key: item.itemId,
          kind: 'item',
          item,
        } satisfies BrowserPageEntry;
      }

      const size = Math.max(1, Number(row.browser_group_size ?? 1));
      const label = `${row.browser_group_label ?? ''}`.trim() || item.localizedName;
      this.setCachedItem(item);
      return {
        key: `collapsed:${row.browser_group_key ?? item.itemId}`,
        kind: 'group-collapsed',
        group: {
          key: `${row.browser_group_key ?? ''}`.trim(),
          representative: item,
          size,
          visibleCount: 1,
          expandable: size > 1,
          label,
        },
      } satisfies BrowserPageEntry;
    });
  }

  private buildBrowserDefaultEntriesFromCatalog(catalog: BrowserCatalogRow[]): BrowserPageEntry[] {
    const entries: BrowserPageEntry[] = [];
    const seenGroups = new Set<string>();

    for (const row of catalog) {
      const groupKey = `${row.browser_group_key ?? ''}`.trim();
      const groupSize = Math.max(1, Number(row.browser_group_size ?? 1));
      const item = this.transformDatabaseItem(row, { trustPreferredImageUrl: true });

      if (!groupKey || groupSize <= 1) {
        this.setCachedItem(item);
        entries.push({
          key: item.itemId,
          kind: 'item',
          item,
        });
        continue;
      }

      if (seenGroups.has(groupKey)) {
        continue;
      }

      seenGroups.add(groupKey);
      this.setCachedItem(item);
      entries.push({
        key: `collapsed:${groupKey}`,
        kind: 'group-collapsed',
        group: {
          key: groupKey,
          representative: item,
          size: groupSize,
          visibleCount: 1,
          expandable: groupSize > 1,
          label: `${row.browser_group_label ?? ''}`.trim() || item.localizedName,
        },
      });
    }

    return entries;
  }

  async getBrowserItemsWindow(params: {
    offset: number;
    limit: number;
    modId?: string;
  }): Promise<{
    data: BrowserPageEntry[];
    total: number;
    offset: number;
    limit: number;
  }> {
    const db = this.getAccelerationDatabase();
    const normalizedOffset = Math.max(0, Math.floor(params.offset));
    const normalizedLimit = Math.min(Math.max(1, Math.floor(params.limit)), 5000);
    const normalizedModId = `${params.modId ?? ''}`.trim();

    if (this.canUseBrowserDefaultEntries(db) && this.canUseAccelerationItems(db)) {
      this.ensureBrowserDefaultEntriesMaterialized(db);
      const bindings: Record<string, unknown> = {};
      const whereClause =
        normalizedModId && normalizedModId !== 'all'
          ? 'WHERE e.mod_id = @modId'
          : '';

      if (whereClause) {
        bindings.modId = normalizedModId;
      }

      const totalRow = db.prepare(`
        SELECT COUNT(*) AS total
        FROM browser_default_entries AS e
        ${whereClause}
      `).get(bindings) as { total?: number } | undefined;

      const total = Math.max(0, Number(totalRow?.total ?? 0));
      const rows = db.prepare(`
        SELECT
          e.entry_order,
          e.entry_kind,
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
          ic.search_terms,
          e.group_key AS browser_group_key,
          e.group_label AS browser_group_label,
          e.group_size AS browser_group_size,
          NULL AS browser_group_sort_order
        FROM browser_default_entries AS e
        INNER JOIN items_core AS ic
          ON ic.item_id = e.item_id
        ${whereClause}
        ORDER BY e.entry_order ASC
        LIMIT @limit OFFSET @offset
      `).all({
        ...bindings,
        limit: normalizedLimit,
        offset: normalizedOffset,
      }) as BrowserDefaultEntryRow[];

      const data = this.mapBrowserDefaultEntryRows(rows);

      return {
        data,
        total,
        offset: normalizedOffset,
        limit: normalizedLimit,
      };
    }

    const catalog = this.getBrowserCatalog({ modId: normalizedModId || undefined });
    const defaultEntries = this.buildBrowserDefaultEntriesFromCatalog(catalog);
    const total = defaultEntries.length;
    const data = defaultEntries.slice(normalizedOffset, normalizedOffset + normalizedLimit);

    return {
      data,
      total,
      offset: normalizedOffset,
      limit: normalizedLimit,
    };
  }

  async getBrowserDisplayItemsForPage(params: {
    page: number;
    pageSize: number;
    modId?: string;
  }): Promise<Item[]> {
    const fastPage = this.getBrowserDefaultEntriesPage(params);
    if (fastPage) {
      return fastPage.data.map((entry) => (entry.kind === 'item' ? entry.item : entry.group.representative));
    }

    const fallback = await this.getBrowserItems({
      page: params.page,
      pageSize: params.pageSize,
      modId: params.modId,
      expandedGroups: [],
    });
    return fallback.data.map((entry) => (entry.kind === 'item' ? entry.item : entry.group.representative));
  }

  private projectBrowserEntries(
    catalog: BrowserCatalogRow[],
    expandedGroupKeys: Set<string>,
    page: number,
    pageSize: number,
  ): PaginatedResponse<BrowserPageEntry> {
    const forceExpandedGroupKey = this.resolveForcedExpandedGroupKey(catalog);
    const effectiveExpandedGroups = new Set(expandedGroupKeys);
    if (forceExpandedGroupKey) {
      effectiveExpandedGroups.add(forceExpandedGroupKey);
    }

    const offset = Math.max(0, (page - 1) * pageSize);
    const limit = offset + pageSize;
    const entries: BrowserPageEntry[] = [];
    const seenGroups = new Set<string>();
    let total = 0;

    const pushEntry = (entry: BrowserPageEntry) => {
      if (total >= offset && total < limit) {
        entries.push(entry);
      }
      total += 1;
    };

    for (const row of catalog) {
      const groupKey = `${row.browser_group_key ?? ''}`.trim();
      const groupSize = Math.max(1, Number(row.browser_group_size ?? 1));
      const item = this.transformDatabaseItem(row, { trustPreferredImageUrl: true });

      if (!groupKey || groupSize <= 1) {
        pushEntry({
          key: item.itemId,
          kind: 'item',
          item,
        });
        continue;
      }

      const expanded = effectiveExpandedGroups.has(groupKey);
      if (!seenGroups.has(groupKey)) {
        seenGroups.add(groupKey);
        const group = this.buildBrowserGroupSummary(row, item, expanded);
        pushEntry({
          key: `${expanded ? 'header' : 'collapsed'}:${group.key}`,
          kind: expanded ? 'group-header' : 'group-collapsed',
          group,
        });
        continue;
      }

      if (expanded) {
        pushEntry({
          key: item.itemId,
          kind: 'item',
          item,
        });
      }
    }

    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const normalizedPage = Math.min(Math.max(page, 1), totalPages);
    if (normalizedPage !== page) {
      return this.projectBrowserEntries(catalog, expandedGroupKeys, normalizedPage, pageSize);
    }

    return {
      data: entries,
      total,
      page: normalizedPage,
      pageSize,
      totalPages,
    };
  }

  private resolveUsablePreferredImageUrl(
    preferredImageUrl: string | null | undefined,
    item: Pick<Item, 'itemId' | 'imageFileName' | 'renderAssetRef'>,
  ): string {
    const normalizedPreferred = `${preferredImageUrl ?? ''}`.trim();
    if (normalizedPreferred) {
      const resolvedRelativePath = this.extractItemRelativePath(normalizedPreferred);
      if (!resolvedRelativePath || this.imageExists(resolvedRelativePath)) {
        return normalizedPreferred;
      }
    }

    return this.resolvePreferredStaticImageUrl(item);
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
            ic.search_terms,
            bg.group_key AS browser_group_key,
            bg.group_label AS browser_group_label,
            bg.group_size AS browser_group_size
          FROM items_core AS ic
          LEFT JOIN item_browser_groups AS bg
            ON bg.item_id = ic.item_id
          ${whereClause}
          ORDER BY
            COALESCE(bg.group_sort_order, 2147483647) ASC,
            ic.localized_name COLLATE NOCASE ASC,
            ic.item_id COLLATE NOCASE ASC
          LIMIT @limit OFFSET @offset
        `)
        .all(bindings) as ItemRow[];

      const data = rows.map((row) => this.transformDatabaseItem(row, { trustPreferredImageUrl: true }));
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

  async getBrowserItems(params: {
    page?: number;
    pageSize?: number;
    search?: string;
    modId?: string;
    expandedGroups?: string[];
  }): Promise<PaginatedResponse<BrowserPageEntry>> {
    const page = Math.max(1, params.page || 1);
    const pageSize = Math.min(params.pageSize || 50, 500);
    const normalizedSearch = `${params.search ?? ''}`.trim();
    const expandedGroups = new Set(
      (params.expandedGroups ?? [])
        .map((entry) => `${entry ?? ''}`.trim())
        .filter(Boolean),
    );

    if (!normalizedSearch && expandedGroups.size === 0) {
      const fastPage = this.getBrowserDefaultEntriesPage({
        page,
        pageSize,
        modId: params.modId,
      });
      if (fastPage) {
        return fastPage;
      }
    }

    const catalog = this.getBrowserCatalog({
      search: params.search,
      modId: params.modId,
    });

    const response = this.projectBrowserEntries(catalog, expandedGroups, page, pageSize);

    for (const entry of response.data) {
      if (entry.kind === 'item') {
        this.setCachedItem(entry.item);
        continue;
      }
      this.setCachedItem(entry.group.representative);
    }

    return response;
  }

  async getItemById(itemId: string): Promise<Item | null> {
    const cached = this.getCachedItem(itemId);
    if (cached) return cached;

    const db = this.getAccelerationDatabase();
    if (this.canUseAccelerationItems(db)) {
      const row = db
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
            ic.search_terms,
            bg.group_key AS browser_group_key,
            bg.group_label AS browser_group_label,
            bg.group_size AS browser_group_size
          FROM items_core AS ic
          LEFT JOIN item_browser_groups AS bg
            ON bg.item_id = ic.item_id
          WHERE ic.item_id = ?
        `)
        .get(itemId) as ItemRow | undefined;
      if (row) {
        const item = this.transformDatabaseItem(row, { trustPreferredImageUrl: true });
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
            ic.search_terms,
            bg.group_key AS browser_group_key,
            bg.group_label AS browser_group_label,
            bg.group_size AS browser_group_size
          FROM items_core AS ic
          LEFT JOIN item_browser_groups AS bg
            ON bg.item_id = ic.item_id
          WHERE ic.item_id IN (${placeholders})
        `)
        .all(...missing) as ItemRow[];
      for (const row of rows) {
        const item = this.transformDatabaseItem(row, { trustPreferredImageUrl: true });
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
      const stems = [
        nbt ? `${internalName}~${damage}~${nbt}` : '',
        `${internalName}~${damage}`,
      ].filter(Boolean);

      for (const stem of stems) {
        const relativePath = this.resolveDirectAssetRelativePath(modId, stem);
        if (relativePath) {
          return `/images/item/${this.encodeRelativePath(relativePath)}`;
        }
      }

      for (const stem of stems) {
        const siblingVariant = this.resolveSiblingVariantImagePath(modId, stem);
        if (siblingVariant) {
          return `/images/item/${this.encodeRelativePath(siblingVariant)}`;
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

    const directSpriteAtlas = this.resolveDirectSpriteAtlasFromNormalizedPath(normalized);
    if (directSpriteAtlas) {
      return `/images/item/${this.encodeRelativePath(directSpriteAtlas)}`;
    }

    const siblingVariant = this.resolveSiblingVariantFromNormalizedPath(normalized);
    if (siblingVariant) {
      return `/images/item/${this.encodeRelativePath(siblingVariant)}`;
    }

    return null;
  }

  private resolveSiblingVariantFromNormalizedPath(normalizedPath: string): string | null {
    const normalized = normalizedPath.replace(/\\/g, '/').replace(/^\/+/, '');
    const slash = normalized.lastIndexOf('/');
    if (slash <= 0) return null;

    const modId = normalized.slice(0, slash);
    const fileName = normalized.slice(slash + 1);
    const stem = fileName.replace(/\.(png|gif)$/i, '');
    return this.resolveSiblingVariantImagePath(modId, stem);
  }

  private resolveDirectSpriteAtlasFromNormalizedPath(normalizedPath: string): string | null {
    const normalized = normalizedPath.replace(/\\/g, '/').replace(/^\/+/, '');
    if (/\.sprite-atlas\.png$/i.test(normalized)) {
      return this.imageExists(normalized) ? normalized : null;
    }

    const match = normalized.match(/^(.*)\.(png|gif)$/i);
    if (!match) {
      return null;
    }

    const spriteAtlasPath = `${match[1]}.sprite-atlas.png`;
    return this.imageExists(spriteAtlasPath) ? spriteAtlasPath : null;
  }

  private resolveDirectAssetRelativePath(modId: string, stem: string): string | null {
    const candidates = [`${stem}.png`, `${stem}.gif`, `${stem}.sprite-atlas.png`];
    for (const candidate of candidates) {
      const relativePath = `${modId}/${candidate}`;
      if (this.imageExists(relativePath)) {
        return relativePath;
      }
    }
    return null;
  }

  private resolveSiblingVariantImagePath(modId: string, stem: string): string | null {
    const directory = path.resolve(IMAGES_PATH, 'item', modId);
    const itemRoot = path.resolve(IMAGES_PATH, 'item');
    if (!directory.startsWith(itemRoot) || !fs.existsSync(directory) || !fs.statSync(directory).isDirectory()) {
      return null;
    }

    const escapedStem = stem.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const variantPattern = new RegExp(`^${escapedStem}~.+(?:\\.png|\\.gif|\\.sprite-atlas\\.png)$`, 'i');
    const siblings = fs.readdirSync(directory).filter((name) => variantPattern.test(name));
    if (siblings.length === 0) {
      return null;
    }

    siblings.sort((left, right) => left.localeCompare(right));
    const preferred =
      siblings.find((name) => !name.toLowerCase().includes('.sprite-atlas.') && name.toLowerCase().endsWith('.png'))
      ?? siblings.find((name) => name.toLowerCase().endsWith('.gif'))
      ?? siblings.find((name) => name.toLowerCase().endsWith('.sprite-atlas.png'))
      ?? siblings[0];
    return `${modId}/${preferred}`.replace(/\\/g, '/');
  }

  private imageExists(relativePath: string): boolean {
    const absolute = path.resolve(IMAGES_PATH, 'item', relativePath);
    const itemRoot = path.resolve(IMAGES_PATH, 'item');
    return absolute.startsWith(itemRoot) && fs.existsSync(absolute);
  }

  private extractItemRelativePath(preferredImageUrl: string): string | null {
    if (!preferredImageUrl.includes('/images/item/')) {
      return null;
    }

    const marker = '/images/item/';
    const markerIndex = preferredImageUrl.indexOf(marker);
    if (markerIndex < 0) {
      return null;
    }

    return preferredImageUrl
      .slice(markerIndex + marker.length)
      .split('/')
      .filter(Boolean)
      .map((part) => decodeURIComponent(part))
      .join('/');
  }

  private encodeRelativePath(relativePath: string): string {
    return relativePath
      .split('/')
      .filter(Boolean)
      .map((part) => encodeURIComponent(part))
      .join('/');
  }

  async getMods(): Promise<Array<{ modId: string; modName: string; itemCount: number }>> {
    const cached = this.getCachedMods();
    if (cached) {
      return cached;
    }

    const db = this.getAccelerationDatabase();
    if (this.canUseAccelerationItems(db)) {
      const accelDb = db;
      this.ensureModsSummaryMaterialized(accelDb);

      if (this.canUseModsSummary(accelDb)) {
        const rows = accelDb
          .prepare(`
            SELECT mod_id, mod_name, item_count
            FROM mods_summary
            ORDER BY mod_id COLLATE NOCASE ASC
          `)
          .all() as ModRow[];

        const mods = rows.map((row) => ({
          modId: row.mod_id,
          modName: row.mod_name ?? row.mod_id,
          itemCount: row.item_count,
        }));
        this.setCachedMods(mods);
        return mods;
      }

      const rows = accelDb
        .prepare(`
          SELECT mod_id, COUNT(*) AS item_count
          FROM items_core
          GROUP BY mod_id
          ORDER BY mod_id COLLATE NOCASE ASC
        `)
        .all() as ModRow[];

      const mods = rows.map((row) => ({
        modId: row.mod_id,
        modName: row.mod_id,
        itemCount: row.item_count,
      }));
      this.setCachedMods(mods);
      return mods;
    }

    if (!this.splitExportFallback) {
      throw new Error('Acceleration item tables are unavailable');
    }

    this.ensureSplitItemsAvailable();
    const mods = this.splitExportService.getModsFast();
    this.setCachedMods(mods);
    return mods;
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
      browserGroupKey: typeof raw.browserGroupKey === 'string' ? raw.browserGroupKey : null,
      browserGroupLabel: typeof raw.browserGroupLabel === 'string' ? raw.browserGroupLabel : null,
      browserGroupSize:
        raw.browserGroupSize != null && Number.isFinite(Number(raw.browserGroupSize))
          ? Number(raw.browserGroupSize)
          : null,
    };
    item.preferredImageUrl = this.resolvePreferredStaticImageUrl(item);
    return item;
  }
}
