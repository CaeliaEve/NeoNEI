import { pinyin } from 'pinyin-pro';
import { getNesqlSplitExportService } from './nesql-split-export.service';

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

export function normalizeSearchKeyword(keyword: string): string {
  return keyword.trim().toLowerCase().replace(/\s+/g, '');
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
    item.pinyinFull.includes(normalizedKeyword) ||
    item.pinyinAcronym.includes(normalizedKeyword)
  );
}

/**
 * Lightweight search service for items using split export only.
 */
export class ItemsSearchService {
  private splitExportService = getNesqlSplitExportService();
  private allItemsCache: ItemBasicInfo[] | null = null;
  private searchIndexCache: SearchIndexEntry[] | null = null;

  private ensureSplitItemsAvailable(): void {
    if (!this.splitExportService.hasSplitItems()) {
      throw new Error('Split item export is unavailable');
    }
  }

  peekAllItemsCache(): boolean {
    return this.allItemsCache !== null;
  }

  async getAllItemsBasic(): Promise<ItemBasicInfo[]> {
    this.ensureSplitItemsAvailable();

    if (this.allItemsCache) {
      return this.allItemsCache;
    }

    const items = this.splitExportService.getAllItems().map((raw) => ({
      itemId: String(raw.itemId ?? raw.id ?? ''),
      localizedName: String(raw.localizedName ?? raw.localized_name ?? ''),
      modId: String(raw.modId ?? raw.mod_id ?? ''),
    }));
    this.allItemsCache = items;
    return items;
  }

  private getSearchIndex(): SearchIndexEntry[] {
    this.ensureSplitItemsAvailable();

    if (this.searchIndexCache) {
      return this.searchIndexCache;
    }

    this.searchIndexCache = this.splitExportService.getAllItems().map((raw) =>
      buildSearchIndexEntry({
        itemId: String(raw.itemId ?? raw.id ?? ''),
        localizedName: String(raw.localizedName ?? raw.localized_name ?? ''),
        modId: String(raw.modId ?? raw.mod_id ?? ''),
        internalName: String(raw.internalName ?? raw.internal_name ?? ''),
        searchTerms: typeof raw.searchTerms === 'string' ? raw.searchTerms : null,
      })
    );
    return this.searchIndexCache;
  }

  async searchItems(keyword: string, limit: number = 100): Promise<ItemBasicInfo[]> {
    this.ensureSplitItemsAvailable();

    const trimmed = keyword.trim();
    if (!trimmed) {
      return [];
    }

    const normalized = normalizeSearchKeyword(trimmed);
    return this.getSearchIndex()
      .filter((item) => matchesIndexedItem(item, normalized))
      .slice(0, Math.min(Math.max(Number.isFinite(limit) ? limit : 100, 1), 500))
      .map(({ itemId, localizedName, modId }) => ({ itemId, localizedName, modId }));
  }

  async getItemsPaginated(page: number = 1, pageSize: number = 50, modId?: string): Promise<{
    items: ItemBasicInfo[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  }> {
    this.ensureSplitItemsAvailable();

    const safePage = Math.max(1, page);
    const safePageSize = Math.min(Math.max(1, pageSize), 500);
    const offset = (safePage - 1) * safePageSize;
    const normalizedModId = typeof modId === 'string' ? modId.trim() : '';

    let items = this.splitExportService.getAllItems().map((raw) => ({
      itemId: String(raw.itemId ?? raw.id ?? ''),
      localizedName: String(raw.localizedName ?? raw.localized_name ?? ''),
      modId: String(raw.modId ?? raw.mod_id ?? ''),
    }));

    if (normalizedModId) {
      items = items.filter((item) => item.modId === normalizedModId);
    }

    const total = items.length;
    const pageItems = items.slice(offset, offset + safePageSize);

    return {
      items: pageItems,
      total,
      page: safePage,
      pageSize: safePageSize,
      totalPages: Math.ceil(total / safePageSize),
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
