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

const openRuntimeHealth = () => {
  showGearMenu.value = false;
  void router.push({ name: "runtime-health" });
};

// Item size settings with localStorage
const loadSavedItemSize = () => {
  const saved = localStorage.getItem("itemSize");
  return saved ? parseInt(saved, 10) : 50; // 默认50px
};
const itemSize = ref(loadSavedItemSize());
const showHiddenDebugItems = ref(localStorage.getItem("neonei:show-hidden-debug-items") === "true");
watch(showHiddenDebugItems, (enabled) => {
  localStorage.setItem("neonei:show-hidden-debug-items", enabled ? "true" : "false");
});

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
  includeHiddenItems: showHiddenDebugItems,
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

const expandedGroupFilterPanels = computed<BrowserVariantGroup[]>(() => {
  const seen = new Set<string>();
  return browserGridEntries.value
    .filter((entry) => entry.kind === "group-header")
    .map((entry) => (entry as { kind: "group-header"; group: BrowserVariantGroup }).group)
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

// Dashboard Clock & Cyber Diagnostics Simulation
const dashboardTime = ref("");
const coreTemp = ref(37.2);
const tempPath = ref("M0 30 Q10 20 20 28 T40 10 T60 22 T80 5 T100 15");
const radarRotate = ref(0);

const updateDashboardStats = () => {
  const now = new Date();
  dashboardTime.value = now.toLocaleTimeString("zh-CN", { hour12: false });
  const drift = (Math.random() - 0.5) * 0.15;
  coreTemp.value = Math.max(36.2, Math.min(39.5, Number((coreTemp.value + drift).toFixed(1))));
  const points = [];
  let currentY = 25;
  for (let i = 0; i <= 10; i++) {
    const x = i * 10;
    const y = Math.max(5, Math.min(35, Math.floor(currentY + (Math.random() - 0.5) * 12)));
    points.push(`${x} ${y}`);
    currentY = y;
  }
  tempPath.value = `M ${points.join(" L ")}`;
  radarRotate.value = (radarRotate.value + 6) % 360;
};

let dashboardIntervalTimer = null;

onMounted(() => {
  updateDashboardStats();
  dashboardIntervalTimer = window.setInterval(updateDashboardStats, 1000);
});

onBeforeUnmount(() => {
  if (dashboardIntervalTimer) {
    clearInterval(dashboardIntervalTimer);
  }
});

// === Settings Constellation Particle System ===
const settingsBgCanvas = ref(null);
const settingsUiRoot = ref(null);
let settingsAnimFrameId = 0;
let settingsResizeObs = null;

interface SettingsStar {
  x: number; y: number;
  vx: number; vy: number;
  radius: number;
  baseAlpha: number;
  phase: number;
  phaseSpeed: number;
}

const SETTINGS_STAR_COUNT = 28;
const SETTINGS_CONNECTION_DIST = 80;
let settingsStars: SettingsStar[] = [];
let settingsCW = 0;
let settingsCH = 0;

const initSettingsStars = () => {
  settingsStars = [];
  for (let i = 0; i < SETTINGS_STAR_COUNT; i++) {
    settingsStars.push({
      x: Math.random() * settingsCW,
      y: Math.random() * settingsCH,
      vx: (Math.random() - 0.5) * 0.15,
      vy: (Math.random() - 0.5) * 0.15,
      radius: 0.6 + Math.random() * 1.4,
      baseAlpha: 0.15 + Math.random() * 0.35,
      phase: Math.random() * Math.PI * 2,
      phaseSpeed: 0.002 + Math.random() * 0.006,
    });
  }
};

const drawSettingsConstellations = () => {
  const canvas = settingsBgCanvas.value;
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, settingsCW, settingsCH);
  const now = performance.now() * 0.001;

  for (const s of settingsStars) {
    s.phase += s.phaseSpeed;
    s.x += s.vx + Math.sin(s.phase) * 0.05;
    s.y += s.vy + Math.cos(s.phase * 0.7) * 0.04;

    if (s.x < -20) s.x = settingsCW + 20;
    if (s.x > settingsCW + 20) s.x = -20;
    if (s.y < -20) s.y = settingsCH + 20;
    if (s.y > settingsCH + 20) s.y = -20;
  }

  for (let i = 0; i < settingsStars.length; i++) {
    for (let j = i + 1; j < settingsStars.length; j++) {
      const a = settingsStars[i], b = settingsStars[j];
      const ddx = a.x - b.x, ddy = a.y - b.y;
      const d = Math.sqrt(ddx * ddx + ddy * ddy);
      if (d < SETTINGS_CONNECTION_DIST) {
        const alpha = (1 - d / SETTINGS_CONNECTION_DIST) * 0.15;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.strokeStyle = `rgba(148, 180, 220, ${alpha})`;
        ctx.lineWidth = 0.5;
        ctx.stroke();
      }
    }
  }

  for (const s of settingsStars) {
    const twinkle = s.baseAlpha + Math.sin(now * 1.5 + s.phase) * 0.08;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(180, 200, 230, ${twinkle})`;
    ctx.fill();
    if (s.radius > 1) {
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.radius * 2.5, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(148, 180, 220, ${twinkle * 0.12})`;
      ctx.fill();
    }
  }
  settingsAnimFrameId = requestAnimationFrame(drawSettingsConstellations);
};

const handleSettingsCanvasResize = () => {
  const el = settingsUiRoot.value;
  const canvas = settingsBgCanvas.value;
  if (!el || !canvas) return;
  const rect = el.getBoundingClientRect();
  const oldW = settingsCW;
  settingsCW = rect.width;
  settingsCH = rect.height;
  canvas.width = settingsCW;
  canvas.height = settingsCH;
  if (settingsStars.length === 0 || (oldW === 0 && settingsCW > 0)) initSettingsStars();
};

const startSettingsAnimation = () => {
  nextTick(() => {
    handleSettingsCanvasResize();
    if (!settingsResizeObs && settingsUiRoot.value) {
      settingsResizeObs = new ResizeObserver(handleSettingsCanvasResize);
      settingsResizeObs.observe(settingsUiRoot.value);
    }
    cancelAnimationFrame(settingsAnimFrameId);
    settingsAnimFrameId = requestAnimationFrame(drawSettingsConstellations);
  });
};

const stopSettingsAnimation = () => {
  cancelAnimationFrame(settingsAnimFrameId);
  if (settingsResizeObs) {
    settingsResizeObs.disconnect();
    settingsResizeObs = null;
  }
};

watch(showGearMenu, (newVal) => {
  if (newVal) {
    startSettingsAnimation();
  } else {
    stopSettingsAnimation();
  }
});

onBeforeUnmount(() => {
  stopSettingsAnimation();
});
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

    <!-- Settings Button -->
    <div class="fixed bottom-3 left-6 z-50">
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
          <path d="M19.43 12.98c.04-.32.07-.65.07-.98s-.02-.66-.07-.98l2.1-1.64-2-3.46-2.47 1a7.2 7.2 0 0 0-1.7-.98L15 3.28h-4l-.36 2.66c-.6.23-1.17.56-1.7.98l-2.47-1-2 3.46 2.1 1.64c-.04.32-.07.65-.07.98s-.02.66.07.98l-2.1 1.64 2 3.46 2.47-1c.53.42 1.1.75 1.7.98L11 20.72h4l.36-2.66c.6-.23 1.17-.56 1.7-.98l2.47 1 2-3.46-2.1-1.64Z" />
        </svg>
      </button>
    </div>

    <!-- Centered Modal Settings Container -->
    <Transition name="settings-modal-fade">
      <div
        v-if="showGearMenu"
        class="settings-modal-overlay fixed inset-0 z-[200] flex items-center justify-center p-4 md:p-6"
      >
        <!-- Scrim / Backdrop -->
        <div
          class="settings-panel-scrim absolute inset-0"
          aria-hidden="true"
          @click="showGearMenu = false"
          @contextmenu.prevent
        />

        <!-- Settings Dialog -->
        <section
          ref="settingsUiRoot"
          class="gear-menu settings-panel relative z-[201] overflow-hidden"
          role="dialog"
          aria-modal="true"
          aria-label="NeoNEI 设置中心"
          @click.stop
          @contextmenu.prevent
        >
          <!-- Star Galaxy background layers (Crafting Table / Furnace style) -->
          <div class="matte-backdrop" aria-hidden="true" />
          <canvas ref="settingsBgCanvas" class="constellation-canvas" aria-hidden="true" />
          <div class="ambient-field" aria-hidden="true">
            <span class="ambient-orb ambient-orb-a" />
            <span class="ambient-orb ambient-orb-b" />
            <span class="ambient-orb ambient-orb-c" />
          </div>
          <div class="volumetric-rays" aria-hidden="true">
            <span class="light-ray ray-1" />
            <span class="light-ray ray-2" />
            <span class="light-ray ray-3" />
            <span class="light-ray ray-4" />
          </div>

          <!-- Close Button -->
          <button
            class="settings-close-btn absolute top-5 right-5 flex items-center justify-center w-8 h-8 rounded-lg text-slate-400 hover:text-white transition-all duration-200 z-[202]"
            type="button"
            aria-label="关闭设置中心"
            @click="showGearMenu = false"
          >
            <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>

          <!-- Minimalist Content Area -->
          <div class="settings-panel__content p-8 md:p-10 relative z-10">
            <!-- Header Block -->
            <header class="settings-header border-b border-white/5 pb-5 mb-6 flex justify-between items-end">
              <div>
                <span class="settings-kicker block text-[9px] font-mono tracking-[0.25em] text-cyan-400/80 uppercase">NEONEI SYSTEM CONFIG</span>
                <h2 class="settings-title text-xl font-light text-slate-100 tracking-wide mt-1">控制与设置</h2>
              </div>
              <span class="font-mono text-[9px] text-slate-500 uppercase tracking-widest">v2.1 / DECK</span>
            </header>

            <!-- Flat Rows Settings List -->
            <div class="settings-rows flex flex-col divide-y divide-white/5">
              
              <!-- Row 01: Workspace View -->
              <div class="settings-row py-5 grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
                <div class="md:col-span-6">
                  <div class="flex items-center gap-2.5">
                    <span class="font-mono text-[9px] text-cyan-400/70 border border-cyan-400/20 px-1.5 py-0.5 rounded bg-cyan-950/10">01</span>
                    <h3 class="text-sm font-medium text-slate-200">工作区视图</h3>
                  </div>
                  <p class="text-xs text-slate-450 mt-1 leading-relaxed max-w-md">切换主页渲染核心以编辑配方或查找样板管理项。</p>
                </div>
                <div class="md:col-span-6 flex justify-end">
                  <div class="settings-segment flex bg-white/[0.02] border border-white/5 p-1 rounded-lg w-full max-w-[260px]">
                    <button
                      type="button"
                      @click="
                        currentView = 'items';
                        showGearMenu = false;
                      "
                      :class="['settings-segment__btn flex-1 py-1.5 px-3 text-xs rounded transition-all duration-300 flex items-center justify-center gap-1.5', currentView === 'items' ? 'settings-segment__btn--active' : 'settings-segment__btn--inactive']"
                    >
                      <span class="btn-indicator w-1 h-1 rounded-full" />
                      物品浏览
                    </button>
                    <button
                      type="button"
                      @click="
                        currentView = 'patterns';
                        showGearMenu = false;
                      "
                      :class="['settings-segment__btn flex-1 py-1.5 px-3 text-xs rounded transition-all duration-300 flex items-center justify-center gap-1.5', currentView === 'patterns' ? 'settings-segment__btn--active settings-segment__btn--violet' : 'settings-segment__btn--inactive']"
                    >
                      <span class="btn-indicator w-1 h-1 rounded-full" />
                      样板管理
                    </button>
                  </div>
                </div>
              </div>

              <!-- Row 02: Grid Icon Size Density -->
              <div class="settings-row py-5 grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
                <div class="md:col-span-6">
                  <div class="flex items-center gap-2.5">
                    <span class="font-mono text-[9px] text-cyan-400/70 border border-cyan-400/20 px-1.5 py-0.5 rounded bg-cyan-950/10">02</span>
                    <h3 class="text-sm font-medium text-slate-200">网格图标大小</h3>
                  </div>
                  <p class="text-xs text-slate-450 mt-1 leading-relaxed max-w-md">动态调整主页网格和历史记录的渲染边长。</p>
                </div>
                <div class="md:col-span-6 flex flex-col sm:flex-row items-center gap-6 justify-end w-full">
                  <div class="flex-1 w-full max-w-[240px]">
                    <div class="flex justify-between items-center mb-1">
                      <span class="text-[9px] font-mono text-slate-500 uppercase">GRID SCALE</span>
                      <span class="text-xs font-mono text-cyan-450">{{ itemSize }}px</span>
                    </div>
                    <input
                      v-model.number="itemSize"
                      type="range"
                      min="24"
                      max="128"
                      step="4"
                      class="settings-slider w-full h-0.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-cyan-400"
                      aria-label="网格图标大小"
                    />
                    <div class="flex justify-between text-[8px] text-slate-600 font-mono mt-1">
                      <span>Compact</span>
                      <span>Standard</span>
                      <span>Large</span>
                    </div>
                  </div>
                  
                  <div class="flex items-center gap-4">
                    <!-- Minimal Slot Preview -->
                    <div class="w-10 h-10 flex items-center justify-center relative overflow-hidden bg-white/[0.01] border border-white/5 rounded-lg" aria-hidden="true">
                      <div
                        class="preview-nebula-orb rounded-full"
                        :style="{ width: Math.min(22, itemSize / 4.5) + 'px', height: Math.min(22, itemSize / 4.5) + 'px' }"
                      />
                    </div>
                    <button type="button" @click="saveSettings" class="settings-primary-btn text-xs font-medium rounded-lg bg-cyan-500 hover:bg-cyan-450 text-slate-950 px-4 py-2 shadow-sm transition-all duration-200">
                      保存配置
                    </button>
                  </div>
                </div>
              </div>

              <!-- Row 03: WebGL Texture Atlas Cache -->
              <div class="settings-row py-5 grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
                <div class="md:col-span-6">
                  <div class="flex items-center gap-2.5">
                    <span class="font-mono text-[9px] text-cyan-400/70 border border-cyan-400/20 px-1.5 py-0.5 rounded bg-cyan-950/10">03</span>
                    <h3 class="text-sm font-medium text-slate-200">WebGL 图集预温</h3>
                  </div>
                  <p class="text-xs text-slate-455 mt-1 leading-relaxed max-w-md">预先合并图集缓存，消除物品翻页时的图像闪烁白块。</p>
                </div>
                <div class="md:col-span-6 flex justify-end w-full">
                  <div class="bg-white/[0.01] border border-white/5 p-4 rounded-xl w-full max-w-[380px] flex flex-col gap-3">
                    <div class="flex justify-between items-center">
                      <span class="text-[10px] text-slate-450 font-mono leading-none">{{ atlasResidentStatus }}</span>
                      <span
                        class="text-[9px] font-mono px-2 py-0.5 rounded border leading-none"
                        :class="atlasResidentProgressTotal > 0 && atlasResidentProgressCurrent >= atlasResidentProgressTotal
                          ? 'bg-emerald-500/5 border-emerald-500/20 text-emerald-400'
                          : 'bg-amber-500/5 border-amber-500/20 text-amber-400 animate-pulse'"
                      >
                        {{ atlasResidentRunning ? "WARMING" : "READY" }}
                      </span>
                    </div>
                    
                    <div class="flex items-center gap-3">
                      <div class="flex-1 h-0.5 bg-white/10 rounded-full overflow-hidden">
                        <div
                          class="h-full bg-cyan-450 transition-all duration-300"
                          :style="{ width: atlasResidentPercent + '%' }"
                        />
                      </div>
                      <span class="text-xs font-mono text-cyan-400 w-8 text-right leading-none">{{ atlasResidentPercent }}%</span>
                    </div>
                    
                    <div class="flex justify-between items-center text-[10px] text-slate-500 font-mono mt-0.5 leading-none">
                      <span>已载入: {{ atlasResidentItemCount.toLocaleString() }} 项</span>
                      <div class="flex gap-2.5">
                        <button type="button" @click="warmResidentAtlas" :disabled="atlasResidentRunning" class="text-cyan-400 hover:text-cyan-300 disabled:opacity-40">重载图集</button>
                        <span class="text-slate-700">|</span>
                        <button type="button" @click="refreshAtlasResidentState" class="text-slate-400 hover:text-slate-350">校验状态</button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Row 04: Maintenance & Diagnostics -->
              <div class="settings-row py-5 grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
                <div class="md:col-span-6">
                  <div class="flex items-center gap-2.5">
                    <span class="font-mono text-[9px] text-cyan-400/70 border border-cyan-400/20 px-1.5 py-0.5 rounded bg-cyan-950/10">04</span>
                    <h3 class="text-sm font-medium text-slate-200">系统诊断维护</h3>
                  </div>
                  <p class="text-xs text-slate-455 mt-1 leading-relaxed max-w-md">核心数据契约监控与重置本地历史浏览轨迹缓存。</p>
                </div>
                <div class="md:col-span-6 flex justify-end w-full">
                  <div class="bg-white/[0.01] border border-white/5 p-4 rounded-xl w-full max-w-[380px] flex items-center justify-between">
                    <div class="flex flex-col">
                      <span class="text-[9px] font-mono text-slate-500 uppercase leading-none">DATABASE / HISTORY</span>
                      <span class="text-xs font-mono text-slate-300 mt-1 leading-none">DB: {{ totalItems.toLocaleString() }} / Cache: {{ viewHistory.length.toLocaleString() }}</span>
                    </div>
                    <div class="flex gap-2">
                      <button type="button" @click="openRuntimeHealth" class="settings-secondary-btn px-3 py-1.5 text-xs rounded-lg border border-white/5 text-slate-350 hover:text-slate-200 hover:bg-white/5 transition-all duration-200">健康面板</button>
                      <button type="button" @click="clearViewHistory" class="settings-danger-btn px-3 py-1.5 text-xs rounded-lg border border-rose-500/10 text-rose-400 hover:bg-rose-500/10 transition-all duration-200">清除轨迹</button>
                    </div>
                  </div>
                </div>
              </div>

            </div>

          </div>
        </section>
      </div>
    </Transition>
  </div>
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

/* Centered Settings Modal Overlay */
.settings-modal-overlay {
  background: rgba(3, 5, 12, 0.72);
  backdrop-filter: blur(16px) saturate(1.2);
  -webkit-backdrop-filter: blur(16px) saturate(1.2);
}

.settings-panel-scrim {
  position: absolute;
  inset: 0;
  cursor: pointer;
}

/* Modal Fade Transitions */
.settings-modal-fade-enter-active,
.settings-modal-fade-leave-active {
  transition: opacity 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

.settings-modal-fade-enter-active .settings-panel,
.settings-modal-fade-leave-active .settings-panel {
  transition: transform 0.35s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

.settings-modal-fade-enter-from,
.settings-modal-fade-leave-to {
  opacity: 0;
}

.settings-modal-fade-enter-from .settings-panel,
.settings-modal-fade-leave-to .settings-panel {
  transform: scale(0.95) translateY(12px);
  opacity: 0;
}

/* Settings Panel (Premium Galaxy Workbench Style) */
.gear-menu.settings-panel {
  width: 90vw;
  max-width: 820px;
  background: 
    radial-gradient(ellipse at 50% 50%, rgba(20, 28, 42, 0.48) 0%, rgba(10, 14, 20, 0.52) 45%, rgba(6, 8, 12, 0.6) 100%),
    linear-gradient(180deg, rgba(13, 18, 28, 0.75), rgba(8, 10, 16, 0.85));
  border: 1px solid rgba(148, 163, 184, 0.08);
  border-radius: 20px;
  box-shadow: 
    inset 0 1px 0 rgba(255, 255, 255, 0.04),
    0 24px 64px rgba(0, 0, 0, 0.55);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  display: flex;
  flex-direction: column;
}

/* Custom Scrollbar */
.gear-menu.settings-panel::-webkit-scrollbar {
  width: 4px;
}
.gear-menu.settings-panel::-webkit-scrollbar-track {
  background: rgba(0, 0, 0, 0.1);
}
.gear-menu.settings-panel::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.08);
  border-radius: 2px;
}
.gear-menu.settings-panel::-webkit-scrollbar-thumb:hover {
  background: rgba(0, 255, 247, 0.25);
}

/* Star Galaxy background layers (Crafting Table / Furnace style) */
.matte-backdrop {
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background:
    radial-gradient(circle at 50% 50%, rgba(59, 130, 246, 0.02) 0%, transparent 45%),
    linear-gradient(180deg, rgba(10, 15, 22, 0.25), rgba(8, 12, 18, 0.42));
  pointer-events: none;
  z-index: 1;
}

.matte-backdrop::before {
  content: '';
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(rgba(148, 163, 184, 0.025) 1px, transparent 1px),
    linear-gradient(90deg, rgba(148, 163, 184, 0.025) 1px, transparent 1px);
  background-size: 28px 28px;
  opacity: 0.35;
  mask-image: radial-gradient(ellipse at center, black 16%, transparent 72%);
  -webkit-mask-image: radial-gradient(ellipse at center, black 16%, transparent 72%);
  pointer-events: none;
}

.constellation-canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 2;
}

.ambient-field {
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
  z-index: 1;
}

.ambient-orb {
  position: absolute;
  display: block;
  pointer-events: none;
  border-radius: 50%;
  opacity: 0.24;
  will-change: transform, opacity;
  animation: settingsAmbientDrift 14s ease-in-out infinite alternate;
}

.ambient-orb-a {
  top: 15%; left: 10%;
  width: 220px; height: 220px;
  background: radial-gradient(circle, rgba(96, 165, 250, 0.06) 0%, transparent 55%);
}

.ambient-orb-b {
  right: 15%; bottom: 15%;
  width: 200px; height: 200px;
  background: radial-gradient(circle, rgba(245, 158, 11, 0.05) 0%, transparent 55%);
  animation-delay: -4s;
}

.ambient-orb-c {
  top: 40%; left: 45%;
  width: 160px; height: 160px;
  background: radial-gradient(circle, rgba(148, 163, 184, 0.04) 0%, transparent 55%);
  animation-delay: -8s;
}

.volumetric-rays {
  position: absolute;
  top: 50%; left: 50%;
  transform: translate(-50%, -50%);
  width: 100%; height: 100%;
  pointer-events: none;
  z-index: 2;
}

.light-ray {
  position: absolute;
  top: 50%; left: 50%;
  width: 4px;
  height: 160px;
  transform-origin: center bottom;
  background: linear-gradient(0deg, rgba(245, 158, 11, 0.03), transparent 85%);
  opacity: 0;
  will-change: opacity;
}

.ray-1 {
  transform: translate(-50%, -100%) rotate(-25deg);
  animation: settings-ray-pulse-1 8s ease-in-out infinite;
  animation-delay: 0s;
}
.ray-2 {
  transform: translate(-50%, -100%) rotate(12deg);
  animation: settings-ray-pulse-2 8s ease-in-out infinite;
  animation-delay: 2s;
  height: 120px;
}
.ray-3 {
  transform: translate(-50%, -100%) rotate(-8deg);
  animation: settings-ray-pulse-3 8s ease-in-out infinite;
  animation-delay: 4.5s;
  height: 140px;
}
.ray-4 {
  transform: translate(-50%, -100%) rotate(30deg);
  animation: settings-ray-pulse-4 8s ease-in-out infinite;
  animation-delay: 6s;
  height: 100px;
}

@keyframes settingsAmbientDrift {
  0% { transform: translate(0, 0) scale(1); opacity: 0.24; }
  50% { transform: translate(5%, 7%) scale(1.05); opacity: 0.32; }
  100% { transform: translate(-4%, -5%) scale(0.97); opacity: 0.24; }
}

@keyframes settings-ray-pulse-1 {
  0%, 100% { opacity: 0; transform: translate(-50%, -100%) scaleY(0.85) rotate(-25deg); }
  50% { opacity: 0.22; transform: translate(-50%, -100%) scaleY(1.1) rotate(-25deg); }
}
@keyframes settings-ray-pulse-2 {
  0%, 100% { opacity: 0; transform: translate(-50%, -100%) scaleY(0.85) rotate(12deg); }
  50% { opacity: 0.22; transform: translate(-50%, -100%) scaleY(1.1) rotate(12deg); }
}
@keyframes settings-ray-pulse-3 {
  0%, 100% { opacity: 0; transform: translate(-50%, -100%) scaleY(0.85) rotate(-8deg); }
  50% { opacity: 0.22; transform: translate(-50%, -100%) scaleY(1.1) rotate(-8deg); }
}
@keyframes settings-ray-pulse-4 {
  0%, 100% { opacity: 0; transform: translate(-50%, -100%) scaleY(0.85) rotate(30deg); }
  50% { opacity: 0.22; transform: translate(-50%, -100%) scaleY(1.1) rotate(30deg); }
}

/* Close Button */
.settings-close-btn {
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(255, 255, 255, 0.04);
  color: rgba(255, 255, 255, 0.4);
}
.settings-close-btn:hover {
  background: rgba(255, 255, 255, 0.05);
  border-color: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.9);
}

/* Header Text / Kicker */
.settings-kicker {
  font-family: 'Space Mono', 'Fira Code', monospace;
  text-shadow: 0 0 8px rgba(0, 255, 247, 0.25);
}
.settings-title {
  font-family: 'Outfit', 'Inter', sans-serif;
  letter-spacing: -0.01em;
}

/* Settings Segment Buttons (Premium segmented pill styling) */
.settings-segment__btn {
  font-family: 'Inter', sans-serif;
}

.settings-segment__btn--active {
  background: rgba(255, 255, 255, 0.04);
  border-color: rgba(255, 255, 255, 0.06);
  color: rgba(255, 255, 255, 0.9);
  box-shadow: 0 1px 2px rgba(0,0,0,0.15);
}

.settings-segment__btn--active .btn-indicator {
  background-color: #00fff7;
  box-shadow: 0 0 6px #00fff7;
}

.settings-segment__btn--violet.settings-segment__btn--active {
  color: rgba(255, 255, 255, 0.9);
}

.settings-segment__btn--violet.settings-segment__btn--active .btn-indicator {
  background-color: #d946ef;
  box-shadow: 0 0 6px #d946ef;
}

.settings-segment__btn--inactive {
  background: transparent;
  border-color: transparent;
  color: rgba(255, 255, 255, 0.35);
}

.settings-segment__btn--inactive:hover {
  color: rgba(255, 255, 255, 0.65);
}

.settings-segment__btn--inactive .btn-indicator {
  background-color: transparent;
}

/* Settings Slider Range Styling */
.settings-slider {
  background: rgba(255, 255, 255, 0.06);
  border: none;
}

.settings-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: #cbd5e1;
  border: 1px solid #0f172a;
  transition: transform 0.1s ease, background-color 0.1s ease;
}

.settings-slider::-webkit-slider-thumb:hover {
  transform: scale(1.2);
  background-color: #00fff7;
}

/* Preview Nebula Orb (glowing star style inside slot) */
.preview-nebula-orb {
  background: radial-gradient(circle, #00fff7 0%, rgba(59, 130, 246, 0.6) 45%, transparent 75%);
  filter: drop-shadow(0 0 8px rgba(0, 255, 247, 0.45));
  animation: pulse-star 3s ease-in-out infinite;
}

@keyframes pulse-star {
  0%, 100% {
    transform: scale(0.95);
    opacity: 0.85;
  }
  50% {
    transform: scale(1.05);
    opacity: 1;
  }
}

/* Button & Card utilities inside panels */
.settings-secondary-btn {
  border: 1px solid rgba(255, 255, 255, 0.05);
  background: rgba(255, 255, 255, 0.02);
  color: rgba(255, 255, 255, 0.65);
  transition: all 0.2s ease;
}

.settings-secondary-btn:hover {
  background: rgba(255, 255, 255, 0.05);
  border-color: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.9);
}

.settings-danger-btn {
  border: 1px solid rgba(244, 63, 94, 0.12);
  background: rgba(244, 63, 94, 0.02);
  color: #f43f5e;
  transition: all 0.2s ease;
}

.settings-danger-btn:hover {
  background: rgba(244, 63, 94, 0.08);
  border-color: rgba(244, 63, 94, 0.25);
  color: #fda4af;
}

.settings-primary-btn {
  background: #cbd5e1;
  color: #0f172a;
}
.settings-primary-btn:hover {
  background: #00fff7;
  color: #080a10;
  box-shadow: 0 0 12px rgba(0, 255, 247, 0.3);
}

/* Row-style Flat List items */
.settings-row {
  border-color: rgba(255, 255, 255, 0.04);
}
.settings-row:first-child {
  border-top: none;
}
.settings-row:last-child {
  border-bottom: none;
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
