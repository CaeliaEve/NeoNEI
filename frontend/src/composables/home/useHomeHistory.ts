import { computed, onBeforeUnmount, onMounted, ref, watch, type Ref } from "vue";
import { api, type BrowserGridEntry, type Item } from "../../services/api";
import type { PageAtlasResult } from "../../services/pageAtlas";
import {
  primeAnimatedAtlasManifest,
  primeRenderAnimationHintsFromUnknown,
  queueRenderableMediaPrewarmFromUnknown,
} from "../../services/animationBudget";
import { warmGlobalBrowserAtlasForItemsDetailed } from "../../services/globalBrowserAtlas";

type ItemBasicInfo = Pick<Item, "itemId" | "localizedName" | "modId" | "internalName" | "damage" | "imageFileName" | "renderAssetRef" | "preferredImageUrl">;

type BrowserPagePackLike = {
  data: BrowserGridEntry[];
  mediaManifest?: Parameters<typeof primeAnimatedAtlasManifest>[0];
};

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

function prewarmHistoryPagePackMedia(pack: BrowserPagePackLike) {
  primeRenderAnimationHintsFromUnknown(pack.data);
  primeAnimatedAtlasManifest(pack.mediaManifest);
  queueRenderableMediaPrewarmFromUnknown(pack.data, {
    limit: 24,
    animatedOnly: true,
  });
}

export function useHomeHistory(itemSize: Ref<number>) {
  const viewHistory = ref<ItemBasicInfo[]>(loadViewHistory());
  const historyAtlas = ref<PageAtlasResult | null | undefined>(undefined);
  const historyItems = ref<Item[]>([]);
  const historyPanelRef = ref<HTMLElement | null>(null);
  const historyPanelWidth = ref(0);
  let historyAtlasRequestSeq = 0;

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
    const fallbackWidth =
      typeof window !== "undefined" ? Math.floor(window.innerWidth * 0.38) : 0;
    const effectiveWidth =
      historyPanelWidth.value > 0 ? historyPanelWidth.value : fallbackWidth;
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
  const visibleHistoryItems = computed<Item[]>(() =>
    historyItems.value.length > 0
      ? historyItems.value
      : (visibleHistorySeeds.value as Item[]),
  );
  const historyBrowserEntries = computed<BrowserGridEntry[]>(() =>
    visibleHistoryItems.value.map((item) => ({
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

  watch(
    () => [
      visibleHistorySeeds.value.map((item) => item.itemId).join("|"),
      historyItemPixelSize.value,
    ].join("::"),
    async () => {
      const seedItems = visibleHistorySeeds.value;
      if (seedItems.length === 0) {
        historyItems.value = [];
        historyAtlas.value = null;
        return;
      }

      const requestSeq = ++historyAtlasRequestSeq;
      const itemIds = seedItems.map((item) => item.itemId);
      const slotSize = Math.max(32, Math.ceil(historyItemPixelSize.value * 0.9));
      historyItems.value = seedItems as Item[];
      historyAtlas.value = undefined;

      const globalCoverage = await warmGlobalBrowserAtlasForItemsDetailed(itemIds).catch(() => null);
      if (requestSeq !== historyAtlasRequestSeq) return;
      if (globalCoverage && globalCoverage.total > 0 && globalCoverage.missingCount === 0) {
        historyAtlas.value = null;
        return;
      }

      const cachedPack = api.peekBrowserPagePackByIds({ itemIds, slotSize });
      if (cachedPack) {
        historyItems.value = cachedPack.data.map((entry) => entry.item);
        historyAtlas.value = cachedPack.atlas ?? null;
        prewarmHistoryPagePackMedia(cachedPack);
      }

      void api.getBrowserPagePackByIds({
        itemIds,
        slotSize,
      }).then((pack) => {
        if (requestSeq !== historyAtlasRequestSeq) return;
        historyItems.value = pack.data.map((entry) => entry.item);
        historyAtlas.value = pack.atlas ?? null;
        prewarmHistoryPagePackMedia(pack);
      }).catch(() => {
        if (requestSeq !== historyAtlasRequestSeq) return;
        historyItems.value = seedItems as Item[];
        historyAtlas.value = null;
      });
    },
    { immediate: true },
  );

  return {
    viewHistory,
    historyAtlas,
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
