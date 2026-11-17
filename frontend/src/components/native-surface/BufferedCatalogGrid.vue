<script setup lang="ts">
import {errorMessage} from '../../i18n/errors.ts';
import {t} from '../../i18n/index.ts';
import {computed, onBeforeUnmount, ref, shallowRef, watch} from 'vue';
import type {Item} from '../../services/api';
import ResidentIcon from '../ResidentIcon.vue';
import {residentCatalog} from '../../browser/resident';
import {useFavorites} from '../../browser/favorites';
import {usePreferences} from '../../state/preferences';
import {createPageBuffer} from '../../browser/page-buffer';
import {prepareBrowserPage, type PreparedBrowserPage} from '../../browser/prepare-page';
import {createPageTransition} from '../../browser/page-transition';

const props = defineProps<{items: Item[]; page: number; targetPage: number; context: string;
  itemSize: number; animate: boolean; selectedItemId: string | null}>();
const emit = defineEmits<{itemClick: [item: Item]; itemContextmenu: [item: Item, event: MouseEvent];
  pagePresented: [page: number]; pageFault: [message: string]}>();
const displayed = shallowRef<PreparedBrowserPage | null>(null);
const grid = ref<HTMLElement | null>(null);
const {ids: favoriteIds, toggle: toggleFavorite} = useFavorites(residentCatalog);
const {preferences} = usePreferences();
const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
const transition = createPageTransition({reducedMotion: () => motion.matches});
const context = computed(() => JSON.stringify([props.context, residentCatalog.value]));
const buffer = createPageBuffer(prepareBrowserPage, value => {
  displayed.value = value;
  emit('pagePresented', value.page);
}, error => emit('pageFault', errorMessage(error)),{
  capacity:2,key:input=>JSON.stringify([input.context,input.page,input.items.map(item=>item.itemId)]),
});
let lastIntentTime = -Infinity;
let rapidPaging = false;

// Navigation intent cancels work immediately, even before new rows have arrived from the worker.
watch([() => props.targetPage, context], ([page], [oldPage]) => {
  const time = performance.now();
  rapidPaging = time - lastIntentTime < 160 || Math.abs(page - oldPage) > 1;
  lastIntentTime = time;
  buffer.cancel(); transition.cancel();
}, {flush: 'sync'});
watch([() => props.items, () => props.page, context], () => {
  if (props.page !== props.targetPage) return;
  void buffer.stage({items: props.items, page: props.page, context: context.value});
}, {immediate: true, flush: 'post'});
watch(displayed, value => {
  if (value) transition.present(grid.value, value.page, value.context, rapidPaging);
}, {flush: 'post'});
motion.addEventListener('change', transition.cancel);
onBeforeUnmount(() => { buffer.close(); transition.cancel(); motion.removeEventListener('change', transition.cancel); });

function click(item: Item, event: MouseEvent) {
  if (event.altKey) { toggleFavorite(item); return; }
  emit('itemClick', item);
}
function sprite(item: Item) { return typeof item.residentSprite === 'number' ? item.residentSprite : -1; }
</script>

<template>
  <div ref="grid" class="native-browser-surface__fallback native-browser-surface__catalog-grid"
    role="list" :data-presented-page="displayed?.page" :style="{'--browser-item-size': itemSize + 'px'}">
    <div v-for="(item, slot) in displayed?.items ?? []" :key="slot" class="native-browser-surface__cell" role="listitem">
      <button type="button" class="native-browser-surface__fallback-item"
        :class="{'native-browser-surface__fallback-item--selected': item.itemId === selectedItemId}"
        :title="item.localizedName" :aria-label="item.localizedName"
        @click.stop="click(item, $event)"
        @contextmenu.prevent.stop="emit('itemContextmenu', item, $event)">
        <ResidentIcon v-if="displayed?.frames.get(item.itemId)" :id="item.itemId" :sprite="sprite(item)"
          :prepared="displayed.frames.get(item.itemId)!" :size="Math.max(1, Math.floor(itemSize * .9))"
          :label="item.localizedName" :animate="animate && preferences.animate" />
        <span v-else class="native-browser-surface__empty" role="img" :aria-label="t('未采集纹理')">◇</span>
      </button>
      <button v-if="residentCatalog" type="button" class="native-browser-surface__favorite"
        :class="{'native-browser-surface__favorite--saved': favoriteIds.has(item.itemId)}"
        :aria-label="`${favoriteIds.has(item.itemId) ? t('取消收藏') : t('收藏')} ${item.localizedName}`"
        :aria-pressed="favoriteIds.has(item.itemId)"
        :title="t('{0}（Alt + 单击物品）', favoriteIds.has(item.itemId) ? t('取消收藏') : t('收藏'))"
        @click.stop="toggleFavorite(item)"
        @contextmenu.prevent.stop>{{ favoriteIds.has(item.itemId) ? '★' : '☆' }}</button>
    </div>
  </div>
</template>

<style scoped>
.native-browser-surface__catalog-grid { position: absolute; inset: 0; z-index: 3; display: grid;
  grid-template-columns: repeat(auto-fill, var(--browser-item-size)); grid-auto-rows: var(--browser-item-size);
  align-content: start; gap: 4px; padding: 0; overflow: clip; }
.native-browser-surface__cell { position: relative; min-width: 0; }
.native-browser-surface__fallback-item { display: grid; place-items: center; min-width: 0;
  width: var(--browser-item-size); height: var(--browser-item-size); padding: 0; gap: 0;
  border: 0; border-radius: 0; background: transparent; color: #e9f1fb; cursor: pointer; }
.native-browser-surface__fallback-item:hover, .native-browser-surface__fallback-item--selected { background: rgba(255,255,255,.1); }
.native-browser-surface__fallback-item:focus-visible { outline: 1px solid rgba(245,158,11,.8); outline-offset: -1px; }
.native-browser-surface__empty { font-size: 12px; color: #94a3b8; }
.native-browser-surface__favorite { position: absolute; top: 0; right: 0; z-index: 1; width: 16px; height: 16px;
  padding: 0; border: 0; border-radius: 2px; background: rgba(9,13,18,.9); color: #e2e8f0;
  font-size: 13px; line-height: 16px; cursor: pointer; opacity: 0; }
.native-browser-surface__cell:hover .native-browser-surface__favorite,
.native-browser-surface__cell:focus-within .native-browser-surface__favorite,
.native-browser-surface__favorite--saved { opacity: 1; }
.native-browser-surface__favorite--saved { color: #fbbf24; }
.native-browser-surface__favorite:focus-visible { outline: 1px solid #fbbf24; }
@media (hover: none) { .native-browser-surface__favorite { opacity: 1; } }
</style>
