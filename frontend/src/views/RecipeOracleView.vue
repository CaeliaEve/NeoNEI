<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import RecipeDisplayRouter from '../components/RecipeDisplayRouter.vue';
import RecipeChromeButton from '../components/RecipeChromeButton.vue';
import RecipeBrowserStage from '../components/RecipeBrowserStage.vue';
import RecipeBrowseControls from '../components/RecipeBrowseControls.vue';
import { api, getImageUrl, type EcosystemOverview, type ItemSearchBasic } from '../services/api';
import { useSound } from '../services/sound.service';
import { useRecipeViewer } from '../composables/useRecipeViewer';
import { useRecipeRouteSync } from '../composables/useRecipeRouteSync';

type RecipeTab = 'producedBy' | 'usedIn';

const route = useRoute();
const router = useRouter();
const { playClick } = useSound();
const oracleQueryInputId = 'recipe-oracle-query-input';

const itemId = computed(() => {
  const routeItemId = route.params.itemId;
  return typeof routeItemId === 'string' && routeItemId.length > 0 ? routeItemId : undefined;
});

const {
  loading,
  item,
  recipes,
  currentTab,
  recipeSearchQuery,
  loadError,
  selectedMachineIndex,
  currentPage,
  machineCategories,
  currentCategory,
  currentCategoryPages,
  currentPageRecipes,
  currentRecipeId,
  totalPages,
  selectMachine: selectMachineFromViewer,
  nextPage,
  prevPage,
  setCurrentTab,
  retryLoadRecipes,
  selectRecipeById,
  clearRecipeSearch,
} = useRecipeViewer(itemId, playClick);

const searchText = ref('');
const searchLoading = ref(false);
const searchResults = ref<ItemSearchBasic[]>([]);
const ecosystemOverview = ref<EcosystemOverview | null>(null);

let searchDebounceTimer: ReturnType<typeof setTimeout> | undefined;
let searchAbortController: AbortController | null = null;
let searchRequestSeq = 0;

const selectedItem = computed(() => (itemId.value ? item.value : null));
const loadingRecipeData = computed(() => Boolean(itemId.value) && loading.value);
const errorMessage = computed(() => (selectedItem.value ? loadError.value : ''));
const selectedRecipeIndex = computed(() => currentPage.value);
const currentRecipe = computed(() => {
  if (!selectedItem.value) return null;
  return currentPageRecipes.value[0] || null;
});

const ecosystemStats = computed(() => {
  if (!selectedItem.value) {
    return [];
  }
  return [
    { label: '来源模组', value: selectedItem.value.modId },
    { label: '来源', value: String(recipes.value.producedBy.length) },
    { label: '用途', value: String(recipes.value.usedIn.length) },
  ];
});

const ecosystemLaneStatus = computed(() =>
  ecosystemOverview.value?.lanes.map((lane) => ({
    id: lane.id,
    label: lane.label,
    ok: lane.detected && lane.details.every((entry) => entry.ok),
  })) ?? []
);

const browseTabs = computed(() => [
  {
    key: 'producedBy',
    label: '合成来源',
    count: recipes.value.producedBy.length,
    disabled: recipes.value.producedBy.length === 0,
    visible: recipes.value.producedBy.length > 0,
  },
  {
    key: 'usedIn',
    label: '用途',
    count: recipes.value.usedIn.length,
    disabled: recipes.value.usedIn.length === 0,
    visible: recipes.value.usedIn.length > 0,
  },
]);

const oracleStageKey = computed(() => {
  if (loading.value) return 'loading';
  if (errorMessage.value) return `error-${errorMessage.value}`;
  if (!selectedItem.value) return 'empty-item';
  if (!currentRecipe.value) return `empty-recipe-${selectedItem.value.itemId}`;
  return `${currentTab.value}-${currentCategory.value?.name || 'none'}-${currentRecipe.value.recipeId}-${selectedRecipeIndex.value}`;
});

const canGoPrevRecipe = computed(() => Boolean(selectedItem.value) && currentPage.value > 0);
const canGoNextRecipe = computed(
  () => Boolean(selectedItem.value) && currentPage.value < Math.max(0, totalPages.value - 1),
);

function isRequestCanceled(error: unknown): boolean {
  const e = error as { name?: string; code?: string };
  return e?.name === 'AbortError' || e?.name === 'CanceledError' || e?.code === 'ERR_CANCELED';
}

async function searchItems(keyword: string) {
  const trimmed = keyword.trim();
  const requestSeq = ++searchRequestSeq;

  if (!trimmed) {
    if (searchAbortController) {
      searchAbortController.abort();
      searchAbortController = null;
    }
    searchLoading.value = false;
    searchResults.value = [];
    return;
  }

  if (searchAbortController) {
    searchAbortController.abort();
  }
  const controller = new AbortController();
  searchAbortController = controller;

  searchLoading.value = true;
  try {
    const results = await api.searchItemsFast(trimmed, 24, { signal: controller.signal });
    if (requestSeq !== searchRequestSeq) {
      return;
    }
    searchResults.value = results;
  } catch (error) {
    if (isRequestCanceled(error)) {
      return;
    }
    console.error('Failed to search items:', error);
    searchResults.value = [];
  } finally {
    if (searchAbortController === controller) {
      searchAbortController = null;
    }
    if (requestSeq === searchRequestSeq) {
      searchLoading.value = false;
    }
  }
}

watch(searchText, (value) => {
  if (searchDebounceTimer) {
    clearTimeout(searchDebounceTimer);
  }
  searchDebounceTimer = setTimeout(() => {
    void searchItems(value);
  }, 180);
});

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
  totalPages,
  currentCategoryPageCount: computed(() => currentCategoryPages.value.length),
  selectRecipeById,
  clearSearchOnMissingQuery: true,
});

async function openItem(nextItemId: string) {
  await router.replace({
    name: 'recipe-oracle',
    params: { itemId: nextItemId },
  });
}

function pickSearchResult(entry: ItemSearchBasic) {
  searchText.value = entry.localizedName;
  searchResults.value = [];
  void openItem(entry.itemId);
}

function retryLoadCurrentItem() {
  retryLoadRecipes();
}

function clearCurrentItem() {
  searchText.value = '';
  searchResults.value = [];
  clearRecipeSearch();
  void router.replace({ name: 'recipe-oracle' });
}

function selectMachine(index: number) {
  selectMachineFromViewer(index);
}

function switchTab(tab: RecipeTab) {
  setCurrentTab(tab);
  selectedMachineIndex.value = 0;
  currentPage.value = 0;
}

function nextRecipe() {
  nextPage();
}

function prevRecipe() {
  prevPage();
}

function handleRecipeItemClick(clickedItemId: string) {
  void openItem(clickedItemId);
}

onMounted(() => {
  void api.getEcosystemOverview()
    .then((overview) => {
      ecosystemOverview.value = overview;
    })
    .catch((error) => {
      console.error('Failed to load ecosystem overview:', error);
    });
});

onUnmounted(() => {
  if (searchDebounceTimer) {
    clearTimeout(searchDebounceTimer);
  }
  if (searchAbortController) {
    searchAbortController.abort();
    searchAbortController = null;
  }
});
</script>

<template>
  <div class="oracle-shell">
    <div class="aurora-layer"></div>
    <div class="star-layer"></div>

    <header class="oracle-header">
      <button class="back-link" @click="router.push('/')">返回首页</button>
      <div class="title-wrap">
        <p class="eyebrow">RECIPE ORACLE</p>
        <h1>配方索引</h1>
        <p class="subtitle">配方浏览器（统一界面）</p>
      </div>
    </header>

    <main class="oracle-grid">
      <section class="query-panel">
        <label class="query-label" :for="oracleQueryInputId">输入物品名 / Item ID</label>
        <input
          :id="oracleQueryInputId"
          v-model="searchText"
          type="text"
          class="query-input"
          placeholder="例如：sodium cyanide / gt.metaitem.01 / gregtech:gt.metaitem.01"
        />
        <p v-if="searchLoading" class="query-tip">正在搜索物品...</p>
        <p v-else-if="searchText.trim() && searchResults.length === 0" class="query-tip">未找到匹配物品</p>

        <div v-if="searchResults.length > 0" class="result-list">
          <button
            v-for="entry in searchResults"
            :key="entry.itemId"
            class="result-item"
            @click="pickSearchResult(entry)"
          >
            <img
              :src="getImageUrl(entry.itemId)"
              :alt="`搜索结果图标：${entry.localizedName}（${entry.itemId}）`"
              class="result-icon"
            />
            <div class="result-text">
              <strong>{{ entry.localizedName }}</strong>
              <span>{{ entry.modId }} / {{ entry.itemId }}</span>
            </div>
          </button>
        </div>

        <div class="panel-footer">
          <RecipeChromeButton tone="quiet" @click="clearCurrentItem">清空当前查询</RecipeChromeButton>
        </div>
      </section>

      <section class="display-panel">
        <RecipeBrowseControls
          :tabs="browseTabs"
          :active-tab="currentTab"
          :machine-categories="machineCategories"
          :selected-machine-index="selectedMachineIndex"
          :progress-text="currentCategory ? String(selectedRecipeIndex + 1) + ' / ' + String(totalPages) : '0 / 0'"
          prev-label="上一配方"
          next-label="下一配方"
          prev-title="上一配方 / Prev"
          next-title="下一配方 / Next"
          prev-test-id="oracle-prev-recipe"
          next-test-id="oracle-next-recipe"
          :prev-disabled="!canGoPrevRecipe"
          :next-disabled="!canGoNextRecipe"
          pager-class="stage-footer"
          @select-tab="(tab) => switchTab(tab as RecipeTab)"
          @select-machine="selectMachine"
          @prev="prevRecipe"
          @next="nextRecipe"
        >
          <template #summary>
            <div v-if="selectedItem" class="selected-item">
              <img
                :src="getImageUrl(selectedItem.itemId)"
                :alt="`当前物品图标：${selectedItem.localizedName}（${selectedItem.itemId}）`"
                class="selected-item-icon"
              />
              <div>
                <p class="selected-item-name">{{ selectedItem.localizedName }}</p>
                <p class="selected-item-id">{{ selectedItem.itemId }}</p>
                <div class="oracle-ecosystem-rail">
                  <div class="oracle-ecosystem-head">
                    <span class="oracle-ecosystem-title">Ecosystem</span>
                    <span class="oracle-ecosystem-flow">NESQL++ → NeoNEI → OC Pattern</span>
                  </div>
                  <div class="oracle-ecosystem-stat-list">
                    <span v-for="stat in ecosystemStats" :key="stat.label" class="oracle-ecosystem-chip">
                      <strong>{{ stat.label }}</strong>
                      <span>{{ stat.value }}</span>
                    </span>
                    <span
                      v-for="lane in ecosystemLaneStatus"
                      :key="lane.id"
                      :class="['oracle-ecosystem-lane', lane.ok ? 'is-ready' : 'is-missing']"
                    >
                      {{ lane.label }}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </template>
        </RecipeBrowseControls>

        <div class="display-stage">
          <RecipeBrowserStage
            :stage-key="oracleStageKey"
            transition-name="oracle-stage-morph"
            stage-shell-class="oracle-stage-slot"
            state-panel-class="state-box"
            :loading="loadingRecipeData"
            loading-title="正在整理配方数据..."
            loading-subtitle="请稍候，系统正在同步该物品的配方索引。"
            :error-title="errorMessage"
            error-subtitle="可以重试当前物品，或清空查询后重新选择。"
            :empty="!selectedItem || !currentRecipe"
            :empty-title="selectedItem ? '该物品暂无可显示配方' : '先在左侧选择一个物品'"
            :empty-subtitle="selectedItem ? '可切换“合成来源 / 用途配方”，或重新选择其他物品。' : '可输入物品名或 Item ID，点击结果后查看配方。'"
          >
            <template #error-actions>
              <RecipeChromeButton @click="retryLoadCurrentItem">重试</RecipeChromeButton>
              <RecipeChromeButton @click="clearCurrentItem">清空查询</RecipeChromeButton>
            </template>

            <template v-if="selectedItem && !currentRecipe" #empty-actions>
              <RecipeChromeButton @click="retryLoadCurrentItem">重新加载</RecipeChromeButton>
              <RecipeChromeButton @click="clearCurrentItem">重新选择物品</RecipeChromeButton>
            </template>

            <template #content>
              <RecipeDisplayRouter
                :recipe="currentRecipe"
                :scale-to-fit="true"
                @item-click="handleRecipeItemClick"
              />
            </template>
          </RecipeBrowserStage>
        </div>
      </section>
    </main>
  </div>
</template>

<style scoped>
.oracle-shell {
  --or-accent-rgb: 158, 176, 198;
  --or-accent-strong-rgb: 192, 207, 226;
  --recipe-accent-rgb: var(--or-accent-rgb);
  --recipe-accent-strong-rgb: var(--or-accent-strong-rgb);
  min-height: 100vh;
  color: rgba(228, 237, 248, 0.96);
  background: transparent;
  position: relative;
  overflow: hidden;
  font-family: "Segoe UI", "Microsoft YaHei UI", "PingFang SC", sans-serif;
  --oracle-shell-width: min(1780px, var(--app-shell-max-width, 96vw));
  --oracle-left-col: minmax(300px, 420px);
}

.aurora-layer,
.star-layer {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 0;
}

.aurora-layer {
  background:
    radial-gradient(65% 42% at 50% -8%, rgba(255, 255, 255, 0.05), transparent 72%),
    radial-gradient(48% 42% at 10% 90%, rgba(92, 108, 136, 0.11), transparent 74%),
    radial-gradient(45% 38% at 88% 12%, rgba(71, 87, 116, 0.1), transparent 74%);
  filter: blur(12px);
  animation: drift 26s ease-in-out infinite alternate;
}

.star-layer {
  background-image:
    repeating-linear-gradient(0deg, rgba(255, 255, 255, 0.01) 0 1px, transparent 1px 3px),
    radial-gradient(120% 105% at 50% 50%, transparent 58%, rgba(0, 0, 0, 0.42) 100%);
  opacity: 0.2;
  animation: pulse 16s ease-in-out infinite;
}

.oracle-header,
.oracle-grid {
  position: relative;
  z-index: 1;
}

.oracle-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 24px 18px 14px;
  width: min(var(--oracle-shell-width), 100%);
  margin-inline: auto;
}

.back-link {
  height: 38px;
  border: 1px solid rgba(var(--or-accent-rgb), 0.15);
  background: linear-gradient(180deg, rgba(16, 20, 27, 0.84), rgba(12, 15, 20, 0.88));
  color: rgba(226, 235, 246, 0.96);
  border-radius: 9px;
  padding: 0 14px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: border-color 180ms ease, background 180ms ease, transform 180ms ease;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.03),
    0 5px 14px rgba(0, 0, 0, 0.28);
}

.back-link:hover {
  border-color: rgba(var(--or-accent-strong-rgb), 0.24);
  background: linear-gradient(180deg, rgba(22, 28, 36, 0.88), rgba(14, 19, 25, 0.92));
  transform: translateY(-1px);
}

.title-wrap {
  text-align: right;
}

.title-wrap h1 {
  margin: 0;
  font-size: clamp(28px, 4vw, 46px);
  letter-spacing: 0.02em;
  color: rgba(238, 244, 253, 0.98);
}

.eyebrow,
.subtitle {
  margin: 0;
  color: rgba(187, 201, 220, 0.84);
}

.eyebrow {
  letter-spacing: 0.3em;
  font-size: 11px;
}

.subtitle {
  font-size: 13px;
}

.oracle-grid {
  display: grid;
  grid-template-columns: var(--oracle-left-col) 1fr;
  gap: 14px;
  padding: 0 18px 20px;
  width: min(var(--oracle-shell-width), 100%);
  margin-inline: auto;
}

.query-panel,
.display-panel {
  border: 1px solid rgba(var(--or-accent-rgb), 0.14);
  background: linear-gradient(180deg, rgba(14, 18, 24, 0.84), rgba(10, 14, 19, 0.88));
  border-radius: 12px;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.03),
    0 10px 26px rgba(0, 0, 0, 0.28);
}

.query-panel {
  padding: 14px;
  display: flex;
  flex-direction: column;
  min-height: 78vh;
}

.query-label {
  font-size: 12px;
  letter-spacing: 0.12em;
  color: rgba(183, 197, 215, 0.82);
  margin-bottom: 8px;
}

.query-input {
  width: 100%;
  border: 1px solid rgba(var(--or-accent-rgb), 0.14);
  background: linear-gradient(180deg, rgba(18, 23, 31, 0.86), rgba(12, 16, 22, 0.9));
  color: rgba(236, 243, 252, 0.98);
  border-radius: 9px;
  padding: 10px 12px;
  font-size: 14px;
  outline: none;
  transition: border-color 170ms ease, box-shadow 170ms ease;
}

.query-input:focus {
  border-color: rgba(var(--or-accent-strong-rgb), 0.24);
  box-shadow:
    0 0 0 1px rgba(var(--or-accent-rgb), 0.14),
    0 4px 12px rgba(0, 0, 0, 0.24);
}

.query-tip {
  margin: 8px 0 0;
  font-size: 12px;
  color: rgba(183, 197, 215, 0.78);
}

.result-list {
  margin-top: 10px;
  display: grid;
  gap: 8px;
  overflow: auto;
  padding-right: 4px;
}

.result-item {
  border: 1px solid rgba(var(--or-accent-rgb), 0.14);
  background: linear-gradient(180deg, rgba(20, 26, 34, 0.82), rgba(14, 18, 25, 0.86));
  border-radius: 10px;
  display: flex;
  align-items: center;
  gap: 10px;
  text-align: left;
  padding: 9px 10px;
  color: rgba(234, 242, 252, 0.96);
  cursor: pointer;
  transition: border-color 0.2s ease, transform 0.2s ease, background 0.2s ease;
}

.result-item:hover {
  border-color: rgba(var(--or-accent-strong-rgb), 0.24);
  background: linear-gradient(180deg, rgba(24, 31, 40, 0.9), rgba(17, 22, 29, 0.94));
  transform: translateY(-1px);
}

.result-icon {
  width: 34px;
  height: 34px;
  object-fit: contain;
}

.result-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.result-text strong,
.result-text span {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.result-text strong {
  font-size: 13px;
}

.result-text span {
  font-size: 11px;
  opacity: 0.72;
}

.panel-footer {
  margin-top: auto;
  padding-top: 12px;
}

.display-panel {
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 78vh;
}

.selected-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px;
  border-radius: 10px;
  border: 1px solid rgba(var(--or-accent-rgb), 0.14);
  background: linear-gradient(180deg, rgba(17, 22, 30, 0.76), rgba(12, 16, 22, 0.8));
  min-width: 0;
}

.selected-item-icon {
  width: 46px;
  height: 46px;
  object-fit: contain;
}

.selected-item-name {
  margin: 0;
  font-size: 18px;
  color: rgba(236, 243, 252, 0.98);
}

.selected-item-id {
  margin: 4px 0 0;
  font-size: 11px;
  color: rgba(185, 199, 217, 0.78);
}

.oracle-ecosystem-rail {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 10px;
}

.oracle-ecosystem-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.oracle-ecosystem-title {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: rgba(235, 241, 255, 0.8);
}

.oracle-ecosystem-flow {
  font-size: 12px;
  color: rgba(185, 201, 228, 0.72);
}

.oracle-ecosystem-stat-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.oracle-ecosystem-chip,
.oracle-ecosystem-lane {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 31px;
  padding: 6px 12px;
  border-radius: 999px;
  border: 1px solid rgba(148, 163, 184, 0.24);
  background: rgba(8, 12, 19, 0.42);
  color: rgba(240, 245, 255, 0.92);
}

.oracle-ecosystem-chip strong {
  font-size: 11px;
  color: rgba(148, 163, 184, 0.9);
}

.oracle-ecosystem-lane {
  font-size: 11px;
}

.oracle-ecosystem-lane.is-ready {
  border-color: rgba(74, 222, 128, 0.28);
  color: rgba(187, 247, 208, 0.95);
}

.oracle-ecosystem-lane.is-missing {
  border-color: rgba(251, 191, 36, 0.28);
  color: rgba(253, 230, 138, 0.95);
}

.tab-row {
  display: flex;
  gap: 8px;
}

.tab-btn {
  border: 1px solid rgba(var(--or-accent-rgb), 0.14);
  background: linear-gradient(180deg, rgba(20, 25, 33, 0.84), rgba(14, 18, 24, 0.88));
  color: rgba(186, 199, 217, 0.9);
  padding: 8px 10px;
  border-radius: 9px;
  cursor: pointer;
  font-weight: 600;
  transition: border-color 170ms ease, background 170ms ease, color 170ms ease;
}

.tab-btn.active {
  border-color: rgba(var(--or-accent-strong-rgb), 0.28);
  color: rgba(236, 243, 252, 0.98);
  background: linear-gradient(180deg, rgba(30, 36, 46, 0.9), rgba(19, 24, 31, 0.92));
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.045),
    0 0 0 1px rgba(var(--or-accent-rgb), 0.1);
}

.tab-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.machine-rail {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding-bottom: 4px;
}

.machine-pill {
  border: 1px solid rgba(var(--or-accent-rgb), 0.14);
  background: linear-gradient(180deg, rgba(20, 25, 33, 0.84), rgba(14, 18, 24, 0.88));
  color: rgba(223, 233, 245, 0.95);
  border-radius: 9px;
  padding: 8px 9px;
  min-width: 120px;
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  transition: border-color 170ms ease, background 170ms ease;
}

.machine-pill.active {
  border-color: rgba(var(--or-accent-strong-rgb), 0.3);
  background: linear-gradient(180deg, rgba(30, 36, 46, 0.9), rgba(19, 24, 31, 0.92));
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.045),
    0 0 0 1px rgba(var(--or-accent-rgb), 0.1);
}

.machine-icon {
  width: 20px;
  height: 20px;
  object-fit: contain;
}

.machine-pill span {
  flex: 1;
  font-size: 12px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.machine-pill em {
  font-style: normal;
  font-size: 11px;
  opacity: 0.74;
}

.display-stage {
  flex: 1;
  min-height: 360px;
  border: 1px solid rgba(var(--or-accent-rgb), 0.14);
  border-radius: 10px;
  background: linear-gradient(180deg, rgba(12, 16, 21, 0.72), rgba(10, 13, 18, 0.78));
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.025),
    0 12px 30px rgba(0, 0, 0, 0.3);
  padding: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.oracle-stage-slot {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.oracle-stage-morph-enter-active,
.oracle-stage-morph-leave-active {
  transition: opacity 220ms ease, transform 220ms ease, filter 220ms ease;
}

.oracle-stage-morph-enter-from,
.oracle-stage-morph-leave-to {
  opacity: 0;
  transform: translateY(8px) scale(0.992);
  filter: blur(4px);
}

.state-box {
  --recipe-state-width: min(560px, 100%);
  --recipe-state-max-width: 520px;
  --recipe-state-gap: 8px;
  --recipe-state-padding: 20px;
  --recipe-state-radius: 10px;
  --recipe-state-border-style: dashed;
  --recipe-state-border-color: rgba(var(--or-accent-rgb), 0.36);
  --recipe-state-text-color: rgba(208, 220, 237, 0.9);
  --recipe-state-title-size: 16px;
  --recipe-state-title-color: rgba(233, 241, 251, 0.98);
  --recipe-state-subtitle-size: 13px;
  --recipe-state-subtitle-color: rgba(187, 201, 220, 0.86);
  --recipe-state-actions-gap: 8px;
  --recipe-state-error-border-color: rgba(237, 152, 157, 0.64);
  --recipe-state-error-title-color: rgba(255, 220, 223, 0.98);
  --recipe-state-error-subtitle-color: rgba(255, 199, 205, 0.9);
}

.stage-footer {
  --recipe-pager-gap: 12px;
  --recipe-pager-justify: center;
  --recipe-pager-info-min-width: 92px;
}

.ghost-btn {
  border: 1px solid rgba(var(--or-accent-rgb), 0.16);
  background: linear-gradient(180deg, rgba(20, 26, 34, 0.88), rgba(13, 18, 24, 0.92));
  color: rgba(226, 235, 246, 0.96);
  border-radius: 9px;
  padding: 8px 12px;
  cursor: pointer;
  transition: border-color 170ms ease, background 170ms ease;
}

.ghost-btn:hover:not(:disabled) {
  border-color: rgba(var(--or-accent-strong-rgb), 0.24);
  background: linear-gradient(180deg, rgba(25, 32, 41, 0.92), rgba(16, 21, 28, 0.94));
}

.ghost-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

@keyframes pulse {
  0%, 100% {
    opacity: 0.4;
  }
  50% {
    opacity: 0.68;
  }
}

@keyframes drift {
  0% {
    transform: translate3d(0, 0, 0) scale(1);
  }
  100% {
    transform: translate3d(2%, -2%, 0) scale(1.06);
  }
}

@media (max-width: 980px) {
  .oracle-grid {
    grid-template-columns: 1fr;
  }

  .query-panel,
  .display-panel {
    min-height: auto;
  }

  .oracle-header {
    flex-direction: row;
    align-items: center;
    padding-inline: 10px;
  }

  .title-wrap {
    text-align: right;
  }
}

@media (min-width: 1600px) {
  .oracle-shell {
    --oracle-shell-width: min(1980px, 95vw);
    --oracle-left-col: minmax(320px, 460px);
  }
}

@media (min-width: 1920px) {
  .oracle-shell {
    --oracle-shell-width: min(2180px, 94vw);
    --oracle-left-col: minmax(360px, 520px);
  }
}

@media (min-width: 2560px) {
  .oracle-shell {
    --oracle-shell-width: min(2480px, 94vw);
    --oracle-left-col: minmax(360px, 540px);
  }
}

@media (min-width: 3200px) {
  .oracle-shell {
    --oracle-shell-width: min(2980px, 92vw);
    --oracle-left-col: minmax(420px, 640px);
  }
}
</style>
