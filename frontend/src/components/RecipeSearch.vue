<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";

interface Props {
  modelValue: string;
  matchCount?: number;
  totalCount?: number;
  fastResults?: Array<{
    itemId: string;
    localizedName: string;
    modId: string;
  }>;
  loading?: boolean;
  highlightMatches?: boolean;
}

interface Emits {
  (e: "update:modelValue", value: string): void;
  (e: "toggle"): void;
  (e: "select-fast-result", itemId: string): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const searchRoot = ref<HTMLElement | null>(null);
const searchInput = ref<HTMLInputElement | null>(null);
const expanded = ref(true);
const activeResultIndex = ref(-1);
const fastResultsDismissed = ref(false);
const fastResultsListId = `recipe-search-fast-results-${Math.random().toString(36).slice(2, 10)}`;

const getFastResultId = (index: number): string => `${fastResultsListId}-option-${index}`;

const query = computed({
  get: () => props.modelValue || "",
  set: (value: string) => emit("update:modelValue", value),
});

const isVisible = computed(() => expanded.value);
const visibleFastResults = computed(() => props.fastResults ?? []);
const shouldHighlightMatches = computed(() => Boolean(props.highlightMatches));
const trimmedQuery = computed(() => query.value.trim());
const highlightKeyword = computed(() => trimmedQuery.value);
const highlightRegex = computed(() => {
  if (!shouldHighlightMatches.value || !highlightKeyword.value) {
    return null;
  }
  return new RegExp(`(${escapeRegExp(highlightKeyword.value)})`, "ig");
});
const highlightKeywordLower = computed(() => highlightKeyword.value.toLowerCase());
const showFastResults = computed(() => {
  if (!isVisible.value) return false;
  if (!trimmedQuery.value) return false;
  if (fastResultsDismissed.value) return false;
  return Boolean(props.loading) || visibleFastResults.value.length > 0;
});

const effectiveActiveResultIndex = computed(() => {
  if (!showFastResults.value || visibleFastResults.value.length === 0) {
    return -1;
  }
  return activeResultIndex.value >= 0 ? activeResultIndex.value : 0;
});

const activeDescendantId = computed(() => {
  if (effectiveActiveResultIndex.value < 0) {
    return undefined;
  }
  return getFastResultId(effectiveActiveResultIndex.value);
});

watch(
  () => props.modelValue,
  (value) => {
    const normalized = value?.trim() ?? "";
    if (normalized.length > 0) {
      expanded.value = true;
      fastResultsDismissed.value = false;
      return;
    }
    activeResultIndex.value = -1;
    fastResultsDismissed.value = false;
  },
);

watch(
  () => visibleFastResults.value.length,
  (nextLength) => {
    if (nextLength === 0) {
      activeResultIndex.value = -1;
      return;
    }
    if (activeResultIndex.value >= nextLength) {
      activeResultIndex.value = 0;
    }
  },
);

const toggleSearch = () => {
  expanded.value = !expanded.value;
  emit("toggle");
  if (!expanded.value) {
    query.value = "";
    activeResultIndex.value = -1;
    fastResultsDismissed.value = false;
    return;
  }
  setTimeout(() => searchInput.value?.focus(), 80);
};

const closeSearch = () => {
  expanded.value = false;
  activeResultIndex.value = -1;
  fastResultsDismissed.value = false;
};

const dismissFastResults = () => {
  fastResultsDismissed.value = true;
  activeResultIndex.value = -1;
};

const handleDocumentPointerDown = (event: PointerEvent) => {
  if (!expanded.value) return;
  if (!searchRoot.value) return;
  const target = event.target as Node | null;
  if (target && searchRoot.value.contains(target)) {
    return;
  }
  dismissFastResults();
};

const handleInputBlur = (event: FocusEvent) => {
  if (!expanded.value) return;
  const nextTarget = event.relatedTarget as Node | null;
  if (nextTarget && searchRoot.value?.contains(nextTarget)) {
    return;
  }
  window.setTimeout(() => {
    const active = document.activeElement as Node | null;
    if (active && searchRoot.value?.contains(active)) {
      return;
    }
    dismissFastResults();
  }, 0);
};

const handleInputFocus = () => {
  fastResultsDismissed.value = false;
};

const handleKeydown = (event: KeyboardEvent) => {
  if (event.key === "Escape") {
    event.preventDefault();
    event.stopPropagation();
    if (showFastResults.value) {
      dismissFastResults();
      return;
    }
    closeSearch();
    return;
  }
  if (!showFastResults.value) {
    return;
  }
  if (event.key === "ArrowDown") {
    event.preventDefault();
    event.stopPropagation();
    const max = visibleFastResults.value.length - 1;
    if (max < 0) return;
    activeResultIndex.value = Math.min(max, activeResultIndex.value + 1);
    return;
  }
  if (event.key === "ArrowUp") {
    event.preventDefault();
    event.stopPropagation();
    const max = visibleFastResults.value.length - 1;
    if (max < 0) return;
    activeResultIndex.value = activeResultIndex.value <= 0 ? max : activeResultIndex.value - 1;
    return;
  }
  if (event.key === "Enter") {
    const selected = visibleFastResults.value[activeResultIndex.value] || visibleFastResults.value[0];
    if (!selected) return;
    event.preventDefault();
    event.stopPropagation();
    emit("select-fast-result", selected.itemId);
    activeResultIndex.value = -1;
    fastResultsDismissed.value = false;
  }
};

const resultInfo = computed(() => {
  if (!isVisible.value) return "";

  const matchCount = props.matchCount ?? 0;
  const totalCount = props.totalCount ?? 0;
  if (matchCount === 0) return "无匹配";
  return `匹配 ${matchCount} / ${totalCount}`;
});

const clearSearch = () => {
  query.value = "";
  activeResultIndex.value = -1;
  fastResultsDismissed.value = false;
  searchInput.value?.focus();
};

const focus = () => searchInput.value?.focus();

const selectFastResult = (itemId: string) => {
  if (!itemId) return;
  emit("select-fast-result", itemId);
  activeResultIndex.value = -1;
  closeSearch();
};

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const getHighlightedSegments = (text: string): Array<{ text: string; matched: boolean }> => {
  const matcher = highlightRegex.value;
  if (!matcher) {
    return [{ text, matched: false }];
  }
  const normalizedKeyword = highlightKeywordLower.value;
  return text.split(matcher).map((part) => ({
    text: part,
    matched: part.length > 0 && part.toLowerCase() === normalizedKeyword,
  }));
};

onMounted(() => {
  document.addEventListener("pointerdown", handleDocumentPointerDown);
});

onBeforeUnmount(() => {
  document.removeEventListener("pointerdown", handleDocumentPointerDown);
});

defineExpose({
  focus,
  clearSearch,
});
</script>

<template>
  <div ref="searchRoot" class="recipe-search" data-testid="recipe-search">
    <button
      type="button"
      class="search-toggle"
      data-testid="recipe-search-toggle"
      :class="{ 'search-toggle-active': isVisible }"
      @click="toggleSearch"
      title="搜索配方 (Ctrl+F)"
      aria-label="搜索配方 (Ctrl+F)"
    >
      <svg width="16" height="16" viewBox="0 0 16 16" class="search-icon">
        <circle cx="6" cy="6" r="4" fill="none" stroke="currentColor" stroke-width="1.5" />
        <line x1="9.3" y1="9.3" x2="13" y2="13" stroke="currentColor" stroke-width="1.5" />
      </svg>
    </button>

    <div v-show="isVisible" class="search-input-container">
      <input
        ref="searchInput"
        v-model="query"
        type="text"
        class="search-input"
        data-testid="recipe-search-input"
        role="combobox"
        :aria-expanded="showFastResults"
        :aria-controls="showFastResults ? fastResultsListId : undefined"
        :aria-activedescendant="activeDescendantId"
        aria-autocomplete="list"
        aria-label="搜索配方"
        placeholder="搜索物品..."
        @keydown="handleKeydown"
        @focus="handleInputFocus"
        @blur="handleInputBlur"
      />
      <button
        v-if="query"
        type="button"
        class="clear-button"
        @click="clearSearch"
        title="清空搜索"
        aria-label="清空搜索"
      >
        ×
      </button>

      <div v-if="showFastResults" :id="fastResultsListId" class="search-fast-results" role="listbox" aria-label="快速搜索结果">
        <div v-if="loading" class="search-fast-loading">索引搜索中...</div>
        <button
          v-for="(entry, idx) in visibleFastResults"
          :id="getFastResultId(idx)"
          :key="entry.itemId"
          type="button"
          class="search-fast-item"
          role="option"
          :aria-selected="idx === effectiveActiveResultIndex"
          :class="{ 'search-fast-item-active': idx === effectiveActiveResultIndex }"
          @mousedown.prevent="selectFastResult(entry.itemId)"
        >
          <span class="search-fast-name">
            <template v-for="(segment, segmentIdx) in getHighlightedSegments(entry.localizedName)" :key="`name-${entry.itemId}-${idx}-${segmentIdx}`">
              <mark v-if="segment.matched" class="search-fast-mark">{{ segment.text }}</mark>
              <span v-else>{{ segment.text }}</span>
            </template>
          </span>
          <span class="search-fast-id">
            <template v-for="(segment, segmentIdx) in getHighlightedSegments(entry.itemId)" :key="`id-${entry.itemId}-${idx}-${segmentIdx}`">
              <mark v-if="segment.matched" class="search-fast-mark">{{ segment.text }}</mark>
              <span v-else>{{ segment.text }}</span>
            </template>
          </span>
        </button>
      </div>
    </div>

    <div v-if="isVisible" class="search-result">
      {{ resultInfo }}
    </div>
  </div>
</template>

<style scoped>
.recipe-search {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 34px;
}

.search-toggle {
  width: 34px;
  height: 34px;
  border-radius: 8px;
  border: 1px solid rgba(147, 166, 191, 0.14);
  background: linear-gradient(180deg, rgba(22, 28, 36, 0.88), rgba(15, 20, 26, 0.9));
  color: rgba(225, 235, 246, 0.94);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: border-color 160ms ease, background 160ms ease, transform 160ms ease;
}

.search-toggle:hover {
  border-color: rgba(183, 200, 221, 0.24);
  background: linear-gradient(180deg, rgba(26, 33, 42, 0.92), rgba(18, 23, 30, 0.94));
  transform: translateY(-1px);
}

.search-toggle-active {
  border-color: rgba(190, 206, 226, 0.3);
  box-shadow: 0 0 0 1px rgba(183, 200, 220, 0.1);
}

.search-icon {
  filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.35));
}

.search-input-container {
  position: relative;
  display: flex;
  align-items: center;
  height: 34px;
}

.search-input {
  width: 188px;
  height: 34px;
  padding: 0 30px 0 10px;
  font-size: 13px;
  border-radius: 8px;
  border: 1px solid rgba(156, 174, 198, 0.14);
  background: linear-gradient(180deg, rgba(18, 23, 31, 0.86), rgba(12, 16, 22, 0.9));
  color: rgba(236, 243, 252, 0.98);
  outline: none;
  transition: border-color 170ms ease, box-shadow 170ms ease;
}

.search-input:focus {
  border-color: rgba(192, 207, 226, 0.24);
  box-shadow:
    0 0 0 1px rgba(158, 176, 198, 0.14),
    0 4px 12px rgba(0, 0, 0, 0.24);
}

.search-input::placeholder {
  color: rgba(179, 194, 213, 0.58);
}

.clear-button {
  position: absolute;
  right: 6px;
  width: 20px;
  height: 20px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: rgba(201, 214, 231, 0.82);
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
}

.clear-button:hover {
  color: rgba(236, 243, 252, 0.98);
  background: rgba(255, 255, 255, 0.06);
}

.search-result {
  min-width: 84px;
  font-size: 12px;
  color: rgba(190, 203, 221, 0.9);
  text-align: right;
}

.search-fast-results {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  width: 360px;
  max-height: 280px;
  overflow: auto;
  z-index: 16;
  border-radius: 10px;
  border: 1px solid rgba(153, 173, 199, 0.2);
  background: linear-gradient(180deg, rgba(16, 22, 31, 0.98), rgba(10, 15, 21, 0.98));
  box-shadow: 0 12px 28px rgba(0, 0, 0, 0.42);
}

.search-fast-loading {
  padding: 10px 12px;
  font-size: 12px;
  color: rgba(187, 202, 222, 0.88);
}

.search-fast-item {
  width: 100%;
  border: none;
  border-top: 1px solid rgba(152, 172, 196, 0.12);
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
  padding: 9px 12px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.search-fast-item:first-of-type {
  border-top: none;
}

.search-fast-item:hover,
.search-fast-item-active {
  background: rgba(192, 210, 232, 0.1);
}

.search-fast-name {
  font-size: 12px;
  color: rgba(232, 241, 252, 0.95);
}

.search-fast-mark {
  background: rgba(241, 208, 112, 0.22);
  color: rgba(255, 239, 173, 0.98);
  border-radius: 3px;
  padding: 0 1px;
}

.search-fast-id {
  font-size: 11px;
  color: rgba(173, 190, 214, 0.8);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
