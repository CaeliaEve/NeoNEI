<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { Recipe } from '../services/api';
import { getImageUrl } from '../services/api';

interface Props {
  recipes: Recipe[];
  selectedIndex: number;
  height?: number;
  itemWidth?: number;
  itemHeight?: number;
  gap?: number;
  overscanRows?: number;
  scrollThrottleMs?: number;
}

const props = withDefaults(defineProps<Props>(), {
  height: 190,
  itemWidth: 160,
  itemHeight: 58,
  gap: 8,
  overscanRows: 4,
  scrollThrottleMs: 32,
});

const emit = defineEmits<{
  (e: 'select', index: number): void;
}>();

const containerRef = ref<HTMLElement | null>(null);
const scrollTop = ref(0);
const viewportWidth = ref(0);
let resizeObserver: ResizeObserver | null = null;
let rafId: number | null = null;
let pendingScrollTop = 0;
let lastScrollCommitAt = 0;

const rowHeight = computed(() => props.itemHeight + props.gap);
const columnWidth = computed(() => props.itemWidth + props.gap);

const columns = computed(() => {
  if (viewportWidth.value <= 0) return 1;
  return Math.max(1, Math.floor((viewportWidth.value + props.gap) / columnWidth.value));
});

const totalRows = computed(() => {
  return Math.ceil(props.recipes.length / columns.value);
});

const overscanRows = computed(() => {
  const viewportRows = Math.max(1, Math.ceil(props.height / rowHeight.value));
  const adaptive = Math.ceil(viewportRows * 0.8);
  return Math.max(2, Math.min(8, Math.max(props.overscanRows, adaptive)));
});
const visibleStartRow = computed(() => {
  return Math.max(0, Math.floor(scrollTop.value / rowHeight.value) - overscanRows.value);
});
const visibleEndRow = computed(() => {
  const viewportRows = Math.ceil(props.height / rowHeight.value) + overscanRows.value;
  return Math.min(totalRows.value, visibleStartRow.value + viewportRows);
});

const visibleItems = computed(() => {
  const startIndex = visibleStartRow.value * columns.value;
  const endIndex = Math.min(props.recipes.length, visibleEndRow.value * columns.value);

  const items: Array<{
    index: number;
    recipe: Recipe;
    top: number;
    left: number;
    previewItemId: string | null;
  }> = [];
  for (let index = startIndex; index < endIndex; index++) {
    const row = Math.floor(index / columns.value);
    const col = index % columns.value;
    const recipe = props.recipes[index];
    const previewItemId = recipe.outputs?.[0]?.itemId ?? null;
    items.push({
      index,
      recipe,
      top: row * rowHeight.value,
      left: col * columnWidth.value,
      previewItemId,
    });
  }

  return items;
});

const contentHeight = computed(() => totalRows.value * rowHeight.value);
const optionIdPrefix = 'virtual-recipe-grid-option';

const getOptionId = (index: number) => `${optionIdPrefix}-${index}`;
const selectedOptionId = computed(() => {
  if (props.selectedIndex < 0 || props.selectedIndex >= props.recipes.length) {
    return undefined;
  }
  return getOptionId(props.selectedIndex);
});

const flushScroll = () => {
  const now = performance.now();
  if (props.scrollThrottleMs > 0 && now - lastScrollCommitAt < props.scrollThrottleMs) {
    rafId = requestAnimationFrame(flushScroll);
    return;
  }
  scrollTop.value = pendingScrollTop;
  lastScrollCommitAt = now;
  rafId = null;
};

const handleScroll = () => {
  if (!containerRef.value) return;
  pendingScrollTop = containerRef.value.scrollTop;
  if (rafId !== null) return;
  rafId = requestAnimationFrame(flushScroll);
};

const measureWidth = () => {
  viewportWidth.value = containerRef.value?.clientWidth || 0;
};

onMounted(() => {
  measureWidth();
  if (typeof ResizeObserver !== 'undefined' && containerRef.value) {
    resizeObserver = new ResizeObserver(() => {
      measureWidth();
    });
    resizeObserver.observe(containerRef.value);
  }
});

onBeforeUnmount(() => {
  if (resizeObserver) {
    resizeObserver.disconnect();
    resizeObserver = null;
  }
  if (rafId !== null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
});

watch(
  () => props.selectedIndex,
  (next) => {
    if (!containerRef.value || next < 0) return;
    const row = Math.floor(next / columns.value);
    const top = row * rowHeight.value;
    const bottom = top + rowHeight.value;
    const viewTop = containerRef.value.scrollTop;
    const viewBottom = viewTop + props.height;

    if (top < viewTop) {
      containerRef.value.scrollTop = top;
    } else if (bottom > viewBottom) {
      containerRef.value.scrollTop = Math.max(0, bottom - props.height);
    }
  },
  { immediate: true },
);


</script>

<template>
  <div class="virtual-grid-shell">
    <div
      ref="containerRef"
      class="virtual-grid-scroll"
      :style="{ height: `${height}px` }"
      role="listbox"
      aria-label="配方分页列表"
      :aria-activedescendant="selectedOptionId"
      @scroll="handleScroll"
    >
      <div class="virtual-grid-content" :style="{ height: `${contentHeight}px` }">
        <button
          v-for="entry in visibleItems"
          :id="getOptionId(entry.index)"
          :key="`${entry.recipe.recipeId}-${entry.index}`"
          class="virtual-grid-item"
          role="option"
          :aria-label="`第 ${entry.index + 1} 条配方：${entry.previewItemId || entry.recipe.recipeId}`"
          :class="{ 'virtual-grid-item-active': entry.index === selectedIndex }"
          :style="{
            width: `${itemWidth}px`,
            height: `${itemHeight}px`,
            top: `${entry.top}px`,
            left: `${entry.left}px`,
          }"
          :aria-selected="entry.index === selectedIndex"
          @click="emit('select', entry.index)"
        >
          <img
            v-if="entry.previewItemId"
            class="virtual-grid-icon"
            :src="getImageUrl(entry.previewItemId)"
            :alt="`${entry.previewItemId} 图标`"
          />
          <div class="virtual-grid-labels">
            <div class="virtual-grid-title">{{ entry.previewItemId || entry.recipe.recipeId }}</div>
            <div class="virtual-grid-subtitle">{{ entry.recipe.recipeType }}</div>
          </div>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.virtual-grid-shell {
  width: 100%;
}

.virtual-grid-scroll {
  overflow: auto;
  border: 1px solid rgba(163, 181, 201, 0.16);
  border-radius: 10px;
  background: rgba(9, 13, 18, 0.5);
}

.virtual-grid-content {
  position: relative;
  min-width: 100%;
}

.virtual-grid-item {
  position: absolute;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px;
  border-radius: 8px;
  border: 1px solid rgba(155, 174, 197, 0.2);
  background: linear-gradient(180deg, rgba(18, 24, 31, 0.88), rgba(12, 17, 22, 0.88));
  text-align: left;
  cursor: pointer;
  color: rgba(233, 241, 251, 0.94);
}

.virtual-grid-item:hover {
  border-color: rgba(195, 211, 231, 0.28);
}

.virtual-grid-item-active {
  border-color: rgba(208, 223, 240, 0.45);
  box-shadow: 0 0 0 1px rgba(177, 196, 220, 0.2);
}

.virtual-grid-icon {
  width: 28px;
  height: 28px;
  image-rendering: pixelated;
  flex-shrink: 0;
}

.virtual-grid-labels {
  min-width: 0;
}

.virtual-grid-title,
.virtual-grid-subtitle {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.virtual-grid-title {
  font-size: 12px;
}

.virtual-grid-subtitle {
  font-size: 11px;
  color: rgba(170, 186, 208, 0.82);
}
</style>
