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
  type BrowserVariantGroup,
  type Item,
} from "../services/api";
import HomeSettingsPanel from "../components/home/HomeSettingsPanel.vue";
import HomeHistoryStrip from "../components/home/HomeHistoryStrip.vue";
import HomeBrowserColumn from "../components/home/HomeBrowserColumn.vue";
import HomeRecipeDock from "../components/home/HomeRecipeDock.vue";
import { useItemBrowser } from "../composables/useItemBrowser";
import { useHomeBrowserNavigation } from "../composables/home/useHomeBrowserNavigation";
import { useHomeHistory } from "../composables/home/useHomeHistory";
import { useHomeGridViewport, useHomeRailStyles } from "../composables/home/useHomeLayout";
import { useHomeRecipePresentation } from "../composables/home/useHomeRecipePresentation";
import { useHomeSettingsState } from "../composables/home/useHomeSettingsState";
import { useSound } from "../services/sound.service";
import { useRecipeViewer } from "../composables/useRecipeViewer";

const router = useRouter();

const PatternGroup = defineAsyncComponent(
  () => import("../components/PatternGroup.vue"),
);

// View mode
const currentView = ref<"items" | "patterns">("items");

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

const {
  showGearMenu,
  atlasResidentRunning,
  atlasResidentProgressCurrent,
  atlasResidentProgressTotal,
  atlasResidentItemCount,
  atlasResidentStatus,
  atlasResidentPercent,
  openRuntimeHealth,
  refreshAtlasResidentState,
  warmResidentAtlas,
  saveSettings,
} = useHomeSettingsState(itemSize, router);

const {
  itemGridViewportRef,
  setItemGridViewportRef,
  setGridViewportSync,
  measureGridCapacityRaw,
  measureVisibleGridCapacity,
} = useHomeGridViewport(itemSize);

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
let transitionOverlayTimer: number | null = null;
const TRANSITION_OVERLAY_DELAY_MS = 140;
const currentGroupId = ref<string | undefined>(undefined);
const currentGroupName = ref<string>('');
const latestCreatedPatternId = ref<string | undefined>(undefined);
const showTransitionOverlay = ref(false);

const expandedBrowserGroups = ref<Set<string>>(new Set());
const showSearchContextMenu = ref(false);
const searchContextMenuPosition = ref({ x: 0, y: 0 });

const {
  viewHistory,
  historyAtlas,
  historyRows,
  historyGridGap,
  historyItemPixelSize,
  historyBrowserEntries,
  setHistoryPanelRef,
  updateHistoryPanelWidth,
  addToHistory,
  clearViewHistory,
} = useHomeHistory(itemSize);

onMounted(() => {
  updateHistoryPanelWidth();
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
  window.removeEventListener("pointerdown", handleGlobalPointerDown, true);
  window.removeEventListener("scroll", closeSearchContextMenu, true);
  window.removeEventListener("keydown", handleGlobalKeydown);
  itemGridResizeObserver?.disconnect();
  itemGridResizeObserver = null;
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

const { changeItemsPageWrapped, handleItemsWheel } = useHomeBrowserNavigation({
  currentView,
  currentPage,
  totalPages,
  searchQuery,
  changePage,
  prefetchItemsPage,
});

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

const {
  currentRecipePresentation,
  isRecipeModalWorkbenchCanvas,
  isRecipeModalWideCanvas,
  isRecipeModalFurnaceCanvas,
  recipeModalScaleToFit,
  recipeStageIsStateView,
  recipePreviewNeedsWideStage,
  recipeStageKey,
} = useHomeRecipePresentation({
  currentPageRecipes,
  currentCategory,
  recipeModalLoading,
  recipeModalError,
  recipeModalMode,
});

const {
  centerRailStyle,
  leftRailStyle,
  itemColumnStyle,
  recipeDockStyle,
} = useHomeRailStyles(recipePreviewNeedsWideStage);

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

const syncMeasuredPageSize = () => {
  if (
    currentView.value !== "items"
    || loading.value
    || items.value.length === 0
    || currentPageAtlas.value === undefined
  ) return;
  const measured = measureVisibleGridCapacity(pageSize);
  if (!measured || measured === pageSize.value || Math.abs(measured - pageSize.value) < 8) return;
  setPageSize(measured);
};
setGridViewportSync(syncMeasuredPageSize);


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
        <HomeRecipeDock
          :visible="showRecipeModal"
          :needs-wide-stage="recipePreviewNeedsWideStage"
          :dock-style="recipeDockStyle"
          :machine-categories="machineCategories"
          v-model:selected-machine-index="selectedMachineIndex"
          :current-category="currentCategory"
          :total-recipe-pages="totalRecipePages"
          :recipe-modal-page="recipeModalPage"
          :recipe-stage-is-state-view="recipeStageIsStateView"
          :recipe-modal-loading="recipeModalLoading"
          :recipe-modal-error="recipeModalError"
          :is-recipe-modal-furnace-canvas="isRecipeModalFurnaceCanvas"
          :current-page-recipes="currentPageRecipes"
          :recipe-modal-scale-to-fit="recipeModalScaleToFit"
          @select-machine="selectMachine"
          @prev-recipe-page="prevRecipePage"
          @next-recipe-page="nextRecipePage"
          @recipe-wheel="handleRecipeWheel"
          @contextmenu="handleRecipePreviewContextMenu"
          @retry="openCurrentRecipeMode"
          @close="showRecipeModal = false"
          @item-click="handleRecipeItemClick"
        />

        <HomeBrowserColumn
          :item-column-style="itemColumnStyle"
          :total-pages="totalPages"
          :current-page="currentPage"
          :item-size="itemSize"
          :loading="loading"
          :items="items"
          :load-error="loadError"
          :item-grid-empty-subtitle="itemGridEmptySubtitle"
          :browser-grid-entries="browserGridEntries"
          :current-page-atlas="currentPageAtlas"
          :expanded-group-filter-panels="expandedGroupFilterPanels"
          :expanded-group-facet-filters="expandedGroupFacetFilters"
          :has-expanded-group-facet-filters="hasExpandedGroupFacetFilters"
          :show-transition-overlay="showTransitionOverlay"
          @items-wheel="handleItemsWheel"
          @page-change="changeItemsPageWrapped"
          @reload="loadItems"
          @reset-filters="resetItemFilters"
          @item-click="openCraftingRecipes"
          @item-contextmenu="handleCardContextMenu"
          @group-click="handleBrowserGroupClick"
          @group-contextmenu="handleBrowserGroupContextMenu"
          @expanded-group-facet-input="handleExpandedGroupFacetInput"
          @clear-expanded-group-facet-filters="clearExpandedGroupFacetFilters"
          @grid-viewport-resize="setItemGridViewportRef"
        >
          <template #history>
            <HomeHistoryStrip
              :view-history-count="viewHistory.length"
              :history-item-pixel-size="historyItemPixelSize"
              :history-rows="historyRows"
              :history-grid-gap="historyGridGap"
              :history-browser-entries="historyBrowserEntries"
              :history-atlas="historyAtlas"
              @panel-resize="setHistoryPanelRef"
              @item-click="openCraftingRecipes"
              @item-contextmenu="handleCardContextMenu"
            />
          </template>
        </HomeBrowserColumn>
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

    <HomeSettingsPanel
      v-model="showGearMenu"
      v-model:current-view="currentView"
      v-model:item-size="itemSize"
      :atlas-resident-status="atlasResidentStatus"
      :atlas-resident-running="atlasResidentRunning"
      :atlas-resident-progress-total="atlasResidentProgressTotal"
      :atlas-resident-progress-current="atlasResidentProgressCurrent"
      :atlas-resident-percent="atlasResidentPercent"
      :atlas-resident-item-count="atlasResidentItemCount"
      :total-items="totalItems"
      :history-count="viewHistory.length"
      @save-settings="saveSettings"
      @warm-resident-atlas="warmResidentAtlas"
      @refresh-atlas-resident-state="refreshAtlasResidentState"
      @open-runtime-health="openRuntimeHealth"
      @clear-history="clearViewHistory"
    />
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
