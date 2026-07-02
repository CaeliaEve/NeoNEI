import type {
  Item,
  ItemSearchBasic,
  PaginatedResponse,
  Recipe,
  SearchItemsFastOptions,
} from './types';
import { getLabPayload, postLabPayload } from './devCompatClient';
import { setCacheWithLimit } from './cacheUtils';

const BATCH_SIZE = 800;
const ITEM_DETAIL_CACHE_LIMIT = 10000;

export type ItemMachinesResponse = {
  itemId: string;
  itemName: string;
  machines: {
    machineType: string;
    category: string;
    voltageTier: string | null;
    voltage: number | null;
    recipeCount: number;
    recipes: Recipe[];
  }[];
};

export function createItemRuntimeClient() {
  const itemDetailCache = new Map<string, Item>();
  const itemDetailInFlight = new Map<string, Promise<Item>>();

  return {
    clearCaches(): void {
      itemDetailCache.clear();
      itemDetailInFlight.clear();
    },

    getItems(params: {
      page?: number;
      pageSize?: number;
      search?: string;
      modId?: string;
    }): Promise<PaginatedResponse<Item>> {
      return getLabPayload<PaginatedResponse<Item>>('/items', { params });
    },

    getItem(itemId: string): Promise<Item> {
      const cached = itemDetailCache.get(itemId);
      if (cached) {
        return Promise.resolve(cached);
      }
      const existingRequest = itemDetailInFlight.get(itemId);
      if (existingRequest) {
        return existingRequest;
      }
      const request = getLabPayload<Item>(`/items/${itemId}`)
        .then((payload) => {
          setCacheWithLimit(itemDetailCache, itemId, payload, ITEM_DETAIL_CACHE_LIMIT);
          return payload;
        })
        .finally(() => {
          itemDetailInFlight.delete(itemId);
        });
      itemDetailInFlight.set(itemId, request);
      return request;
    },

    async getItemsByIds(itemIds: string[]): Promise<Item[]> {
      const uniqueIds = Array.from(new Set(itemIds));
      const missingIds = uniqueIds.filter((id) => !itemDetailCache.has(id));

      if (missingIds.length > 0) {
        for (let i = 0; i < missingIds.length; i += BATCH_SIZE) {
          const chunk = missingIds.slice(i, i + BATCH_SIZE);
          const payload = await postLabPayload<Item[], { itemIds: string[] }>('/items/batch', { itemIds: chunk });
          for (const item of payload) {
            setCacheWithLimit(itemDetailCache, item.itemId, item, ITEM_DETAIL_CACHE_LIMIT);
          }
        }
      }

      return itemIds
        .map((id) => itemDetailCache.get(id))
        .filter((item): item is Item => item !== undefined);
    },

    getItemMachines(itemId: string): Promise<ItemMachinesResponse> {
      return getLabPayload<ItemMachinesResponse>(`/recipes/${itemId}/machines`);
    },

    searchItemsFast(keyword: string, limit: number = 60, options?: SearchItemsFastOptions): Promise<ItemSearchBasic[]> {
      if (!keyword || !keyword.trim()) {
        return Promise.resolve([]);
      }
      return getLabPayload<ItemSearchBasic[]>('/items/search/fast', {
        params: {
          q: keyword.trim(),
          limit,
        },
        signal: options?.signal,
      });
    },
  };
}

export const itemRuntimeClient = createItemRuntimeClient();
