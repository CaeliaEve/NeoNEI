import type { BrowserSearchPackResponse } from '../services/api';
import { getDistDataSearchPack } from '../services/distDataRuntime';

export function createSearchRuntimeClient() {
  return {
    async getSearchPack(): Promise<BrowserSearchPackResponse | null> {
      const distDataSearch = await getDistDataSearchPack();
      return distDataSearch?.pack?.items?.length ? distDataSearch.pack : null;
    },
  };
}

export const searchRuntimeClient = createSearchRuntimeClient();
