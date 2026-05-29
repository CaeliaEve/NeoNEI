import type {
  BrowserAtlasIndexResponse,
  BrowserByIdsPackResponse,
  BrowserDefaultCatalogResponse,
  BrowserGroupItemsResponse,
  BrowserPagePackResponse,
  BrowserSearchCatalogResponse,
  BrowserGridEntry,
  PaginatedResponse,
} from './types';
import {
  getDistDataBrowserAtlasIndex,
  getDistDataBrowserPagePack,
  getDistDataBrowserPagePackByIds,
  getDistDataDefaultCatalog,
  getDistDataGroupItems,
  getDistDataSearchCatalog,
} from '../services/distDataRuntime';

export type BrowserPageParams = {
  page?: number;
  pageSize?: number;
  search?: string;
  modId?: string;
  expandedGroups?: string[];
  slotSize?: number;
};

export type BrowserCatalogParams = {
  modId?: string;
};

export type BrowserSearchCatalogParams = {
  search: string;
  modId?: string;
};

export type BrowserByIdsParams = {
  itemIds: string[];
  slotSize?: number;
};

export function createBrowserRuntimeClient() {
  async function getItemsPage(params: Omit<BrowserPageParams, 'slotSize'>): Promise<PaginatedResponse<BrowserGridEntry> | null> {
    const pagePack = await getDistDataBrowserPagePack(params);
    if (!pagePack) {
      return null;
    }
    return {
      data: pagePack.data,
      total: pagePack.total,
      page: pagePack.page,
      pageSize: pagePack.pageSize,
      totalPages: pagePack.totalPages,
    };
  }

  return {
    getItemsPage,
    getPagePack(params: BrowserPageParams): Promise<BrowserPagePackResponse | null> {
      return getDistDataBrowserPagePack(params);
    },
    getDefaultCatalog(modId?: string): Promise<BrowserDefaultCatalogResponse | null> {
      return getDistDataDefaultCatalog(modId);
    },
    getSearchCatalog(search: string, modId?: string): Promise<BrowserSearchCatalogResponse | null> {
      return getDistDataSearchCatalog(search, modId);
    },
    getGroupItems(groupKey: string, modId?: string): Promise<BrowserGroupItemsResponse | null> {
      return getDistDataGroupItems(groupKey, modId);
    },
    getByIdsPack(itemIds: string[]): Promise<BrowserByIdsPackResponse | null> {
      return getDistDataBrowserPagePackByIds(itemIds);
    },
    getAtlasIndex(): Promise<BrowserAtlasIndexResponse | null> {
      return getDistDataBrowserAtlasIndex();
    },
  };
}

export const browserRuntimeClient = createBrowserRuntimeClient();
