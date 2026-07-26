import type Database from 'better-sqlite3';
import { pinyin } from 'pinyin-pro';
import { getAccelerationDatabaseManager } from '../models/database';

export interface ItemBasicInfo {
  itemId: string;
  localizedName: string;
  modId: string;
}

export interface SearchIndexSource extends ItemBasicInfo {
  internalName: string;
  searchTerms: string | null;
}

export interface SearchIndexEntry extends SearchIndexSource {
  normalizedLocalizedName: string;
  normalizedInternalName: string;
  normalizedItemId: string;
  normalizedSearchTerms: string;
  pinyinFull: string;
  pinyinAcronym: string;
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

type AccelerationSearchRow = {
  item_id: string;
  localized_name: string;
  mod_id: string;
};

type AccelerationItemRow = {
  item_id: string;
  localized_name: string;
  mod_id: string;
};

type AccelerationSearchPackRow = {
  item_id: string;
  localized_name: string;
  mod_id: string;
  localized_name_norm: string | null;
  internal_name_norm: string | null;
  item_id_norm: string | null;
  search_terms_norm: string | null;
  pinyin_full: string | null;
  pinyin_acronym: string | null;
  aliases: string | null;
  popularity_score: number | null;
  search_rank: number | null;
};

export interface ItemsSearchServiceOptions {
  databaseProvider?: () => Database.Database | null;
}

export function normalizeSearchKeyword(keyword: string): string {
  return keyword.trim().toLowerCase().replace(/\s+/g, '');
}

export const ACCELERATION_SEARCH_MATCH_SQL = `
  s.localized_name_norm LIKE @searchContains
  OR s.internal_name_norm LIKE @searchContains
  OR s.item_id_norm LIKE @searchContains
  OR s.pinyin_full LIKE @searchPrefix
  OR s.pinyin_acronym LIKE @searchPrefix
  OR s.search_terms_norm LIKE @searchContains
  OR COALESCE(s.aliases, '') LIKE @searchContains
`;

export function accelerationSearchBindings(keyword: string): Record<string, string> {
  const normalized = normalizeSearchKeyword(keyword);
  return {
    searchExact: normalized,
    searchContains: `%${normalized}%`,
    searchPrefix: `${normalized}%`,
  };
}

function normalizeLooseText(value: string | null | undefined): string {
  return `${value ?? ''}`.trim().toLowerCase();
}

function normalizeCompactText(value: string | null | undefined): string {
  return normalizeLooseText(value).replace(/\s+/g, '');
}

function buildPinyinFields(localizedName: string): Pick<SearchIndexEntry, 'pinyinFull' | 'pinyinAcronym'> {
  const syllables = pinyin(localizedName, {
    toneType: 'none',
    type: 'array',
    nonZh: 'consecutive',
    v: false,
  })
    .map((part) => normalizeCompactText(part))
    .filter(Boolean);

  return {
    pinyinFull: syllables.join(''),
    pinyinAcronym: syllables.map((part) => part[0]).join(''),
  };
}

export function buildSearchIndexEntry(source: SearchIndexSource): SearchIndexEntry {
  const pinyinFields = buildPinyinFields(source.localizedName);
  return {
    ...source,
    normalizedLocalizedName: normalizeLooseText(source.localizedName),
    normalizedInternalName: normalizeCompactText(source.internalName),
    normalizedItemId: normalizeCompactText(source.itemId),
    normalizedSearchTerms: normalizeLooseText(source.searchTerms),
    pinyinFull: pinyinFields.pinyinFull,
    pinyinAcronym: pinyinFields.pinyinAcronym,
  };
}

export function matchesIndexedItem(item: SearchIndexEntry, normalizedKeyword: string): boolean {
  if (!normalizedKeyword) return false;

  return (
    item.normalizedLocalizedName.includes(normalizedKeyword) ||
    item.normalizedInternalName.includes(normalizedKeyword) ||
    item.normalizedItemId.includes(normalizedKeyword) ||
    item.normalizedSearchTerms.includes(normalizedKeyword) ||
    item.pinyinFull.startsWith(normalizedKeyword) ||
    item.pinyinAcronym.startsWith(normalizedKeyword)
  );
}

function canUseAccelerationItems(db: Database.Database | null): db is Database.Database {
  if (!db) return false;
  try {
    const itemsCore = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'items_core'")
      .get() as { name?: string } | undefined;
    const itemsSearch = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'items_search'")
      .get() as { name?: string } | undefined;
    return itemsCore?.name === 'items_core' && itemsSearch?.name === 'items_search';
  } catch {
    return false;
  }
}
function canUseAccelerationSearchFts(db: Database.Database | null): db is Database.Database {
  if (!db) return false;
  try {
    const ftsTable = db
      .prepare("SELECT name FROM sqlite_master WHERE name = 'items_search_fts'")
      .get() as { name?: string } | undefined;
    return ftsTable?.name === 'items_search_fts';
  } catch {
    return false;
  }
}

function toFtsPrefixQuery(keyword: string): string | null {
  const tokens = keyword
    .trim()
    .toLowerCase()
    .split(/[^\p{L}\p{N}_]+/u)
    .map((token) => token.trim())
    .filter(Boolean)
    .slice(0, 8);

  if (tokens.length === 0) {
    return null;
  }

  return tokens.map((token) => `"${token.replace(/"/g, '""')}"*`).join(' OR ');
}

export function queryAccelerationSearch(
  db: Database.Database,
  keyword: string,
  limit: number = 100,
  options?: { browserOnly?: boolean },
): ItemBasicInfo[] {
  const normalized = normalizeSearchKeyword(keyword);
  if (!normalized) return [];

  const safeLimit = Math.min(Math.max(Number.isFinite(limit) ? limit : 100, 1), 500);
  const ftsQuery = toFtsPrefixQuery(keyword);
  if (ftsQuery && canUseAccelerationSearchFts(db)) {
    try {
      const ftsStatement = db.prepare(`
        SELECT
          ic.item_id,
          ic.localized_name,
          ic.mod_id,
          bm25(items_search_fts) AS rank
        FROM items_search_fts
        INNER JOIN items_core AS ic
          ON ic.item_id = items_search_fts.item_id
        INNER JOIN items_search AS s
          ON s.item_id = ic.item_id
        LEFT JOIN hot_items AS h
          ON h.item_id = ic.item_id
        WHERE items_search_fts MATCH @ftsQuery
          AND (${ACCELERATION_SEARCH_MATCH_SQL})
        ORDER BY
          rank ASC,
          COALESCE(h.search_rank, 999999) ASC,
          COALESCE(h.recipe_rank, 0) DESC,
          COALESCE(h.popularity_score, 0) DESC,
          ic.localized_name COLLATE NOCASE ASC
        LIMIT @limit
      `);
      const ftsRows = ftsStatement.all({
        ftsQuery,
        limit: safeLimit,
        ...accelerationSearchBindings(keyword),
      }) as AccelerationSearchRow[];

      if (ftsRows.length > 0) {
        return ftsRows.map((row) => ({
          itemId: row.item_id,
          localizedName: row.localized_name,
          modId: row.mod_id,
        }));
      }
    } catch {
      // FTS5 is an acceleration path only. Keep the LIKE acceleration scan authoritative.
    }
  }

  const statement = db.prepare(`
    SELECT
      ic.item_id,
      ic.localized_name,
      ic.mod_id
    FROM items_search AS s
    INNER JOIN items_core AS ic
      ON ic.item_id = s.item_id
    LEFT JOIN hot_items AS h
      ON h.item_id = s.item_id
    WHERE
      ${ACCELERATION_SEARCH_MATCH_SQL}
    ORDER BY
      CASE
        WHEN s.localized_name_norm = @searchExact THEN 0
        WHEN s.pinyin_full = @searchExact THEN 1
        WHEN s.pinyin_acronym = @searchExact THEN 2
        WHEN s.internal_name_norm = @searchExact THEN 4
        WHEN s.item_id_norm = @searchExact THEN 5
        WHEN s.search_terms_norm = @searchExact THEN 6
        WHEN s.localized_name_norm LIKE @searchPrefix THEN 10
        WHEN s.pinyin_full LIKE @searchPrefix THEN 11
        WHEN s.pinyin_acronym LIKE @searchPrefix THEN 12
        WHEN COALESCE(s.aliases, '') LIKE @searchContains THEN 13
        WHEN s.internal_name_norm LIKE @searchPrefix THEN 14
        WHEN s.search_terms_norm LIKE @searchContains THEN 15
        WHEN s.item_id_norm LIKE @searchPrefix THEN 16
        ELSE 20
      END ASC,
      COALESCE(h.search_rank, 999999) ASC,
      COALESCE(h.recipe_rank, 0) DESC,
      (LENGTH(COALESCE(s.localized_name_norm, '')) - LENGTH(@searchExact)) ASC,
      COALESCE(h.popularity_score, COALESCE(s.popularity_score, 0)) DESC,
      COALESCE(s.family_score, 0) DESC,
      ic.localized_name COLLATE NOCASE ASC
    LIMIT @limit
  `);

  return (statement.all({
    ...accelerationSearchBindings(normalized),
    limit: safeLimit,
  }) as AccelerationSearchRow[]).map((row) => ({
    itemId: row.item_id,
    localizedName: row.localized_name,
    modId: row.mod_id,
  }));
}

export class ItemsSearchService {
  private allItemsCache: ItemBasicInfo[] | null = null;
  private browserSearchPackCache: BrowserSearchPackEntry[] | null = null;
  private readonly databaseProvider: () => Database.Database | null;

  constructor(options: ItemsSearchServiceOptions = {}) {
    this.databaseProvider = options.databaseProvider ?? (() => {
      try {
        return getAccelerationDatabaseManager().getDatabase();
      } catch {
        return null;
      }
    });
  }

  private getAccelerationDatabase(): Database.Database | null {
    return this.databaseProvider();
  }

  peekAllItemsCache(): boolean {
    return this.allItemsCache !== null;
  }

  async getAllItemsBasic(): Promise<ItemBasicInfo[]> {
    if (this.allItemsCache) {
      return this.allItemsCache;
    }

    const db = this.getAccelerationDatabase();
    if (canUseAccelerationItems(db)) {
      const rows = db.prepare(`
        SELECT item_id, localized_name, mod_id
        FROM items_core
        ORDER BY localized_name COLLATE NOCASE ASC
      `).all() as AccelerationItemRow[];

      const items = rows.map((row) => ({
        itemId: row.item_id,
        localizedName: row.localized_name,
        modId: row.mod_id,
      }));
      this.allItemsCache = items;
      return items;
    }

    this.allItemsCache = [];
    return this.allItemsCache;
  }

  async getBrowserSearchPack(): Promise<BrowserSearchPackEntry[]> {
    if (this.browserSearchPackCache) {
      return this.browserSearchPackCache;
    }

    const db = this.getAccelerationDatabase();
    if (canUseAccelerationItems(db)) {
      const rows = db.prepare(`
        SELECT
          ic.item_id,
          ic.localized_name,
          ic.mod_id,
          s.localized_name_norm,
          s.internal_name_norm,
          s.item_id_norm,
          s.search_terms_norm,
          s.pinyin_full,
          s.pinyin_acronym,
          s.aliases,
          COALESCE(h.popularity_score, s.popularity_score, 0) AS popularity_score,
          COALESCE(h.search_rank, 999999) AS search_rank
        FROM items_core AS ic
        INNER JOIN items_search AS s
          ON s.item_id = ic.item_id
        LEFT JOIN hot_items AS h
          ON h.item_id = ic.item_id
        ORDER BY
          COALESCE(h.search_rank, 999999) ASC,
          COALESCE(h.popularity_score, s.popularity_score, 0) DESC,
          ic.localized_name COLLATE NOCASE ASC
      `).all() as AccelerationSearchPackRow[];

      this.browserSearchPackCache = rows.map((row) => ({
        itemId: row.item_id,
        localizedName: row.localized_name,
        modId: row.mod_id,
        normalizedLocalizedName: row.localized_name_norm ?? '',
        normalizedInternalName: row.internal_name_norm ?? '',
        normalizedItemId: row.item_id_norm ?? '',
        normalizedSearchTerms: row.search_terms_norm ?? '',
        pinyinFull: row.pinyin_full ?? '',
        pinyinAcronym: row.pinyin_acronym ?? '',
        aliases: row.aliases ?? '',
        popularityScore: Number(row.popularity_score ?? 0),
        searchRank: Number(row.search_rank ?? 999999),
      }));
      return this.browserSearchPackCache;
    }

    this.browserSearchPackCache = [];
    return this.browserSearchPackCache;
  }

  async searchItems(keyword: string, limit: number = 100): Promise<ItemBasicInfo[]> {
    const trimmed = keyword.trim();
    if (!trimmed) {
      return [];
    }

    const db = this.getAccelerationDatabase();
    if (canUseAccelerationItems(db)) {
      const accelerated = queryAccelerationSearch(db, trimmed, limit, {
        browserOnly: false,
      });
      return accelerated;
    }

    return [];
  }

  async getItemsPaginated(page: number = 1, pageSize: number = 50, modId?: string): Promise<{
    items: ItemBasicInfo[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  }> {
    const safePage = Math.max(1, page);
    const safePageSize = Math.min(Math.max(1, pageSize), 500);
    const offset = (safePage - 1) * safePageSize;
    const normalizedModId = typeof modId === 'string' ? modId.trim() : '';

    const db = this.getAccelerationDatabase();
    if (canUseAccelerationItems(db)) {
      const bindings: Record<string, unknown> = {
        limit: safePageSize,
        offset,
      };
      const whereClause =
        normalizedModId
          ? 'WHERE mod_id = @modId'
          : '';
      if (normalizedModId) {
        bindings.modId = normalizedModId;
      }

      const total = (db.prepare(`
        SELECT COUNT(*) AS c
        FROM items_core
        ${whereClause}
      `).get(bindings) as { c: number }).c;

      const rows = db.prepare(`
        SELECT item_id, localized_name, mod_id
        FROM items_core
        ${whereClause}
        ORDER BY localized_name COLLATE NOCASE ASC
        LIMIT @limit OFFSET @offset
      `).all(bindings) as AccelerationItemRow[];

      return {
        items: rows.map((row) => ({
          itemId: row.item_id,
          localizedName: row.localized_name,
          modId: row.mod_id,
        })),
        total,
        page: safePage,
        pageSize: safePageSize,
        totalPages: Math.max(1, Math.ceil(total / safePageSize)),
      };
    }

    return {
      items: [],
      total: 0,
      page: safePage,
      pageSize: safePageSize,
      totalPages: 1,
    };
  }
}

let itemsSearchServiceInstance: ItemsSearchService | null = null;

export function getItemsSearchService(): ItemsSearchService {
  if (!itemsSearchServiceInstance) {
    itemsSearchServiceInstance = new ItemsSearchService();
  }
  return itemsSearchServiceInstance;
}
