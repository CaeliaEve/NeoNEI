<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue';
import RecipeChromeButton from './RecipeChromeButton.vue';
import AnimatedItemIcon from './AnimatedItemIcon.vue';
import { api, type ItemSearchBasic } from '../services/api';

const emit = defineEmits<{
  select: [itemId: string];
  clear: [];
}>();

const queryInputId = 'recipe-workspace-query-input';
const searchText = ref('');
const searchLoading = ref(false);
const searchResults = ref<ItemSearchBasic[]>([]);

let searchDebounceTimer: ReturnType<typeof setTimeout> | undefined;
let searchAbortController: AbortController | null = null;
let searchRequestSeq = 0;

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
  }, 160);
});

function pickSearchResult(entry: ItemSearchBasic) {
  searchText.value = entry.localizedName;
  searchResults.value = [];
  emit('select', entry.itemId);
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

onBeforeUnmount(() => {
  if (searchDebounceTimer) {
    clearTimeout(searchDebounceTimer);
  }
  cancelSearchRequest();
});
</script>

<template>
  <section class="recipe-index-panel" aria-labelledby="recipe-index-title">
    <div class="recipe-index-ambient" aria-hidden="true"></div>
    <div class="recipe-index-head">
      <p class="recipe-index-eyebrow">RECIPE INDEX</p>
      <h1 id="recipe-index-title">配方索引</h1>
      <p class="recipe-index-subtitle">
        输入物品名或 Item ID，选择结果后进入同一个配方工作台。
      </p>
    </div>

    <div class="query-panel">
      <label class="query-label" :for="queryInputId">物品名 / Item ID</label>
      <input
        :id="queryInputId"
        v-model="searchText"
        type="text"
        class="query-input"
        autocomplete="off"
        placeholder="例如：铁锭 / AFSU / gt.metaitem.01"
      />
      <p v-if="searchLoading" class="query-tip">正在搜索物品...</p>
      <p v-else-if="searchText.trim() && searchResults.length === 0" class="query-tip">
        未找到匹配物品
      </p>

      <div v-if="searchResults.length > 0" class="result-list">
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

      <div class="panel-footer">
        <RecipeChromeButton tone="quiet" @click="clearSearch">清空搜索</RecipeChromeButton>
      </div>
    </div>
  </section>
</template>

<style scoped>
.recipe-index-panel {
  width: min(980px, 100%);
  min-height: min(72vh, 760px);
  margin-top: 24px;
  padding: clamp(22px, 4vw, 42px);
  border: 1px solid rgba(var(--rv-accent-rgb), 0.16);
  border-radius: 22px;
  background:
    linear-gradient(135deg, rgba(18, 23, 31, 0.78), rgba(8, 11, 17, 0.86)),
    radial-gradient(circle at 18% 12%, rgba(var(--rv-accent-strong-rgb), 0.13), transparent 36%),
    radial-gradient(circle at 86% 72%, rgba(var(--rv-accent-rgb), 0.1), transparent 42%);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.045),
    0 24px 70px rgba(0, 0, 0, 0.34);
  position: relative;
  overflow: hidden;
}

.recipe-index-ambient {
  position: absolute;
  inset: 12px;
  border-radius: 18px;
  border: 1px solid rgba(var(--rv-accent-rgb), 0.06);
  background:
    linear-gradient(90deg, transparent, rgba(var(--rv-accent-rgb), 0.035), transparent),
    repeating-linear-gradient(90deg, rgba(255, 255, 255, 0.018) 0 1px, transparent 1px 54px);
  mask-image: linear-gradient(180deg, rgba(0, 0, 0, 0.8), transparent 82%);
  pointer-events: none;
}

.recipe-index-head,
.query-panel {
  position: relative;
  z-index: 1;
}

.recipe-index-head {
  text-align: center;
  margin-bottom: 24px;
}

.recipe-index-eyebrow,
.recipe-index-subtitle {
  margin: 0;
  color: rgba(188, 202, 221, 0.78);
}

.recipe-index-eyebrow {
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.32em;
}

.recipe-index-head h1 {
  margin: 8px 0 8px;
  font-size: clamp(32px, 5vw, 56px);
  letter-spacing: 0.02em;
  color: rgba(239, 245, 255, 0.98);
  text-shadow: 0 0 28px rgba(var(--rv-accent-rgb), 0.16);
}

.recipe-index-subtitle {
  font-size: 14px;
}

.query-panel {
  max-width: 720px;
  margin: 0 auto;
  padding: 16px;
  border: 1px solid rgba(var(--rv-accent-rgb), 0.14);
  border-radius: 16px;
  background: linear-gradient(180deg, rgba(13, 18, 25, 0.82), rgba(8, 12, 18, 0.88));
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.035);
}

.query-label {
  display: block;
  margin-bottom: 9px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.14em;
  color: rgba(194, 208, 226, 0.82);
}

.query-input {
  width: 100%;
  border: 1px solid rgba(var(--rv-accent-rgb), 0.16);
  background: linear-gradient(180deg, rgba(18, 24, 33, 0.9), rgba(10, 14, 20, 0.94));
  color: rgba(238, 244, 252, 0.98);
  border-radius: 12px;
  padding: 12px 14px;
  font-size: 15px;
  outline: none;
  transition: border-color 170ms ease, box-shadow 170ms ease;
}

.query-input:focus {
  border-color: rgba(var(--rv-accent-strong-rgb), 0.3);
  box-shadow:
    0 0 0 1px rgba(var(--rv-accent-rgb), 0.16),
    0 12px 28px rgba(0, 0, 0, 0.25);
}

.query-tip {
  margin: 10px 0 0;
  font-size: 12px;
  color: rgba(190, 204, 222, 0.78);
}

.result-list {
  max-height: 430px;
  margin-top: 12px;
  display: grid;
  gap: 8px;
  overflow: auto;
  padding-right: 4px;
}

.result-item {
  border: 1px solid rgba(var(--rv-accent-rgb), 0.13);
  background: linear-gradient(180deg, rgba(20, 26, 35, 0.82), rgba(13, 17, 24, 0.9));
  border-radius: 12px;
  display: flex;
  align-items: center;
  gap: 11px;
  text-align: left;
  padding: 9px 11px;
  color: rgba(234, 242, 252, 0.96);
  cursor: pointer;
  transition: border-color 0.18s ease, transform 0.18s ease, background 0.18s ease;
}

.result-item:hover {
  border-color: rgba(var(--rv-accent-strong-rgb), 0.25);
  background: linear-gradient(180deg, rgba(25, 32, 42, 0.92), rgba(16, 21, 29, 0.96));
  transform: translateY(-1px);
}

.result-icon {
  flex: 0 0 auto;
}

.result-text {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.result-text strong,
.result-text span {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.result-text strong {
  font-size: 14px;
}

.result-text span {
  font-size: 11px;
  opacity: 0.72;
}

.panel-footer {
  display: flex;
  justify-content: flex-end;
  margin-top: 12px;
}

@media (max-width: 720px) {
  .recipe-index-panel {
    padding: 18px;
  }

  .query-panel {
    padding: 12px;
  }
}
</style>
