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
import HomeSettingsPanel from "../components/home/HomeSettingsPanel.vue";
import HomeHistoryStrip from "../components/home/HomeHistoryStrip.vue";
import HomeBrowserColumn from "../components/home/HomeBrowserColumn.vue";
import HomeRecipeDock from "../components/home/HomeRecipeDock.vue";
import { useItemBrowser } from "../composables/useItemBrowser";
import { useHomeBrowserGroups } from "../composables/home/useHomeBrowserGroups";
import { useHomeBrowserNavigation } from "../composables/home/useHomeBrowserNavigation";
import { useHomeHistory } from "../composables/home/useHomeHistory";
import { useHomeGridViewport, useHomeRailStyles } from "../composables/home/useHomeLayout";
import { useHomeRecipeModal } from "../composables/home/useHomeRecipeModal";
import { useHomeSearchContextMenu } from "../composables/home/useHomeSearchContextMenu";
import { useHomeSettingsState } from "../composables/home/useHomeSettingsState";
import { useSound } from "../services/sound.service";
import { isControlPlaneDisabled } from "../runtime/runtimeMode";
import "../styles/homePage.css";

const router = useRouter();

const PatternGroup = defineAsyncComponent(
  () => import("../components/PatternGroup.vue"),
);

// View mode
const currentView = ref<"items" | "patterns">("items");
const patternControlEnabled = computed(() => !isControlPlaneDisabled());

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
  expandedGroupKeys,
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
  applyNativeProjectionPageMetrics,
} = useItemBrowser(itemSize, {
  measureVisiblePageCapacity: () => measureGridCapacityRaw(),
  includeHiddenItems: showHiddenDebugItems,
});
let itemGridResizeObserver: ResizeObserver | null = null;
let transitionOverlayTimer: number | null = null;
const TRANSITION_OVERLAY_DELAY_MS = 140;
const currentGroupId = ref<string | undefined>(undefined);
const latestCreatedPatternId = ref<string | undefined>(undefined);
const showTransitionOverlay = ref(false);

const {
  viewHistory,
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
  if (view === "patterns" && !patternControlEnabled.value) {
    currentView.value = "items";
    return;
  }
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

const openRecipeEntry = () => {
  void router.push({ name: 'recipe' });
};

const {
  showSearchContextMenu,
  searchContextMenuPosition,
  handleSearchContextMenu,
  closeSearchContextMenu,
  clearSearchQuery,
  handleGlobalPointerDown,
  handleGlobalKeydown,
} = useHomeSearchContextMenu({
  searchQuery,
  currentPage,
  loadItems,
});

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
const { playClick } = useSound();
const {
  showRecipeModal,
  recipeModalLoading,
  selectedMachineIndex,
  recipeModalPage,
  machineCategories,
  currentCategory,
  currentPageRecipes,
  totalRecipePages,
  recipeModalError,
  isRecipeModalFurnaceCanvas,
  recipeModalScaleToFit,
  recipeStageIsStateView,
  recipePreviewNeedsWideStage,
  selectMachine,
  openCurrentRecipeMode,
  openCraftingRecipes,
  openUsageRecipes,
  handleCardContextMenu,
  nextRecipePage,
  prevRecipePage,
  handleRecipeWheel,
  handleRecipeItemClick,
  recipeModalItem,
} = useHomeRecipeModal({
  items,
  router,
  playClick,
  addToHistory,
});

const {
  centerRailStyle,
  leftRailStyle,
  itemColumnStyle,
  recipeDockStyle,
} = useHomeRailStyles(recipePreviewNeedsWideStage);

const {
  expandedGroupFilterPanels,
  hasBrowserGroups,
  allBrowserGroupsExpanded,
  groupToggleBusy,
  hasExpandedGroupFacetFilters,
  handleExpandedGroupFacetInput,
  handleBrowserGroupClick,
  handleBrowserGroupContextMenu,
  toggleAllGroups,
} = useHomeBrowserGroups({
  browserGridEntries,
  expandedGroupKeys,
  expandedGroupFacetFilters,
  searchQuery,
  selectedMod,
  includeHiddenItems: showHiddenDebugItems,
  setExpandedGroups,
  setExpandedGroupFacetFilter,
  openUsageRecipes,
});

// Handle pattern group selection
const onSelectGroup = (groupId: string) => {
  currentGroupId.value = groupId;
};

const syncMeasuredPageSize = () => {
  if (
    currentView.value !== "items"
    || loading.value
    || items.value.length === 0
  ) return;
  const measured = measureVisibleGridCapacity(pageSize);
  if (!measured || measured === pageSize.value || Math.abs(measured - pageSize.value) < 8) return;
  setPageSize(measured);
};
setGridViewportSync(syncMeasuredPageSize);


</script>

<template>
  <div class="homepage-shell h-screen overflow-hidden flex">
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
          :search-query="searchQuery"
          :selected-mod="selectedMod"
          :loading="loading"
          :items="items"
          :load-error="loadError"
          :item-grid-empty-subtitle="itemGridEmptySubtitle"
          :expanded-group-keys="expandedGroupKeys"
          :expanded-group-filter-panels="expandedGroupFilterPanels"
          :expanded-group-facet-filters="expandedGroupFacetFilters"
          :has-expanded-group-facet-filters="hasExpandedGroupFacetFilters"
          :has-browser-groups="hasBrowserGroups"
          :all-browser-groups-expanded="allBrowserGroupsExpanded"
          :group-toggle-busy="groupToggleBusy"
          :show-transition-overlay="showTransitionOverlay"
          :selected-item-id="recipeModalItem?.itemId ?? null"
          @items-wheel="handleItemsWheel"
          @page-change="changeItemsPageWrapped"
          @reload="loadItems"
          @reset-filters="resetItemFilters"
          @item-click="openCraftingRecipes"
          @item-contextmenu="handleCardContextMenu"
          @group-click="handleBrowserGroupClick"
          @group-contextmenu="handleBrowserGroupContextMenu"
          @runtime-projection-update="applyNativeProjectionPageMetrics"
          @expanded-group-facet-input="handleExpandedGroupFacetInput"
          @clear-expanded-group-facet-filters="clearExpandedGroupFacetFilters"
          @grid-viewport-resize="setItemGridViewportRef"
          @toggle-all-groups="toggleAllGroups"
          @open-recipe="openRecipeEntry"
        >
          <template #history>
            <HomeHistoryStrip
              :view-history-count="viewHistory.length"
              :history-item-pixel-size="historyItemPixelSize"
              :history-rows="historyRows"
              :history-grid-gap="historyGridGap"
              :history-browser-entries="historyBrowserEntries"
              @panel-resize="setHistoryPanelRef"
              @item-click="openCraftingRecipes"
              @item-contextmenu="handleCardContextMenu"
            />
          </template>
        </HomeBrowserColumn>
      </div>

      <!-- Patterns View -->
      <div
        v-if="currentView === 'patterns' && patternControlEnabled"
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
      :pattern-control-enabled="patternControlEnabled"
      @save-settings="saveSettings"
      @warm-resident-atlas="warmResidentAtlas"
      @refresh-atlas-resident-state="refreshAtlasResidentState"
      @open-runtime-health="openRuntimeHealth"
      @clear-history="clearViewHistory"
    />
  </div>
</template>
