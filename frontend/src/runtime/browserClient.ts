import type {
  BrowserAtlasIndexResponse,
  BrowserByIdsPackResponse,
  BrowserDefaultCatalogResponse,
  BrowserGroupItemsResponse,
  BrowserPagePackResponse,
  BrowserSearchCatalogResponse,
  NativeRenderIndex,
  BrowserGridEntry,
  PaginatedResponse,
} from './types';
import {
  getDistDataBrowserAtlasIndex,
  getDistDataBrowserPagePack,
  getDistDataBrowserPagePackByIds,
  getDistDataDefaultCatalog,
  getDistDataNativeRenderIndex,
  getDistDataGroupItems,
  getDistDataSearchCatalog,
} from '../services/distDataRuntime';

export type BrowserPageParams = {
  page?: number;
  pageSize?: number;
  search?: string;
  modId?: string;
  expandedGroups?: string[];
  includeHidden?: boolean;
  slotSize?: number;
};

export type BrowserSearchCatalogParams = {
  search: string;
  modId?: string;
  includeHidden?: boolean;
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
    getDefaultCatalog(modId?: string, includeHidden = false): Promise<BrowserDefaultCatalogResponse | null> {
      return getDistDataDefaultCatalog(modId, includeHidden);
    },
    getSearchCatalog(search: string, modId?: string, includeHidden = false): Promise<BrowserSearchCatalogResponse | null> {
      return getDistDataSearchCatalog(search, modId, includeHidden);
    },
    getGroupItems(groupKey: string, modId?: string, includeHidden = false): Promise<BrowserGroupItemsResponse | null> {
      return getDistDataGroupItems(groupKey, modId, includeHidden);
    },
    getByIdsPack(itemIds: string[]): Promise<BrowserByIdsPackResponse | null> {
      return getDistDataBrowserPagePackByIds(itemIds);
    },
    getAtlasIndex(): Promise<BrowserAtlasIndexResponse | null> {
      return getDistDataBrowserAtlasIndex();
    },
    getNativeRenderIndex(): Promise<NativeRenderIndex | null> {
      return getDistDataNativeRenderIndex();
    },
  };
}

export const browserRuntimeClient = createBrowserRuntimeClient();
