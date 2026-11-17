<script setup lang="ts">
import {t} from '../i18n/index.ts';
import {computed,ref,watch} from 'vue';
import {useRoute,useRouter} from 'vue-router';
import {Records} from '../catalog/client.ts';
import type {LexiconPage,LexiconSearch} from '../catalog/lexicon.ts';
import {useCatalog} from '../state/catalog.ts';
import {useRequest} from '../state/request.ts';
import {usePreferences} from '../state/preferences.ts';
import {itemLocation} from '../router/workspace.ts';
import GameText from '../components/GameText.vue';
import ItemLink from '../components/ItemLink.vue';
import Pager from '../components/Pager.vue';

const route=useRoute(),router=useRouter();
const param=(key:string)=>typeof route.query[key]==='string'?route.query[key] as string:'';
const {catalog,opening,error:openError,open}=useCatalog(computed(()=>param('catalog')));
const {preferences}=usePreferences();
const {value:page,error,loading,run,clear}=useRequest<LexiconPage>();
const search=ref(param('query'));
const options=computed<LexiconSearch>(()=>({query:param('query'),item:param('item'),offset:Number(param('offset')||0),limit:20}));
const records=computed(()=>page.value?new Records(page.value.related):null);
function load() {const session=catalog.value;if(session) void run(signal=>session.lexicon(options.value,signal));}
watch([catalog,options],()=>{clear();load();},{immediate:true});
watch(()=>param('query'),value=>{search.value=value;});
function find() {void router.push({query:{...route.query,query:search.value||undefined,offset:undefined}});}
function move(offset:number) {void router.push({query:{...route.query,offset:String(offset)}});}
function select(id:string,direction:'recipes'|'uses') {void router.push(itemLocation(id,route.query,direction==='uses'?'usedIn':'producedBy'));}
</script>

<template>
  <section v-if="opening" class="state-panel" role="status">{{t("正在读取植物魔法辞典…")}}</section>
  <section v-else-if="openError" class="state-panel error" role="alert">{{openError}} <button @click="open()">{{t("重试")}}</button></section>
  <main v-else-if="catalog" class="panel lexicon-page">
    <header><h1>{{t("植物魔法辞典")}}</h1><p>{{t("查看原生 NEI 辞典索引中的条目、知识等级和物品说明。")}}</p></header>
    <form class="lexicon-search" @submit.prevent="find"><label>{{t("查找条目")}} <input v-model="search" type="search" maxlength="256" /></label><button type="submit">{{t("搜索")}}</button></form>
    <p v-if="options.item">{{t("已按物品筛选。")}}<RouterLink :to="{query:{...route.query,item:undefined,offset:undefined}}">{{t("清除筛选")}}</RouterLink></p>
    <p v-if="loading" role="status">{{t("正在读取辞典条目…")}}</p>
    <p v-else-if="error" class="inline-error" role="alert">{{error}} <button @click="load">{{t("重试")}}</button></p>
    <template v-else-if="page && records">
      <p v-if="!page.definitions.length" class="state-panel">{{t("当前数据集未包含辞典索引。")}}</p>
      <p v-else-if="!page.total" class="state-panel">{{t("没有符合筛选条件的辞典条目。")}}</p>
      <article v-for="row in page.rows" :key="row.id" class="lexicon-entry">
        <h2><GameText :text="row.data.name.value" /></h2>
        <p class="lexicon-knowledge"><GameText :text="row.data.knowledge.color + row.data.knowledge.name.value" /> · {{row.data.knowledge.autoUnlock?t("基础知识自动解锁"):t("需要对应知识解锁")}}</p>
        <p v-if="row.data.tagline" class="lexicon-text"><GameText :text="row.data.tagline.value" /></p>
        <div class="lexicon-items">
          <section v-for="(item,index) in row.data.items" :key="index" class="lexicon-item">
            <ItemLink :target="{kind:'item',id:item.item}" :records="records" :catalog="catalog" :animate="preferences.animate" @select="select" />
            <p class="lexicon-text"><GameText :text="item.quickInfo.value" /></p>
          </section>
        </div>
        <p v-if="!row.data.items.length" class="subtle">{{t("该原生条目没有关联的 NEI 展示物品。")}}</p>
      </article>
      <Pager :total="page.total" :offset="page.offset" :limit="page.limit" :busy="loading" :label="t('辞典')" @change="move" />
    </template>
  </main>
</template>

<style scoped>
.lexicon-page{margin:1rem;max-width:1100px;padding:1.2rem;color:var(--text,#e2e8f0)}
.lexicon-search,.lexicon-search label{display:flex;align-items:center;gap:.6rem;flex-wrap:wrap}
.lexicon-entry{margin-top:1rem;padding:1rem;border:1px solid var(--border,#334155);border-radius:.7rem;background:var(--surface,#101b2b)}
.lexicon-entry h2{font-size:1.1rem;margin:0 0 .5rem}
.lexicon-items{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,250px),1fr));gap:1rem}
.lexicon-item{padding:.5rem;border-top:1px solid var(--border,#334155)}
.lexicon-text{white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.65}
.lexicon-knowledge,.subtle{color:var(--muted,#94a3b8)}
</style>
