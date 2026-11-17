<script setup lang="ts">
import { t, language } from "../../i18n/index.ts";
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from "vue";
import {residentCatalog,residentReady,residentRows} from '../../browser/resident';
import {resolveHistory} from '../../browser/history';
import {useFavorites} from '../../browser/favorites';
import type { BrowserGridEntry, Item } from "../../services/api";
import { resolveDistDataNativeRuntimeManifestPath } from "../../services/distDataRuntime";
import NativeBrowserSurface from "../native-surface/NativeBrowserSurface.vue";
import PanelResizeHandle from './PanelResizeHandle.vue';

const props = defineProps<{
  viewHistoryCount: number;
  historyItemPixelSize: number;
  historyRows: number;
  historyGridGap: number;
  historyBrowserEntries: BrowserGridEntry[];
  panelHeight: number;
  resizeEnabled: boolean;
  minHeight: number;
  maxHeight: number;
}>();

const emit = defineEmits<{
  itemClick: [item: Item];
  itemContextmenu: [item: Item, event: MouseEvent];
  panelResize: [element: HTMLElement | null];
  resizeHeight: [value: number];
  resizeStart: [];
  resizeEnd: [];
  resetHeight: [];
}>();

const { items: favorites, storageError } = useFavorites(residentCatalog);
const mode = ref<'history' | 'favorites'>('history');
const favoritePage = ref(0);
const panelWidth = ref(0);
let panelElement: HTMLElement | null = null;
let panelObserver: ResizeObserver | null = null;
const measurePanel = () => {
  panelWidth.value = Math.max(0, (panelElement?.clientWidth ?? 0) - 32);
  emit("panelResize", panelElement);
};
const bindPanelRef = (element: HTMLElement | null) => {
  if (element === panelElement) return;
  panelObserver?.disconnect();
  panelElement = element;
  measurePanel();
  if (element) panelObserver?.observe(element);
};
onMounted(() => {
  panelObserver = new ResizeObserver(measurePanel);
  if (panelElement) panelObserver.observe(panelElement);
});
onBeforeUnmount(() => panelObserver?.disconnect());

const pageSize = computed(() => Math.max(1, Math.floor((panelWidth.value + props.historyGridGap)
  / (props.historyItemPixelSize + props.historyGridGap))) * props.historyRows);
const favoritePageCount = computed(() => Math.max(1, Math.ceil(favorites.value.length / pageSize.value)));
const currentFavoritePage = computed(() => Math.min(favoritePage.value, favoritePageCount.value - 1));
watch([residentCatalog, mode], () => { favoritePage.value = 0; });

const visibleSeeds = computed(() => mode.value === 'favorites'
  ? favorites.value.slice(currentFavoritePage.value * pageSize.value, (currentFavoritePage.value + 1) * pageSize.value)
  : props.historyBrowserEntries.map(entry => entry.kind === 'item' ? entry.item : entry.group.representative));
const stripHeight = computed(() => props.panelHeight);

const historyItemIds = computed(() =>
  visibleSeeds.value.map(item => item.itemId),
);

const nativeRuntimeManifestUrl = resolveDistDataNativeRuntimeManifestPath();
const nativeItems=shallowRef<Item[]>([]);
watch([visibleSeeds,residentReady,residentCatalog],async(_value,_old,cleanup)=>{
 let stale=false;cleanup(()=>{stale=true;});
 const seeds=visibleSeeds.value;
 nativeItems.value=seeds;
 if(residentReady.value){try{const rows=await residentRows(seeds.map(item=>item.itemId));if(!stale)nativeItems.value=resolveHistory(seeds,rows);}catch{/* Keep the regular Catalog icons when native lookup is unavailable. */}}
},{immediate:true});
</script>

<template>
  <div
    id="home-history-strip"
    :ref="bindPanelRef"
    class="history-strip relative flex flex-col gap-1 flex-shrink-0 overflow-hidden px-4 pt-3 pb-1"
    :style="{
      minHeight: `${stripHeight}px`,
      height: `${stripHeight}px`,
      maxHeight: `${stripHeight}px`,
    }"
  >
    <PanelResizeHandle v-if="resizeEnabled" orientation="horizontal" :label="t('调整历史区高度')" controls="home-history-strip"
      :value="panelHeight" :min="minHeight" :max="maxHeight"
      @update="emit('resizeHeight', $event)" @start="emit('resizeStart')" @end="emit('resizeEnd')" @reset="emit('resetHeight')" />
    <div class="history-strip__toolbar" :aria-label="t('最近与收藏')">
      <button type="button" :class="{ active: mode === 'history' }" :aria-pressed="mode === 'history'" @click="mode = 'history'"> {{ t("最近") }} {{ viewHistoryCount }}</button>
      <button type="button" :class="{ active: mode === 'favorites' }" :aria-pressed="mode === 'favorites'" @click="mode = 'favorites'"> {{ t("收藏") }} {{ favorites.length }}</button>
      <span class="history-strip__hint" :title="t('悬停或键盘聚焦物品后，点击星标收藏；也可 Alt + 单击')"> {{ t("☆ 收藏") }} </span>
      <span v-if="mode === 'favorites' && favoritePageCount > 1" class="history-strip__pages">
        <button type="button" :aria-label="t('上一页收藏')" :disabled="currentFavoritePage === 0" @click="favoritePage = currentFavoritePage - 1">‹</button>
        <span>{{ currentFavoritePage + 1 }}/{{ favoritePageCount }}</span>
        <button type="button" :aria-label="t('下一页收藏')" :disabled="currentFavoritePage + 1 >= favoritePageCount" @click="favoritePage = currentFavoritePage + 1">›</button>
      </span>
    </div>
    <div v-if="storageError" class="history-strip__error" role="alert">{{ storageError }}</div>
    <div
      v-if="visibleSeeds.length > 0"
      class="min-h-0 flex-1 w-full overflow-hidden"
    >
      <NativeBrowserSurface catalog
        surface-id="history"
        viewport-role="history"
        :item-size="historyItemPixelSize"
        :manifest-url="nativeRuntimeManifestUrl"
        :enable-animation="true"
        :history-item-ids="historyItemIds"
        :fallback-items="nativeItems"
        @item-click="emit('itemClick', $event)"
        @item-contextmenu="(item, event) => emit('itemContextmenu', item, event)"
      />
    </div>
    <div
      v-else
      class="min-h-0 flex-1 flex items-center justify-center text-xs text-slate-200/65"
    >
      {{ mode === 'favorites' ? t("暂无收藏，点击物品旁的 ☆ 添加") : t("暂无浏览记录") }}
    </div>
  </div>
</template>

<style scoped>
.history-strip__toolbar { display: flex; align-items: center; gap: 6px; flex-shrink: 0; min-height: 20px; font-size: 11px; color: #94a3b8; }
.history-strip__toolbar button { padding: 1px 6px; border-radius: 3px; white-space: nowrap; }
.history-strip__toolbar button:hover, .history-strip__toolbar button.active { color: #f1f5f9; background: rgba(148, 163, 184, .16); }
.history-strip__toolbar button:focus-visible { outline: 1px solid #fbbf24; }
.history-strip__toolbar button:disabled { opacity: .3; cursor: default; }
.history-strip__hint { margin-left: auto; white-space: nowrap; }
.history-strip__pages { display: flex; align-items: center; gap: 2px; white-space: nowrap; }
.history-strip__error { flex-shrink: 0; font-size: 11px; line-height: 16px; color: #fca5a5; }
</style>
