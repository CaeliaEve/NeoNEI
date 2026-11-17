<script setup lang="ts">
import {t,language} from '../i18n/index.ts';
import {computed,ref,watch} from 'vue';
import {useRoute,useRouter} from 'vue-router';
import type {EnderPage,EnderSearch} from '../catalog/ender-storage.ts';
import {Records} from '../catalog/client.ts';
import {useCatalog} from '../state/catalog.ts';
import {useRequest} from '../state/request.ts';
import {usePreferences} from '../state/preferences.ts';
import {itemLocation} from '../router/workspace.ts';
import ItemLink from '../components/ItemLink.vue';
import GameText from '../components/GameText.vue';
import Pager from '../components/Pager.vue';
const route=useRoute(),router=useRouter();
const {catalog,opening,error:openError,open}=useCatalog(computed(()=>typeof route.query.catalog==='string'?route.query.catalog:''));
const {preferences}=usePreferences();
const field=(key:string)=>typeof route.query[key]==='string'?route.query[key] as string:'';
const number=(key:string)=>/^(0|[1-9][0-9]*)$/.test(field(key))?Number(field(key)):0;
const search=computed<EnderSearch>(()=>({type:field('type')==='liquid'?'liquid':'item',owner:field('owner')==='personal'?'personal':field('owner')==='global'?'global':'',query:field('query'),frequency:field('frequency'),item:field('item'),state:field('state'),offset:number('offset'),limit:4,slotOffset:number('slotOffset'),slotLimit:27}));
const query=ref(search.value.query),frequency=ref(search.value.frequency);
const {value:page,error,loading,run,clear}=useRequest<EnderPage>();
const records=computed(()=>page.value?new Records(page.value.related):null);
const selected=computed(()=>page.value?.definitions.find(def=>def.data.storageType===search.value.type));
function load(){const session=catalog.value;if(session)void run(signal=>session.enderStorage(search.value,signal));}
watch([catalog,search],()=>{clear();query.value=search.value.query;frequency.value=search.value.frequency;load();},{immediate:true});
function update(patch:Record<string,string|number|undefined>){void router.push({name:'ender-storage',query:{...route.query,...patch}});}
function select(id:string,direction:'recipes'|'uses'){void router.push(itemLocation(id,route.query,direction==='uses'?'usedIn':'producedBy'));}
</script>
<template>
  <section v-if="opening" class="state-panel" role="status">{{t("正在读取末影存储快照…")}}</section>
  <section v-else-if="openError" class="state-panel error" role="alert">{{openError}} <button @click="open()">{{t("重试")}}</button></section>
  <main v-else-if="catalog" class="catalog-page panel ender-storage-page">
    <h1>{{t("末影存储")}}</h1>
    <p>{{t("查看采集时全局频道与当前玩家个人频道的内容。此处是保存的快照；游戏中的后续变化需要重新采集。")}}</p>
    <form class="ender-storage-filters" @submit.prevent="update({query:query||undefined,frequency:frequency||undefined,offset:undefined,state:undefined})">
      <label for="ender-storage-type">{{t("存储类型")}}</label><select id="ender-storage-type" :value="search.type" @change="update({type:($event.target as HTMLSelectElement).value,offset:undefined,state:undefined,slotOffset:undefined,item:undefined})"><option value="item">{{t("末影箱")}}</option><option value="liquid">{{t("末影储罐")}}</option></select>
      <label for="ender-storage-owner">{{t("频道")}}</label><select id="ender-storage-owner" :value="search.owner" @change="update({owner:($event.target as HTMLSelectElement).value||undefined,offset:undefined,state:undefined})"><option value="">{{t("全局和个人")}}</option><option value="global">{{t("全局")}}</option><option value="personal">{{t("个人")}}</option></select>
      <label for="ender-storage-frequency">{{t("频率编号")}}</label><input id="ender-storage-frequency" v-model="frequency" type="number" min="0" max="4095" />
      <label for="ender-storage-query">{{t("查找内容")}}</label><input id="ender-storage-query" v-model="query" type="search" maxlength="256" /><button>{{t("搜索")}}</button>
    </form>
    <p v-if="error" class="state-panel error" role="alert">{{error}} <button @click="load()">{{t("重试")}}</button></p>
    <p v-else-if="loading" class="state-panel" role="status">{{t("正在读取快照…")}}</p>
    <template v-else-if="page && records">
      <p v-if="!selected" class="state-panel">{{t("本数据集没有该类型的存储快照。")}}</p>
      <section v-else class="ender-storage-context">
        <p>{{t("游戏时刻")}} {{selected.data.capturedTick}} {{t("· 个人所有者：")}}<GameText :text="selected.data.personalOwner" /> {{t("· 已记录")}} {{selected.data.counts.states}} {{t("个频道")}}</p>
        <p>{{t("未分配的频率属于原生空频道。已记录的空频道仍保留在快照中。")}}</p>
        <p>{{t("个人频道锁定物品")}}</p><ItemLink v-if="selected.data.personalLockItem.fact" :target="{kind:'item',id:selected.data.personalLockItem.fact}" :catalog="catalog" :records="records" :animate="preferences.animate" @select="select" />
      </section>
      <p v-if="!page.total" class="state-panel">{{t("没有匹配的已记录频道。")}}</p>
      <Pager :offset="search.offset" :limit="search.limit" :total="page.total" @change="offset=>update({offset,state:undefined})" />
      <article v-for="state in page.states" :key="state.id" class="ender-storage-state" :data-state="state.id">
        <h2>{{t("频率")}} {{state.data.frequency}} · <GameText :text="state.data.owner" /></h2>
        <p class="ender-storage-colours">{{t("颜色代码：{0}", state.data.colours.join(' · '))}}</p>
        <p>{{state.data.layer==='loadedServer'?t("采集时已加载的内容"):t("尚未加载的存档条目")}} <span v-if="!state.data.contents.nonEmpty">{{t("· 原生空频道")}}</span></p>
        <RouterLink :to="{name:'ender-storage',query:{...route.query,type:state.data.contents.kind,state:state.id,offset:undefined}}">{{t("频道固定链接")}}</RouterLink>
        <template v-if="state.data.contents.kind==='item'">
          <p>{{state.data.contents.slots.length}} {{t("个原始槽位")}} <span v-if="state.data.layer==='persistedServer'">{{t("· 保留存档大小，不模拟加载时的尺寸调整")}}</span></p>
          <div v-for="slots in page.slots.filter(slots=>slots.state===state.id)" :key="slots.state" class="ender-storage-slots">
            <div v-for="(slot,index) in slots.slots" :key="index" class="ender-storage-slot" :data-slot="slots.offset+index">
              <small>{{t("槽位 {0}", slots.offset+index+1)}}</small>
              <ItemLink v-if="slot?.component.fact" :target="{kind:'item',id:slot.component.fact,amount:slot.amount}" :catalog="catalog" :records="records" :animate="preferences.animate" @select="select" />
              <p v-else-if="slot?.component.kind==='item'" class="ender-storage-template">{{t("{0} · 符号元数据", slot.component.registry)}}</p><span v-else class="ender-storage-empty">{{t("空")}}</span>
            </div>
          </div>
          <Pager :offset="search.slotOffset" :limit="search.slotLimit" :total="state.data.contents.slots.length" @change="slotOffset=>update({slotOffset})" />
        </template>
        <template v-else>
          <p>{{t("容量 {0} mB", state.data.contents.capacity.toLocaleString(language))}}</p>
          <ItemLink v-if="state.data.contents.nonEmpty && state.data.contents.fluid?.fact" :target="{kind:'fluid',id:state.data.contents.fluid.fact,amount:state.data.contents.amount}" :catalog="catalog" :records="records" :animate="preferences.animate" @select="select" />
          <p v-else class="ender-storage-empty">{{t("空储罐")}}</p>
        </template>
      </article>
    </template>
  </main>
</template>
<style scoped>
.ender-storage-page{min-width:0;padding:20px;padding-bottom:48px;overflow-wrap:anywhere}.ender-storage-filters{display:flex;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:16px}.ender-storage-filters input[type=number]{width:90px}.ender-storage-state{padding:16px;margin:12px 0;border:1px solid var(--color-border,#334155);border-radius:8px}.ender-storage-slots{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(200px,100%),1fr));gap:8px}.ender-storage-slot{border:1px solid var(--color-border,#334155);border-radius:6px;display:flex;flex-direction:column;gap:8px;padding:10px;min-height:60px;min-width:0}.ender-storage-empty{color:var(--color-text-secondary,#a0afc6)}.ender-storage-context{margin:12px 0}
.ender-storage-slot :deep(.item-link){width:100%;min-width:0;align-items:flex-start}.ender-storage-slot :deep(.item-caption){display:flex;flex-direction:column;align-items:flex-start;gap:4px;min-width:0;line-height:1.4}.ender-storage-slot :deep(.item-caption small){display:block;white-space:nowrap}
</style>
