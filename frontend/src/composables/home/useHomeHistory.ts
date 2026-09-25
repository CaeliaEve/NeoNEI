import { computed, onBeforeUnmount, onMounted, ref, type Ref } from "vue";
import type { BrowserGridEntry, Item } from "../../services/api";

type ItemBasicInfo = Pick<Item, "itemId" | "localizedName" | "modId" | "internalName" | "damage" | "imageFileName" | "renderAssetRef" | "preferredImageUrl">;

const HISTORY_STORAGE_KEY = "viewHistory";
const MAX_HISTORY_ITEMS = 400;
const HISTORY_ROWS = 2 as const;
const HISTORY_GRID_GAP = 4;
const HISTORY_HORIZONTAL_PADDING = 32;

const loadViewHistory = (): ItemBasicInfo[] => {
  try {
    const saved = localStorage.getItem(HISTORY_STORAGE_KEY);
    return saved ? JSON.parse(saved) : [];
  } catch {
    return [];
  }
};

const toHistoryItem = (item: Item): ItemBasicInfo => ({
  itemId: item.itemId,
  localizedName: item.localizedName,
  modId: item.modId,
  internalName: item.internalName,
  damage: Number(item.damage ?? 0),
  imageFileName: item.imageFileName,
  renderAssetRef: item.renderAssetRef,
  preferredImageUrl: item.preferredImageUrl,
});

export function useHomeHistory(itemSize: Ref<number>) {
  const viewHistory = ref<ItemBasicInfo[]>(loadViewHistory());
  const historyPanelRef = ref<HTMLElement | null>(null);
  const historyPanelWidth = ref(0);

  const saveViewHistory = () => {
    try {
      localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(viewHistory.value));
    } catch (e) {
      console.error("Failed to save view history:", e);
    }
  };

  const addToHistory = (item: Item) => {
    const basic = toHistoryItem(item);
    const idx = viewHistory.value.findIndex((h) => h.itemId === basic.itemId);
    if (idx >= 0) {
      viewHistory.value.splice(idx, 1);
    }
    viewHistory.value.unshift(basic);
    if (viewHistory.value.length > MAX_HISTORY_ITEMS) {
      viewHistory.value = viewHistory.value.slice(0, MAX_HISTORY_ITEMS);
    }
    saveViewHistory();
  };

  const clearViewHistory = () => {
    viewHistory.value = [];
    saveViewHistory();
  };

  const historyItemPixelSize = computed(() => Math.min(itemSize.value, 56));
  const historyGridCellSize = computed(() => Math.min(itemSize.value + 4, 60));

  const updateHistoryPanelWidth = () => {
    historyPanelWidth.value = historyPanelRef.value?.clientWidth ?? 0;
  };

  const setHistoryPanelRef = (element: HTMLElement | null) => {
    historyPanelRef.value = element;
    updateHistoryPanelWidth();
  };

  const historyColumns = computed(() => {
    const defaultWidth =
      typeof window !== "undefined" ? Math.floor(window.innerWidth * 0.38) : 0;
    const effectiveWidth =
      historyPanelWidth.value > 0 ? historyPanelWidth.value : defaultWidth;
    const contentWidth = Math.max(0, effectiveWidth - HISTORY_HORIZONTAL_PADDING);
    return Math.max(
      1,
      Math.floor(
        (contentWidth + HISTORY_GRID_GAP) /
          (historyGridCellSize.value + HISTORY_GRID_GAP),
      ),
    );
  });

  const historyVisibleCount = computed(() => historyColumns.value * HISTORY_ROWS);
  const visibleHistorySeeds = computed(() => viewHistory.value.slice(0, historyVisibleCount.value));
  const historyBrowserEntries = computed<BrowserGridEntry[]>(() =>
    (visibleHistorySeeds.value as Item[]).map((item) => ({
      key: item.itemId,
      kind: "item",
      item,
    })),
  );

  onMounted(() => {
    updateHistoryPanelWidth();
    window.addEventListener("resize", updateHistoryPanelWidth);
  });

  onBeforeUnmount(() => {
    window.removeEventListener("resize", updateHistoryPanelWidth);
  });

  return {
    viewHistory,
    historyRows: HISTORY_ROWS,
    historyGridGap: HISTORY_GRID_GAP,
    historyItemPixelSize,
    historyBrowserEntries,
    setHistoryPanelRef,
    updateHistoryPanelWidth,
    addToHistory,
    clearViewHistory,
  };
}
