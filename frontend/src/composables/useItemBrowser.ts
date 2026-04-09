import { onMounted, onUnmounted, ref, watch, type Ref } from 'vue';
import { api, type Item, type Mod } from '../services/api';

export function useItemBrowser(itemSize: Ref<number>) {
  const pageCache = new Map<string, { data: Item[]; total: number; totalPages: number }>();
  const items = ref<Item[]>([]);
  const mods = ref<Mod[]>([]);
  const loading = ref(false);
  const modsLoading = ref(false);
  const loadError = ref('');
  const modsLoadError = ref('');
  const searchQuery = ref('');
  const selectedMod = ref<string>('all');
  const currentPage = ref(1);
  const pageSize = ref(50);
  const totalItems = ref(0);
  const totalPages = ref(0);

  let loadItemsRequestId = 0;
  let resizeTimeout: ReturnType<typeof setTimeout> | undefined;
  let searchTimeout: ReturnType<typeof setTimeout> | undefined;
  let searchAbortController: AbortController | null = null;

  const buildPageCacheKey = (params: { page: number; pageSize: number; search?: string; modId?: string }) =>
    JSON.stringify({
      page: params.page,
      pageSize: params.pageSize,
      search: params.search?.trim() || '',
      modId: params.modId || 'all',
    });

  const calculatePageSize = () => {
    const gap = 4;
    const itemSizeWithGap = itemSize.value + gap;

    const topPanelHeight = 60;
    const bottomSearchBarHeight = 80;
    const modFilterHeight = 60;
    const paddingX = 32;
    const paddingY = 32;

    const maxHeight =
      window.innerHeight - topPanelHeight - bottomSearchBarHeight - modFilterHeight - paddingY;
    const contentWidth = Math.floor(window.innerWidth * 0.38) - paddingX;

    const rows = Math.floor(maxHeight / itemSizeWithGap);
    const cols = Math.floor(contentWidth / itemSizeWithGap);

    return Math.max(rows * cols, 20);
  };

  const loadMods = async () => {
    modsLoading.value = true;
    modsLoadError.value = '';
    try {
      mods.value = await api.getMods();
    } catch (error) {
      console.error('Failed to load mods:', error);
      mods.value = [];
      modsLoadError.value = '加载模组列表失败，请检查后端连接后重试。';
    } finally {
      modsLoading.value = false;
    }
  };

  const loadItems = async () => {
    const requestId = ++loadItemsRequestId;
    loading.value = true;
    loadError.value = '';

    if (searchAbortController) {
      searchAbortController.abort();
    }
    searchAbortController = new AbortController();

    try {
      const trimmed = searchQuery.value.trim();

      if (!trimmed) {
        const requestParams = {
          page: currentPage.value,
          pageSize: pageSize.value,
          modId: selectedMod.value === 'all' ? undefined : selectedMod.value,
        };
        const cacheKey = buildPageCacheKey(requestParams);
        const cached = pageCache.get(cacheKey);
        const response = cached ?? await api.getItems(requestParams);
        if (!cached) {
          pageCache.set(cacheKey, {
            data: response.data,
            total: response.total,
            totalPages: response.totalPages,
          });
        }

        if (requestId !== loadItemsRequestId) {
          return;
        }

        items.value = response.data;
        totalItems.value = response.total;
        totalPages.value = response.totalPages;
        return;
      }

      const fastResults = await api.searchItemsFast(trimmed, Math.max(pageSize.value * 6, 200), {
        signal: searchAbortController.signal,
      });

      const modFiltered = selectedMod.value === 'all'
        ? fastResults
        : fastResults.filter((entry) => entry.modId === selectedMod.value);

      const start = (currentPage.value - 1) * pageSize.value;
      const end = start + pageSize.value;
      const pageResults = modFiltered.slice(start, end);

      if (requestId !== loadItemsRequestId) {
        return;
      }

      const detailedItems = pageResults.length > 0
        ? await api.getItemsByIds(pageResults.map((entry) => entry.itemId))
        : [];

      if (requestId !== loadItemsRequestId) {
        return;
      }

      items.value = detailedItems;
      totalItems.value = modFiltered.length;
      totalPages.value = Math.ceil(modFiltered.length / pageSize.value);
    } catch (error) {
      if ((error as { name?: string })?.name === 'AbortError') {
        return;
      }
      console.error('Failed to load items:', error);
      loadError.value = '加载物品列表失败，请检查后端连接后重试。';
      items.value = [];
      totalItems.value = 0;
      totalPages.value = 0;
    } finally {
      if (requestId === loadItemsRequestId) {
        loading.value = false;
      }
    }
  };

  const onSearch = () => {
    if (searchTimeout) clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      currentPage.value = 1;
      void loadItems();
    }, 300);
  };

  const changePage = (page: number) => {
    currentPage.value = page;
    void loadItems();
  };

  const prefetchItemsPage = async (page: number) => {
    const trimmed = searchQuery.value.trim();
    if (page < 1) return;
    if (!trimmed) {
      const requestParams = {
        page,
        pageSize: pageSize.value,
        modId: selectedMod.value === 'all' ? undefined : selectedMod.value,
      };
      const cacheKey = buildPageCacheKey(requestParams);
      if (pageCache.has(cacheKey)) return;
      try {
        const response = await api.getItems(requestParams);
        pageCache.set(cacheKey, {
          data: response.data,
          total: response.total,
          totalPages: response.totalPages,
        });
      } catch {
        // best-effort prefetch only
      }
    }
  };

  const getCachedItemsPage = (page: number) => {
    const trimmed = searchQuery.value.trim();
    if (trimmed || page < 1) return null;
    const requestParams = {
      page,
      pageSize: pageSize.value,
      modId: selectedMod.value === 'all' ? undefined : selectedMod.value,
    };
    return pageCache.get(buildPageCacheKey(requestParams)) ?? null;
  };

  const handleResize = () => {
    if (resizeTimeout) clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
      const newSize = calculatePageSize();
      if (newSize !== pageSize.value) {
        pageSize.value = newSize;
        currentPage.value = 1;
        void loadItems();
      }
    }, 300);
  };

  watch(
    itemSize,
    () => {
      const newSize = calculatePageSize();
      if (newSize !== pageSize.value) {
        pageSize.value = newSize;
        currentPage.value = 1;
        void loadItems();
      }
    },
    { flush: 'post' }
  );

  onMounted(async () => {
    window.addEventListener('resize', handleResize);
    pageSize.value = calculatePageSize();
    await loadMods();
    await loadItems();
  });

  onUnmounted(() => {
    window.removeEventListener('resize', handleResize);
    if (resizeTimeout) clearTimeout(resizeTimeout);
    if (searchTimeout) clearTimeout(searchTimeout);
    if (searchAbortController) {
      searchAbortController.abort();
    }
  });

  return {
    items,
    mods,
    loading,
    modsLoading,
    loadError,
    modsLoadError,
    searchQuery,
    selectedMod,
    currentPage,
    pageSize,
    totalItems,
    totalPages,
    loadMods,
    loadItems,
    onSearch,
    changePage,
    prefetchItemsPage,
    getCachedItemsPage,
  };
}
