import { onMounted, onUnmounted, ref, watch, type Ref } from 'vue';
import { api, type BrowserGridEntry, type Item, type Mod } from '../services/api';

type CachedBrowserPage = {
  data: BrowserGridEntry[];
  items: Item[];
  total: number;
  totalPages: number;
  page: number;
};

function collectDisplayItems(entries: BrowserGridEntry[]): Item[] {
  const ordered: Item[] = [];
  const seen = new Set<string>();

  for (const entry of entries) {
    const item = entry.kind === 'item' ? entry.item : entry.group.representative;
    if (!item?.itemId || seen.has(item.itemId)) continue;
    seen.add(item.itemId);
    ordered.push(item);
  }

  return ordered;
}

export function useItemBrowser(itemSize: Ref<number>) {
  const pageCache = new Map<string, CachedBrowserPage>();
  const items = ref<Item[]>([]);
  const browserEntries = ref<BrowserGridEntry[]>([]);
  const mods = ref<Mod[]>([]);
  const loading = ref(false);
  const modsLoading = ref(false);
  const loadError = ref('');
  const modsLoadError = ref('');
  const searchQuery = ref('');
  const selectedMod = ref<string>('all');
  const expandedGroupKeys = ref<string[]>([]);
  const currentPage = ref(1);
  const pageSize = ref(50);
  const totalItems = ref(0);
  const totalPages = ref(0);

  let loadItemsRequestId = 0;
  let resizeTimeout: ReturnType<typeof setTimeout> | undefined;
  let searchTimeout: ReturnType<typeof setTimeout> | undefined;

  const buildPageCacheKey = (params: {
    page: number;
    pageSize: number;
    search?: string;
    modId?: string;
    expandedGroups?: string[];
  }) =>
    JSON.stringify({
      page: params.page,
      pageSize: params.pageSize,
      search: params.search?.trim() || '',
      modId: params.modId || 'all',
      expandedGroups: [...(params.expandedGroups ?? [])].sort(),
    });

  const calculatePageSize = () => {
    const gap = 4;
    const itemSizeWithGap = itemSize.value + gap;

    const paginationHeight = 52;
    const historyReserveHeight = Math.min(itemSize.value, 56) * 2 + 4 + 40;
    const paddingX = 32;
    const paddingY = 24;

    const maxHeight =
      window.innerHeight - paginationHeight - historyReserveHeight - paddingY;
    const contentWidth = Math.floor(window.innerWidth * 0.38) - paddingX;

    const rows = Math.max(1, Math.floor(maxHeight / itemSizeWithGap));
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

  const buildRequestParams = (page: number) => ({
    page,
    pageSize: pageSize.value,
    search: searchQuery.value.trim() || undefined,
    modId: selectedMod.value === 'all' ? undefined : selectedMod.value,
    expandedGroups: expandedGroupKeys.value,
  });

  const applyBrowserResponse = (
    response: CachedBrowserPage,
    requestId: number,
  ) => {
    if (requestId !== loadItemsRequestId) {
      return;
    }

    browserEntries.value = response.data;
    items.value = response.items;
    totalItems.value = response.total;
    totalPages.value = response.totalPages;
    currentPage.value = response.page;
  };

  const loadItems = async () => {
    const requestId = ++loadItemsRequestId;
    loading.value = true;
    loadError.value = '';

    try {
      const requestParams = buildRequestParams(currentPage.value);
      const cacheKey = buildPageCacheKey(requestParams);
      const cached = pageCache.get(cacheKey);
      if (cached) {
        applyBrowserResponse(cached, requestId);
        return;
      }

      const response = await api.getBrowserItems(requestParams);
      const normalized: CachedBrowserPage = {
        data: response.data,
        items: collectDisplayItems(response.data),
        total: response.total,
        totalPages: response.totalPages,
        page: response.page,
      };

      pageCache.set(
        buildPageCacheKey({
          ...requestParams,
          page: normalized.page,
        }),
        normalized,
      );
      applyBrowserResponse(normalized, requestId);
    } catch (error) {
      console.error('Failed to load items:', error);
      loadError.value = '加载物品列表失败，请检查后端连接后重试。';
      browserEntries.value = [];
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

  const setExpandedGroups = (groupKeys: string[]) => {
    expandedGroupKeys.value = Array.from(new Set(groupKeys.filter(Boolean)));
    pageCache.clear();
    void loadItems();
  };

  const setPageSize = (newSize: number, options?: { resetPage?: boolean }) => {
    const normalized = Math.max(20, Math.floor(newSize));
    if (normalized === pageSize.value) return;
    pageSize.value = normalized;
    pageCache.clear();
    if (options?.resetPage) {
      currentPage.value = 1;
    }
    void loadItems();
  };

  const prefetchItemsPage = async (page: number) => {
    if (page < 1) return;
    const requestParams = buildRequestParams(page);
    const cacheKey = buildPageCacheKey(requestParams);
    if (pageCache.has(cacheKey)) return;

    try {
      const response = await api.getBrowserItems(requestParams);
      pageCache.set(cacheKey, {
        data: response.data,
        items: collectDisplayItems(response.data),
        total: response.total,
        totalPages: response.totalPages,
        page: response.page,
      });
    } catch {
      // best-effort prefetch only
    }
  };

  const getCachedItemsPage = (page: number) => {
    if (page < 1) return null;
    const requestParams = buildRequestParams(page);
    return pageCache.get(buildPageCacheKey(requestParams)) ?? null;
  };

  const handleResize = () => {
    if (resizeTimeout) clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
      const newSize = calculatePageSize();
      if (newSize !== pageSize.value) {
        setPageSize(newSize, { resetPage: true });
      }
    }, 300);
  };

  watch(
    itemSize,
    () => {
      const newSize = calculatePageSize();
      if (newSize !== pageSize.value) {
        setPageSize(newSize, { resetPage: true });
      }
    },
    { flush: 'post' },
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
  });

  return {
    items,
    browserEntries,
    mods,
    loading,
    modsLoading,
    loadError,
    modsLoadError,
    searchQuery,
    selectedMod,
    expandedGroupKeys,
    currentPage,
    pageSize,
    totalItems,
    totalPages,
    setExpandedGroups,
    setPageSize,
    loadMods,
    loadItems,
    onSearch,
    changePage,
    prefetchItemsPage,
    getCachedItemsPage,
  };
}
