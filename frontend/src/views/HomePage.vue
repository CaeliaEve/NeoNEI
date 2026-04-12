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
  getItemImageUrlFromEntity,
  getPreferredStaticImageUrlFromEntity,
  type Item,
} from "../services/api";
import { buildPageAtlas, primePageAtlas, type PageAtlasResult } from "../services/pageAtlas";
import ItemTooltip from "../components/ItemTooltip.vue";
import { useItemBrowser } from "../composables/useItemBrowser";
import { useSound } from "../services/sound.service";
import { useRecipeViewer } from "../composables/useRecipeViewer";
import { resolveRecipePresentationProfile } from "../services/uiTypeMapping";

type ItemBasicInfo = Pick<Item, "itemId" | "localizedName" | "modId" | "internalName" | "damage" | "imageFileName" | "renderAssetRef" | "preferredImageUrl">;

const router = useRouter();

const PatternGroup = defineAsyncComponent(
  () => import("../components/PatternGroup.vue"),
);
const ItemCard = defineAsyncComponent(() => import("../components/ItemCard.vue"));
const RecipeDisplayRouter = defineAsyncComponent(
  () => import("../components/RecipeDisplayRouter.vue"),
);
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

// Animation speed settings with localStorage
const loadSavedAnimationSpeed = () => {
  const saved = localStorage.getItem("animationSpeed");
  return saved ? parseInt(saved, 10) : 20; // 默认20 FPS
};
const animationSpeed = ref(loadSavedAnimationSpeed());

const {

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
} = useItemBrowser(itemSize);
const currentGroupId = ref<string | undefined>(undefined);
const currentGroupName = ref<string>('');
const latestCreatedPatternId = ref<string | undefined>(undefined);

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
const prefetchedHomeImages = new Set<string>();
const HOME_GRID_ANIMATION_DELAY_MS = 6000;
const HOME_HISTORY_ANIMATION_DELAY_MS = 8000;
const currentPageAtlas = ref<PageAtlasResult | null>(null);
const historyAtlas = ref<PageAtlasResult | null>(null);

const prefetchImageUrl = (url: string) => {
  if (!url || prefetchedHomeImages.has(url)) return;
  prefetchedHomeImages.add(url);
  const img = new Image();
  img.decoding = "async";
  img.loading = "eager";
  img.src = url;
};

const resolveHomepageImageUrl = (item: ItemBasicInfo) => {
  return item.preferredImageUrl || getPreferredStaticImageUrlFromEntity(item);
};

const prewarmVisibleItemImages = () => {
  const visibleItems = items.value.slice(0, Math.min(items.value.length, pageSize.value));
  const urls = visibleItems
    .map((entry) => resolveHomepageImageUrl(entry))
    .filter(Boolean)
    .slice(0, Math.max(pageSize.value, 120));

  const run = () => {
    for (const url of urls) {
      prefetchImageUrl(url);
    }
  };

  if (typeof window !== "undefined" && "requestIdleCallback" in window) {
    (window as Window & { requestIdleCallback: (cb: () => void, opts?: { timeout: number }) => number })
      .requestIdleCallback(run, { timeout: 800 });
    return;
  }

  setTimeout(run, 0);
};

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

onMounted(() => {
  updateHistoryPanelWidth();
  window.addEventListener("resize", updateHistoryPanelWidth);
});

onBeforeUnmount(() => {
  window.removeEventListener("resize", updateHistoryPanelWidth);
});

watch(currentView, async (view) => {
  if (view === "items") {
    await nextTick();
    updateHistoryPanelWidth();
  }
});

watch(
  () => items.value.map((item) => item.itemId).join("|"),
  () => {
    if (currentView.value === "items" && items.value.length > 0) {
      prewarmVisibleItemImages();
      void buildPageAtlas(items.value, itemSize.value).then((atlas) => {
        currentPageAtlas.value = atlas;
      });
    }
  },
);

watch(
  () => [currentPage.value, totalPages.value, currentView.value] as const,
  ([page, total, view]) => {
    if (view !== "items") return;
    void prefetchItemsPage(page + 1);
    if (page > 1) {
      void prefetchItemsPage(page - 1);
    }
    if (page + 2 <= total) {
      void prefetchItemsPage(page + 2);
    }

    const neighborPages = [page - 1, page + 1, page + 2].filter((value) => value >= 1 && value <= total);
    for (const neighborPage of neighborPages) {
      const cached = getCachedItemsPage(neighborPage);
      if (cached?.data?.length) {
        void primePageAtlas(cached.data, itemSize.value);
      }
    }
  },
  { immediate: true },
);

watch(
  () => viewHistory.value.slice(0, historyVisibleCount.value).map((item) => item.itemId).join("|"),
  () => {
    const visibleHistoryItems = viewHistory.value.slice(0, historyVisibleCount.value) as Item[];
    if (visibleHistoryItems.length === 0) {
      historyAtlas.value = null;
      return;
    }
    void buildPageAtlas(visibleHistoryItems, historyItemPixelSize.value).then((atlas) => {
      historyAtlas.value = atlas;
    });
  },
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

const handleSearchContextMenu = (event: MouseEvent) => {
  event.preventDefault();
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

const recipeModalScaleToFit = computed(() => {
  const surface = currentRecipePresentation.value?.uiConfig.presentation?.surface;
  const density = currentRecipePresentation.value?.uiConfig.presentation?.density;
  const family = currentRecipePresentation.value?.uiConfig.presentation?.family;
  if (surface === 'ritual' || surface === 'research') return false;
  if (density === 'oversized') return false;
  if (family === 'thaumcraft' || family === 'blood_magic' || family === 'multiblock') return false;
  return true;
});

const recipePreviewNeedsWideStage = computed(() => !recipeModalScaleToFit.value);

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

// Computed: Calculate grid cell size based on item size
const gridCellSize = computed(() => {
  return `${itemSize.value + 4}px`; // itemSize + gap-1 (4px)
});

// Save settings to localStorage
const saveSettings = () => {
  localStorage.setItem("itemSize", itemSize.value.toString());
  localStorage.setItem("animationSpeed", animationSpeed.value.toString());

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
  <div class="homepage-shell min-h-screen flex">
    <!-- Mod Filter Panel (Fixed Top, offset to have left 18% and right 12%) -->
    <div
      class="mod-filter-anchor fixed top-0 z-40 pt-0 pb-2 px-2"
      :style="centerRailStyle"
    >
      <div v-if="currentView === 'items'" class="flex flex-col gap-2">
        <select
          v-model="selectedMod"
          @change="
            currentPage = 1;
            loadItems();
          "
          :disabled="modsLoading || !!modsLoadError"
          class="w-full px-3 py-2 text-sm text-center rounded-lg chrome-field chrome-select disabled:opacity-60 disabled:cursor-not-allowed"
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
          :class="['recipe-preview-panel absolute flex flex-col overflow-hidden surface-glass border border-slate-300/50 rounded-xl shadow-lg', { 'wide-stage': recipePreviewNeedsWideStage }]"
          :style="recipeDockStyle"
        >
          <!-- Recipe Content (no scroll, compact) -->
          <div class="flex-1 flex flex-col p-2 gap-2 min-h-0 overflow-hidden">
            <!-- Machine Type Icons (compact) -->
            <MachineTypeIcons
              :categories="machineCategories"
              v-model="selectedMachineIndex"
              @select="selectMachine"
            />

            <!-- Machine Name -->
            <div
              class="text-center py-1 px-2 surface-glass rounded border border-blue-400/30"
            >
              <span
                class="text-xs font-bold text-blue-500"
                style="text-shadow: 0 0 20px rgba(191, 0, 255, 0.5)"
              >
                {{ currentCategory?.name || "未知分类" }}
              </span>
            </div>

            <!-- Pagination (compact) -->
            <div
              v-if="totalRecipePages > 1"
              class="flex items-center justify-center gap-1 py-0.5"
            >
              <button
                @click="prevRecipePage"
                :disabled="totalRecipePages <= 1"
                class="px-1.5 py-0.5 text-[10px] mini-pager-btn disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                title="上一页"
                aria-label="上一页"
              >
                ◀
              </button>
              <span class="text-slate-200 text-[10px]">
                {{ recipeModalPage + 1 }}/{{ totalRecipePages }}
              </span>
              <button
                @click="nextRecipePage"
                :disabled="totalRecipePages <= 1"
                class="px-1.5 py-0.5 text-[10px] mini-pager-btn disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                title="下一页"
                aria-label="下一页"
              >
                ▶
              </button>
            </div>

            <!-- Recipe Display (scaled to fit, flex-1 to fill remaining space) -->
            <div
              class="surface-glass rounded border border-slate-200/60 flex-1 flex items-center justify-center recipe-display-container p-2 min-h-0"
              @wheel="handleRecipeWheel"
            >
                <div class="recipe-stage-slot">
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
                  <RecipeDisplayRouter
                    v-else-if="currentPageRecipes.length > 0"
                    :recipe="currentPageRecipes[0]"
                    @item-click="handleRecipeItemClick"
                    :scale-to-fit="recipeModalScaleToFit"
                  />
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
        >
          <!-- Top Pagination Control -->
          <div
            v-if="totalPages > 1"
            class="pagination-top py-1 px-2"
          >
            <div class="flex items-center justify-between gap-1">
              <!-- 上一页按钮 - 最左侧 -->
              <button
                @click="changePage(currentPage - 1)"
                :disabled="currentPage === 1"
                class="pager-btn rounded disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0 flex items-center justify-center transition-colors"
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
                @click="changePage(currentPage + 1)"
                :disabled="currentPage === totalPages"
                class="pager-btn rounded disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0 flex items-center justify-center transition-colors"
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
            <div v-if="loading" class="state-panel list-state-panel">
              <div class="state-spinner"></div>
              <p class="state-title">加载数据中...</p>
              <p class="state-subtitle">正在同步物品列表，请稍候。</p>
            </div>

            <div v-else-if="loadError" class="state-panel list-state-panel state-panel-error">
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

            <div
              v-else
              class="grid gap-1 w-full p-4 flex-1 min-h-0 overflow-y-auto"
              :style="{
                gridTemplateColumns: `repeat(auto-fill, ${gridCellSize})`,
              }"
            >
                <ItemTooltip
                  v-for="(item, pageIndex) in items"
                  :key="item.itemId"
                  :item="item"
                  @click="openCraftingRecipes(item)"
                  @contextmenu="handleCardContextMenu"
                >
                  <ItemCard
                    :item="item"
                    :itemSize="itemSize"
                    :enableAnimation="false"
                    :animationSpeed="animationSpeed"
                    :eager="pageIndex < 10"
                    :deferAnimationMs="HOME_GRID_ANIMATION_DELAY_MS"
                    :atlas-sprite="currentPageAtlas?.entries[item.itemId] || null"
                    @click="openCraftingRecipes(item)"
                    @contextmenu="handleCardContextMenu"
                  />
                </ItemTooltip>
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
                class="grid gap-1 overflow-hidden content-start"
                :style="{
                  gridTemplateColumns: `repeat(${historyColumns}, ${historyGridCellSize}px)`,
                  gridTemplateRows: `repeat(${historyRows}, ${historyItemPixelSize}px)`,
                }"
              >
                <ItemTooltip
                  v-for="(historyItem, historyIndex) in viewHistory.slice(0, historyVisibleCount)"
                  :key="historyItem.itemId"
                  :item="historyItem"
                  @click="openCraftingRecipes(historyItem)"
                  @contextmenu="handleCardContextMenu"
                >
                  <ItemCard
                    :item="historyItem"
                    :itemSize="historyItemPixelSize"
                    :enableAnimation="false"
                    :animationSpeed="animationSpeed"
                    :eager="historyIndex < 8"
                    :deferAnimationMs="HOME_HISTORY_ANIMATION_DELAY_MS"
                    :atlas-sprite="historyAtlas?.entries[historyItem.itemId] || null"
                    @click="openCraftingRecipes(historyItem)"
                  @contextmenu="handleCardContextMenu"
                  />
                </ItemTooltip>
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
        class="search-anchor bottom-search-bar fixed bottom-0 z-40 pt-2 pb-0 px-2"
        :style="centerRailStyle"
      >
        <input
          v-model="searchQuery"
          @input="onSearch"
          @contextmenu="handleSearchContextMenu"
          type="text"
          class="w-full px-3 py-2 text-sm rounded-lg chrome-field chrome-search-input"
        />
      </div>
    </main>

    <!-- Gear Button (Fixed Bottom-Left, Outside Main) -->
    <div class="fixed bottom-6 left-6 z-50">
      <div class="relative">
        <button
          @click="showGearMenu = !showGearMenu"
          class="gear-btn w-14 h-14 rounded-xl flex items-center justify-center text-3xl transition-all duration-300"
          :class="
            showGearMenu
              ? 'bg-gradient-to-r from-pink-500 to-rose-500 text-white shadow-lg shadow-pink-500/50'
              : 'surface-glass text-slate-200 hover:bg-white/10 border border-slate-200/40'
          "
          title="设置菜单"
          aria-label="设置菜单"
        >
          ⚙
        </button>

        <!-- Gear Menu Dropdown -->
        <div
          v-if="showGearMenu"
          class="gear-menu absolute bottom-full left-0 mb-3 w-72 surface-glass rounded-xl border border-slate-300/50 shadow-lg overflow-hidden animate-scale-in"
        >
          <!-- View Toggle -->
          <div class="p-4 border-b border-slate-200/40">
            <p class="text-slate-200/60 text-xs uppercase tracking-wider mb-3">
              视图切换
            </p>
            <div class="flex gap-2">
              <button
                @click="
                  currentView = 'items';
                  showGearMenu = false;
                "
                :class="[
                  'flex-1 py-2.5 px-3 rounded-lg font-semibold text-sm transition-all duration-300',
                  currentView === 'items'
                    ? 'bg-gradient-to-r from-cyan-500 to-blue-500 text-white shadow-lg'
                    : 'surface-glass text-slate-200 hover:bg-white/10 border border-slate-200/40',
                ]"
              >
                物品浏览
              </button>
              <button
                @click="
                  currentView = 'patterns';
                  showGearMenu = false;
                "
                :class="[
                  'flex-1 py-2.5 px-3 rounded-lg font-semibold text-sm transition-all duration-300',
                  currentView === 'patterns'
                    ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-lg'
                    : 'surface-glass text-slate-200 hover:bg-white/10 border border-slate-200/40',
                ]"
              >
                模板管理
              </button>
            </div>
          </div>

          <!-- Item Size Slider -->
          <div class="p-4 border-b border-slate-200/40">
            <p class="text-slate-200/60 text-xs uppercase tracking-wider mb-3">
              物品大小
            </p>
            <input
              v-model.number="itemSize"
              type="range"
              min="24"
              max="128"
              step="4"
              class="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer slider-modern"
            />
            <div
              class="flex items-center justify-between text-xs text-slate-200/70 mt-2"
            >
              <span>小</span>
              <span class="text-slate-200 font-bold">{{ itemSize }}px</span>
              <span>大</span>
            </div>
          </div>

          <!-- Animation Speed Slider -->
          <div class="p-4 border-b border-slate-200/40">
            <p class="text-slate-200/60 text-xs uppercase tracking-wider mb-3">
              动画速度
            </p>
            <input
              v-model.number="animationSpeed"
              type="range"
              min="1"
              max="60"
              step="1"
              class="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer slider-modern"
            />
            <div
              class="flex items-center justify-between text-xs text-slate-200/70 mt-2"
            >
              <span>1 FPS</span>
              <span class="text-slate-200 font-bold"
                >{{ animationSpeed }} FPS</span
              >
              <span>60 FPS</span>
            </div>
            <button
              @click="saveSettings"
              class="save-settings-btn w-full mt-4 py-2.5 px-4 rounded-lg bg-green-500 hover:bg-green-600 text-white font-bold text-sm transition-colors shadow-sm"
            >
              保存设置
            </button>
          </div>

          <!-- Stats & Actions -->
          <div class="p-4">
            <p class="text-slate-200/60 text-xs uppercase tracking-wider mb-3">
              统计与操作
            </p>
            <div class="bg-slate-100 rounded-lg py-3 px-4 mb-3 border border-slate-200">
              <p class="text-slate-600 text-xs">物品总数</p>
              <p class="text-xl font-bold text-slate-900">
                {{ totalItems.toLocaleString() }}
              </p>
            </div>
            <button
              @click="clearViewHistory"
              class="w-full py-2.5 px-4 rounded-lg bg-red-500 hover:bg-red-600 text-white font-bold text-sm transition-colors shadow-sm"
            >
              清除历史记录
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Items Grid - 使用 flex 布局确保不产生滚动条 */
.items-grid-container {
  overflow: hidden !important;
}

.homepage-shell {
  --home-shell-width: min(1880px, var(--app-shell-max-width, 96vw));
  --home-center-width: clamp(420px, 30vw, 760px);
  --home-center-left: clamp(180px, calc(50% - 18vw), 860px);
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

.recipe-stage-slot {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
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
  max-width: 460px;
}

.list-state-panel {
  flex: 1;
  margin: 12px;
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
  backdrop-filter: blur(10px);
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);
}

.gear-btn:hover {
  transform: rotate(45deg) scale(1.1);
  box-shadow: 0 0 20px rgba(0, 255, 247, 0.5);
}

/* Gear Menu */
.gear-menu {
  backdrop-filter: blur(20px);
  animation: scaleIn 0.2s ease-out;
  width: clamp(290px, 22vw, 420px);
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

/* Animate Scale In */
.animate-scale-in {
  animation: scaleIn 0.3s ease-out;
}

@media (min-width: 1600px) {
  .homepage-shell {
    --home-shell-width: min(2140px, 95vw);
    --home-center-width: clamp(460px, 29vw, 820px);
    --home-right-width: clamp(580px, 38vw, 1360px);
  }
}

@media (min-width: 1920px) {
  .homepage-shell {
    --home-center-width: clamp(520px, 30vw, 900px);
    --home-center-left: clamp(250px, calc(50% - 18vw), 980px);
    --home-right-width: clamp(700px, 39vw, 1500px);
  }
}

@media (min-width: 2560px) {
  .homepage-shell {
    --home-shell-width: min(2680px, 94vw);
    --home-center-width: clamp(620px, 30vw, 1080px);
    --home-center-left: clamp(320px, calc(50% - 18vw), 1220px);
    --home-right-width: clamp(860px, 40vw, 1760px);
  }
}

@media (min-width: 3200px) {
  .homepage-shell {
    --home-shell-width: min(3200px, 92vw);
    --home-center-width: clamp(760px, 31vw, 1280px);
    --home-center-left: clamp(420px, calc(50% - 18vw), 1520px);
    --home-right-width: clamp(1120px, 41vw, 2160px);
  }
}
</style>
