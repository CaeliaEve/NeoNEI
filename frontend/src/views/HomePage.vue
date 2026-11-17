<script setup lang="ts">
import { t, language } from "../i18n/index.ts";


import {
  ref,
  computed,
  onMounted,
  onBeforeUnmount,
  watch,
  nextTick,
} from "vue";
import { isNavigationFailure, NavigationFailureType, useRoute, useRouter, type RouteLocationRaw } from "vue-router";
import HomeSettingsPanel from "../components/home/HomeSettingsPanel.vue";
import HomeHistoryStrip from "../components/home/HomeHistoryStrip.vue";
import HomeBrowserColumn from "../components/home/HomeBrowserColumn.vue";
import SiteHeader from '../components/SiteHeader.vue';
import { useCatalog } from '../state/catalog.ts';
import { catalogSession } from '../state/catalog-session.ts';
import { prepareResident, disposeResident, residentStatus } from '../browser/resident.ts';
import { itemLocation, readRecipeIntent, snapshotQuery } from '../router/workspace.ts';
import { ApiError } from '../catalog/transport.ts';
import { errorMessage } from '../i18n/errors.ts';
import type { Item } from '../services/api';
import { useItemBrowser } from "../composables/useItemBrowser";
import { useHomeBrowserGroups } from "../composables/home/useHomeBrowserGroups";
import { useHomeBrowserNavigation } from "../composables/home/useHomeBrowserNavigation";
import { useHomeHistory } from "../composables/home/useHomeHistory";
import { useHomeGridViewport, useHomeRailStyles } from "../composables/home/useHomeLayout";
import { useHomeSearchContextMenu } from "../composables/home/useHomeSearchContextMenu";
import { useHomeSettingsState } from "../composables/home/useHomeSettingsState";
import { useHomePanelResize } from "../composables/home/useHomePanelResize";
import { useSound } from "../services/sound.service";
import { isHomeItemSize } from '../state/personal-backup.ts';
import "../styles/homePage.css";

const router = useRouter(), route = useRoute();
const snapshot = computed(() => typeof route.query.catalog === 'string' ? route.query.catalog : '');
const { catalog, offline, opening: catalogOpening, error: catalogError, open: openCatalog } = useCatalog(snapshot);
const recipeIntent = computed(() => route.name === 'home' ? readRecipeIntent(route.query) : null);
const presentationStatus = ref<'idle' | 'checking' | 'presentationUnavailable' | 'invalidTarget' | 'failed'>('idle');
const presentationError = ref('');
const presentationSequence = ref(0);
let presentationRequest: AbortController | null = null;
async function acknowledgeRecipeIntent() {
  presentationRequest?.abort();
  const request = new AbortController();
  presentationRequest = request;
  const intent = recipeIntent.value, source = catalog.value;
  presentationError.value = '';
  presentationSequence.value++;
  if (!intent) { presentationStatus.value = 'idle'; return; }
  if (intent.kind === 'invalid') { presentationStatus.value = 'invalidTarget'; return; }
  if (intent.kind === 'entry') { presentationStatus.value = 'presentationUnavailable'; return; }
  presentationStatus.value = 'checking';
  if (!source) {
    if (catalogError.value) { presentationStatus.value = 'failed'; presentationError.value = catalogError.value; }
    return;
  }
  try {
    await source.record(intent.kind === 'recipe' ? 'recipes' : intent.kind === 'fluid' ? 'fluids' : 'items', intent.id, request.signal);
    if (!request.signal.aborted && source === catalog.value && intent === recipeIntent.value) {
      presentationStatus.value = 'presentationUnavailable';
    }
  } catch (error) {
    if (request.signal.aborted || source !== catalog.value || intent !== recipeIntent.value) return;
    if (error instanceof ApiError && error.code === 'record_missing') presentationStatus.value = 'invalidTarget';
    else {
      presentationStatus.value = 'failed';
      presentationError.value = errorMessage(error, '无法确认配方入口，请重试。');
    }
  }
}
watch([catalog, recipeIntent, catalogError], () => { void acknowledgeRecipeIntent(); }, { immediate: true });
const presentationMessage = computed(() => {
  if (presentationStatus.value === 'checking') return t('正在确认目标…');
  if (presentationStatus.value === 'invalidTarget') return t('此目标不在当前数据快照中，或链接无效。');
  if (presentationStatus.value === 'failed') return presentationError.value;
  return recipeIntent.value?.direction === 'uses' ? t('用途展示尚未接入。') : t('配方展示尚未接入。');
});
const currentView = ref<'items'>('items');
const showBrowser = ref(true);
const narrowMedia = window.matchMedia('(max-width: 700px)');
const workspaceView = computed(() => recipeIntent.value ? 'recipe-intent' : route.name);
const narrowScreen = ref(narrowMedia.matches), mobileBrowserOpen = ref(workspaceView.value === 'home');
function updateNarrowScreen() {
  if (narrowMedia.matches && !narrowScreen.value) mobileBrowserOpen.value = workspaceView.value === 'home';
  narrowScreen.value = narrowMedia.matches;
}
function toggleBrowser() { if (narrowScreen.value) mobileBrowserOpen.value = !mobileBrowserOpen.value; else showBrowser.value = !showBrowser.value; }
watch(workspaceView, name => { if (narrowScreen.value) mobileBrowserOpen.value = name === 'home'; });
const selectedItemId = computed(() => {
  const intent = recipeIntent.value;
  return intent && (intent.kind === 'item' || intent.kind === 'fluid') ? intent.id : null;
});
// Item size settings with localStorage
const loadSavedItemSize = () => {
  try {
    const saved = Number(localStorage.getItem("itemSize"));
    return isHomeItemSize(saved) ? saved : 50;
  } catch { return 50; }
};
const itemSize = ref(loadSavedItemSize());
const {
  browserWidth, historyHeight, bounds: panelSizeBounds, shellStyle, resizing: panelResizing,
  storageError: panelStorageError, setBrowserColumnRef, startResize, resizeWidth, resizeHeight,
  saveLayout, resetWidth, resetHeight,
  resizeEnabled: panelResizeEnabled, setResizeEnabled,
} = useHomePanelResize(itemSize);
const showHiddenDebugItems = ref(localStorage.getItem("neonei:show-hidden-debug-items") === "true");
watch(showHiddenDebugItems, (enabled) => {
  localStorage.setItem("neonei:show-hidden-debug-items", enabled ? "true" : "false");
});

const {
  showGearMenu,
  settingsSaveStatus,
  settingsSaveError,
  saveSettings,
} = useHomeSettingsState(itemSize);

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
  loadedPage,
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
  invalidateCatalog,
  loadItems,
  onSearch,
  warmSearchIndex,
  changePage,
  prefetchItemsPage,
  applyNativeProjectionPageMetrics,
  browserPageRevision,
} = useItemBrowser(itemSize, {
  measureVisiblePageCapacity: () => measureGridCapacityRaw(),
  includeHiddenItems: showHiddenDebugItems,
});
let itemGridResizeObserver: ResizeObserver | null = null;
let observedItemGridViewport: HTMLElement | null = null;
let transitionOverlayTimer: number | null = null;
const TRANSITION_OVERLAY_DELAY_MS = 140;
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
} = useHomeHistory(itemSize, historyHeight);

onMounted(() => {
  narrowMedia.addEventListener('change', updateNarrowScreen);
  updateHistoryPanelWidth();
  window.addEventListener("pointerdown", handleGlobalPointerDown, true);
  window.addEventListener("scroll", closeSearchContextMenu, true);
  window.addEventListener("keydown", handleGlobalKeydown);
  itemGridResizeObserver = new ResizeObserver(() => {
    syncMeasuredPageSize();
  });
});

onBeforeUnmount(() => {
  presentationRequest?.abort();
  narrowMedia.removeEventListener('change', updateNarrowScreen);
  catalogSession.close();
  disposeResident();
  window.removeEventListener("pointerdown", handleGlobalPointerDown, true);
  window.removeEventListener("scroll", closeSearchContextMenu, true);
  window.removeEventListener("keydown", handleGlobalKeydown);
  itemGridResizeObserver?.disconnect();
  itemGridResizeObserver = null;
  observedItemGridViewport = null;
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

const observeItemGridViewport = () => {
  const viewport = itemGridViewportRef.value;
  if (!viewport || !itemGridResizeObserver) return;
  if (observedItemGridViewport !== viewport) {
    itemGridResizeObserver.disconnect();
    itemGridResizeObserver.observe(viewport);
    observedItemGridViewport = viewport;
  }
  syncMeasuredPageSize();
};

watch(
  () => [
    browserPageRevision.value,
    currentPage.value,
    pageSize.value,
  ].join("::"),
  async () => {
    if (currentView.value !== "items" || items.value.length === 0) {
      return;
    }

    await nextTick();
    observeItemGridViewport();
  },
);

const itemGridEmptySubtitle = computed(() => {
  if (searchQuery.value.trim()) {
    return t("请尝试缩短关键词，或清空搜索后查看全部物品。");
  }
  if (selectedMod.value !== 'all') {
    return t("当前模组筛选下没有匹配物品，可重置筛选后重试。");
  }
  return t("当前页暂无可显示物品，可刷新后重试。");
});

const resetItemFilters = () => {
  searchQuery.value = '';
  selectedMod.value = 'all';
  currentPage.value = 1;
  void loadItems();
};

const openRecipeEntry = () => {
  navigateRecipeIntent({ name: 'home', query: { ...snapshotQuery(route.query), presentation: 'recipe', direction: 'recipes' } });
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

const { playClick } = useSound();
function navigateRecipeIntent(location: RouteLocationRaw) {
  void router.push(location).then(failure => {
    if (isNavigationFailure(failure, NavigationFailureType.duplicated)) void acknowledgeRecipeIntent();
  });
}
function openCraftingRecipes(item: Item) { playClick(); addToHistory(item); navigateRecipeIntent(itemLocation(item.itemId, route.query)); }
function openUsageRecipes(item: Item) { playClick(); addToHistory(item); navigateRecipeIntent(itemLocation(item.itemId, route.query, 'usedIn')); }
function handleCardContextMenu(item: Item, event?: MouseEvent) { event?.preventDefault(); event?.stopPropagation(); openUsageRecipes(item); }
const { leftRailStyle, itemColumnStyle } = useHomeRailStyles(computed(() => false));
watch(() => route.query.settings, value => { showGearMenu.value = value === '1'; }, { immediate: true });
watch(showGearMenu, value => {
  if (!value && route.query.settings === '1') { const query = { ...route.query }; delete query.settings; void router.replace({ query }); }
});
let lastCatalogId = '', catalogNeedsReload = false;
watch(catalog, async value => {
  if (!value) {
    if (lastCatalogId) { invalidateCatalog(); disposeResident(); catalogNeedsReload = true; }
    return;
  }
  const reload = catalogNeedsReload || (lastCatalogId && lastCatalogId !== value.manifest.id);
  lastCatalogId = value.manifest.id; catalogNeedsReload = false;
  if (!reload) return;
  await prepareResident(value.manifest.id,value).catch(() => {});
  if (catalog.value !== value) return;
  await loadMods(); await loadItems();
});
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

const syncMeasuredPageSize = () => {
  if (
    currentView.value !== "items"
    || loading.value
    || items.value.length === 0
    || panelResizing.value
  ) return;
  const measured = measureVisibleGridCapacity();
  if (!measured || measured === pageSize.value) return;
  setPageSize(measured);
};
setGridViewportSync(syncMeasuredPageSize);
const finishPanelResize = async () => {
  saveLayout();
  await nextTick();
  syncMeasuredPageSize();
};


</script>

<template>
  <div class="homepage-shell h-screen overflow-hidden flex" :style="shellStyle" :class="{'homepage-shell--resizing': panelResizing, 'homepage-shell--mobile-browser': narrowScreen && mobileBrowserOpen}">
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
          <option value="all"> {{ t("全部模组") }} </option>
          <option v-for="mod in mods" :key="mod.modId" :value="mod.modId">
            {{ mod.modName }} ({{ mod.itemCount }})
          </option>
        </select>

        <div v-if="modsLoading" class="state-panel list-state-panel !py-2 !px-3">
          <p class="state-title text-xs"> {{ t("正在加载模组筛选...") }} </p>
        </div>

        <div v-else-if="modsLoadError" class="state-panel list-state-panel state-panel-error !py-2 !px-3">
          <p class="state-title text-xs">{{ modsLoadError }}</p>
          <div class="state-actions">
            <button class="mini-pager-btn" @click="loadMods"> {{ t("重试加载模组") }} </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Main Content (Full Width) -->
    <div class="flex-1 flex flex-col relative">
      <!-- Items View -->
      <div
        v-if="currentView === 'items'"
        class="flex-1 flex overflow-hidden relative"
      >
        <div class="workspace-left" :class="{ 'workspace-left--expanded': !showBrowser }">
          <SiteHeader :catalog="catalog?.manifest.id" :offline="offline" @settings="showGearMenu = true" />
          <button type="button" class="workspace-browser-toggle" :aria-expanded="narrowScreen ? mobileBrowserOpen : showBrowser" @click="toggleBrowser">{{ narrowScreen ? (mobileBrowserOpen ? t("返回内容") : t("浏览物品")) : (showBrowser ? t("收起浏览区") : t("展开浏览区")) }}</button>
          <main v-show="!narrowScreen || !mobileBrowserOpen" class="workspace-content" :inert="showGearMenu" :aria-hidden="showGearMenu ? 'true' : undefined">
            <p v-if="catalogError" role="alert">{{ catalogError }} <button type="button" @click="openCatalog()"> {{ t("重试") }} </button></p>
            <p v-if="presentationStatus !== 'idle'" class="workspace-presentation-status text-sm text-slate-300" role="status" aria-live="polite"
              :data-status="presentationStatus" :data-sequence="presentationSequence" :data-direction="recipeIntent?.direction"
              :data-target="recipeIntent && 'id' in recipeIntent ? recipeIntent.id : undefined">
              {{ presentationMessage }}
              <button v-if="presentationStatus === 'failed' && catalog" type="button" @click="acknowledgeRecipeIntent()">{{ t("重试") }}</button>
            </p>
            <RouterView v-slot="{ Component }"><component :is="Component" :key="snapshot + ':' + (route.query.offline === '1' ? 'offline' : 'online')" @item-ready="addToHistory" /></RouterView>
          </main>
        </div>

        <HomeBrowserColumn
          v-show="narrowScreen ? mobileBrowserOpen : showBrowser"
          :resize-enabled="panelResizeEnabled"
          :panel-width="browserWidth"
          :min-width="panelSizeBounds.browser.min"
          :max-width="panelSizeBounds.browser.max"
          @column-resize="setBrowserColumnRef"
          @resize-start="startResize"
          @resize-width="resizeWidth"
          @resize-end="finishPanelResize"
          @reset-width="resetWidth"
          :item-column-style="itemColumnStyle"
          :total-pages="totalPages"
          :current-page="currentPage"
          :loaded-page="loadedPage"
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
          :selected-item-id="selectedItemId"
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
              :resize-enabled="panelResizeEnabled"
              :panel-height="historyHeight"
              :min-height="panelSizeBounds.history.min"
              :max-height="panelSizeBounds.history.max"
              @resize-start="startResize"
              @resize-height="resizeHeight"
              @resize-end="finishPanelResize"
              @reset-height="resetHeight"
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
        <p v-if="panelStorageError" role="status" class="panel-layout-storage-error">{{ panelStorageError }}</p>
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
        > {{ t("清空搜索") }} </button>
      </div>
    </div>

    <HomeSettingsPanel
      v-model="showGearMenu"
      v-model:item-size="itemSize"
      :panel-resize-enabled="panelResizeEnabled"
      @update:panel-resize-enabled="setResizeEnabled"
      :settings-save-status="settingsSaveStatus"
      :settings-save-error="settingsSaveError"
      :atlas-resident-status="residentStatus"
      :catalog="catalog"
      :catalog-opening="catalogOpening"
      :catalog-error="catalogError"
      :history-count="viewHistory.length"
      @retry-catalog="openCatalog()"
      @save-settings="saveSettings"
      @clear-history="clearViewHistory"
    />
  </div>
</template>
