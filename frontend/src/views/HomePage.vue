<script setup lang="ts">


import {
  ref,
  computed,
  defineAsyncComponent,
  onMounted,
  onBeforeUnmount,
  watch,
  nextTick,
} from "vue";
import { useRouter } from "vue-router";
import {
  api,
  type BrowserGridEntry,
  type BrowserVariantGroup,
  type Item,
} from "../services/api";
import {
  type PageAtlasResult,
} from "../services/pageAtlas";
import {
  primeAnimatedAtlasManifest,
  primeRenderAnimationHintsFromUnknown,
  queueRenderableMediaPrewarmFromUnknown,
} from "../services/animationBudget";
import {
  inspectGlobalBrowserAtlasResidentState,
  warmAllGlobalBrowserAtlases,
  warmGlobalBrowserAtlasForItemsDetailed,
} from "../services/globalBrowserAtlas";
import RecipeDisplayRouter from "../components/RecipeDisplayRouter.vue";
import { useItemBrowser } from "../composables/useItemBrowser";
import { useSound } from "../services/sound.service";
import { useRecipeViewer } from "../composables/useRecipeViewer";
import { resolveRecipePresentationProfile } from "../services/uiTypeMapping";

type ItemBasicInfo = Pick<Item, "itemId" | "localizedName" | "modId" | "internalName" | "damage" | "imageFileName" | "renderAssetRef" | "preferredImageUrl">;

const router = useRouter();

const PatternGroup = defineAsyncComponent(
  () => import("../components/PatternGroup.vue"),
);
const HomeCanvasGrid = defineAsyncComponent(() => import("../components/HomeCanvasGrid.vue"));
const MachineTypeIcons = defineAsyncComponent(
  () => import("../components/MachineTypeIcons.vue"),
);

// View mode
const currentView = ref<"items" | "patterns">("items");

// Gear menu state
const showGearMenu = ref(false);

// Item size settings with localStorage
const loadSavedItemSize = () => {
  const saved = localStorage.getItem("itemSize");
  return saved ? parseInt(saved, 10) : 50; // 默认50px
};
const itemSize = ref(loadSavedItemSize());

const itemGridViewportRef = ref<HTMLElement | null>(null);

const {

  items,
  browserEntries: browserGridEntries,
  mods,
  loading,
  transitioning,
  modsLoading,
  loadError,
  modsLoadError,
  searchQuery,
  selectedMod,
  currentPage,
  pageSize,
  totalItems,
  totalPages,
  currentPageAtlas,
  setExpandedGroups,
  expandedGroupFacetFilters,
  setExpandedGroupFacetFilter,
  clearExpandedGroupFacetFilters,
  setPageSize,
  loadMods,
  loadItems,
  onSearch,
  warmSearchIndex,
  changePage,
  prefetchItemsPage,
} = useItemBrowser(itemSize, {
  measureVisiblePageCapacity: () => measureGridCapacityRaw(),
});
let itemGridResizeObserver: ResizeObserver | null = null;
let neighborPrefetchTimer: number | null = null;
let neighborPrefetchIdleHandle: number | null = null;
let transitionOverlayTimer: number | null = null;
const BROWSER_PREFETCH_FORWARD_RADIUS = 1;
const BROWSER_PREFETCH_BACKWARD_RADIUS = 1;
const TRANSITION_OVERLAY_DELAY_MS = 140;
const currentGroupId = ref<string | undefined>(undefined);
const currentGroupName = ref<string>('');
const latestCreatedPatternId = ref<string | undefined>(undefined);
const showTransitionOverlay = ref(false);

// View history cache persisted in localStorage.
const loadViewHistory = () => {
  try {
    const saved = localStorage.getItem("viewHistory");
    return saved ? JSON.parse(saved) : [];
  } catch {
    return [];
  }
};
const viewHistory = ref<ItemBasicInfo[]>(loadViewHistory());
const maxHistoryItems = 400; // Keep a bounded history list without limiting UI to 20.
const historyAtlas = ref<PageAtlasResult | null | undefined>(undefined);
const historyItems = ref<Item[]>([]);
const expandedBrowserGroups = ref<Set<string>>(new Set());
const showSearchContextMenu = ref(false);
const searchContextMenuPosition = ref({ x: 0, y: 0 });
let historyAtlasRequestSeq = 0;

// Save view history to localStorage
const saveViewHistory = () => {
  try {
    localStorage.setItem("viewHistory", JSON.stringify(viewHistory.value));
  } catch (e) {
    console.error("Failed to save view history:", e);
  }
};


const addToHistory = (item: Item) => {
  const basic: ItemBasicInfo = {
    itemId: item.itemId,
    localizedName: item.localizedName,
    modId: item.modId,
    internalName: item.internalName,
    damage: Number(item.damage ?? 0),
    imageFileName: item.imageFileName,
    renderAssetRef: item.renderAssetRef,
    preferredImageUrl: item.preferredImageUrl,
  };

  const idx = viewHistory.value.findIndex((h) => h.itemId === basic.itemId);
  if (idx >= 0) {
    viewHistory.value.splice(idx, 1);
  }
  viewHistory.value.unshift(basic);
  if (viewHistory.value.length > maxHistoryItems) {
    viewHistory.value = viewHistory.value.slice(0, maxHistoryItems);
  }
  saveViewHistory();
};

const clearViewHistory = () => {
  viewHistory.value = [];
  saveViewHistory();
};

const atlasResidentRunning = ref(false);
const atlasResidentProgressCurrent = ref(0);
const atlasResidentProgressTotal = ref(0);
const atlasResidentItemCount = ref(0);
const atlasResidentStatus = ref("Atlas 将在主页打开后自动后台驻留");
const atlasResidentError = ref<string | null>(null);

const atlasResidentPercent = computed(() => {
  if (atlasResidentProgressTotal.value <= 0) return 0;
  return Math.min(100, Math.round((atlasResidentProgressCurrent.value / atlasResidentProgressTotal.value) * 100));
});

const refreshAtlasResidentState = async () => {
  const state = await inspectGlobalBrowserAtlasResidentState().catch(() => null);
  if (!state) {
    atlasResidentStatus.value = "Atlas 状态读取失败";
    return;
  }
  atlasResidentItemCount.value = state.itemCount;
  atlasResidentProgressCurrent.value = state.loadedAtlasFileCount;
  atlasResidentProgressTotal.value = state.atlasFileCount;
  if (!state.available) {
    atlasResidentStatus.value = "当前导出未包含浏览区 Atlas 索引";
  } else if (state.atlasFileCount > 0 && state.loadedAtlasFileCount >= state.atlasFileCount) {
    atlasResidentStatus.value = "Atlas 已就绪，翻页将直接走常驻纹理快路径";
  } else {
    atlasResidentStatus.value = `Atlas 后台驻留中 ${state.loadedAtlasFileCount}/${state.atlasFileCount}`;
  }
};

const warmResidentAtlas = async () => {
  if (atlasResidentRunning.value) return;
  atlasResidentRunning.value = true;
  atlasResidentError.value = null;
  atlasResidentStatus.value = "正在后台驻留浏览区 Atlas";
  try {
    const ok = await warmAllGlobalBrowserAtlases((processed, total) => {
      atlasResidentProgressCurrent.value = processed;
      atlasResidentProgressTotal.value = total;
      atlasResidentStatus.value = total > 0
        ? `Atlas 后台驻留中 ${processed}/${total}`
        : "正在读取 Atlas 索引";
    });
    await refreshAtlasResidentState();
    if (!ok) {
      atlasResidentStatus.value = "Atlas 索引不可用，请检查 NESQL++ 导出";
    }
  } catch (error) {
    atlasResidentError.value = error instanceof Error ? error.message : String(error);
    atlasResidentStatus.value = "Atlas 驻留失败";
  } finally {
    atlasResidentRunning.value = false;
  }
};

const historyPanelRef = ref<HTMLElement | null>(null);
const historyPanelWidth = ref(0);
const historyRows = 2 as const; // 强制固定两行
const historyGridGap = 4; // 对应 gap-1
const historyHorizontalPadding = 32; // 对应 px-4 (左右各16)

const historyItemPixelSize = computed(() => Math.min(itemSize.value, 56));
const historyGridCellSize = computed(() => Math.min(itemSize.value + 4, 60));

const updateHistoryPanelWidth = () => {
  historyPanelWidth.value = historyPanelRef.value?.clientWidth ?? 0;
};

const historyColumns = computed(() => {
  const fallbackWidth =
    typeof window !== "undefined" ? Math.floor(window.innerWidth * 0.38) : 0;
  const effectiveWidth =
    historyPanelWidth.value > 0 ? historyPanelWidth.value : fallbackWidth;
  const contentWidth = Math.max(0, effectiveWidth - historyHorizontalPadding);
  return Math.max(
    1,
    Math.floor(
      (contentWidth + historyGridGap) /
        (historyGridCellSize.value + historyGridGap),
    ),
  );
});

const historyVisibleCount = computed(() => historyColumns.value * historyRows);
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
  window.addEventListener("pointerdown", handleGlobalPointerDown, true);
  window.addEventListener("scroll", closeSearchContextMenu, true);
  window.addEventListener("keydown", handleGlobalKeydown);
  itemGridResizeObserver = new ResizeObserver(() => {
    syncMeasuredPageSize();
  });
  window.setTimeout(() => {
    void warmResidentAtlas();
  }, 250);
});

onBeforeUnmount(() => {
  window.removeEventListener("resize", updateHistoryPanelWidth);
  window.removeEventListener("pointerdown", handleGlobalPointerDown, true);
  window.removeEventListener("scroll", closeSearchContextMenu, true);
  window.removeEventListener("keydown", handleGlobalKeydown);
  itemGridResizeObserver?.disconnect();
  itemGridResizeObserver = null;
  if (neighborPrefetchTimer !== null) {
    clearTimeout(neighborPrefetchTimer);
    neighborPrefetchTimer = null;
  }
  if (neighborPrefetchIdleHandle !== null && typeof window !== "undefined" && "cancelIdleCallback" in window) {
    (window as Window & { cancelIdleCallback: (id: number) => void }).cancelIdleCallback(neighborPrefetchIdleHandle);
    neighborPrefetchIdleHandle = null;
  }
  if (transitionOverlayTimer !== null) {
    clearTimeout(transitionOverlayTimer);
    transitionOverlayTimer = null;
  }
});

watch(
  transitioning,
  (active) => {
    if (transitionOverlayTimer !== null) {
      clearTimeout(transitionOverlayTimer);
      transitionOverlayTimer = null;
    }

    if (!active) {
      showTransitionOverlay.value = false;
      return;
    }

    transitionOverlayTimer = window.setTimeout(() => {
      showTransitionOverlay.value = true;
      transitionOverlayTimer = null;
    }, TRANSITION_OVERLAY_DELAY_MS);
  },
  { immediate: true },
);

watch(currentView, async (view) => {
  if (view === "items") {
    await nextTick();
    updateHistoryPanelWidth();
    if (itemGridViewportRef.value) {
      itemGridResizeObserver?.disconnect();
      itemGridResizeObserver?.observe(itemGridViewportRef.value);
      syncMeasuredPageSize();
    }
  }
});

watch(
  () => [
    items.value.map((item) => item.itemId).join("|"),
    currentPage.value,
    pageSize.value,
    currentPageAtlas.value === undefined,
  ].join("::"),
  async () => {
    if (currentView.value !== "items" || items.value.length === 0) {
      return;
    }

    await nextTick();
    if (itemGridViewportRef.value) {
      itemGridResizeObserver?.disconnect();
      itemGridResizeObserver?.observe(itemGridViewportRef.value);
      syncMeasuredPageSize();
    }
  },
);

function prewarmHistoryPagePackMedia(pack: { data: BrowserGridEntry[]; mediaManifest?: Parameters<typeof primeAnimatedAtlasManifest>[0] }) {
  primeRenderAnimationHintsFromUnknown(pack.data);
  primeAnimatedAtlasManifest(pack.mediaManifest);
  queueRenderableMediaPrewarmFromUnknown(pack.data, {
    limit: 24,
    animatedOnly: true,
  });
}

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

const itemGridEmptySubtitle = computed(() => {
  if (searchQuery.value.trim()) {
    return '请尝试缩短关键词，或清空搜索后查看全部物品。';
  }
  if (selectedMod.value !== 'all') {
    return '当前模组筛选下没有匹配物品，可重置筛选后重试。';
  }
  return '当前页暂无可显示物品，可刷新后重试。';
});

const resetItemFilters = () => {
  searchQuery.value = '';
  selectedMod.value = 'all';
  currentPage.value = 1;
  void loadItems();
};

const openRecipeOracleEntry = () => {
  void router.push({ name: 'recipe-oracle' });
};

const handleSearchContextMenu = (event: MouseEvent) => {
  event.preventDefault();
  event.stopPropagation();
  searchContextMenuPosition.value = { x: event.clientX, y: event.clientY };
  showSearchContextMenu.value = true;
};

const closeSearchContextMenu = () => {
  showSearchContextMenu.value = false;
};

const clearSearchQuery = () => {
  searchQuery.value = '';
  currentPage.value = 1;
  closeSearchContextMenu();
  void loadItems();
};

const handleGlobalPointerDown = () => {
  if (!showSearchContextMenu.value) return;
  closeSearchContextMenu();
};

const handleGlobalKeydown = (event: KeyboardEvent) => {
  if (event.key === 'Escape') {
    closeSearchContextMenu();
  }
};

const handleRecipePreviewContextMenu = (event: MouseEvent) => {
  event.preventDefault();
  event.stopPropagation();
};

const changeItemsPageWrapped = (targetPage: number) => {
  const total = totalPages.value;
  if (total <= 0) return;
  const resolvedTargetPage = targetPage < 1
    ? total
    : targetPage > total
      ? 1
      : targetPage;
  const direction: 1 | -1 | 0 = targetPage < 1
    ? -1
    : targetPage > total
      ? 1
      : resolvedTargetPage > currentPage.value
        ? 1
        : resolvedTargetPage < currentPage.value
          ? -1
          : 0;

  changePage(resolvedTargetPage);
  scheduleNeighborPrefetch(resolvedTargetPage, total, direction);
};

const collectWrappedPageCandidates = (
  page: number,
  total: number,
  forwardRadius: number,
  backwardRadius: number,
) => {
  const normalizedTotal = Math.max(0, Math.floor(total));
  const normalizedPage = Math.max(1, Math.floor(page));
  const normalizedForwardRadius = Math.max(1, Math.floor(forwardRadius));
  const normalizedBackwardRadius = Math.max(1, Math.floor(backwardRadius));
  if (normalizedTotal <= 1) {
    return [] as number[];
  }

  const wrap = (value: number) => ((value - 1 + normalizedTotal) % normalizedTotal) + 1;
  const candidates = new Set<number>();

  for (let offset = 1; offset <= normalizedForwardRadius; offset += 1) {
    candidates.add(wrap(normalizedPage + offset));
  }

  for (let offset = 1; offset <= normalizedBackwardRadius; offset += 1) {
    candidates.add(wrap(normalizedPage - offset));
  }

  candidates.delete(normalizedPage);
  return Array.from(candidates).filter((candidate) => candidate >= 1 && candidate <= normalizedTotal);
};

const scheduleNeighborPrefetch = (
  page: number,
  total: number,
  direction: 1 | -1 | 0,
) => {
  if (neighborPrefetchTimer !== null) {
    clearTimeout(neighborPrefetchTimer);
    neighborPrefetchTimer = null;
  }
  if (neighborPrefetchIdleHandle !== null && typeof window !== "undefined" && "cancelIdleCallback" in window) {
    (window as Window & { cancelIdleCallback: (id: number) => void }).cancelIdleCallback(neighborPrefetchIdleHandle);
    neighborPrefetchIdleHandle = null;
  }

  if (currentView.value !== "items" || total <= 1 || searchQuery.value.trim()) {
    return;
  }

  const candidatePages = collectWrappedPageCandidates(
    page,
    total,
    direction >= 0 ? BROWSER_PREFETCH_FORWARD_RADIUS : BROWSER_PREFETCH_BACKWARD_RADIUS,
    direction <= 0 ? BROWSER_PREFETCH_FORWARD_RADIUS : BROWSER_PREFETCH_BACKWARD_RADIUS,
  );
  if (candidatePages.length === 0) {
    return;
  }

  neighborPrefetchTimer = window.setTimeout(() => {
    neighborPrefetchTimer = null;
    const runPrefetch = () => {
      for (const candidatePage of candidatePages) {
        void prefetchItemsPage(candidatePage);
      }
    };

    if (typeof window !== "undefined" && "requestIdleCallback" in window) {
      neighborPrefetchIdleHandle = (window as Window & {
        requestIdleCallback: (cb: () => void, opts?: { timeout: number }) => number;
      }).requestIdleCallback(() => {
        neighborPrefetchIdleHandle = null;
        runPrefetch();
      }, { timeout: 600 });
      return;
    }

    runPrefetch();
  }, 800);
};

const handleItemsWheel = (event: WheelEvent) => {
  if (currentView.value !== 'items' || totalPages.value <= 1) return;
  if (Math.abs(event.deltaY) < 8) return;

  event.preventDefault();
  if (event.deltaY > 0) {
    changeItemsPageWrapped(currentPage.value + 1);
  } else {
    changeItemsPageWrapped(currentPage.value - 1);
  }
};

// Recipe modal state
const showRecipeModal = ref(false);
const recipeModalItem = ref<Item | null>(null);
const recipeModalMode = ref<'usedIn' | 'producedBy'>('producedBy');
const { playClick } = useSound();
const modalRecipeItemId = computed(() => recipeModalItem.value?.itemId);

const {
  loading: recipeModalLoading,
  recipes,
  currentTab,
  loadError: recipeLoadError,
  selectedMachineIndex,
  currentPage: recipeModalPage,
  machineCategories,
  currentCategory,
  currentPageRecipes,
  totalPages: totalRecipePages,
  selectMachine,
  nextPage,
  prevPage,
  setCurrentTab,
  retryLoadRecipes,
} = useRecipeViewer(modalRecipeItemId, playClick);

const recipeModalError = computed(() => recipeLoadError.value);
const pendingRecipeMachineName = ref<string | null>(null);

watch(recipeModalMode, (mode) => {
  setCurrentTab(mode);
  patternCreateStatus.value = {
    type: 'idle',
    message: '',
  };
  resetPatternDraftFromCurrentRecipe();
});

watch(showRecipeModal, (visible) => {
  if (!visible) {
    recipeModalItem.value = null;
    recipeModalMode.value = 'producedBy';
    patternCreateStatus.value = {
      type: 'idle',
      message: '',
    };
    resetPatternDraftFromCurrentRecipe();
  }
});

const centerRailStyle = computed(() => ({
  width: "var(--home-center-width)",
  left: "var(--home-center-left)",
}));

const leftRailStyle = computed(() => ({
  left: "max(24px, calc((100vw - var(--home-right-width) - var(--home-left-rail-width)) / 2))",
  right: "auto",
  width: "min(var(--home-left-rail-width), calc(100vw - var(--home-right-width) - 48px))",
  maxWidth: "calc(100vw - var(--home-right-width) - 48px)",
}));

const itemColumnStyle = computed(() => ({
  width: "var(--home-right-width)",
}));

const currentRecipePresentation = computed(() => {
  const recipe = currentPageRecipes.value[0];
  if (!recipe) return null;
  return resolveRecipePresentationProfile({
    machineType: recipe.machineInfo?.machineType,
    recipeType: recipe.recipeType,
    recipeTypeData: recipe.recipeTypeData,
    inputs: recipe.inputs,
    additionalData: recipe.additionalData as Record<string, unknown> | undefined,
    metadata: recipe.metadata as Record<string, unknown> | undefined,
    preferDetailedCrafting: false,
  });
});

const isRecipeModalWorkbenchCanvas = computed(() => {
  const categoryName = `${currentCategory.value?.name || ''}`.toLowerCase();
  const isNamedWorkbench =
    categoryName === 'crafting table'
    || categoryName === 'crafting (shaped)'
    || categoryName === 'crafting (shapeless)'
    || categoryName === '有序合成'
    || categoryName === '无序合成';
  return (
    currentCategory.value?.type === 'crafting'
    || isNamedWorkbench
  );
});

const isRecipeModalWideCanvas = computed(() => {
  return isRecipeModalWorkbenchCanvas.value || currentRecipePresentation.value?.component === 'FurnaceUI';
});

const isRecipeModalFurnaceCanvas = computed(() => currentRecipePresentation.value?.component === 'FurnaceUI');

const recipeModalScaleToFit = computed(() => {
  if (isRecipeModalWideCanvas.value) return false;
  const surface = currentRecipePresentation.value?.uiConfig.presentation?.surface;
  const density = currentRecipePresentation.value?.uiConfig.presentation?.density;
  const family = currentRecipePresentation.value?.uiConfig.presentation?.family;
  if (surface === 'ritual' || surface === 'research') return false;
  if (density === 'oversized') return false;
  if (family === 'thaumcraft' || family === 'blood_magic' || family === 'multiblock') return false;
  return true;
});

const recipePreviewNeedsWideStage = computed(() => recipeStageIsStateView.value || !recipeModalScaleToFit.value);

const recipeDockStyle = computed(() => {
  if (recipePreviewNeedsWideStage.value) {
    return {
      left: "16px",
      right: "calc(var(--home-right-width) + 16px)",
      top: "var(--home-recipe-top)",
      bottom: "var(--home-recipe-bottom)",
      width: "auto",
      zIndex: "30",
    };
  }

  return {
    ...centerRailStyle.value,
    top: "var(--home-recipe-top)",
    bottom: "var(--home-recipe-bottom)",
  };
});

const recipeStageKey = computed(() => {
  if (recipeModalLoading.value) return "loading";
  if (recipeModalError.value) return `error-${recipeModalMode.value}`;
  const recipe = currentPageRecipes.value[0];
  if (!recipe) return `empty-${recipeModalMode.value}-${currentCategory.value?.name || "none"}`;
  return `${currentCategory.value?.name || "unknown"}-${recipe.recipeId}`;
});

const recipeStageIsStateView = computed(() =>
  recipeModalLoading.value || Boolean(recipeModalError.value) || currentPageRecipes.value.length === 0,
);

const currentRecipeForPattern = computed(() => currentPageRecipes.value[0] || null);
const currentRecipeOutputOptions = computed(() => currentRecipeForPattern.value?.outputs || []);
const patternDraftName = ref('');
const patternDraftOutputItemId = ref<string | null>(null);
const patternDraftCrafting = ref(1);
const patternDraftSubstitute = ref(0);
const patternDraftBeSubstitute = ref(0);
const patternDraftPriority = ref(0);
const canCreatePatternFromCurrentRecipe = computed(() =>
  Boolean(currentGroupId.value && currentRecipeForPattern.value && recipeModalItem.value),
);
const patternCreateStatus = ref<{
  type: 'idle' | 'success' | 'error';
  message: string;
}>({
  type: 'idle',
  message: '',
});

watch(currentRecipeForPattern, () => {
  if (showRecipeModal.value) {
    resetPatternDraftFromCurrentRecipe();
    patternCreateStatus.value = {
      type: 'idle',
      message: '',
    };
  }
});

const openCurrentRecipeMode = () => {
  retryLoadRecipes();
};

const resetPatternDraftFromCurrentRecipe = () => {
  if (!recipeModalItem.value) {
    patternDraftName.value = '';
    patternDraftOutputItemId.value = null;
    patternDraftCrafting.value = 1;
    patternDraftSubstitute.value = 0;
    patternDraftBeSubstitute.value = 0;
    patternDraftPriority.value = 0;
    return;
  }

  patternDraftName.value = `${recipeModalItem.value.localizedName} (${currentCategory.value?.name || 'Recipe'})`;
  patternDraftOutputItemId.value = currentRecipeOutputOptions.value[0]?.itemId || null;
  patternDraftCrafting.value = recipeModalMode.value === 'producedBy' ? 1 : 0;
  patternDraftSubstitute.value = 0;
  patternDraftBeSubstitute.value = 0;
  patternDraftPriority.value = 0;
};

const createPatternFromCurrentRecipe = async () => {
  if (!currentGroupId.value || !currentRecipeForPattern.value || !recipeModalItem.value) {
    patternCreateStatus.value = {
      type: 'error',
      message: '请先选择一个模板分组，并确保当前配方已加载完成。',
    };
    return;
  }

  const recipe = currentRecipeForPattern.value;

  try {
    const createdPattern = await api.createPattern({
      groupId: currentGroupId.value,
      recipeId: recipe.recipeId,
      patternName: patternDraftName.value.trim() || `${recipeModalItem.value.localizedName} (${currentCategory.value?.name || 'Recipe'})`,
      outputItemId: patternDraftOutputItemId.value || undefined,
      crafting: patternDraftCrafting.value,
      substitute: patternDraftSubstitute.value,
      beSubstitute: patternDraftBeSubstitute.value,
      priority: patternDraftPriority.value,
    });
    patternCreateStatus.value = {
      type: 'success',
      message: `已保存到模板分组：${currentGroupName.value || currentGroupId.value}`,
    };
    latestCreatedPatternId.value = createdPattern.patternId;
    currentView.value = 'patterns';
  } catch (error) {
    console.error('Failed to create pattern from current recipe:', error);
    patternCreateStatus.value = {
      type: 'error',
      message: '保存 Pattern 失败，请稍后重试。',
    };
  }
};

const openRecipeModal = (item: Item) => {
  recipeModalItem.value = item;
  recipeModalMode.value = 'producedBy';
  setCurrentTab('producedBy');
  showRecipeModal.value = true;
  patternCreateStatus.value = {
    type: 'idle',
    message: '',
  };
  resetPatternDraftFromCurrentRecipe();
  addToHistory(item);
};

const openCraftingRecipes = (item: Item) => {
  openRecipeModal(item);
};

const openUsageRecipes = (item: Item) => {
  recipeModalItem.value = item;
  recipeModalMode.value = 'usedIn';
  setCurrentTab('usedIn');
  showRecipeModal.value = true;
  resetPatternDraftFromCurrentRecipe();
  addToHistory(item);
};

const handleItemContextMenu = (item: Item, event: MouseEvent) => {
  event.preventDefault();
  event.stopPropagation();
  openUsageRecipes(item);
};

const handleCardContextMenu = (item: Item, event?: MouseEvent) => {
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }
  openUsageRecipes(item);
};

const toggleBrowserGroup = (groupKey: string) => {
  const next = new Set(expandedBrowserGroups.value);
  if (next.has(groupKey)) {
    next.delete(groupKey);
  } else {
    next.add(groupKey);
  }
  expandedBrowserGroups.value = next;
  setExpandedGroups(Array.from(next));
};

const expandedGroupFilterPanels = computed(() => {
  const seen = new Set<string>();
  return browserGridEntries.value
    .filter((entry): entry is Extract<BrowserGridEntry, { kind: "group-header" }> => entry.kind === "group-header")
    .map((entry) => entry.group)
    .filter((group) => {
      const key = `${group.key ?? ""}`.trim();
      if (!key || seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    })
    .slice(0, 3);
});

const hasExpandedGroupFacetFilters = computed(() =>
  Object.keys(expandedGroupFacetFilters.value ?? {}).length > 0,
);

const handleExpandedGroupFacetInput = (groupKey: string, event: Event) => {
  setExpandedGroupFacetFilter(groupKey, (event.target as HTMLInputElement | null)?.value ?? "");
};

const handleBrowserGroupClick = (group: BrowserVariantGroup) => {
  if (!group.expandable) {
    return;
  }
  toggleBrowserGroup(group.key);
};

const handleBrowserGroupContextMenu = (group: BrowserVariantGroup, event?: MouseEvent) => {
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }
  openUsageRecipes(group.representative);
};

const nextRecipePage = () => {
  nextPage();
};

const prevRecipePage = () => {
  prevPage();
};

const handleRecipeWheel = (event: WheelEvent) => {
  if (Math.abs(event.deltaY) < 8 || totalRecipePages.value <= 1) return;
  event.preventDefault();
  if (event.deltaY > 0) {
    nextPage();
  } else {
    prevPage();
  }
};

// Handle item click in recipe
const handleRecipeItemClick = (itemId: string, options?: { tab?: 'usedIn' | 'producedBy' }) => {
  const item = items.value.find((i) => i.itemId === itemId);
  if (item) {
    if (options?.tab) {
      setCurrentTab(options.tab);
      recipeModalMode.value = options.tab;
      pendingRecipeMachineName.value = options.tab === 'producedBy' ? '物品中的要素' : null;
    }
    openRecipeModal(item);
    return;
  }
  void router.push({
    name: "recipe",
    params: { itemId },
    query: options?.tab
      ? {
          tab: options.tab,
          mode: options.tab === 'usedIn' ? 'u' : 'r',
          machineName: options.tab === 'producedBy' ? '物品中的要素' : undefined,
          page: '0',
        }
      : undefined,
  });
};

watch(
  () => [pendingRecipeMachineName.value, machineCategories.value.map((category) => category.name).join('|')] as const,
  ([pendingMachineName]) => {
    if (!pendingMachineName) return;
    const index = machineCategories.value.findIndex(
      (category) => category.name.trim().toLowerCase() === pendingMachineName.trim().toLowerCase(),
    );
    if (index >= 0) {
      selectMachine(index);
      pendingRecipeMachineName.value = null;
    }
  },
);

// Handle pattern group selection
const onSelectGroup = (groupId: string) => {
  currentGroupId.value = groupId;
  patternCreateStatus.value = {
    type: 'idle',
    message: '',
  };
  resetPatternDraftFromCurrentRecipe();
  void api.getPatternGroup(groupId)
    .then((group) => {
      currentGroupName.value = group.groupName;
    })
    .catch((error) => {
      console.error('Failed to resolve selected pattern group name:', error);
      currentGroupName.value = '';
    });
};

const measureGridCapacityRaw = () => {
  const shell = itemGridViewportRef.value;
  if (!shell) return null;

  const style = window.getComputedStyle(shell);
  const paddingX =
    (Number.parseFloat(style.paddingLeft || "0") || 0)
    + (Number.parseFloat(style.paddingRight || "0") || 0);
  const paddingY =
    (Number.parseFloat(style.paddingTop || "0") || 0)
    + (Number.parseFloat(style.paddingBottom || "0") || 0);
  const gap = 4;
  const usableWidth = Math.max(0, shell.clientWidth - paddingX);
  const usableHeight = Math.max(0, shell.clientHeight - paddingY);
  const columnCount = Math.max(1, Math.floor((usableWidth + gap) / (itemSize.value + gap)));
  const rows = Math.max(1, Math.floor((usableHeight + gap) / (itemSize.value + gap)));

  if (columnCount <= 0 || rows <= 0) return null;
  return columnCount * rows;
};

const measureVisibleGridCapacity = () => {
  const capacity = measureGridCapacityRaw();
  if (!capacity) return null;
  const baseline = Math.max(20, pageSize.value);
  const lowerBound = Math.max(20, Math.floor(baseline * 0.75));
  const upperBound = Math.max(lowerBound, Math.ceil(baseline * 1.5));
  if (capacity < lowerBound || capacity > upperBound) {
    return null;
  }
  return capacity;
};

const syncMeasuredPageSize = () => {
  if (
    currentView.value !== "items"
    || loading.value
    || items.value.length === 0
    || currentPageAtlas.value === undefined
  ) return;
  const measured = measureVisibleGridCapacity();
  if (!measured || measured === pageSize.value || Math.abs(measured - pageSize.value) < 8) return;
  setPageSize(measured);
};

// Save settings to localStorage
const saveSettings = () => {
  localStorage.setItem("itemSize", itemSize.value.toString());

  const button = document.querySelector(
    ".save-settings-btn",
  ) as HTMLButtonElement | null;

  if (button) {
    const originalText = button.textContent;
    button.textContent = "已保存";
    setTimeout(() => {
      button.textContent = originalText;
    }, 1500);
  }
};
</script>

<template>
  <div class="homepage-shell h-screen overflow-hidden flex">
    <div class="fixed top-4 left-4 z-50">
      <button
        @click="openRecipeOracleEntry"
        class="recipe-entry-btn px-4 py-2 rounded-xl text-sm font-semibold"
        title="进入 Recipe 界面"
        aria-label="进入 Recipe 界面"
      >
        Recipe
      </button>
    </div>

    <!-- Mod Filter Panel (Fixed Top, offset to have left 18% and right 12%) -->
    <div
      class="mod-filter-anchor fixed top-0 z-40 pt-0 pb-1 px-2"
      :style="leftRailStyle"
    >
      <div v-if="currentView === 'items'" class="flex flex-col gap-2">
        <select
          v-model="selectedMod"
          @change="
            currentPage = 1;
            loadItems();
          "
          :disabled="modsLoading || !!modsLoadError"
          class="w-full px-4 py-2.5 text-sm text-center rounded-lg chrome-field chrome-select disabled:opacity-60 disabled:cursor-not-allowed"
        >
          <option value="all">全部模组</option>
          <option v-for="mod in mods" :key="mod.modId" :value="mod.modId">
            {{ mod.modName }} ({{ mod.itemCount }})
          </option>
        </select>

        <div v-if="modsLoading" class="state-panel list-state-panel !py-2 !px-3">
          <p class="state-title text-xs">正在加载模组筛选...</p>
        </div>

        <div v-else-if="modsLoadError" class="state-panel list-state-panel state-panel-error !py-2 !px-3">
          <p class="state-title text-xs">{{ modsLoadError }}</p>
          <div class="state-actions">
            <button class="mini-pager-btn" @click="loadMods">重试加载模组</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Main Content (Full Width) -->
    <main class="flex-1 flex flex-col relative">
      <!-- Items View -->
      <div
        v-if="currentView === 'items'"
        class="flex-1 flex overflow-hidden relative"
      >
        <!-- Recipe Display Module (Center, 30% width) - Absolutely positioned to match mod filter and search bar -->
        <div
          v-if="
            showRecipeModal
          "
          :class="['recipe-preview-panel recipe-preview-shell absolute flex flex-col overflow-visible rounded-xl shadow-lg', { 'wide-stage': recipePreviewNeedsWideStage }]"
          :style="recipeDockStyle"
        >
          <!-- Recipe Content (no scroll, compact) -->
          <div class="flex-1 flex flex-col p-2 gap-2 min-h-0 overflow-visible">
            <!-- Machine Type Icons (compact) -->
            <MachineTypeIcons
              :categories="machineCategories"
              v-model="selectedMachineIndex"
              @select="selectMachine"
            />

            <!-- Machine Name -->
            <div
              class="recipe-machine-banner rounded"
            >
              <button
                v-if="totalRecipePages > 1"
                @click="prevRecipePage"
                :disabled="totalRecipePages <= 1"
                class="recipe-machine-banner__nav recipe-machine-banner__nav--left disabled:opacity-50 disabled:cursor-not-allowed"
                title="上一页"
                aria-label="上一页"
              >
                ◀
              </button>
              <span
                class="recipe-machine-banner__title text-xs font-bold text-cyan-300"
                style="text-shadow: 0 0 18px rgba(69, 191, 255, 0.22)"
              >
                {{ currentCategory?.name || "未知分类" }}
              </span>
              <button
                v-if="totalRecipePages > 1"
                @click="nextRecipePage"
                :disabled="totalRecipePages <= 1"
                class="recipe-machine-banner__nav recipe-machine-banner__nav--right disabled:opacity-50 disabled:cursor-not-allowed"
                title="下一页"
                aria-label="下一页"
              >
                ▶
              </button>
              <span
                v-if="totalRecipePages > 1"
                class="recipe-machine-banner__page text-[10px]"
              >
                {{ recipeModalPage + 1 }}/{{ totalRecipePages }}
              </span>
            </div>

            <!-- Recipe Display (scaled to fit, flex-1 to fill remaining space) -->
              <div
                :class="[
                  'recipe-display-shell rounded flex-1 flex items-center justify-center recipe-display-container p-2 min-h-0',
                  {
                    'recipe-display-container--state': recipeStageIsStateView,
                    'recipe-display-container--homepage': !recipeStageIsStateView,
                  }
                ]"
                @wheel="handleRecipeWheel"
                @contextmenu="handleRecipePreviewContextMenu"
              >
                  <div
                    :class="[
                      'recipe-stage-slot',
                      {
                        'recipe-stage-slot--state': recipeStageIsStateView,
                        'recipe-stage-slot--homepage': !recipeStageIsStateView,
                      },
                    ]"
                  >
                    <div v-if="recipeModalLoading" class="state-panel stage-state-panel">
                      <p class="state-title">正在加载配方...</p>
                      <p class="state-subtitle">请稍候，系统正在准备该物品的配方索引。</p>
                    </div>
                  <div v-else-if="recipeModalError" class="state-panel stage-state-panel state-panel-error">
                    <p class="state-title">{{ recipeModalError }}</p>
                    <p class="state-subtitle">你可以立即重试，或切换到其他物品后再查询。</p>
                    <div class="state-actions">
                      <button class="mini-pager-btn" @click="openCurrentRecipeMode">重试</button>
                      <button class="mini-pager-btn" @click="showRecipeModal = false">关闭面板</button>
                    </div>
                  </div>
                    <div
                      v-else-if="isRecipeModalFurnaceCanvas && currentPageRecipes.length > 0"
                      class="modal-stacked-furnace-recipes homepage-recipe-scale-shell"
                    >
                      <RecipeDisplayRouter
                        v-for="recipe in currentPageRecipes"
                        :key="recipe.recipeId"
                      :recipe="recipe"
                      @item-click="handleRecipeItemClick"
                      :scale-to-fit="recipeModalScaleToFit"
                      :prefer-detailed-crafting="false"
                    />
                    </div>
                    <div
                      v-else-if="currentPageRecipes.length > 0"
                      class="homepage-recipe-scale-shell"
                    >
                      <RecipeDisplayRouter
                        :recipe="currentPageRecipes[0]"
                        @item-click="handleRecipeItemClick"
                        :scale-to-fit="recipeModalScaleToFit"
                        :prefer-detailed-crafting="false"
                      />
                    </div>
                    <div v-else class="state-panel stage-state-panel">
                      <p class="state-title">暂无可显示配方</p>
                      <p class="state-subtitle">请尝试右键查看“用途配方”，或切换其他物品。</p>
                    <div class="state-actions">
                      <button class="mini-pager-btn" @click="openCurrentRecipeMode">重新加载</button>
                      <button class="mini-pager-btn" @click="showRecipeModal = false">关闭面板</button>
                    </div>
                  </div>
                </div>
            </div>
          </div>
        </div>

        <!-- Items Container (38% width, right aligned) -->
        <div
          class="items-column ml-auto flex flex-col overflow-hidden border-l border-slate-200/40"
          :style="itemColumnStyle"
          @wheel="handleItemsWheel"
        >
          <!-- Top Pagination Control -->
          <div
            v-if="totalPages > 1"
            class="pagination-top py-1 px-2"
          >
            <div class="flex items-center justify-between gap-1">
              <!-- 上一页按钮 - 最左侧 -->
              <button
                @click="changeItemsPageWrapped(currentPage - 1)"
                class="pager-btn rounded flex-shrink-0 flex items-center justify-center transition-colors"
                :style="{
                  width: itemSize + 'px',
                  height: itemSize + 'px',
                  fontSize: itemSize * 0.5 + 'px',
                }"
                title="上一页"
                aria-label="上一页"
              >
                ◀
              </button>

              <!-- 页码显示 - 中间 -->
              <div
                class="flex items-center gap-1 px-2 py-1 pager-indicator rounded text-xs flex-shrink-0"
              >
                <span class="text-slate-200">{{ currentPage }}</span>
                <span class="text-slate-200/60">/</span>
                <span class="text-white">{{ totalPages }}</span>
              </div>

              <!-- 下一页按钮 - 最右侧 -->
              <button
                @click="changeItemsPageWrapped(currentPage + 1)"
                class="pager-btn rounded flex-shrink-0 flex items-center justify-center transition-colors"
                :style="{
                  width: itemSize + 'px',
                  height: itemSize + 'px',
                  fontSize: itemSize * 0.5 + 'px',
                }"
                title="下一页"
                aria-label="下一页"
              >
                ▶
              </button>
            </div>
          </div>

          <!-- Items Grid Container -->
          <div class="items-grid-container flex-1 min-h-0 pt-1 flex flex-col">
            <div
              ref="itemGridViewportRef"
              class="item-grid-shell w-full p-4 flex-1 min-h-0 overflow-hidden"
            >
              <div v-if="loading && items.length === 0" class="state-panel list-state-panel">
                <div class="state-spinner"></div>
                <p class="state-title">加载数据中...</p>
                <p class="state-subtitle">正在同步物品列表，请稍候。</p>
              </div>

              <div v-else-if="loadError && items.length === 0" class="state-panel list-state-panel state-panel-error">
                <p class="state-title">{{ loadError }}</p>
                <p class="state-subtitle">可立即重试，或重置筛选条件后重新加载。</p>
                <div class="state-actions">
                  <button class="mini-pager-btn" @click="loadItems">重试</button>
                  <button class="mini-pager-btn" @click="resetItemFilters">重置筛选</button>
                </div>
              </div>

              <div v-else-if="items.length === 0" class="state-panel list-state-panel">
                <p class="state-title">暂无可显示物品</p>
                <p class="state-subtitle">{{ itemGridEmptySubtitle }}</p>
                <div class="state-actions">
                  <button class="mini-pager-btn" @click="loadItems">重新加载</button>
                  <button class="mini-pager-btn" @click="resetItemFilters">重置筛选</button>
                </div>
              </div>

              <div v-else class="relative h-full w-full">
                <HomeCanvasGrid
                  :entries="browserGridEntries"
                  :item-size="itemSize"
                  :atlas="currentPageAtlas"
                  :enable-animation="true"
                  :prefer-atlas="true"
                  @item-click="openCraftingRecipes"
                  @item-contextmenu="handleCardContextMenu"
                  @group-click="handleBrowserGroupClick"
                  @group-contextmenu="handleBrowserGroupContextMenu"
                />

                <div
                  v-if="expandedGroupFilterPanels.length > 0"
                  class="expanded-group-filter-panel absolute left-3 top-3 z-20 flex max-w-[min(520px,calc(100%-1.5rem))] flex-col gap-2"
                >
                  <div
                    v-for="group in expandedGroupFilterPanels"
                    :key="group.key"
                    class="expanded-group-filter-row"
                  >
                    <div class="min-w-0 flex-1">
                      <p class="expanded-group-filter-label">{{ group.label || group.representative.localizedName }}</p>
                      <p class="expanded-group-filter-meta">{{ group.semanticFamily || group.groupSource || 'semantic group' }} · {{ group.visibleCount || group.size }} 项</p>
                    </div>
                    <input
                      class="expanded-group-filter-input"
                      :value="expandedGroupFacetFilters[group.key] || ''"
                      placeholder="筛选材质 / 方块 / 实体 / 流体"
                      @input="handleExpandedGroupFacetInput(group.key, $event)"
                    />
                  </div>
                  <button
                    v-if="hasExpandedGroupFacetFilters"
                    class="expanded-group-filter-clear"
                    type="button"
                    @click="clearExpandedGroupFacetFilters"
                  >
                    清除筛选
                  </button>
                </div>

                <div
                  v-if="showTransitionOverlay"
                  class="pointer-events-none absolute right-3 top-3 z-20 rounded-xl border border-cyan-300/25 bg-slate-950/82 px-3 py-2 text-xs text-cyan-100 shadow-[0_10px_30px_rgba(15,23,42,0.45)] backdrop-blur-md"
                >
                  正在切换到第 {{ currentPage }} 页...
                </div>

                <div
                  v-else-if="loadError && items.length > 0"
                  class="absolute inset-x-3 top-3 z-20"
                >
                  <div class="state-panel list-state-panel state-panel-error !px-3 !py-2">
                    <p class="state-title text-xs">{{ loadError }}</p>
                    <p class="state-subtitle">上一页内容已保留，可立即重试当前页加载。</p>
                    <div class="state-actions">
                      <button class="mini-pager-btn" @click="loadItems">重试当前页</button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- View History（位于物品浏览区底部，固定高度） -->
            <div
              ref="historyPanelRef"
              class="flex-shrink-0 overflow-hidden border-t-2 border-dashed border-slate-300/50 px-4 pt-3 pb-1"
              :style="{
                minHeight: `${historyItemPixelSize * historyRows + (historyRows - 1) * historyGridGap + 24}px`,
                height: `${historyItemPixelSize * historyRows + (historyRows - 1) * historyGridGap + 24}px`,
                maxHeight: `${historyItemPixelSize * historyRows + (historyRows - 1) * historyGridGap + 24}px`,
              }"
            >
              <div
                v-if="viewHistory.length > 0"
                class="h-full w-full overflow-hidden"
              >
                <HomeCanvasGrid
                  :entries="historyBrowserEntries"
                  :item-size="historyItemPixelSize"
                  :atlas="historyAtlas"
                  :enable-animation="false"
                  :prefer-atlas="true"
                  @item-click="openCraftingRecipes"
                  @item-contextmenu="handleCardContextMenu"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Patterns View -->
      <div
        v-if="currentView === 'patterns'"
        class="flex-1 overflow-y-auto p-6 no-scrollbar"
      >
        <PatternGroup
          :current-group-id="currentGroupId"
          :latest-created-pattern-id="latestCreatedPatternId"
          @select-group="onSelectGroup"
        />
      </div>

      <!-- Bottom Search Bar (Fixed Position, offset to have left 18% and right 12%) -->
      <div
        class="search-anchor bottom-search-bar fixed bottom-0 z-40 pt-1 pb-0 px-2"
        :style="leftRailStyle"
      >
        <input
          v-model="searchQuery"
          @input="onSearch"
          @focus="warmSearchIndex"
          @contextmenu="handleSearchContextMenu"
          type="text"
          class="w-full px-4 py-2.5 text-sm rounded-lg chrome-field chrome-search-input"
        />
      </div>

      <div
        v-if="showSearchContextMenu"
        class="search-context-menu fixed z-[70] min-w-[148px] rounded-xl border border-slate-300/20 p-1.5"
        :style="{
          left: `${searchContextMenuPosition.x}px`,
          top: `${searchContextMenuPosition.y}px`,
        }"
        @pointerdown.stop
        @contextmenu.prevent
      >
        <button
          class="search-context-action w-full rounded-lg px-3 py-2 text-left text-sm"
          @click="clearSearchQuery"
        >
          清空搜索
        </button>
      </div>
    </main>

    <!-- Settings Button + Floating Home Overlay -->
    <div class="fixed bottom-3 left-6 z-50">
      <div
        v-if="showGearMenu"
        class="settings-panel-scrim fixed inset-0 z-[48]"
        aria-hidden="true"
        @click="showGearMenu = false"
        @contextmenu.prevent
      />

      <div class="relative z-[51]">
        <button
          @click="showGearMenu = !showGearMenu"
          class="gear-btn settings-launcher w-12 h-12 rounded-xl flex items-center justify-center transition-all duration-300"
          :class="
            showGearMenu
              ? 'settings-launcher--active text-white'
              : 'surface-glass text-slate-300 hover:text-white border border-slate-200/20'
          "
          title="设置"
          aria-label="打开设置中心"
          :aria-expanded="showGearMenu"
        >
          <svg
            class="h-5 w-5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" />
            <path d="M19.43 12.98c.04-.32.07-.65.07-.98s-.02-.66-.07-.98l2.1-1.64-2-3.46-2.47 1a7.2 7.2 0 0 0-1.7-.98L15 3.28h-4l-.36 2.66c-.6.23-1.17.56-1.7.98l-2.47-1-2 3.46 2.1 1.64c-.04.32-.07.65-.07.98s.02.66.07.98l-2.1 1.64 2 3.46 2.47-1c.53.42 1.1.75 1.7.98L11 20.72h4l.36-2.66c.6-.23 1.17-.56 1.7-.98l2.47 1 2-3.46-2.1-1.64Z" />
          </svg>
        </button>

        <section
          v-if="showGearMenu"
          class="gear-menu settings-panel fixed left-6 bottom-20 surface-glass rounded-2xl border border-slate-300/20 shadow-2xl overflow-hidden"
          role="dialog"
          aria-label="NeoNEI 设置中心"
          @click.stop
          @contextmenu.prevent
        >
          <div class="settings-panel__glow" aria-hidden="true" />

          <header class="settings-panel__header">
            <div>
              <p class="settings-kicker">NEONEI CONTROL</p>
              <h2 class="settings-title">设置中心</h2>
              <p class="settings-subtitle">悬浮式主页控制台，预留更多调试与体验选项。</p>
            </div>
            <button
              class="settings-close-btn"
              type="button"
              aria-label="关闭设置中心"
              @click="showGearMenu = false"
            >
              <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
                <path d="M6 6l12 12M18 6 6 18" />
              </svg>
            </button>
          </header>

          <div class="settings-panel__body">
            <section class="settings-section">
              <div class="settings-section__head">
                <div>
                  <p class="settings-section__label">视图切换</p>
                  <p class="settings-section__hint">选择主页当前工作区。</p>
                </div>
              </div>
              <div class="settings-segment" role="group" aria-label="视图切换">
                <button
                  type="button"
                  @click="
                    currentView = 'items';
                    showGearMenu = false;
                  "
                  :class="['settings-segment__btn', currentView === 'items' && 'settings-segment__btn--active']"
                >
                  物品浏览
                </button>
                <button
                  type="button"
                  @click="
                    currentView = 'patterns';
                    showGearMenu = false;
                  "
                  :class="['settings-segment__btn', currentView === 'patterns' && 'settings-segment__btn--active settings-segment__btn--violet']"
                >
                  模板管理
                </button>
              </div>
            </section>

            <section class="settings-section">
              <div class="settings-section__head">
                <div>
                  <p class="settings-section__label">物品图标尺寸</p>
                  <p class="settings-section__hint">调整右侧浏览区图标密度。</p>
                </div>
                <span class="settings-value-chip">{{ itemSize }}px</span>
              </div>
              <input
                v-model.number="itemSize"
                type="range"
                min="24"
                max="128"
                step="4"
                class="settings-slider"
                aria-label="物品图标尺寸"
              />
              <div class="settings-scale" aria-hidden="true">
                <span>紧凑</span>
                <span>标准</span>
                <span>展示</span>
              </div>
              <button type="button" @click="saveSettings" class="settings-primary-btn">
                保存设置
              </button>
            </section>

            <section class="settings-section settings-section--wide">
              <div class="settings-section__head">
                <div>
                  <p class="settings-section__label">Atlas 驻留状态</p>
                  <p class="settings-section__hint">
                    浏览区已切换到全局 Atlas / 动画 Atlas 常驻模式；这里保留诊断和重新驻留入口。
                  </p>
                </div>
                <span
                  class="settings-status-pill"
                  :class="atlasResidentProgressTotal > 0 && atlasResidentProgressCurrent >= atlasResidentProgressTotal
                    ? 'settings-status-pill--ready'
                    : 'settings-status-pill--running'"
                >
                  {{ atlasResidentRunning ? "后台驻留" : "自动" }}
                </span>
              </div>

              <div class="settings-atlas-card">
                <div class="settings-atlas-card__top">
                  <div>
                    <p class="settings-atlas-title">{{ atlasResidentStatus }}</p>
                    <p class="settings-atlas-meta">
                      物品索引 {{ atlasResidentItemCount.toLocaleString() }} · Atlas 分片 {{ atlasResidentProgressCurrent }}/{{ atlasResidentProgressTotal }}
                    </p>
                  </div>
                  <div class="settings-atlas-percent">
                    <strong>{{ atlasResidentPercent }}%</strong>
                    <span>常驻进度</span>
                  </div>
                </div>

                <div class="settings-progress" aria-hidden="true">
                  <div
                    class="settings-progress__bar"
                    :style="{ width: atlasResidentPercent + '%' }"
                  />
                </div>

                <p v-if="atlasResidentError" class="settings-error">
                  {{ atlasResidentError }}
                </p>

                <div class="settings-action-grid">
                  <button
                    type="button"
                    @click="warmResidentAtlas"
                    :disabled="atlasResidentRunning"
                    class="settings-secondary-btn settings-secondary-btn--cyan"
                  >
                    重新驻留 Atlas
                  </button>
                  <button
                    type="button"
                    @click="refreshAtlasResidentState"
                    class="settings-secondary-btn"
                  >
                    刷新状态
                  </button>
                </div>
              </div>
            </section>

            <section class="settings-section settings-section--wide settings-section--stats">
              <div class="settings-section__head">
                <div>
                  <p class="settings-section__label">统计与维护</p>
                  <p class="settings-section__hint">快速查看当前数据规模，并清理本地浏览历史。</p>
                </div>
              </div>
              <div class="settings-stat-grid">
                <div class="settings-stat-card">
                  <span>物品总数</span>
                  <strong>{{ totalItems.toLocaleString() }}</strong>
                </div>
                <div class="settings-stat-card">
                  <span>历史记录</span>
                  <strong>{{ viewHistory.length.toLocaleString() }}</strong>
                </div>
                <button type="button" @click="clearViewHistory" class="settings-danger-btn">
                  清除历史记录
                </button>
              </div>
            </section>
          </div>
        </section>
      </div>
    </div>  </div>
</template>

<style scoped>
/* Items Grid - 使用 flex 布局确保不产生滚动条 */
.items-grid-container {
  overflow: hidden !important;
}

.item-grid-shell {
  position: relative;
}

.atlas-card-placeholder {
  border: 1px solid rgba(148, 163, 184, 0.14);
  border-radius: 10px;
  background:
    linear-gradient(180deg, rgba(20, 24, 31, 0.84), rgba(13, 16, 22, 0.88)),
    radial-gradient(circle at 50% 38%, rgba(255, 255, 255, 0.05), transparent 55%);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.025),
    0 3px 8px rgba(0, 0, 0, 0.18);
}

.homepage-shell {
  --home-shell-width: min(1880px, var(--app-shell-max-width, 96vw));
  --home-center-width: clamp(420px, 30vw, 760px);
  --home-center-left: clamp(180px, calc(50% - 18vw), 860px);
  --home-left-rail-width: clamp(520px, 34vw, 920px);
  --home-right-width: clamp(520px, 38vw, 1240px);
  --home-recipe-top: clamp(56px, 6.2vh, 70px);
  --home-recipe-bottom: clamp(76px, 8vh, 98px);
}

.mod-filter-anchor,
.search-anchor {
  width: var(--home-center-width);
  left: var(--home-center-left);
}

.recipe-preview-panel {
  width: var(--home-center-width);
  left: var(--home-center-left);
}

.recipe-preview-shell {
  border: 1px solid rgba(133, 164, 206, 0.16);
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.025), transparent 12%),
    radial-gradient(circle at 50% 0%, rgba(107, 211, 255, 0.05), transparent 28%),
    linear-gradient(180deg, rgba(13, 18, 26, 0.985), rgba(7, 10, 16, 0.995));
  box-shadow:
    0 28px 58px rgba(0, 0, 0, 0.38),
    inset 0 1px 0 rgba(255, 255, 255, 0.04),
    inset 0 0 0 1px rgba(89, 122, 166, 0.05);
}

.recipe-preview-shell::before {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: inherit;
  pointer-events: none;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.025), transparent 14%),
    repeating-linear-gradient(90deg, rgba(255, 255, 255, 0.012) 0 1px, transparent 1px 52px);
  opacity: 0.85;
}

.recipe-preview-panel.wide-stage {
  width: auto;
  left: 16px;
  right: calc(var(--home-right-width) + 16px);
}

.items-column {
  width: var(--home-right-width);
}

/* Recipe Display Container */
.recipe-display-container {
  width: min(var(--home-shell-width), 100%);
  margin-inline: auto;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.recipe-machine-banner {
  position: relative;
  z-index: 1;
  min-height: 34px;
  padding: 4px 52px 4px 52px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(108, 160, 218, 0.16);
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.018), transparent 20%),
    linear-gradient(180deg, rgba(22, 28, 39, 0.95), rgba(11, 16, 24, 0.98));
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.03),
    0 12px 22px rgba(0, 0, 0, 0.14);
}

.recipe-machine-banner__title {
  text-align: center;
  line-height: 1.1;
}

.recipe-machine-banner__nav {
  position: absolute;
  top: 50%;
  transform: translate3d(0, -50%, 0);
  z-index: 2;
  width: 28px;
  min-width: 28px;
  height: 24px;
  margin: 0;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  appearance: none;
  -webkit-appearance: none;
  vertical-align: middle;
  line-height: 1;
  font-size: 11px;
  font-weight: 700;
  flex-shrink: 0;
  transition:
    border-color 140ms ease,
    background-color 140ms ease,
    box-shadow 140ms ease,
    color 140ms ease;
}

.recipe-machine-banner__page {
  position: absolute;
  top: 50%;
  transform: translate3d(0, -50%, 0);
}

.recipe-machine-banner__nav--left {
  left: 6px;
}

.recipe-machine-banner__nav--right {
  right: 42px;
}

.recipe-machine-banner__page {
  right: 8px;
  min-width: 32px;
  height: 22px;
  padding: 0 6px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  border: 1px solid rgba(117, 157, 203, 0.16);
  color: rgba(214, 230, 247, 0.95);
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.018), transparent 26%),
    linear-gradient(180deg, rgba(20, 27, 37, 0.94), rgba(10, 15, 22, 0.98));
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.03),
    0 10px 18px rgba(0, 0, 0, 0.14);
}

.recipe-machine-banner__nav {
  border-radius: 10px;
  border-color: rgba(118, 158, 203, 0.16);
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.02), transparent 24%),
    linear-gradient(180deg, rgba(21, 29, 39, 0.94), rgba(11, 16, 24, 0.98));
  color: rgba(222, 235, 248, 0.95);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.03),
    0 10px 18px rgba(0, 0, 0, 0.14);
}

.recipe-machine-banner__nav:hover {
  transform: translate3d(0, -50%, 0);
  border-color: rgba(154, 190, 228, 0.24);
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.026), transparent 24%),
    linear-gradient(180deg, rgba(26, 35, 47, 0.96), rgba(14, 20, 29, 0.99));
}

.recipe-machine-banner__nav:focus,
.recipe-machine-banner__nav:active {
  transform: translate3d(0, -50%, 0);
}

.recipe-display-shell {
  position: relative;
  z-index: 1;
  border: 1px solid rgba(143, 171, 211, 0.14);
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.02), transparent 14%),
    radial-gradient(circle at 50% 0%, rgba(107, 211, 255, 0.035), transparent 28%),
    linear-gradient(180deg, rgba(10, 15, 22, 0.985), rgba(6, 9, 14, 1));
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.035),
    inset 0 0 0 1px rgba(86, 119, 162, 0.04),
    0 18px 38px rgba(0, 0, 0, 0.24);
}

.recipe-display-shell::before {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: inherit;
  pointer-events: none;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.018), transparent 12%),
    radial-gradient(circle at 50% 100%, rgba(255, 189, 113, 0.03), transparent 24%);
}

.recipe-display-container--state {
  width: 100%;
  max-width: none;
  margin-inline: 0;
}

.recipe-display-container--homepage {
  padding-top: 6px;
  padding-bottom: 6px;
  align-items: stretch;
  justify-content: stretch;
}

.recipe-stage-slot {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.recipe-stage-slot--state {
  align-items: stretch;
  justify-content: stretch;
}

.recipe-stage-slot--homepage {
  align-items: stretch;
  justify-content: stretch;
}

.homepage-recipe-scale-shell {
  --homepage-recipe-preview-scale: 0.92;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: stretch;
  justify-content: stretch;
}

.homepage-recipe-scale-shell :deep(.recipe-display-wrapper) {
  width: calc(100% / var(--homepage-recipe-preview-scale));
  height: calc(100% / var(--homepage-recipe-preview-scale));
  align-items: stretch;
  justify-content: stretch;
  zoom: var(--homepage-recipe-preview-scale);
}

.homepage-recipe-scale-shell :deep(.recipe-display-content) {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: stretch;
  justify-content: stretch;
}

@supports not (zoom: 1) {
  .homepage-recipe-scale-shell {
    transform: scale(var(--homepage-recipe-preview-scale));
    transform-origin: center top;
  }

  .homepage-recipe-scale-shell :deep(.recipe-display-wrapper) {
    zoom: normal;
  }
}

.homepage-recipe-scale-shell :deep(.gt-research-ui),
.homepage-recipe-scale-shell :deep(.gt-assembler-ui),
.homepage-recipe-scale-shell :deep(.gt-assembly-line-ui),
.homepage-recipe-scale-shell :deep(.gt-alloy-smelter-ui),
.homepage-recipe-scale-shell :deep(.gt-molecular-ui),
.homepage-recipe-scale-shell :deep(.gt-electrolyzer-ui),
.homepage-recipe-scale-shell :deep(.gt-blast-furnace-ui),
.homepage-recipe-scale-shell :deep(.gt-electric-furnace-ui),
.homepage-recipe-scale-shell :deep(.industrial-slaughterhouse-ui),
.homepage-recipe-scale-shell :deep(.thaumcraft-infusion-ui),
.homepage-recipe-scale-shell :deep(.thaumcraft-arcane-ui),
.homepage-recipe-scale-shell :deep(.thaumcraft-crucible-ui),
.homepage-recipe-scale-shell :deep(.thaumcraft-aspect-ui),
.homepage-recipe-scale-shell :deep(.blood-magic-altar-ui),
.homepage-recipe-scale-shell :deep(.blood-alchemy-table-ui),
.homepage-recipe-scale-shell :deep(.blood-binding-ritual-ui),
.homepage-recipe-scale-shell :deep(.botania-rune-altar-ui),
.homepage-recipe-scale-shell :deep(.botania-terra-plate-ui),
.homepage-recipe-scale-shell :deep(.botania-pool-ui),
.homepage-recipe-scale-shell :deep(.mana-pool-ui),
.homepage-recipe-scale-shell :deep(.botania-elven-trade-ui),
.homepage-recipe-scale-shell :deep(.furnace-ui),
.homepage-recipe-scale-shell :deep(.avaritia-extreme-ui),
.homepage-recipe-scale-shell :deep(.multiblock-blueprint-ui) {
  width: 100%;
  height: 100%;
  min-height: 100%;
  max-width: none;
  max-height: 100%;
}

.homepage-recipe-scale-shell :deep(.mana-pool-ui) {
  box-sizing: border-box;
  min-height: 0;
}

.homepage-recipe-scale-shell :deep(.mana-pool-ui .altar-deck) {
  transform: translateY(-18px);
}

.homepage-recipe-scale-shell :deep(.mana-pool-ui .mana-hud-overlay) {
  bottom: 58px;
}

.modal-stacked-furnace-recipes {
  width: 100%;
  height: 100%;
  display: grid;
  grid-template-rows: repeat(2, minmax(0, 1fr));
  gap: 0;
  align-items: stretch;
  position: relative;
  overflow: hidden;
  border-radius: 22px;
  border: 1px solid rgba(148, 163, 184, 0.10);
  background:
    linear-gradient(180deg, rgba(11, 16, 24, 0.94), rgba(7, 11, 17, 0.97));
  box-shadow:
    0 18px 42px rgba(2, 8, 23, 0.40),
    inset 0 1px 0 rgba(255, 255, 255, 0.05);
}

.modal-stacked-furnace-recipes::before {
  content: '';
  position: absolute;
  inset: 10px;
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.022);
  pointer-events: none;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.008), transparent 20%, transparent 80%, rgba(255, 255, 255, 0.004));
}

.modal-stacked-furnace-recipes :deep(.furnace-ui) {
  --furnace-slot-size: 58px;
  --furnace-icon-size: 40px;
  width: 100%;
  height: 100%;
  min-height: 0;
  padding: 4px 10px;
  overflow: visible;
}

.state-panel {
  width: min(560px, 100%);
  padding: 20px;
  border: 1px dashed rgba(162, 178, 199, 0.3);
  border-radius: 10px;
  background: linear-gradient(180deg, rgba(16, 20, 27, 0.76), rgba(12, 16, 22, 0.8));
  color: rgba(223, 233, 246, 0.94);
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.stage-state-panel {
  width: 100%;
  max-width: none;
  height: 100%;
  min-height: 100%;
  border-radius: 18px;
}

.list-state-panel {
  flex: 1;
  align-self: stretch;
  width: auto;
  max-width: none;
  min-height: 0;
  margin: 12px;
  box-sizing: border-box;
}

.state-panel-error {
  border-color: rgba(237, 152, 157, 0.6);
  color: rgba(255, 211, 214, 0.95);
}

.state-title {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  color: rgba(233, 241, 251, 0.98);
}

.state-subtitle {
  margin: 0;
  font-size: 13px;
  color: rgba(187, 201, 220, 0.86);
}

.state-panel-error .state-title {
  color: rgba(255, 226, 228, 0.98);
}

.state-panel-error .state-subtitle {
  color: rgba(255, 205, 210, 0.92);
}

.state-actions {
  margin-top: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  flex-wrap: wrap;
}

.state-spinner {
  width: 34px;
  height: 34px;
  border-radius: 999px;
  border: 2px solid rgba(157, 174, 197, 0.26);
  border-top-color: rgba(188, 204, 226, 0.78);
  animation: spin 0.9s linear infinite;
}

/* Keep internal panel clipping without locking page scroll */

/* Hide all scrollbars */
.no-scrollbar::-webkit-scrollbar {
  display: none;
}

.no-scrollbar {
  -ms-overflow-style: none;
  scrollbar-width: none;
}

/* Pagination Top */
.pagination-top {
  background: linear-gradient(180deg, rgba(14, 17, 23, 0.83), rgba(11, 14, 19, 0.86));
  border: 1px solid rgba(162, 178, 199, 0.11);
  border-radius: 10px;
  backdrop-filter: blur(12px) saturate(104%);
  -webkit-backdrop-filter: blur(12px) saturate(104%);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.025),
    0 5px 14px rgba(0, 0, 0, 0.28);
}

/* Search Panel */
.search-panel {
  background: rgba(10, 10, 20, 0.9);
  backdrop-filter: blur(20px);
  box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.3);
}

/* Modal Item Icon */
.modal-item-icon-wrapper {
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 255, 247, 0.1);
  border: 2px solid rgba(0, 255, 247, 0.3);
  border-radius: 10px;
  backdrop-filter: blur(10px);
  box-shadow:
    0 0 20px rgba(0, 255, 247, 0.2),
    inset 0 0 10px rgba(0, 255, 247, 0.1);
}

.modal-item-icon {
  width: 40px;
  height: 40px;
  object-fit: contain;
  filter: drop-shadow(0 0 10px rgba(0, 255, 247, 0.6));
}

/* Compact stat card */
.stat-card.compact {
  padding: 8px 12px;
}

/* Modern Slider */
.slider-modern {
  -webkit-appearance: none;
  appearance: none;
  background: #e2e8f0;
  border-radius: 8px;
  height: 8px;
}

.slider-modern::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 18px;
  height: 18px;
  background: #64748b;
  border-radius: 50%;
  cursor: pointer;
  transition: all 0.15s ease;
}

.slider-modern::-webkit-slider-thumb:hover {
  background: #475569;
  transform: scale(1.1);
}

.slider-modern::-moz-range-thumb {
  width: 18px;
  height: 18px;
  background: #64748b;
  border-radius: 50%;
  cursor: pointer;
  border: none;
  transition: all 0.15s ease;
}

.slider-modern::-moz-range-thumb:hover {
  background: #475569;
  transform: scale(1.1);
}

/* Gear Button */
.gear-btn {
  backdrop-filter: blur(12px);
  box-shadow:
    0 8px 18px rgba(0, 0, 0, 0.22),
    inset 0 1px 0 rgba(255, 255, 255, 0.04);
  opacity: 0.84;
}

.gear-btn:hover {
  transform: translateY(-1px) scale(1.04);
  opacity: 1;
  box-shadow:
    0 12px 26px rgba(0, 0, 0, 0.30),
    inset 0 1px 0 rgba(255, 255, 255, 0.06);
}

/* Gear Menu */
.gear-menu {
  backdrop-filter: blur(20px);
  animation: scaleIn 0.2s ease-out;
  width: clamp(290px, 22vw, 420px);
}

/* Floating Settings Panel */
.settings-panel-scrim {
  background:
    radial-gradient(circle at 12% 86%, rgba(34, 211, 238, 0.11), transparent 30%),
    radial-gradient(circle at 70% 18%, rgba(139, 92, 246, 0.10), transparent 34%),
    rgba(2, 6, 18, 0.34);
  backdrop-filter: blur(2px);
}

.settings-launcher {
  position: relative;
  color: rgba(226, 232, 240, 0.94);
  background: linear-gradient(145deg, rgba(15, 23, 42, 0.82), rgba(2, 6, 23, 0.92));
}

.settings-launcher::before {
  content: "";
  position: absolute;
  inset: -1px;
  border-radius: inherit;
  padding: 1px;
  background: linear-gradient(135deg, rgba(103, 232, 249, 0.55), rgba(129, 140, 248, 0.18), rgba(255, 255, 255, 0.10));
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  -webkit-mask-composite: xor;
  mask-composite: exclude;
  pointer-events: none;
}

.settings-launcher--active {
  background: linear-gradient(145deg, rgba(14, 116, 144, 0.92), rgba(30, 41, 59, 0.96));
  box-shadow:
    0 0 28px rgba(34, 211, 238, 0.24),
    0 16px 34px rgba(0, 0, 0, 0.34),
    inset 0 1px 0 rgba(255, 255, 255, 0.12);
}

.gear-menu.settings-panel {
  width: min(760px, calc(100vw - 48px));
  max-height: min(78vh, 690px);
  background:
    linear-gradient(135deg, rgba(15, 23, 42, 0.93), rgba(3, 7, 18, 0.96) 58%, rgba(12, 20, 38, 0.94)),
    radial-gradient(circle at 20% 0%, rgba(34, 211, 238, 0.14), transparent 36%),
    radial-gradient(circle at 92% 86%, rgba(168, 85, 247, 0.12), transparent 34%);
  border-color: rgba(148, 163, 184, 0.22);
  box-shadow:
    0 28px 80px rgba(0, 0, 0, 0.52),
    0 0 0 1px rgba(255, 255, 255, 0.035) inset,
    0 0 42px rgba(34, 211, 238, 0.10);
  backdrop-filter: blur(24px) saturate(1.2);
  transform-origin: bottom left;
}

.settings-panel__glow {
  position: absolute;
  inset: -35% auto auto -14%;
  width: 360px;
  height: 360px;
  border-radius: 999px;
  background: radial-gradient(circle, rgba(34, 211, 238, 0.18), transparent 64%);
  filter: blur(8px);
  pointer-events: none;
}

.settings-panel__header {
  position: relative;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24px;
  padding: 22px 24px 18px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.16);
  background:
    linear-gradient(90deg, rgba(14, 165, 233, 0.08), rgba(99, 102, 241, 0.05), transparent),
    rgba(15, 23, 42, 0.34);
}

.settings-kicker {
  margin: 0 0 6px;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.24em;
  color: rgba(103, 232, 249, 0.82);
  text-shadow: 0 0 14px rgba(34, 211, 238, 0.32);
}

.settings-title {
  margin: 0;
  font-size: 24px;
  font-weight: 900;
  line-height: 1.05;
  color: rgba(248, 250, 252, 0.98);
}

.settings-subtitle {
  margin: 8px 0 0;
  max-width: 460px;
  font-size: 13px;
  line-height: 1.6;
  color: rgba(203, 213, 225, 0.72);
}

.settings-close-btn {
  display: grid;
  place-items: center;
  width: 38px;
  height: 38px;
  flex: 0 0 auto;
  border-radius: 12px;
  border: 1px solid rgba(148, 163, 184, 0.18);
  color: rgba(226, 232, 240, 0.82);
  background: rgba(15, 23, 42, 0.58);
  transition: border-color 160ms ease, background 160ms ease, color 160ms ease, transform 160ms ease;
}

.settings-close-btn:hover {
  transform: translateY(-1px);
  border-color: rgba(103, 232, 249, 0.34);
  background: rgba(15, 23, 42, 0.82);
  color: #fff;
}

.settings-panel__body {
  position: relative;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
  padding: 16px;
  overflow: auto;
  max-height: calc(min(78vh, 690px) - 112px);
}

.settings-section {
  border-radius: 18px;
  border: 1px solid rgba(148, 163, 184, 0.16);
  background:
    linear-gradient(180deg, rgba(30, 41, 59, 0.56), rgba(2, 6, 23, 0.44)),
    rgba(15, 23, 42, 0.34);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.045),
    0 12px 28px rgba(0, 0, 0, 0.18);
  padding: 16px;
}

.settings-section--wide {
  grid-column: 1 / -1;
}

.settings-section__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
  margin-bottom: 14px;
}

.settings-section__label {
  margin: 0;
  font-size: 13px;
  font-weight: 800;
  letter-spacing: 0.08em;
  color: rgba(241, 245, 249, 0.94);
}

.settings-section__hint {
  margin: 5px 0 0;
  font-size: 12px;
  line-height: 1.55;
  color: rgba(203, 213, 225, 0.64);
}

.settings-segment {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  padding: 5px;
  border-radius: 14px;
  border: 1px solid rgba(148, 163, 184, 0.14);
  background: rgba(2, 6, 23, 0.42);
}

.settings-segment__btn {
  min-height: 42px;
  border-radius: 11px;
  border: 1px solid transparent;
  background: transparent;
  color: rgba(203, 213, 225, 0.78);
  font-size: 13px;
  font-weight: 800;
  transition: background 160ms ease, border-color 160ms ease, color 160ms ease, box-shadow 160ms ease;
}

.settings-segment__btn:hover {
  color: #fff;
  background: rgba(148, 163, 184, 0.10);
}

.settings-segment__btn--active {
  color: white;
  border-color: rgba(103, 232, 249, 0.26);
  background: linear-gradient(135deg, rgba(6, 182, 212, 0.82), rgba(37, 99, 235, 0.68));
  box-shadow: 0 10px 22px rgba(14, 165, 233, 0.22);
}

.settings-segment__btn--violet {
  border-color: rgba(216, 180, 254, 0.26);
  background: linear-gradient(135deg, rgba(139, 92, 246, 0.82), rgba(219, 39, 119, 0.62));
  box-shadow: 0 10px 22px rgba(168, 85, 247, 0.20);
}

.settings-value-chip,
.settings-status-pill {
  flex: 0 0 auto;
  border-radius: 999px;
  border: 1px solid rgba(103, 232, 249, 0.24);
  background: rgba(8, 47, 73, 0.36);
  color: rgba(165, 243, 252, 0.96);
  padding: 6px 10px;
  font-size: 12px;
  font-weight: 900;
}

.settings-status-pill--ready {
  border-color: rgba(52, 211, 153, 0.26);
  background: rgba(6, 78, 59, 0.34);
  color: rgba(167, 243, 208, 0.96);
}

.settings-status-pill--running {
  border-color: rgba(34, 211, 238, 0.26);
}

.settings-slider {
  -webkit-appearance: none;
  appearance: none;
  width: 100%;
  height: 8px;
  border-radius: 999px;
  outline: none;
  cursor: pointer;
  background:
    linear-gradient(90deg, rgba(34, 211, 238, 0.78), rgba(99, 102, 241, 0.72)),
    rgba(15, 23, 42, 0.78);
  box-shadow: inset 0 0 0 1px rgba(148, 163, 184, 0.18);
}

.settings-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 18px;
  height: 18px;
  border-radius: 999px;
  border: 2px solid rgba(248, 250, 252, 0.95);
  background: #22d3ee;
  box-shadow: 0 0 18px rgba(34, 211, 238, 0.55);
}

.settings-slider::-moz-range-thumb {
  width: 18px;
  height: 18px;
  border-radius: 999px;
  border: 2px solid rgba(248, 250, 252, 0.95);
  background: #22d3ee;
  box-shadow: 0 0 18px rgba(34, 211, 238, 0.55);
}

.settings-scale {
  display: flex;
  justify-content: space-between;
  margin-top: 9px;
  font-size: 11px;
  color: rgba(148, 163, 184, 0.74);
}

.settings-primary-btn,
.settings-secondary-btn,
.settings-danger-btn {
  border-radius: 12px;
  min-height: 40px;
  font-size: 13px;
  font-weight: 850;
  transition: transform 160ms ease, background 160ms ease, border-color 160ms ease, box-shadow 160ms ease;
}

.settings-primary-btn {
  width: 100%;
  margin-top: 14px;
  color: white;
  border: 1px solid rgba(52, 211, 153, 0.26);
  background: linear-gradient(135deg, rgba(16, 185, 129, 0.88), rgba(20, 184, 166, 0.62));
  box-shadow: 0 12px 26px rgba(16, 185, 129, 0.18);
}

.settings-primary-btn:hover,
.settings-secondary-btn:hover,
.settings-danger-btn:hover {
  transform: translateY(-1px);
}

.settings-atlas-card {
  border-radius: 16px;
  border: 1px solid rgba(148, 163, 184, 0.14);
  background:
    linear-gradient(135deg, rgba(2, 6, 23, 0.66), rgba(15, 23, 42, 0.54)),
    radial-gradient(circle at 0% 0%, rgba(34, 211, 238, 0.09), transparent 38%);
  padding: 14px;
}

.settings-atlas-card__top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.settings-atlas-title {
  margin: 0;
  color: rgba(248, 250, 252, 0.96);
  font-size: 14px;
  font-weight: 850;
}

.settings-atlas-meta {
  margin: 6px 0 0;
  color: rgba(203, 213, 225, 0.68);
  font-size: 12px;
}

.settings-atlas-percent {
  min-width: 82px;
  text-align: right;
}

.settings-atlas-percent strong {
  display: block;
  color: rgba(248, 250, 252, 0.96);
  font-size: 18px;
  line-height: 1;
}

.settings-atlas-percent span {
  display: block;
  margin-top: 5px;
  color: rgba(148, 163, 184, 0.78);
  font-size: 11px;
}

.settings-progress {
  height: 9px;
  margin-top: 14px;
  overflow: hidden;
  border-radius: 999px;
  background: rgba(2, 6, 23, 0.74);
  box-shadow: inset 0 0 0 1px rgba(148, 163, 184, 0.13);
}

.settings-progress__bar {
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #34d399, #22d3ee, #60a5fa);
  box-shadow: 0 0 18px rgba(34, 211, 238, 0.46);
  transition: width 260ms ease;
}

.settings-error {
  margin: 10px 0 0;
  color: rgba(253, 164, 175, 0.95);
  font-size: 12px;
}

.settings-action-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin-top: 14px;
}

.settings-secondary-btn {
  color: rgba(226, 232, 240, 0.92);
  border: 1px solid rgba(148, 163, 184, 0.17);
  background: rgba(15, 23, 42, 0.62);
}

.settings-secondary-btn:hover {
  border-color: rgba(203, 213, 225, 0.28);
  background: rgba(30, 41, 59, 0.72);
}

.settings-secondary-btn:disabled {
  cursor: not-allowed;
  opacity: 0.48;
  transform: none;
}

.settings-secondary-btn--cyan {
  color: rgba(207, 250, 254, 0.96);
  border-color: rgba(34, 211, 238, 0.24);
  background: rgba(8, 145, 178, 0.14);
}

.settings-stat-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr)) minmax(150px, 0.72fr);
  gap: 10px;
}

.settings-stat-card {
  border-radius: 14px;
  border: 1px solid rgba(148, 163, 184, 0.14);
  background: rgba(2, 6, 23, 0.44);
  padding: 12px;
}

.settings-stat-card span {
  display: block;
  color: rgba(148, 163, 184, 0.78);
  font-size: 11px;
  margin-bottom: 4px;
}

.settings-stat-card strong {
  color: rgba(248, 250, 252, 0.96);
  font-size: 19px;
  line-height: 1;
}

.settings-danger-btn {
  color: rgba(255, 228, 230, 0.96);
  border: 1px solid rgba(251, 113, 133, 0.28);
  background: linear-gradient(135deg, rgba(190, 18, 60, 0.70), rgba(127, 29, 29, 0.56));
  box-shadow: 0 12px 24px rgba(244, 63, 94, 0.12);
}

@media (max-width: 760px) {
  .gear-menu.settings-panel {
    left: 12px;
    right: 12px;
    bottom: 76px;
    width: auto;
  }

  .settings-panel__body {
    grid-template-columns: 1fr;
  }

  .settings-stat-grid {
    grid-template-columns: 1fr;
  }
}

.recipe-entry-btn {
  border: 1px solid rgba(148, 163, 184, 0.18);
  background: linear-gradient(180deg, rgba(20, 24, 31, 0.90), rgba(13, 16, 22, 0.94));
  color: rgba(233, 241, 251, 0.95);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.04),
    0 10px 22px rgba(0, 0, 0, 0.22);
  backdrop-filter: blur(12px);
  transition: transform 180ms ease, border-color 180ms ease, box-shadow 180ms ease, color 180ms ease;
}

.recipe-entry-btn:hover {
  transform: translateY(-1px);
  border-color: rgba(191, 219, 254, 0.28);
  color: #ffffff;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.06),
    0 14px 28px rgba(0, 0, 0, 0.28);
}

.search-context-menu {
  background:
    linear-gradient(180deg, rgba(18, 22, 29, 0.96), rgba(11, 14, 20, 0.98));
  box-shadow:
    0 18px 36px rgba(0, 0, 0, 0.36),
    inset 0 1px 0 rgba(255, 255, 255, 0.05);
  backdrop-filter: blur(14px);
}

.search-context-action {
  color: rgba(229, 236, 245, 0.94);
  transition: background 160ms ease, color 160ms ease;
}

.search-context-action:hover {
  background: rgba(148, 163, 184, 0.14);
  color: #ffffff;
}

@keyframes scaleIn {
  from {
    opacity: 0;
    transform: scale(0.9) translateY(10px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

/* Bottom Search Bar */
.bottom-search-bar {
  background: transparent;
  border: none;
  border-radius: 0;
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
  box-shadow: none;
}

/* Mod Filter Panel */
.mod-filter-panel {
  background: rgba(10, 10, 20, 0.7);
  backdrop-filter: blur(10px);
}

.chrome-field {
  border: 1px solid rgba(157, 174, 197, 0.11);
  border-radius: 9px;
  background: linear-gradient(180deg, rgba(16, 19, 25, 0.8), rgba(12, 15, 20, 0.84));
  color: rgba(230, 237, 248, 0.95);
  backdrop-filter: blur(12px) saturate(104%);
  -webkit-backdrop-filter: blur(12px) saturate(104%);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.028),
    0 4px 12px rgba(0, 0, 0, 0.24);
  transition: border-color 180ms ease, box-shadow 180ms ease, background 180ms ease;
}

.chrome-field::placeholder {
  color: rgba(176, 188, 205, 0.48);
}

.chrome-field:focus {
  outline: none;
  border-color: rgba(188, 204, 226, 0.24);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.04),
    0 0 0 1px rgba(188, 204, 226, 0.12),
    0 4px 12px rgba(0, 0, 0, 0.24);
}

.chrome-select {
  appearance: none;
  -webkit-appearance: none;
  background-image:
    linear-gradient(45deg, transparent 50%, rgba(208, 219, 236, 0.64) 50%),
    linear-gradient(135deg, rgba(208, 219, 236, 0.64) 50%, transparent 50%);
  background-position:
    calc(100% - 16px) calc(50% - 2px),
    calc(100% - 11px) calc(50% - 2px);
  background-size: 4px 4px, 4px 4px;
  background-repeat: no-repeat;
  padding-right: 30px;
}

.chrome-select option {
  background: #0c1118;
  color: rgba(230, 237, 248, 0.95);
}

.chrome-search-input {
  letter-spacing: 0.1px;
}

.pager-btn {
  border: 1px solid rgba(145, 166, 191, 0.12);
  border-radius: 8px;
  background: linear-gradient(180deg, rgba(20, 24, 31, 0.84), rgba(13, 16, 22, 0.88));
  color: rgba(226, 235, 246, 0.94);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.022),
    0 3px 8px rgba(0, 0, 0, 0.22);
}

.pager-btn:hover {
  border-color: rgba(174, 194, 219, 0.2);
  background: linear-gradient(180deg, rgba(24, 30, 37, 0.88), rgba(17, 21, 28, 0.92));
}

.pager-indicator {
  border: 1px solid rgba(145, 166, 191, 0.1);
  border-radius: 8px;
  background: linear-gradient(180deg, rgba(20, 24, 31, 0.78), rgba(13, 16, 22, 0.84));
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.02);
}

.mini-pager-btn {
  border: 1px solid rgba(145, 166, 191, 0.11);
  border-radius: 7px;
  background: linear-gradient(180deg, rgba(22, 27, 35, 0.82), rgba(14, 18, 24, 0.86));
  color: rgba(224, 234, 245, 0.92);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.018);
  height: 30px;
  padding: 0 10px;
  font-size: 12px;
  cursor: pointer;
}

.mini-pager-btn:hover {
  border-color: rgba(174, 194, 219, 0.18);
  background: linear-gradient(180deg, rgba(26, 33, 41, 0.86), rgba(18, 22, 29, 0.9));
}

.expanded-group-filter-panel {
  pointer-events: auto;
}

.expanded-group-filter-row {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 360px;
  max-width: 520px;
  padding: 8px 9px;
  border: 1px solid rgba(125, 211, 252, 0.18);
  border-radius: 13px;
  background:
    radial-gradient(circle at 12% 20%, rgba(34, 211, 238, 0.16), transparent 36%),
    linear-gradient(135deg, rgba(8, 13, 20, 0.86), rgba(14, 19, 30, 0.72));
  box-shadow:
    0 14px 38px rgba(0, 0, 0, 0.34),
    inset 0 1px 0 rgba(255, 255, 255, 0.05);
  backdrop-filter: blur(14px) saturate(112%);
  -webkit-backdrop-filter: blur(14px) saturate(112%);
}

.expanded-group-filter-label {
  margin: 0;
  overflow: hidden;
  color: rgba(235, 245, 255, 0.94);
  font-size: 12px;
  font-weight: 700;
  line-height: 1.2;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.expanded-group-filter-meta {
  margin: 2px 0 0;
  overflow: hidden;
  color: rgba(148, 163, 184, 0.82);
  font-family: "JetBrains Mono", "SFMono-Regular", Consolas, monospace;
  font-size: 10px;
  line-height: 1.1;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.expanded-group-filter-input {
  width: 190px;
  flex: 0 0 auto;
  border: 1px solid rgba(148, 163, 184, 0.18);
  border-radius: 10px;
  background: rgba(2, 6, 14, 0.54);
  color: rgba(226, 232, 240, 0.94);
  font-size: 12px;
  line-height: 1;
  padding: 8px 10px;
  outline: none;
  transition: border-color 160ms ease, box-shadow 160ms ease, background 160ms ease;
}

.expanded-group-filter-input::placeholder {
  color: rgba(148, 163, 184, 0.56);
}

.expanded-group-filter-input:focus {
  border-color: rgba(34, 211, 238, 0.46);
  background: rgba(2, 8, 18, 0.72);
  box-shadow: 0 0 0 1px rgba(34, 211, 238, 0.14), 0 0 22px rgba(34, 211, 238, 0.12);
}

.expanded-group-filter-clear {
  align-self: flex-start;
  border: 1px solid rgba(148, 163, 184, 0.16);
  border-radius: 999px;
  background: rgba(2, 6, 14, 0.64);
  color: rgba(203, 213, 225, 0.86);
  cursor: pointer;
  font-size: 11px;
  padding: 5px 11px;
}

.expanded-group-filter-clear:hover {
  border-color: rgba(34, 211, 238, 0.28);
  color: rgba(224, 242, 254, 0.96);
}

/* Animate Scale In */
.animate-scale-in {
  animation: scaleIn 0.3s ease-out;
}

@media (min-width: 1600px) {
  .homepage-shell {
    --home-shell-width: min(2140px, 95vw);
    --home-center-width: clamp(460px, 29vw, 820px);
    --home-left-rail-width: clamp(620px, 33vw, 1080px);
    --home-right-width: clamp(580px, 38vw, 1360px);
  }
}

@media (min-width: 1920px) {
  .homepage-shell {
    --home-center-width: clamp(520px, 30vw, 900px);
    --home-center-left: clamp(250px, calc(50% - 18vw), 980px);
    --home-left-rail-width: clamp(720px, 32vw, 1240px);
    --home-right-width: clamp(700px, 39vw, 1500px);
  }
}

@media (min-width: 2560px) {
  .homepage-shell {
    --home-shell-width: min(2680px, 94vw);
    --home-center-width: clamp(620px, 30vw, 1080px);
    --home-center-left: clamp(320px, calc(50% - 18vw), 1220px);
    --home-left-rail-width: clamp(860px, 31vw, 1520px);
    --home-right-width: clamp(860px, 40vw, 1760px);
  }
}

@media (min-width: 3200px) {
  .homepage-shell {
    --home-shell-width: min(3200px, 92vw);
    --home-center-width: clamp(760px, 31vw, 1280px);
    --home-center-left: clamp(420px, calc(50% - 18vw), 1520px);
    --home-left-rail-width: clamp(1040px, 30vw, 1880px);
    --home-right-width: clamp(1120px, 41vw, 2160px);
  }
}
</style>
