import { getNesqlSplitExportService } from './nesql-split-export.service';

export interface ItemBasicInfo {
  itemId: string;
  localizedName: string;
  modId: string;
}

/**
 * Lightweight search service for items using split export only.
 */
export class ItemsSearchService {
  private splitExportService = getNesqlSplitExportService();
  private allItemsCache: ItemBasicInfo[] | null = null;

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

  async searchItems(keyword: string, limit: number = 100): Promise<ItemBasicInfo[]> {
    this.ensureSplitItemsAvailable();

    const trimmed = keyword.trim();
    if (!trimmed) {
      return [];
    }

    const normalized = trimmed.toLowerCase();
    return this.splitExportService
      .getAllItems()
      .map((raw) => ({
        itemId: String(raw.itemId ?? raw.id ?? ''),
        localizedName: String(raw.localizedName ?? raw.localized_name ?? ''),
        modId: String(raw.modId ?? raw.mod_id ?? ''),
        internalName: String(raw.internalName ?? raw.internal_name ?? ''),
      }))
      .filter((item) =>
        item.localizedName.toLowerCase().includes(normalized) ||
        item.internalName.toLowerCase().includes(normalized) ||
        item.itemId.toLowerCase().includes(normalized)
      )
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
