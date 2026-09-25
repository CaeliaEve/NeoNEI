import { ref, type Ref } from 'vue';
import { api, type ItemSearchBasic } from '../../services/api';
import { reportRecipeSearchHydrationOmitted } from './recipeHydrationPolicyCatalog';

type RecipeTab = 'usedIn' | 'producedBy';

type PendingSearchLatency = {
  requestSeq: number;
  query: string;
  startedAt: number;
};

export type RecipeSearchController = {
  searchMatchedItemIds: Ref<Set<string>>;
  searchMatchedRecipeIds: Ref<Set<string> | null>;
  fastSearchResults: Ref<ItemSearchBasic[]>;
  searchingRecipes: Ref<boolean>;
  clear: () => void;
  reset: () => void;
  schedule: (query: string) => void;
  dispose: () => void;
};

export function createRecipeSearchController(options: {
  itemIdRef: Ref<string | undefined>;
  currentTab: Ref<RecipeTab>;
  recipeSearchQuery: Ref<string>;
  getNow: () => number;
  waitForPaint: () => Promise<void>;
  getFilteredRecipeCount: () => number;
  getLoadedRecipeIds: (tab: RecipeTab) => Set<string>;
  isDisposed: () => boolean;
  logSearchLatency: (query: string, resultCount: number, durationMs: number) => void;
  debounceMs?: number;
}): RecipeSearchController {
  const searchMatchedItemIds = ref<Set<string>>(new Set<string>());
  const searchMatchedRecipeIds = ref<Set<string> | null>(null);
  const fastSearchResults = ref<ItemSearchBasic[]>([]);
  const searchingRecipes = ref(false);
  const pendingSearchLatency = ref<PendingSearchLatency | null>(null);

  let searchRequestSeq = 0;
  let searchDebounce: ReturnType<typeof setTimeout> | null = null;
  let searchAbortController: AbortController | null = null;

  const cancelPendingTransport = () => {
    if (searchDebounce) {
      clearTimeout(searchDebounce);
      searchDebounce = null;
    }
    if (searchAbortController) {
      searchAbortController.abort();
      searchAbortController = null;
    }
  };

  const resetState = () => {
    pendingSearchLatency.value = null;
    searchMatchedItemIds.value = new Set<string>();
    searchMatchedRecipeIds.value = null;
    fastSearchResults.value = [];
    searchingRecipes.value = false;
  };

  const invalidate = () => {
    searchRequestSeq += 1;
    cancelPendingTransport();
  };

  const flushSearchLatency = async (requestSeq: number) => {
    const pending = pendingSearchLatency.value;
    if (!pending || pending.requestSeq !== requestSeq) return;
    await options.waitForPaint();
    const durationMs = options.getNow() - pending.startedAt;
    options.logSearchLatency(pending.query, options.getFilteredRecipeCount(), durationMs);
    if (pendingSearchLatency.value?.requestSeq === requestSeq) {
      pendingSearchLatency.value = null;
    }
  };

  const isStale = (controller: AbortController, requestSeq: number, itemId: string, tab: RecipeTab): boolean => (
    options.isDisposed()
    || controller.signal.aborted
    || requestSeq !== searchRequestSeq
    || options.itemIdRef.value !== itemId
    || options.currentTab.value !== tab
  );

  const clear = () => {
    options.recipeSearchQuery.value = '';
    invalidate();
    resetState();
  };

  const schedule = (query: string) => {
    cancelPendingTransport();

    const normalized = query.trim();
    if (!normalized) {
      invalidate();
      resetState();
      return;
    }

    const itemId = options.itemIdRef.value;
    if (!itemId) {
      invalidate();
      resetState();
      return;
    }

    const tab = options.currentTab.value;
    searchingRecipes.value = true;
    searchMatchedItemIds.value = new Set<string>();
    searchMatchedRecipeIds.value = null;
    fastSearchResults.value = [];
    const requestSeq = ++searchRequestSeq;
    pendingSearchLatency.value = { requestSeq, query: normalized, startedAt: options.getNow() };
    searchDebounce = setTimeout(async () => {
      const controller = new AbortController();
      searchAbortController = controller;
      try {
        const searchPayload = await api.getRecipeBootstrapSearch(itemId, tab, normalized, { signal: controller.signal });
        if (isStale(controller, requestSeq, itemId, tab)) {
          return;
        }

        const matchedRecipeIds = Array.isArray(searchPayload.recipeIds)
          ? searchPayload.recipeIds.map((recipeId) => recipeId.trim()).filter(Boolean)
          : [];
        const itemMatches = Array.isArray(searchPayload.itemMatches)
          ? searchPayload.itemMatches
          : [];

        searchMatchedItemIds.value = new Set(itemMatches.map((entry) => entry.itemId));
        fastSearchResults.value = itemMatches.slice(0, 12);

        const loadedRecipeIds = options.getLoadedRecipeIds(tab);
        const missingMatchedRecipeIds = matchedRecipeIds.filter((recipeId) => !loadedRecipeIds.has(recipeId));
        reportRecipeSearchHydrationOmitted(missingMatchedRecipeIds);

        if (isStale(controller, requestSeq, itemId, tab)) {
          return;
        }

        searchMatchedRecipeIds.value = new Set(matchedRecipeIds);
      } catch (error) {
        if (controller.signal.aborted) return;
        console.warn('Failed to search recipe bootstrap pack:', error);
        if (requestSeq !== searchRequestSeq) return;
        searchMatchedItemIds.value = new Set<string>();
        searchMatchedRecipeIds.value = null;
        fastSearchResults.value = [];
      } finally {
        if (searchAbortController === controller) {
          searchAbortController = null;
        }
        if (requestSeq !== searchRequestSeq) return;
        searchingRecipes.value = false;
        void flushSearchLatency(requestSeq);
      }
    }, options.debounceMs ?? 180);
  };

  return {
    searchMatchedItemIds,
    searchMatchedRecipeIds,
    fastSearchResults,
    searchingRecipes,
    clear,
    reset() {
      invalidate();
      resetState();
    },
    schedule,
    dispose() {
      invalidate();
      resetState();
    },
  };
}
