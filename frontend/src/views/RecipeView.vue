<script setup lang="ts">
import { computed, ref, watch, onMounted, onBeforeUnmount } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import RecipeDisplayRouter from '../components/RecipeDisplayRouter.vue';
import RecipeBrowseControls from '../components/RecipeBrowseControls.vue';
import MultiblockBlueprintDialog from '../components/MultiblockBlueprintDialog.vue';
import VirtualRecipeGrid from '../components/VirtualRecipeGrid.vue';
import RecipeSearch from '../components/RecipeSearch.vue';
import RecipeChromeButton from '../components/RecipeChromeButton.vue';
import RecipeBrowserStage from '../components/RecipeBrowserStage.vue';
import RecipeStatePanel from '../components/RecipeStatePanel.vue';
import { useSound } from '../services/sound.service';
import { resolveRecipePresentationProfile } from '../services/uiTypeMapping';
import { useRecipeViewer } from '../composables/useRecipeViewer';
import { useRecipeRouteSync } from '../composables/useRecipeRouteSync';
import { api, getImageUrlFromFileName, getImageUrlFromRenderAssetRef, type EcosystemOverview, type MultiblockBlueprint } from '../services/api';
import { useRecipeHistory } from '../services/recipeHistory.service';
import type { RecipeDisplayHandle, RecipeOverlayUiState } from '../domain/recipeDisplayContract';

interface Props {
  itemId?: string;
}

const props = defineProps<Props>();
const route = useRoute();
const router = useRouter();
const { playClick } = useSound();
const recipeDisplayRouterRef = ref<RecipeDisplayHandle | null>(null);

const itemId = computed(() => props.itemId ?? (route.params.itemId as string | undefined));

const getHeaderImagePath = () => {
  if (item.value?.renderAssetRef) {
    const renderAssetUrl = getImageUrlFromRenderAssetRef(item.value.renderAssetRef);
    if (renderAssetUrl) return renderAssetUrl;
  }
  if (item.value?.imageFileName) {
    return getImageUrlFromFileName(item.value.imageFileName);
  }
  if (item.value?.itemId) {
    return getImagePath(item.value.itemId);
  }
  return '/placeholder.png';
};
const showMultiblockDialog = ref(false);
const multiblockLoading = ref(false);
const multiblockError = ref<string | null>(null);
const multiblockBlueprint = ref<MultiblockBlueprint | null>(null);
const ecosystemOverview = ref<EcosystemOverview | null>(null);
let multiblockRequestToken = 0;

const defaultOverlayState = (): RecipeOverlayUiState => ({
  status: 'idle',
  message: '',
  canRetry: false,
  requestId: null,
  updatedAt: Date.now(),
});

const copy = {
  backHome: '\u8fd4\u56de\u9996\u9875',
  blueprintButton: '\u67e5\u770b NEI \u591a\u65b9\u5757\u84dd\u56fe',
  clearFilters: '\u6e05\u7a7a\u7b5b\u9009',
  emptyRecipesSubtitle: '\u53ef\u4ee5\u5207\u6362\u673a\u5668\u5206\u7c7b\u3001\u6e05\u7a7a\u7b5b\u9009\uff0c\u6216\u8fd4\u56de\u91cd\u65b0\u9009\u62e9\u5176\u4ed6\u7269\u54c1\u3002',
  emptyRecipesTitle: '\u6682\u65e0\u53ef\u663e\u793a\u914d\u65b9',
  itemIcon: '\u56fe\u6807',
  keyboardShortcuts: '\u5feb\u6377\u952e\uff1a\u5de6\u53f3\u5207\u6362\u5206\u9875\uff0c\u4e0a\u4e0b\u5207\u6362\u673a\u5668\uff0cR/U \u5207\u6362\u914d\u65b9\u6807\u7b7e\u3002',
  keyboardShortcutsAriaLabel: '\u5feb\u6377\u952e\u8bf4\u660e',
  loadingRecipeDataSubtitle: '\u7cfb\u7edf\u6b63\u5728\u6574\u7406\u8be5\u7269\u54c1\u7684\u914d\u65b9\u7d22\u5f15\uff0c\u8bf7\u7a0d\u5019\u3002',
  loadingRecipeDataTitle: '\u6b63\u5728\u52a0\u8f7d\u914d\u65b9\u6570\u636e...',
  loadingRecipeDetail: '\u6b63\u5728\u52a0\u8f7d\u914d\u65b9\u8be6\u60c5...',
  multiblockUnavailable: '\u5f53\u524d\u63a7\u5236\u5668\u6682\u65e0\u53ef\u7528\u7684\u591a\u65b9\u5757\u84dd\u56fe\u6570\u636e\u3002',
  noRecipesSubtitle: '\u8be5\u7269\u54c1\u5f53\u524d\u6ca1\u6709\u53ef\u7528\u7684\u6765\u6e90\u914d\u65b9\u6216\u7528\u9014\u914d\u65b9\u3002',
  noRecipesTitle: '\u6682\u65e0\u53ef\u663e\u793a\u914d\u65b9',
  noVariantAvailable: '\u672a\u627e\u5230\u53ef\u7528\u53d8\u4f53',
  oreDictionaryVariants: '\u77ff\u8f9e\u5178\u53d8\u4f53',
  ecosystemTitle: 'Ecosystem',
  ecosystemFlow: 'NESQL++ → NeoNEI → OC Pattern',
  sourceMod: '\u6765\u6e90\u6a21\u7ec4',
  producedByCount: '\u6765\u6e90',
  usedInCount: '\u7528\u9014',
  openOracle: 'Open Oracle',
  openGTDiagrams: 'GT Diagrams',
  openBeeTree: 'Bee Tree',
  overlayFailed: 'Overlay \u53d1\u9001\u5931\u8d25',
  overlaySending: '\u6b63\u5728\u53d1\u9001 Overlay...',
  overlaySent: 'Overlay \u5df2\u53d1\u9001',
  previousPage: '\u4e0a\u4e00\u9875',
  previousVariant: '\u4e0a\u4e00\u4e2a\u53d8\u4f53',
  producedByTab: '\u5408\u6210\u6765\u6e90',
  recipeDetailFallback: '\u5f53\u524d\u5c55\u793a\u7684\u662f\u56de\u9000\u914d\u65b9\u6570\u636e\uff0c\u5b8c\u6574\u8be6\u60c5\u6682\u4e0d\u53ef\u7528\u3002',
  recipeDetailFailed: '\u914d\u65b9\u8be6\u60c5\u52a0\u8f7d\u5931\u8d25\uff0c\u5f53\u524d\u663e\u793a\u7684\u662f\u56de\u9000\u5185\u5bb9\uff0c\u53ef\u4ee5\u91cd\u8bd5\u8be6\u60c5\u8bf7\u6c42\u3002',
  recipeDetailReady: '\u914d\u65b9\u8be6\u60c5\u5df2\u51c6\u5907\u5b8c\u6210',
  recipeLoadErrorTitle: '\u52a0\u8f7d\u5931\u8d25',
  recipeLoadErrorSubtitle: '\u53ef\u4ee5\u91cd\u8bd5\u5f53\u524d\u8bf7\u6c42\uff0c\u6216\u8fd4\u56de\u9996\u9875\u91cd\u65b0\u9009\u62e9\u7269\u54c1\u3002',
  reload: '\u91cd\u65b0\u52a0\u8f7d',
  retry: '\u91cd\u8bd5',
  retryDetailLoad: '\u91cd\u8bd5\u8be6\u60c5\u52a0\u8f7d',
  retryOverlaySend: '\u91cd\u8bd5 Overlay \u53d1\u9001',
  slotLabel: '\u69fd\u4f4d',
  unknownCategory: '\u672a\u77e5\u5206\u7c7b',
  unknownItem: '\u672a\u77e5\u7269\u54c1',
  usedInTab: '\u7528\u9014\u914d\u65b9',
  nextPage: '\u4e0b\u4e00\u9875',
  nextVariant: '\u4e0b\u4e00\u4e2a\u53d8\u4f53',
} as const;

const {
  loading,
  item,
  recipes,
  currentTab,
  recipeSearchQuery,
  fastSearchResults,
  searchingRecipes,
  loadError,
  selectedMachineIndex,
  currentPage,
  machineCategories,
  currentCategory,
  currentCategoryPages,
  currentPageRecipes,
  currentRecipeId,
  isCurrentRecipeDetailLoading,
  isCurrentRecipeUsingFallback,
  isCurrentRecipeDetailFailed,
  currentRecipeVariantGroups,
  currentRecipeVariantSelections,
  filteredRecipeCount,
  totalRecipeCount,
  producedByTotalCount,
  usedInTotalCount,
  totalPages,
  getImagePath,
  selectMachine,
  setRecipeVariant,
  retryCurrentRecipeDetails,
  clearRecipeSearch,
  nextPage,
  prevPage,
  setPage,
  setCurrentTab,
  retryLoadRecipes,
  selectRecipeById,
} = useRecipeViewer(itemId, playClick);

const { pushEntry, updateNavigationFlags } = useRecipeHistory();
const overlayUiState = ref<RecipeOverlayUiState>(defaultOverlayState());

const featureRecipeBrowserV2 = computed(() => import.meta.env.VITE_RECIPE_BROWSER_V2 !== '0');

const displayVariantGroups = computed(() =>
  currentRecipeVariantGroups.value.filter((group) => group.isOreDictionary || group.options.length > 1),
);

const showGlobalVariantScaffold = computed(() => {
  const recipe = currentPageRecipes.value[0];
  if (!recipe) {
    return false;
  }
  const profile = resolveRecipePresentationProfile({
    machineType: recipe.machineInfo?.machineType,
    recipeType: recipe.recipeType,
    recipeTypeData: recipe.recipeTypeData,
    inputs: recipe.inputs,
    additionalData: recipe.additionalData as Record<string, unknown> | undefined,
    metadata: recipe.metadata as Record<string, unknown> | undefined,
    preferDetailedCrafting: false,
  });
  if (
    profile.uiConfig.presentation?.surface === 'ritual'
    || profile.uiConfig.presentation?.family === 'thaumcraft'
    || profile.uiConfig.presentation?.family === 'gregtech'
  ) {
    return false;
  }
  return displayVariantGroups.value.length > 0;
});

const browseTabs = computed(() => [
  {
    key: 'producedBy',
    label: copy.producedByTab,
    count: producedByTotalCount.value,
    disabled: producedByTotalCount.value === 0,
    visible: producedByTotalCount.value > 0,
  },
  {
    key: 'usedIn',
    label: copy.usedInTab,
    count: usedInTotalCount.value,
    disabled: usedInTotalCount.value === 0,
    visible: usedInTotalCount.value > 0,
  },
]);

const ecosystemStats = computed(() => {
  if (!item.value) {
    return [];
  }
  return [
    { label: copy.sourceMod, value: item.value.modId },
    { label: copy.producedByCount, value: String(producedByTotalCount.value) },
    { label: copy.usedInCount, value: String(usedInTotalCount.value) },
  ];
});

const ecosystemLaneStatus = computed(() =>
  ecosystemOverview.value?.lanes.map((lane) => ({
    id: lane.id,
    label: lane.label,
    ok: lane.detected && lane.details.every((entry) => entry.ok),
  })) ?? []
);

const showRecipePreviewGrid = computed(() => {
  if (!featureRecipeBrowserV2.value || currentCategoryPages.value.length <= 6) {
    return false;
  }
  const previewIds = new Set(
    currentCategoryPages.value
      .map((recipe) => recipe.outputs?.[0]?.itemId || recipe.recipeId)
      .filter((value): value is string => Boolean(value))
  );
  return previewIds.size > 1;
});

const overlayStatusVm = computed(() => {
  const state = overlayUiState.value;
  if (state.status === 'idle') return null;

  if (state.status === 'loading') {
    return { text: state.message || copy.overlaySending, className: 'recipe-detail-pill-loading', showRetry: false };
  }
  if (state.status === 'error') {
    return { text: state.message || copy.overlayFailed, className: 'recipe-detail-pill-fallback', showRetry: state.canRetry };
  }
  return { text: state.message || copy.overlaySent, className: 'recipe-detail-pill-ready', showRetry: false };
});

const currentPresentationProfile = computed(() => {
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

const isFurnaceCanvas = computed(() => currentPresentationProfile.value?.component === 'FurnaceUI');

const shellToneClass = computed(() => {
  const family = currentPresentationProfile.value?.uiConfig.presentation?.family;
  if (family === 'thaumcraft') return 'tone-arcane';
  if (family === 'blood_magic') return 'tone-blood';
  if (family === 'botania') return 'tone-botania';
  if (family === 'gregtech' || family === 'multiblock') return 'tone-tech';

  const name = `${currentCategory.value?.name || ''}`.toLowerCase();
  if (name.includes('infusion') || name.includes('thaum')) return 'tone-arcane';
  if (name.includes('blood')) return 'tone-blood';
  if (name.includes('botania')) return 'tone-botania';
  if (name.includes('gt') || name.includes('gregtech') || name.includes('machine')) {
    return 'tone-tech';
  }
  return 'tone-neutral';
});

const isWorkbenchCanvas = computed(() => {
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

const isWideRecipeCanvas = computed(() => {
  return isWorkbenchCanvas.value || isFurnaceCanvas.value;
});

const shellLayoutClass = computed(() => {
  return isWideRecipeCanvas.value ? 'recipe-workbench-canvas' : '';
});

const goBack = () => {
  router.push('/');
};

const handleItemClick = (clickedItemId: string, options?: { tab?: 'usedIn' | 'producedBy' }) => {
  playClick();
  router.push({
    name: 'recipe',
    params: { itemId: clickedItemId },
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

const openOracle = () => {
  if (!itemId.value) return;
  playClick();
  router.push({ name: 'recipe-oracle', params: { itemId: itemId.value } });
};

const openGTDiagrams = () => {
  playClick();
  router.push({ name: 'gt-diagrams' });
};

const openBeeTree = () => {
  playClick();
  router.push({ name: 'forestry-bee-tree' });
};

const onSelectRecipeVariant = (slotKey: string, event: Event) => {
  const target = event.target as HTMLSelectElement | null;
  if (!target) return;
  const variantIndex = Number(target.value);
  if (!Number.isFinite(variantIndex) || variantIndex < 0) return;
  setRecipeVariant(slotKey, variantIndex);
};

const cycleRecipeVariant = (slotKey: string, total: number, direction: 1 | -1) => {
  if (total <= 1) return;
  const current = currentRecipeVariantSelections.value[slotKey] ?? 0;
  const next = (current + direction + total) % total;
  setRecipeVariant(slotKey, next);
};

const getVariantSelectionPreview = (group: (typeof displayVariantGroups.value)[number]): string => {
  const selectedIndex = currentRecipeVariantSelections.value[group.slotKey] ?? 0;
  const selected = group.options[selectedIndex] || group.options[0];
  if (!selected) return copy.noVariantAvailable;
  const countText = selected.count > 1 ? ' x' + selected.count : '';
  return selected.itemId + countText;
};

const getVariantLabelSuffix = (group: (typeof displayVariantGroups.value)[number]): string => {
  const oreDictName = typeof group.oreDictName === 'string' ? group.oreDictName.trim() : '';
  if (!group.isOreDictionary || !oreDictName) return '';
  if (oreDictName.toLowerCase() === 'unknown') return '';
  return `(${oreDictName})`;
};

const handleFastSearchSelect = (clickedItemId: string) => {
  if (!clickedItemId) return;
  playClick();
  clearRecipeSearch();
  router.push({
    name: 'recipe',
    params: { itemId: clickedItemId },
  });
};


const handleOverlayStateChange = (state: RecipeOverlayUiState) => {
  overlayUiState.value = state;
};

const triggerRecipeOverlay = () => {
  recipeDisplayRouterRef.value?.handleRecipeOverlay?.();
};

const retryOverlaySend = () => {
  triggerRecipeOverlay();
};

const currentRecipeKey = computed(() => {
  const recipe = currentPageRecipes.value[0];
  if (!recipe) {
    return `empty-${currentCategory.value?.name || 'none'}-${currentPage.value}`;
  }
  return `${currentCategory.value?.type || 'unknown'}-${currentCategory.value?.name || 'none'}-${recipe.recipeId}-${currentPage.value}`;
});

const recipeDisplayRouterBindings = computed(() => ({
  scaleToFit: currentCategory.value?.type === 'machine' && !isWideRecipeCanvas.value,
  preferDetailedCrafting: false,
}));

const invalidateMultiblockRequest = (): number => {
  multiblockRequestToken += 1;
  return multiblockRequestToken;
};

const resetMultiblockDialogState = () => {
  multiblockLoading.value = false;
  multiblockError.value = null;
  multiblockBlueprint.value = null;
};

const isLatestMultiblockRequest = (requestToken: number, requestItemId: string) => (
  requestToken === multiblockRequestToken
  && requestItemId === itemId.value
  && showMultiblockDialog.value
);

const openMultiblockBlueprint = async () => {
  const requestItemId = itemId.value;
  if (!requestItemId) return;

  const requestToken = invalidateMultiblockRequest();
  showMultiblockDialog.value = true;
  multiblockLoading.value = true;
  multiblockError.value = null;
  multiblockBlueprint.value = null;

  try {
    const blueprint = await api.getMultiblockBlueprint(requestItemId);
    if (!isLatestMultiblockRequest(requestToken, requestItemId)) {
      return;
    }
    multiblockBlueprint.value = blueprint;
  } catch (error) {
    if (!isLatestMultiblockRequest(requestToken, requestItemId)) {
      return;
    }
    multiblockError.value = copy.multiblockUnavailable;
    console.error('Failed to load multiblock blueprint:', error);
  } finally {
    if (isLatestMultiblockRequest(requestToken, requestItemId)) {
      multiblockLoading.value = false;
    }
  }
};

const closeMultiblockDialog = () => {
  invalidateMultiblockRequest();
  showMultiblockDialog.value = false;
  resetMultiblockDialogState();
};

useRecipeRouteSync({
  route,
  router,
  itemId,
  currentTab,
  setCurrentTab,
  recipeSearchQuery,
  selectedMachineIndex,
  currentPage,
  currentRecipeId,
  machineCategoryCount: computed(() => machineCategories.value.length),
  machineCategoryNames: computed(() => machineCategories.value.map((category) => category.name)),
  totalPages,
  currentCategoryPageCount: computed(() => currentCategoryPages.value.length),
  selectRecipeById,
  onAfterStateSync: ({ itemId: currentItemId, tab, machineIndex, pageIndex }) => {
    pushEntry({
      itemId: currentItemId,
      itemName: item.value?.localizedName || currentItemId,
      tab,
      machineIndex,
      pageIndex,
    });
    updateNavigationFlags();
  },
});

watch(
  () => currentRecipeId.value,
  () => {
    overlayUiState.value = defaultOverlayState();
  },
);

watch(itemId, (nextItemId, previousItemId) => {
  if (nextItemId === previousItemId) {
    return;
  }

  invalidateMultiblockRequest();
  showMultiblockDialog.value = false;
  resetMultiblockDialogState();
});

const isEditableTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (target.isContentEditable) return true;
  return Boolean(target.closest('[contenteditable="true"], [contenteditable=""], [contenteditable]:not([contenteditable="false"])'));
};

const handleKeydown = (event: KeyboardEvent) => {
  if (event.repeat) return;

  if (showMultiblockDialog.value) {
    return;
  }

  if (isEditableTarget(event.target)) {
    return;
  }

  switch (event.key) {
    case 'Escape':
    case 'Backspace':
      event.preventDefault();
      goBack();
      break;
    case 'ArrowLeft':
      event.preventDefault();
      prevPage();
      break;
    case 'ArrowRight':
      event.preventDefault();
      nextPage();
      break;
    case 'ArrowUp':
      event.preventDefault();
      if (selectedMachineIndex.value > 0) {
        selectMachine(selectedMachineIndex.value - 1);
      }
      break;
    case 'ArrowDown':
      event.preventDefault();
      if (selectedMachineIndex.value < machineCategories.value.length - 1) {
        selectMachine(selectedMachineIndex.value + 1);
      }
      break;
    case 'r':
    case 'R':
      if (recipes.value.producedBy.length > 0) {
        event.preventDefault();
        setCurrentTab('producedBy');
      }
      break;
    case 'u':
    case 'U':
      if (recipes.value.usedIn.length > 0) {
        event.preventDefault();
        setCurrentTab('usedIn');
      }
      break;
    case 'o':
    case 'O':
      event.preventDefault();
      triggerRecipeOverlay();
      break;
  }
};

const handleRecipeWheel = (event: WheelEvent) => {
  if (Math.abs(event.deltaY) < 8 || totalPages.value <= 1) return;
  event.preventDefault();
  if (event.deltaY > 0) {
    nextPage();
  } else {
    prevPage();
  }
};

onMounted(() => {
  window.addEventListener('keydown', handleKeydown);
  const loadOverview = () => {
    void api.getEcosystemOverview()
      .then((overview) => {
        ecosystemOverview.value = overview;
      })
      .catch((error) => {
        console.error('Failed to load ecosystem overview:', error);
      });
  };
  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(() => loadOverview(), { timeout: 1500 });
  } else {
    window.setTimeout(loadOverview, 300);
  }
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeydown);
});
</script>

<template>
  <div class="recipe-view-root">
    <div
      :class="['recipe-view', shellToneClass, shellLayoutClass, featureRecipeBrowserV2 ? 'recipe-browser-v2-on' : 'recipe-browser-v2-off']"
      :inert="showMultiblockDialog"
      :aria-hidden="showMultiblockDialog ? 'true' : undefined"
      tabindex="0"
    >
      <div class="recipe-top-bar">
        <button class="back-button" @click="goBack">
          {{ copy.backHome }}
        </button>
        <button class="blueprint-button" @click="openMultiblockBlueprint">
          {{ copy.blueprintButton }}
        </button>
      </div>

      <RecipeStatePanel
        v-if="loading"
        class="loading-state"
        variant="loading"
        :title="copy.loadingRecipeDataTitle"
        :subtitle="copy.loadingRecipeDataSubtitle"
      />

      <RecipeStatePanel
        v-else-if="loadError"
        class="no-recipes"
        variant="error"
        :title="loadError || copy.recipeLoadErrorTitle"
        :subtitle="copy.recipeLoadErrorSubtitle"
      >
        <template #actions>
          <RecipeChromeButton @click="retryLoadRecipes">{{ copy.retry }}</RecipeChromeButton>
          <RecipeChromeButton @click="goBack">{{ copy.backHome }}</RecipeChromeButton>
        </template>
      </RecipeStatePanel>

      <RecipeStatePanel
        v-else-if="totalRecipeCount === 0"
        class="no-recipes"
        :title="copy.noRecipesTitle"
        :subtitle="copy.noRecipesSubtitle"
      >
        <template #actions>
          <RecipeChromeButton @click="retryLoadRecipes">{{ copy.reload }}</RecipeChromeButton>
          <RecipeChromeButton @click="goBack">{{ copy.backHome }}</RecipeChromeButton>
        </template>
      </RecipeStatePanel>

      <div v-else class="recipe-content">
        <RecipeBrowseControls
          :tabs="browseTabs"
          :active-tab="currentTab"
          :machine-categories="machineCategories"
          :selected-machine-index="selectedMachineIndex"
          :progress-text="(currentPage + 1) + ' / ' + totalPages"
          :prev-label="copy.previousPage"
          :next-label="copy.nextPage"
          :prev-title="copy.previousPage"
          :next-title="copy.nextPage"
          prev-test-id="recipe-prev-page"
          next-test-id="recipe-next-page"
          :prev-disabled="totalPages <= 1"
          :next-disabled="totalPages <= 1"
          pager-class="pagination"
          @select-tab="(tab) => setCurrentTab(tab as 'usedIn' | 'producedBy')"
          @select-machine="selectMachine"
          @prev="prevPage"
          @next="nextPage"
        >
          <template #summary>
            <div class="recipe-header">
              <div class="item-info">
                <img
                  v-if="item"
                  :src="getHeaderImagePath()"
                  :alt="item.localizedName + ' ' + copy.itemIcon"
                  class="item-icon"
                  @error="(e) => { (e.target as HTMLImageElement).src = '/placeholder.png'; }"
                />
                <div class="item-heading-copy">
                  <h1 v-if="item">{{ item.localizedName }}</h1>
                  <div v-if="item" class="ecosystem-rail">
                    <div class="ecosystem-rail-head">
                      <span class="ecosystem-title">{{ copy.ecosystemTitle }}</span>
                      <span class="ecosystem-flow">{{ copy.ecosystemFlow }}</span>
                    </div>
                    <div class="ecosystem-stat-list">
                      <span v-for="stat in ecosystemStats" :key="stat.label" class="ecosystem-stat-chip">
                        <strong>{{ stat.label }}</strong>
                        <span>{{ stat.value }}</span>
                      </span>
                      <span
                        v-for="lane in ecosystemLaneStatus"
                        :key="lane.id"
                        :class="['ecosystem-lane-chip', lane.ok ? 'is-ready' : 'is-missing']"
                      >
                        {{ lane.label }}
                      </span>
                      <div class="ecosystem-cta-row">
                        <button class="ecosystem-cta" @click="openOracle">{{ copy.openOracle }}</button>
                        <button class="ecosystem-cta ecosystem-cta-secondary" @click="openGTDiagrams">{{ copy.openGTDiagrams }}</button>
                        <button class="ecosystem-cta ecosystem-cta-secondary" @click="openBeeTree">{{ copy.openBeeTree }}</button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </template>

          <template #search>
            <div class="recipe-search-row">
              <RecipeSearch
                v-model="recipeSearchQuery"
                :fast-results="fastSearchResults"
                :match-count="filteredRecipeCount"
                :total-count="totalRecipeCount"
                :loading="searchingRecipes"
                :highlight-matches="true"
                @select-fast-result="handleFastSearchSelect"
              />
            </div>
          </template>

          <template #meta>
            <div class="machine-name">
              {{ currentCategory?.name || copy.unknownCategory }}
            </div>
            <p class="keyboard-shortcut-hint" :aria-label="copy.keyboardShortcutsAriaLabel">
              {{ copy.keyboardShortcuts }}
            </p>

            <div v-if="showGlobalVariantScaffold" class="variant-scaffold">
              <div class="variant-head">{{ copy.oreDictionaryVariants }}</div>
              <div class="variant-list">
                <label
                  v-for="group in displayVariantGroups"
                  :key="group.slotKey"
                  class="variant-entry"
                >
                  <span class="variant-label">
                    {{ copy.slotLabel }} {{ group.slotKey }}
                    <span v-if="getVariantLabelSuffix(group)">{{ getVariantLabelSuffix(group) }}</span>
                  </span>
                  <span class="variant-preview">{{ getVariantSelectionPreview(group) }}</span>
                  <div class="variant-controls">
                    <button
                      class="variant-switch-btn"
                      :disabled="group.options.length <= 1"
                      @click="cycleRecipeVariant(group.slotKey, group.options.length, -1)"
                      :title="copy.previousVariant"
                      :aria-label="copy.previousVariant"
                    >
                      &#8249;
                    </button>
                    <select
                      class="variant-select"
                      :value="currentRecipeVariantSelections[group.slotKey] ?? 0"
                      @change="(event) => onSelectRecipeVariant(group.slotKey, event)"
                    >
                      <option
                        v-for="(option, idx) in group.options"
                        :key="[group.slotKey, option.itemId, idx].join('-')"
                        :value="idx"
                      >
                        {{ idx + 1 }}. {{ option.itemId }}
                      </option>
                    </select>
                    <button
                      class="variant-switch-btn"
                      :disabled="group.options.length <= 1"
                      @click="cycleRecipeVariant(group.slotKey, group.options.length, 1)"
                      :title="copy.nextVariant"
                      :aria-label="copy.nextVariant"
                    >
                      &#8250;
                    </button>
                  </div>
                </label>
              </div>
            </div>
          </template>
        </RecipeBrowseControls>

        <div class="recipe-display" @wheel="handleRecipeWheel">
          <RecipeBrowserStage
            :stage-key="currentRecipeKey"
            transition-name=""
            stage-shell-class="recipe-stage-shell"
            state-panel-class="recipe-stage-state-panel"
            :empty="!(currentPageRecipes.length > 0)"
            :empty-title="copy.emptyRecipesTitle"
            :empty-subtitle="copy.emptyRecipesSubtitle"
          >
            <template #status>
              <div v-if="currentRecipeId" class="recipe-detail-status">
                <span v-if="isCurrentRecipeDetailLoading" class="recipe-detail-pill recipe-detail-pill-loading">
                  {{ copy.loadingRecipeDetail }}
                </span>
                <template v-else-if="isCurrentRecipeDetailFailed">
                  <span class="recipe-detail-pill recipe-detail-pill-fallback">
                    {{ copy.recipeDetailFailed }}
                  </span>
                  <button class="recipe-detail-retry" @click="retryCurrentRecipeDetails">
                    {{ copy.retryDetailLoad }}
                  </button>
                </template>
                <span v-else-if="isCurrentRecipeUsingFallback" class="recipe-detail-pill recipe-detail-pill-fallback">
                  {{ copy.recipeDetailFallback }}
                </span>
                <span v-else class="recipe-detail-pill recipe-detail-pill-ready">
                  {{ copy.recipeDetailReady }}
                </span>
              </div>
              <div v-if="overlayStatusVm" class="recipe-detail-status">
                <span :class="['recipe-detail-pill', overlayStatusVm.className]">
                  {{ overlayStatusVm.text }}
                </span>
                <button
                  v-if="overlayStatusVm.showRetry"
                  class="recipe-detail-retry"
                  @click="retryOverlaySend"
                >
                  {{ copy.retryOverlaySend }}
                </button>
              </div>
            </template>

            <template #empty-actions>
              <RecipeChromeButton @click="clearRecipeSearch">{{ copy.clearFilters }}</RecipeChromeButton>
              <RecipeChromeButton @click="goBack">{{ copy.backHome }}</RecipeChromeButton>
            </template>

            <template #content>
              <div
                v-if="isFurnaceCanvas && currentPageRecipes.length > 0"
                class="stacked-furnace-recipes"
              >
                <RecipeDisplayRouter
                  v-for="recipe in currentPageRecipes"
                  :key="recipe.recipeId"
                  v-bind="recipeDisplayRouterBindings"
                  :recipe="recipe"
                  @item-click="handleItemClick"
                  @overlay-state-change="handleOverlayStateChange"
                />
              </div>
              <RecipeDisplayRouter
                v-else-if="currentPageRecipes.length > 0"
                ref="recipeDisplayRouterRef"
                v-bind="recipeDisplayRouterBindings"
                :recipe="currentPageRecipes[0]"
                @item-click="handleItemClick"
                @overlay-state-change="handleOverlayStateChange"
              />
            </template>
          </RecipeBrowserStage>
        </div>

        <div v-if="showRecipePreviewGrid" class="recipe-grid-scaffold">
          <VirtualRecipeGrid
            :recipes="currentCategoryPages"
            :selected-index="currentPage"
            :overscan-rows="5"
            :scroll-throttle-ms="32"
            :show-preview-images="false"
            @select="setPage"
          />
        </div>
      </div>
    </div>

    <MultiblockBlueprintDialog
      :open="showMultiblockDialog"
      :item-label="item?.localizedName || itemId || copy.unknownItem"
      :loading="multiblockLoading"
      :error="multiblockError"
      :blueprint="multiblockBlueprint"
      @close="closeMultiblockDialog"
    />
  </div>
</template>
<style scoped>
.recipe-view-root {
  min-height: 100vh;
  overflow-x: hidden;
}

.recipe-view {
  --rv-accent-rgb: 164, 181, 204;
  --rv-accent-strong-rgb: 195, 210, 228;
  --recipe-accent-rgb: var(--rv-accent-rgb);
  --recipe-accent-strong-rgb: var(--rv-accent-strong-rgb);
  min-height: 100vh;
  padding: 24px 16px 28px;
  display: flex;
  flex-direction: column;
  align-items: center;
  position: relative;
  overflow: visible;
  --recipe-shell-width: min(1200px, var(--recipe-shell-max-width, 92vw));
}

.tone-neutral {
  --rv-accent-rgb: 164, 181, 204;
  --rv-accent-strong-rgb: 195, 210, 228;
}

.tone-tech {
  --rv-accent-rgb: 128, 168, 220;
  --rv-accent-strong-rgb: 176, 207, 245;
}

.tone-arcane {
  --rv-accent-rgb: 165, 138, 216;
  --rv-accent-strong-rgb: 207, 188, 238;
}

.tone-blood {
  --rv-accent-rgb: 186, 104, 116;
  --rv-accent-strong-rgb: 228, 162, 170;
}

.tone-botania {
  --rv-accent-rgb: 112, 168, 124;
  --rv-accent-strong-rgb: 170, 214, 176;
}

.recipe-view::before,
.recipe-view::after {
  content: "";
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 0;
}

.recipe-view::before {
  background:
    radial-gradient(65% 48% at 50% -10%, rgba(255, 255, 255, 0.055), transparent 70%),
    radial-gradient(50% 44% at 8% 90%, rgba(96, 112, 140, 0.095), transparent 76%),
    radial-gradient(42% 40% at 90% 12%, rgba(72, 90, 122, 0.085), transparent 76%);
}

.recipe-view::after {
  opacity: 0.22;
  background-image:
    repeating-linear-gradient(0deg, rgba(255, 255, 255, 0.012) 0 1px, transparent 1px 3px),
    radial-gradient(120% 105% at 50% 50%, transparent 58%, rgba(0, 0, 0, 0.42) 100%);
}

.recipe-top-bar {
  width: min(var(--recipe-shell-width), 100%);
  max-width: var(--recipe-shell-width);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 14px;
  position: relative;
  z-index: 1;
}

.back-button,
.blueprint-button {
  height: 38px;
  padding: 0 14px;
  border-radius: 9px;
  border: 1px solid rgba(var(--rv-accent-rgb), 0.14);
  background: linear-gradient(180deg, rgba(16, 20, 27, 0.84), rgba(12, 15, 20, 0.88));
  color: rgba(226, 235, 246, 0.96);
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.1px;
  cursor: pointer;
  transition: border-color 180ms ease, background 180ms ease, box-shadow 180ms ease, transform 180ms ease;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.03),
    0 5px 14px rgba(0, 0, 0, 0.28);
}

.back-button:hover,
.blueprint-button:hover {
  border-color: rgba(var(--rv-accent-strong-rgb), 0.24);
  background: linear-gradient(180deg, rgba(22, 28, 36, 0.88), rgba(14, 19, 25, 0.92));
  transform: translateY(-1px);
}

.loading-state,
.no-recipes {
  width: min(var(--recipe-shell-width), 100%);
  max-width: var(--recipe-shell-width);
}


.recipe-content {
  width: min(var(--recipe-shell-width), 100%);
  max-width: var(--recipe-shell-width);
  display: flex;
  flex-direction: column;
  gap: 14px;
  position: relative;
  z-index: 1;
  margin-inline: auto;
}

.recipe-header,
.machine-name,
.pagination,
.recipe-display {
  background: linear-gradient(180deg, rgba(14, 18, 24, 0.84), rgba(10, 14, 19, 0.88));
  border: 1px solid rgba(var(--rv-accent-rgb), 0.14);
  border-radius: 12px;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.03),
    0 10px 26px rgba(0, 0, 0, 0.28);
}

.recipe-header {
  padding: 18px;
}

.item-info {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 12px;
  min-width: 0;
}

.item-heading-copy {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 10px;
}

.ecosystem-rail {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.ecosystem-rail-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.ecosystem-title {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: rgba(235, 241, 255, 0.78);
}

.ecosystem-flow {
  font-size: 12px;
  color: rgba(196, 208, 231, 0.7);
}

.ecosystem-stat-list {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.ecosystem-stat-chip,
.ecosystem-lane-chip,
.ecosystem-cta {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 32px;
  padding: 6px 12px;
  border-radius: 999px;
  border: 1px solid rgba(148, 163, 184, 0.22);
  background: rgba(9, 13, 22, 0.46);
  color: rgba(238, 244, 255, 0.9);
}

.ecosystem-stat-chip strong {
  font-size: 11px;
  color: rgba(148, 163, 184, 0.9);
}

.ecosystem-stat-chip span {
  font-size: 12px;
}

.ecosystem-lane-chip {
  font-size: 11px;
}

.ecosystem-lane-chip.is-ready {
  border-color: rgba(74, 222, 128, 0.28);
  color: rgba(187, 247, 208, 0.95);
}

.ecosystem-lane-chip.is-missing {
  border-color: rgba(251, 191, 36, 0.28);
  color: rgba(253, 230, 138, 0.95);
}

.ecosystem-cta {
  cursor: pointer;
  font: inherit;
}

.ecosystem-cta-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.ecosystem-cta-secondary {
  border-color: rgba(250, 204, 21, 0.24);
  color: rgba(252, 233, 166, 0.92);
}

.ecosystem-cta:hover {
  border-color: rgba(125, 211, 252, 0.34);
  color: #ffffff;
}

.item-icon {
  width: 44px;
  height: 44px;
  image-rendering: pixelated;
  image-rendering: crisp-edges;
  filter: drop-shadow(0 4px 8px rgba(0, 0, 0, 0.34));
}

.recipe-header h1 {
  margin: 0;
  font-size: 30px;
  font-weight: 700;
  color: rgba(236, 243, 252, 0.98);
  letter-spacing: 0.2px;
}

.recipe-tabs {
  display: flex;
  gap: 8px;
}

.recipe-search-row {
  margin-top: 10px;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 10px;
}

.tab {
  flex: 1;
  height: 38px;
  padding: 0 12px;
  background: linear-gradient(180deg, rgba(20, 25, 33, 0.84), rgba(14, 18, 24, 0.88));
  border: 1px solid rgba(var(--rv-accent-rgb), 0.12);
  border-radius: 9px;
  color: rgba(186, 199, 217, 0.9);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: border-color 180ms ease, background 180ms ease, color 180ms ease, box-shadow 180ms ease;
}

.tab:hover {
  border-color: rgba(var(--rv-accent-strong-rgb), 0.22);
  color: rgba(225, 235, 246, 0.96);
}

.tab-active {
  border-color: rgba(var(--rv-accent-strong-rgb), 0.28);
  color: rgba(236, 243, 252, 0.98);
  background: linear-gradient(180deg, rgba(30, 36, 46, 0.9), rgba(19, 24, 31, 0.92));
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.045),
    0 0 0 1px rgba(var(--rv-accent-rgb), 0.1);
}

.machine-name {
  text-align: center;
  padding: 12px 14px;
  color: rgba(229, 238, 249, 0.98);
  font-size: 18px;
  font-weight: 700;
}

.keyboard-shortcut-hint {
  margin: -2px 0 8px;
  text-align: center;
  font-size: 12px;
  color: rgba(186, 199, 217, 0.86);
}

.variant-scaffold {
  background: linear-gradient(180deg, rgba(14, 18, 24, 0.84), rgba(10, 14, 19, 0.88));
  border: 1px solid rgba(var(--rv-accent-rgb), 0.14);
  border-radius: 12px;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.03),
    0 10px 26px rgba(0, 0, 0, 0.28);
  padding: 10px 12px;
}

.variant-head {
  font-size: 12px;
  color: rgba(190, 204, 222, 0.86);
  margin-bottom: 8px;
}

.variant-list {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 8px;
}

.variant-entry {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  font-size: 12px;
  color: rgba(220, 229, 241, 0.92);
}

.variant-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.variant-preview {
  flex: 1;
  min-width: 0;
  font-size: 11px;
  color: rgba(189, 205, 224, 0.84);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.variant-select {
  min-width: 220px;
  height: 30px;
  border-radius: 8px;
  border: 1px solid rgba(var(--rv-accent-rgb), 0.2);
  background: rgba(16, 21, 29, 0.9);
  color: rgba(226, 236, 248, 0.95);
  font-size: 12px;
}

.variant-controls {
  display: flex;
  align-items: center;
  gap: 8px;
}

.variant-switch-btn {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  border: 1px solid rgba(var(--rv-accent-rgb), 0.2);
  background: linear-gradient(180deg, rgba(21, 28, 36, 0.88), rgba(14, 19, 26, 0.9));
  color: rgba(229, 238, 248, 0.96);
  font-size: 12px;
  cursor: pointer;
}

.variant-switch-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.pagination {
  --recipe-pager-gap: 10px;
  --recipe-pager-justify: center;
  --recipe-pager-info-min-width: 92px;
  padding: 10px;
}

.recipe-grid-scaffold {
  padding: 0 10px 10px;
}

.recipe-display {
  position: relative;
  padding: 12px;
  min-height: clamp(340px, 42vh, 640px);
  overflow: visible;
}

.tone-arcane .recipe-display,
.tone-blood .recipe-display {
  min-height: auto;
}

.recipe-workbench-canvas .recipe-display {
  min-height: clamp(620px, 70vh, 820px);
  padding: 12px 10px;
}

.recipe-detail-status {
  position: relative;
  z-index: 1;
  margin-bottom: 8px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.recipe-detail-pill {
  display: inline-flex;
  align-items: center;
  min-height: 26px;
  padding: 0 10px;
  border-radius: 999px;
  border: 1px solid rgba(var(--rv-accent-rgb), 0.22);
  background: rgba(10, 16, 23, 0.82);
  font-size: 12px;
  color: rgba(221, 231, 245, 0.93);
}

.recipe-detail-pill-loading {
  border-color: rgba(125, 170, 222, 0.34);
  color: rgba(198, 224, 250, 0.95);
}

.recipe-detail-pill-fallback {
  border-color: rgba(188, 167, 126, 0.36);
  color: rgba(237, 221, 191, 0.95);
}

.recipe-detail-pill-ready {
  border-color: rgba(130, 183, 150, 0.32);
  color: rgba(198, 235, 208, 0.95);
}

.recipe-detail-retry {
  height: 24px;
  padding: 0 10px;
  border-radius: 999px;
  border: 1px solid rgba(var(--rv-accent-rgb), 0.24);
  background: rgba(18, 24, 32, 0.74);
  color: rgba(229, 238, 249, 0.96);
  font-size: 11px;
  cursor: pointer;
  transition: border-color 160ms ease, background 160ms ease;
}

.recipe-detail-retry:hover {
  border-color: rgba(var(--rv-accent-strong-rgb), 0.3);
  background: rgba(24, 31, 41, 0.8);
}

.recipe-display::before {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: inherit;
  pointer-events: none;
  background:
    radial-gradient(72% 46% at 50% 0%, rgba(255, 255, 255, 0.034), transparent 72%),
    radial-gradient(80% 60% at 50% 120%, rgba(67, 82, 107, 0.11), transparent 74%);
}

.recipe-display-frame {
  position: relative;
  z-index: 1;
  width: 100%;
  height: 100%;
  min-height: clamp(316px, 40vh, 612px);
  border-radius: 10px;
  border: 1px solid rgba(var(--rv-accent-rgb), 0.12);
  background: linear-gradient(180deg, rgba(12, 16, 21, 0.72), rgba(10, 13, 18, 0.78));
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.025),
    0 12px 30px rgba(0, 0, 0, 0.3);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.recipe-workbench-canvas .recipe-display-frame {
  min-height: clamp(590px, 68vh, 790px);
  align-items: stretch;
}

.recipe-stage-shell {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: visible;
}

.recipe-workbench-canvas .recipe-stage-shell {
  align-items: stretch;
}

.stacked-furnace-recipes {
  width: 100%;
  min-height: 100%;
  display: grid;
  grid-template-rows: repeat(2, minmax(0, 1fr));
  gap: 0;
  align-items: stretch;
  position: relative;
  overflow: hidden;
  border-radius: 28px;
  border: 1px solid rgba(148, 163, 184, 0.18);
  background:
    radial-gradient(circle at 50% 50%, rgba(249, 115, 22, 0.08), transparent 34%),
    linear-gradient(180deg, rgba(9, 14, 22, 0.96), rgba(4, 8, 14, 0.99));
  box-shadow:
    0 22px 58px rgba(2, 8, 23, 0.46),
    inset 0 1px 0 rgba(255, 255, 255, 0.05);
}

.stacked-furnace-recipes::before {
  content: '';
  position: absolute;
  inset: 28px;
  border-radius: 22px;
  border: 1px solid rgba(148, 163, 184, 0.08);
  pointer-events: none;
  background:
    linear-gradient(rgba(180, 205, 235, 0.018) 1px, transparent 1px),
    linear-gradient(90deg, rgba(180, 205, 235, 0.018) 1px, transparent 1px);
  background-size: 24px 24px;
  mask-image: radial-gradient(circle at center, #000 0 64%, transparent 96%);
}

.stacked-furnace-recipes::after {
  content: '';
  position: absolute;
  left: 36px;
  right: 36px;
  top: 50%;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(148, 163, 184, 0.20), transparent);
  pointer-events: none;
}

.stacked-furnace-recipes :deep(.recipe-display-wrapper) {
  position: relative;
  z-index: 1;
  min-height: 0;
}

.stacked-furnace-recipes :deep(.furnace-ui) {
  --furnace-slot-size: 64px;
  --furnace-icon-size: 44px;
  width: 100%;
  height: 100%;
  min-height: 0;
  padding: 8px 16px;
  overflow: visible;
}

.stacked-furnace-recipes :deep(.scene-bg) {
  display: none;
}

.stacked-furnace-recipes :deep(.furnace-shell) {
  width: min(1020px, 100%);
  min-height: 0;
  height: 100%;
  grid-template-columns: 180px minmax(250px, 1fr) 180px;
  gap: 34px;
  padding: 18px 44px;
  border: 0;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
}

.stacked-furnace-recipes :deep(.furnace-shell::before) {
  inset: 18px 32px;
  border-color: rgba(148, 163, 184, 0.05);
  background: radial-gradient(circle at 50% 50%, rgba(249, 115, 22, 0.045), transparent 30%);
}

.stacked-furnace-recipes :deep(.furnace-panel) {
  min-height: 150px;
  padding: 26px 20px 20px;
  border-radius: 20px;
}

.stacked-furnace-recipes :deep(.heat-core) {
  min-height: 210px;
}

.stacked-furnace-recipes :deep(.thermal-core) {
  width: 92px;
  height: 92px;
  border-radius: 24px;
}

.stacked-furnace-recipes :deep(.thermal-track) {
  left: 0;
  right: 0;
  height: 88px;
}

.stacked-furnace-recipes :deep(.thermal-line) {
  opacity: 0.56;
}

.stacked-furnace-recipes :deep(.thermal-caption) {
  bottom: 18px;
  font-size: 9px;
}

.recipe-stage-state-panel {
  --recipe-state-width: min(560px, 100%);
  --recipe-state-padding: 24px 20px;
  --recipe-state-border-style: dashed;
  --recipe-state-border-color: rgba(var(--rv-accent-rgb), 0.32);
}

@media (max-width: 768px) {
  .recipe-view {
    padding: 16px 10px 20px;
  }

  .recipe-top-bar {
    margin-bottom: 10px;
  }

  .back-button,
  .blueprint-button {
    height: 34px;
    padding: 0 12px;
    font-size: 12px;
  }

  .recipe-header {
    padding: 14px;
  }

  .recipe-header h1 {
    font-size: 18px;
  }

  .item-icon {
    width: 36px;
    height: 36px;
  }

  .tab {
    font-size: 12px;
  }

  .variant-list {
    grid-template-columns: 1fr;
  }

  .variant-entry {
    align-items: flex-start;
    flex-direction: column;
  }

  .variant-controls {
    width: 100%;
  }

  .variant-select {
    min-width: 0;
    width: 100%;
  }

  .machine-name {
    font-size: 15px;
  }

}

@media (min-width: 1600px) {
  .recipe-view {
    --recipe-shell-width: min(1320px, 92vw);
  }
}

@media (min-width: 1920px) {
  .recipe-view {
    --recipe-shell-width: min(1480px, 91vw);
  }
}

@media (min-width: 2560px) {
  .recipe-view {
    --recipe-shell-width: min(1680px, 90vw);
  }
}

@media (min-width: 3200px) {
  .recipe-view {
    --recipe-shell-width: min(1960px, 88vw);
  }
}
</style>
