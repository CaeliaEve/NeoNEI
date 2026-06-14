<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import RecipeChromeButton from './RecipeChromeButton.vue';
import AnimatedItemIcon from './AnimatedItemIcon.vue';
import { api, type ItemSearchBasic } from '../services/api';
import { useRecipeHistory, type HistoryEntry } from '../services/recipeHistory.service';

type QuickDestination = 'home' | 'gt-diagrams' | 'forestry-bee-tree' | 'runtime-health';

const emit = defineEmits<{
  select: [itemId: string];
  clear: [];
  navigate: [destination: QuickDestination];
}>();

const { history } = useRecipeHistory();

const queryInputId = 'recipe-workspace-query-input';
const searchText = ref('');
const searchLoading = ref(false);
const searchResults = ref<ItemSearchBasic[]>([]);

let searchDebounceTimer: ReturnType<typeof setTimeout> | undefined;
let searchAbortController: AbortController | null = null;
let searchRequestSeq = 0;

const quickSearches = [
  '铁锭',
  '橡胶',
  'AFSU',
  '时空导线',
] as const;

const workspaceDestinations: Array<{
  id: QuickDestination;
  label: string;
  caption: string;
  code: string;
}> = [
  {
    id: 'home',
    label: '返回主页浏览区',
    caption: '从右侧 NEI 浏览区直接打开物品配方',
    code: 'NEI',
  },
  {
    id: 'gt-diagrams',
    label: 'GT 线路图',
    caption: '查看材料、线路与机器链路',
    code: 'GT',
  },
  {
    id: 'forestry-bee-tree',
    label: '林业遗传树',
    caption: '查看蜜蜂 / 树木等遗传路线',
    code: 'FR',
  },
  {
    id: 'runtime-health',
    label: '运行数据状态',
    caption: '检查本地资源包和 Native Runtime',
    code: 'RT',
  },
];

const recipeFamilies = [
  '工作台',
  '熔炉',
  '装配线',
  '化学反应釜',
  '神秘时代',
  '植物魔法',
] as const;

const recentEntries = computed(() => {
  const seen = new Set<string>();
  const entries: HistoryEntry[] = [];
  for (const entry of [...history.value].reverse()) {
    if (!entry.itemId || seen.has(entry.itemId)) {
      continue;
    }
    seen.add(entry.itemId);
    entries.push(entry);
    if (entries.length >= 8) {
      break;
    }
  }
  return entries;
});

const hasSearchText = computed(() => searchText.value.trim().length > 0);
const showSearchResults = computed(() => hasSearchText.value && (searchLoading.value || searchResults.value.length > 0));

function isRequestCanceled(error: unknown): boolean {
  const e = error as { name?: string; code?: string };
  return e?.name === 'AbortError' || e?.name === 'CanceledError' || e?.code === 'ERR_CANCELED';
}

function cancelSearchRequest() {
  if (searchAbortController) {
    searchAbortController.abort();
    searchAbortController = null;
  }
}

async function searchItems(keyword: string) {
  const trimmed = keyword.trim();
  const requestSeq = ++searchRequestSeq;

  if (!trimmed) {
    cancelSearchRequest();
    searchLoading.value = false;
    searchResults.value = [];
    return;
  }

  cancelSearchRequest();
  const controller = new AbortController();
  searchAbortController = controller;

  searchLoading.value = true;
  try {
    const results = await api.searchItemsFast(trimmed, 36, { signal: controller.signal });
    if (requestSeq !== searchRequestSeq) {
      return;
    }
    searchResults.value = results;
  } catch (error) {
    if (isRequestCanceled(error)) {
      return;
    }
    console.error('Failed to search recipe workspace items:', error);
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
  }, 150);
});

function pickItem(itemId: string) {
  if (!itemId) {
    return;
  }
  searchResults.value = [];
  emit('select', itemId);
}

function pickSearchResult(entry: ItemSearchBasic) {
  searchText.value = entry.localizedName;
  pickItem(entry.itemId);
}

function runQuickSearch(keyword: string) {
  searchText.value = keyword;
  void searchItems(keyword);
}

function clearSearch() {
  if (searchDebounceTimer) {
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = undefined;
  }
  cancelSearchRequest();
  searchText.value = '';
  searchResults.value = [];
  searchLoading.value = false;
  emit('clear');
}

function openDestination(destination: QuickDestination) {
  emit('navigate', destination);
}

onBeforeUnmount(() => {
  if (searchDebounceTimer) {
    clearTimeout(searchDebounceTimer);
  }
  cancelSearchRequest();
});
</script>

<template>
  <section class="recipe-workspace-panel" aria-labelledby="recipe-workspace-title">
    <div class="workspace-orbit" aria-hidden="true"></div>
    <div class="workspace-glow" aria-hidden="true"></div>

    <header class="workspace-header">
      <div>
        <p class="workspace-eyebrow">RECIPE WORKSPACE</p>
        <h1 id="recipe-workspace-title">配方中心</h1>
      </div>
      <p class="workspace-subtitle">
        主页浏览区是主要入口；这里用于快速回到最近配方、跳转常用工具，或直接搜索物品。
      </p>
    </header>

    <div class="command-bar" role="search">
      <label class="sr-only" :for="queryInputId">搜索物品或 Item ID</label>
      <div class="command-prefix" aria-hidden="true">/</div>
      <input
        :id="queryInputId"
        v-model="searchText"
        type="text"
        class="query-input"
        autocomplete="off"
        placeholder="快速跳转物品 / Item ID"
      />
      <RecipeChromeButton class="command-clear" tone="quiet" @click="clearSearch">
        清空
      </RecipeChromeButton>
    </div>

    <div class="quick-search-row" aria-label="常用搜索">
      <button
        v-for="keyword in quickSearches"
        :key="keyword"
        class="quick-chip"
        type="button"
        @click="runQuickSearch(keyword)"
      >
        {{ keyword }}
      </button>
    </div>

    <div v-if="showSearchResults" class="search-results-panel">
      <div class="section-title-row">
        <span class="section-kicker">SEARCH</span>
        <span class="section-muted">{{ searchLoading ? '正在搜索...' : `${searchResults.length} 个结果` }}</span>
      </div>
      <p v-if="searchLoading" class="query-tip">正在同步 Native 搜索索引...</p>
      <p v-else-if="searchResults.length === 0" class="query-tip">未找到匹配物品</p>
      <div v-else class="result-list">
        <button
          v-for="entry in searchResults"
          :key="entry.itemId"
          class="result-item"
          type="button"
          @click="pickSearchResult(entry)"
        >
          <AnimatedItemIcon
            :item-id="entry.itemId"
            :render-asset-ref="null"
            :image-file-name="null"
            :size="36"
            class="result-icon"
          />
          <span class="result-text">
            <strong>{{ entry.localizedName }}</strong>
            <span>{{ entry.modId }} / {{ entry.itemId }}</span>
          </span>
        </button>
      </div>
    </div>

    <div v-else class="workspace-grid">
      <section class="workspace-card recent-card" aria-labelledby="recent-recipes-title">
        <div class="section-title-row">
          <div>
            <span class="section-kicker">RECENT</span>
            <h2 id="recent-recipes-title">最近查看</h2>
          </div>
          <span class="section-muted">{{ recentEntries.length }} / 8</span>
        </div>

        <div v-if="recentEntries.length > 0" class="recent-grid">
          <button
            v-for="entry in recentEntries"
            :key="[entry.itemId, entry.timestamp].join(':')"
            class="recent-item"
            type="button"
            @click="pickItem(entry.itemId)"
          >
            <AnimatedItemIcon
              :item-id="entry.itemId"
              :render-asset-ref="null"
              :image-file-name="null"
              :size="40"
              class="recent-icon"
            />
            <span class="recent-copy">
              <strong>{{ entry.itemName }}</strong>
              <span>{{ entry.tab === 'usedIn' ? '用途' : '来源' }} · {{ entry.itemId }}</span>
            </span>
          </button>
        </div>

        <div v-else class="empty-recent">
          <p>打开任意物品配方后，这里会自动记录最近查看。</p>
          <button class="empty-action" type="button" @click="openDestination('home')">
            去主页浏览区选择物品
          </button>
        </div>
      </section>

      <aside class="workspace-side">
        <section class="workspace-card">
          <div class="section-title-row">
            <div>
              <span class="section-kicker">TOOLS</span>
              <h2>常用入口</h2>
            </div>
          </div>
          <div class="destination-list">
            <button
              v-for="destination in workspaceDestinations"
              :key="destination.id"
              class="destination-item"
              type="button"
              @click="openDestination(destination.id)"
            >
              <span class="destination-code">{{ destination.code }}</span>
              <span class="destination-copy">
                <strong>{{ destination.label }}</strong>
                <span>{{ destination.caption }}</span>
              </span>
            </button>
          </div>
        </section>

        <section class="workspace-card recipe-family-card">
          <div class="section-title-row">
            <div>
              <span class="section-kicker">FAMILIES</span>
              <h2>常见配方族</h2>
            </div>
          </div>
          <div class="family-grid">
            <span v-for="family in recipeFamilies" :key="family" class="family-chip">
              {{ family }}
            </span>
          </div>
          <p class="family-note">
            配方族会跟随具体物品自动展开；先从主页或搜索选择目标物品。
          </p>
        </section>
      </aside>
    </div>
  </section>
</template>

<style scoped>
.recipe-workspace-panel {
  width: min(1180px, 100%);
  min-height: min(76vh, 820px);
  margin-top: 22px;
  padding: clamp(20px, 3.4vw, 38px);
  border: 1px solid rgba(var(--rv-accent-rgb), 0.14);
  border-radius: 24px;
  background:
    linear-gradient(135deg, rgba(17, 22, 30, 0.78), rgba(7, 10, 15, 0.9)),
    radial-gradient(circle at 12% 4%, rgba(var(--rv-accent-strong-rgb), 0.12), transparent 34%),
    radial-gradient(circle at 92% 74%, rgba(var(--rv-accent-rgb), 0.1), transparent 42%);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.04),
    0 26px 80px rgba(0, 0, 0, 0.38);
  position: relative;
  overflow: hidden;
}

.workspace-orbit,
.workspace-glow {
  position: absolute;
  pointer-events: none;
}

.workspace-orbit {
  inset: 14px;
  border-radius: 20px;
  border: 1px solid rgba(var(--rv-accent-rgb), 0.06);
  background:
    linear-gradient(90deg, transparent, rgba(var(--rv-accent-rgb), 0.035), transparent),
    repeating-linear-gradient(90deg, rgba(255, 255, 255, 0.016) 0 1px, transparent 1px 64px);
  mask-image: linear-gradient(180deg, rgba(0, 0, 0, 0.88), transparent 90%);
}

.workspace-glow {
  width: 420px;
  height: 420px;
  right: -180px;
  top: -170px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(var(--rv-accent-rgb), 0.11), transparent 68%);
  filter: blur(10px);
}

.workspace-header,
.command-bar,
.quick-search-row,
.search-results-panel,
.workspace-grid {
  position: relative;
  z-index: 1;
}

.workspace-header {
  display: grid;
  grid-template-columns: minmax(260px, 0.9fr) minmax(260px, 1.1fr);
  align-items: end;
  gap: 22px;
  margin-bottom: 22px;
}

.workspace-eyebrow,
.workspace-subtitle,
.section-kicker,
.section-muted {
  margin: 0;
  color: rgba(188, 202, 221, 0.78);
}

.workspace-eyebrow,
.section-kicker {
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.28em;
}

.workspace-header h1 {
  margin: 8px 0 0;
  font-size: clamp(34px, 5vw, 58px);
  letter-spacing: 0.02em;
  color: rgba(240, 246, 255, 0.98);
  text-shadow: 0 0 28px rgba(var(--rv-accent-rgb), 0.16);
}

.workspace-subtitle {
  max-width: 620px;
  justify-self: end;
  text-align: right;
  font-size: 14px;
  line-height: 1.8;
}

.command-bar {
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  min-height: 58px;
  padding: 8px;
  border: 1px solid rgba(var(--rv-accent-rgb), 0.15);
  border-radius: 18px;
  background: linear-gradient(180deg, rgba(14, 19, 27, 0.9), rgba(8, 12, 18, 0.94));
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.035),
    0 12px 32px rgba(0, 0, 0, 0.28);
}

.command-prefix {
  display: grid;
  place-items: center;
  width: 42px;
  height: 42px;
  border-radius: 13px;
  border: 1px solid rgba(var(--rv-accent-rgb), 0.13);
  color: rgba(var(--rv-accent-strong-rgb), 0.92);
  background: rgba(255, 255, 255, 0.035);
  font-size: 23px;
  font-weight: 800;
  line-height: 1;
}

.query-input {
  width: 100%;
  min-width: 0;
  border: 0;
  background: transparent;
  color: rgba(238, 244, 252, 0.98);
  font-size: 16px;
  outline: none;
}

.query-input::placeholder {
  color: rgba(188, 202, 221, 0.52);
}

.command-clear {
  min-width: 70px;
}

.quick-search-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 12px 0 22px;
}

.quick-chip,
.family-chip {
  border: 1px solid rgba(var(--rv-accent-rgb), 0.13);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.035);
  color: rgba(224, 235, 248, 0.9);
  font-size: 12px;
  font-weight: 700;
}

.quick-chip {
  padding: 7px 12px;
  cursor: pointer;
  transition: border-color 170ms ease, background 170ms ease, color 170ms ease;
}

.quick-chip:hover {
  border-color: rgba(var(--rv-accent-strong-rgb), 0.28);
  background: rgba(var(--rv-accent-rgb), 0.1);
  color: rgba(245, 249, 255, 0.98);
}

.workspace-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(330px, 390px);
  gap: 16px;
}

.workspace-card,
.search-results-panel {
  border: 1px solid rgba(var(--rv-accent-rgb), 0.13);
  border-radius: 18px;
  background: linear-gradient(180deg, rgba(13, 18, 25, 0.76), rgba(8, 12, 18, 0.86));
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.035);
}

.workspace-card {
  padding: 16px;
}

.recent-card {
  min-height: 380px;
}

.workspace-side {
  display: grid;
  gap: 16px;
  align-content: start;
}

.section-title-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
  margin-bottom: 14px;
}

.section-title-row h2 {
  margin: 5px 0 0;
  font-size: 20px;
  color: rgba(239, 245, 255, 0.96);
}

.section-muted {
  font-size: 12px;
  white-space: nowrap;
}

.recent-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.recent-item,
.destination-item {
  border: 1px solid rgba(var(--rv-accent-rgb), 0.12);
  background: linear-gradient(180deg, rgba(18, 24, 33, 0.82), rgba(10, 14, 21, 0.92));
  color: rgba(235, 243, 252, 0.96);
  cursor: pointer;
  transition: border-color 170ms ease, background 170ms ease, box-shadow 170ms ease;
}

.recent-item {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 11px;
  border-radius: 14px;
  text-align: left;
}

.recent-item:hover,
.destination-item:hover {
  border-color: rgba(var(--rv-accent-strong-rgb), 0.26);
  background: linear-gradient(180deg, rgba(23, 30, 40, 0.92), rgba(13, 18, 26, 0.96));
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.22);
}

.recent-icon {
  flex: 0 0 auto;
}

.recent-copy,
.destination-copy,
.result-text {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.recent-copy strong,
.recent-copy span,
.destination-copy strong,
.destination-copy span,
.result-text strong,
.result-text span {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.recent-copy strong,
.destination-copy strong,
.result-text strong {
  font-size: 13px;
}

.recent-copy span,
.destination-copy span,
.result-text span {
  font-size: 11px;
  color: rgba(189, 203, 221, 0.72);
}

.empty-recent {
  min-height: 270px;
  display: grid;
  place-items: center;
  align-content: center;
  gap: 14px;
  text-align: center;
  color: rgba(193, 207, 225, 0.78);
}

.empty-recent p {
  max-width: 360px;
  margin: 0;
  line-height: 1.7;
}

.empty-action {
  border: 1px solid rgba(var(--rv-accent-strong-rgb), 0.22);
  border-radius: 999px;
  background: rgba(var(--rv-accent-rgb), 0.09);
  color: rgba(238, 245, 255, 0.96);
  padding: 9px 15px;
  font-weight: 800;
  cursor: pointer;
  transition: border-color 170ms ease, background 170ms ease;
}

.empty-action:hover {
  border-color: rgba(var(--rv-accent-strong-rgb), 0.35);
  background: rgba(var(--rv-accent-rgb), 0.14);
}

.destination-list {
  display: grid;
  gap: 9px;
}

.destination-item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px;
  border-radius: 14px;
  text-align: left;
}

.destination-code {
  display: grid;
  place-items: center;
  flex: 0 0 38px;
  width: 38px;
  height: 38px;
  border-radius: 12px;
  border: 1px solid rgba(var(--rv-accent-rgb), 0.14);
  background: rgba(255, 255, 255, 0.04);
  color: rgba(var(--rv-accent-strong-rgb), 0.92);
  font-size: 12px;
  font-weight: 900;
  letter-spacing: 0.06em;
}

.family-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.family-chip {
  padding: 7px 10px;
}

.family-note {
  margin: 12px 0 0;
  color: rgba(190, 204, 222, 0.72);
  font-size: 12px;
  line-height: 1.7;
}

.search-results-panel {
  padding: 16px;
}

.query-tip {
  margin: 8px 0 0;
  font-size: 12px;
  color: rgba(190, 204, 222, 0.78);
}

.result-list {
  max-height: 470px;
  display: grid;
  gap: 8px;
  overflow: auto;
  padding-right: 4px;
}

.result-item {
  width: 100%;
  border: 1px solid rgba(var(--rv-accent-rgb), 0.13);
  background: linear-gradient(180deg, rgba(20, 26, 35, 0.82), rgba(13, 17, 24, 0.9));
  border-radius: 13px;
  display: flex;
  align-items: center;
  gap: 11px;
  text-align: left;
  padding: 9px 11px;
  color: rgba(234, 242, 252, 0.96);
  cursor: pointer;
  transition: border-color 170ms ease, background 170ms ease;
}

.result-item:hover {
  border-color: rgba(var(--rv-accent-strong-rgb), 0.25);
  background: linear-gradient(180deg, rgba(25, 32, 42, 0.92), rgba(16, 21, 29, 0.96));
}

.result-icon {
  flex: 0 0 auto;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

@media (max-width: 980px) {
  .workspace-header,
  .workspace-grid {
    grid-template-columns: 1fr;
  }

  .workspace-subtitle {
    justify-self: start;
    text-align: left;
  }
}

@media (max-width: 720px) {
  .recipe-workspace-panel {
    padding: 18px;
  }

  .command-bar {
    grid-template-columns: 36px minmax(0, 1fr);
  }

  .command-clear {
    grid-column: 1 / -1;
  }

  .recent-grid {
    grid-template-columns: 1fr;
  }
}
</style>
