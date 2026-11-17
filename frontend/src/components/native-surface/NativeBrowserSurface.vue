<script setup lang="ts">
import {computed,onBeforeUnmount,onMounted,ref} from 'vue';
import {t} from '../../i18n/index.ts';
import type {BrowserVariantGroup,Item} from '../../services/api';
import type {NativeSurfaceId,NativeSurfaceViewportRole,NativeSurfaceFrameProjectionMetrics} from '../../native-surface/contracts';
import {residentCatalog} from '../../browser/resident';
import {useFavorites} from '../../browser/favorites';
import {usePreferences} from '../../state/preferences';
import BufferedCatalogGrid from './BufferedCatalogGrid.vue';
import ResidentIcon from '../ResidentIcon.vue';
import CatalogIcon from '../CatalogIcon.vue';

const props=withDefaults(defineProps<{
 catalog?:boolean;surfaceId:NativeSurfaceId;viewportRole?:NativeSurfaceViewportRole;itemSize:number;
 page?:number;itemsPage?:number;searchQuery?:string;modId?:string|null;expandedGroups?:string[];
 manifestUrl?:string|null;enableAnimation?:boolean;historyItemIds?:string[];selectedItemId?:string|null;fallbackItems?:Item[];
}>(),{catalog:true,viewportRole:'browser',page:1,expandedGroups:()=>[],enableAnimation:true,historyItemIds:()=>[],selectedItemId:null});
const emit=defineEmits<{
 itemClick:[item:Item];itemContextmenu:[item:Item,event:MouseEvent];groupClick:[group:BrowserVariantGroup];groupContextmenu:[group:BrowserVariantGroup,event:MouseEvent];
 viewportResize:[element:HTMLElement|null];runtimeProjectionUpdate:[metrics:NativeSurfaceFrameProjectionMetrics];pagePresented:[page:number];pageFault:[message:string];
}>();
const host=ref<HTMLElement|null>(null);
const pageContext=computed(()=>JSON.stringify([props.searchQuery,props.modId,props.itemSize,props.expandedGroups]));
const {ids:favoriteIds,toggle:toggleFavorite}=useFavorites(residentCatalog);
const {preferences}=usePreferences();
let observer:ResizeObserver|null=null;
onMounted(()=>{
 emit('viewportResize',host.value);
 observer=new ResizeObserver(()=>emit('viewportResize',host.value));
 if(host.value)observer.observe(host.value);
});
onBeforeUnmount(()=>{observer?.disconnect();});
function select(item:Item,event:MouseEvent){
 if(event.altKey){toggleFavorite(item);return;}
 emit('itemClick',item);
}
</script>

<template>
 <div ref="host" class="native-browser-surface h-full w-full overflow-hidden">
  <BufferedCatalogGrid v-if="viewportRole==='browser'"
   :items="fallbackItems??[]" :page="itemsPage??page" :target-page="page" :context="pageContext"
   :item-size="itemSize" :animate="enableAnimation" :selected-item-id="selectedItemId"
   @item-click="emit('itemClick',$event)" @item-contextmenu="(item,event)=>emit('itemContextmenu',item,event)"
   @page-presented="emit('pagePresented',$event)" @page-fault="emit('pageFault',$event)" />
  <div v-else class="native-browser-surface__fallback native-browser-surface__catalog-grid"
   :style="{'--browser-item-size':itemSize+'px'}" role="list">
   <div v-for="item in fallbackItems??[]" :key="item.itemId" class="native-browser-surface__cell" role="listitem">
    <button type="button" class="native-browser-surface__fallback-item"
     :class="{'native-browser-surface__fallback-item--selected':item.itemId===selectedItemId}"
     :title="item.localizedName" :aria-label="item.localizedName"
     @click.stop="select(item,$event)"
     @contextmenu.prevent.stop="emit('itemContextmenu',item,$event)">
     <ResidentIcon v-if="typeof item.residentSprite==='number'&&item.residentSprite>=0" :id="item.itemId" :sprite="item.residentSprite"
      :size="Math.max(1,Math.floor(itemSize*.9))" :label="item.localizedName" :animate="enableAnimation&&preferences.animate" />
     <CatalogIcon v-else :id="item.itemId" :size="Math.max(1,Math.floor(itemSize*.9))" :label="item.localizedName" :animate="enableAnimation&&preferences.animate" />
    </button>
    <button v-if="residentCatalog" type="button" class="native-browser-surface__favorite"
     :class="{'native-browser-surface__favorite--saved':favoriteIds.has(item.itemId)}"
     :aria-label="`${favoriteIds.has(item.itemId)?t('取消收藏'):t('收藏')} ${item.localizedName}`"
     :aria-pressed="favoriteIds.has(item.itemId)" :title="t('{0}（Alt + 单击物品）',favoriteIds.has(item.itemId)?t('取消收藏'):t('收藏'))"
     @click.stop="toggleFavorite(item)"
     @contextmenu.prevent.stop>{{favoriteIds.has(item.itemId)?'★':'☆'}}</button>
   </div>
  </div>
 </div>
</template>

<style scoped>
.native-browser-surface{position:relative}
.native-browser-surface__fallback{position:absolute;inset:0;z-index:3;display:grid;align-content:start}
.native-browser-surface__catalog-grid{grid-template-columns:repeat(auto-fill,var(--browser-item-size));grid-auto-rows:var(--browser-item-size);gap:4px;padding:0;overflow:clip}
.native-browser-surface__cell{position:relative;min-width:0}
.native-browser-surface__fallback-item{display:grid;place-items:center;min-width:0;min-height:0;width:var(--browser-item-size);height:var(--browser-item-size);padding:0;gap:0;border:0;border-radius:0;background:transparent;color:rgba(233,241,251,.94);cursor:pointer}
.native-browser-surface__fallback-item:hover,.native-browser-surface__fallback-item--selected{background:rgba(255,255,255,.1)}
.native-browser-surface__fallback-item:focus-visible{outline:1px solid rgba(245,158,11,.8);outline-offset:-1px}
.native-browser-surface__favorite{position:absolute;top:0;right:0;z-index:1;width:16px;height:16px;padding:0;border:0;border-radius:2px;background:rgba(9,13,18,.9);color:#e2e8f0;font-size:13px;line-height:16px;cursor:pointer;opacity:0}
.native-browser-surface__cell:hover .native-browser-surface__favorite,.native-browser-surface__cell:focus-within .native-browser-surface__favorite,.native-browser-surface__favorite--saved{opacity:1}
.native-browser-surface__favorite--saved{color:#fbbf24}
.native-browser-surface__favorite:focus-visible{outline:1px solid #fbbf24}
@media(hover:none){.native-browser-surface__favorite{opacity:1}}
</style>
