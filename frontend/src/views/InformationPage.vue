<script setup lang="ts">
import {t} from '../i18n/index.ts';
import {computed,ref,watch} from 'vue';
import {useRoute,useRouter} from 'vue-router';
import type {InformationPage,InformationSearch} from '../catalog/information.ts';
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
const search=computed<InformationSearch>(()=>({backend:route.query.backend==='nei'||route.query.backend==='extraUtilities'?route.query.backend:'',
  query:typeof route.query.query==='string'?route.query.query:'',item:typeof route.query.item==='string'?route.query.item:'',includeUnmatched:route.query.includeUnmatched==='true',
  document:typeof route.query.document==='string'?route.query.document:'',linkOffset:/^(0|[1-9][0-9]*)$/.test(String(route.query.linkOffset??''))?Number(route.query.linkOffset):0,linkLimit:8,
  offset:/^(0|[1-9][0-9]*)$/.test(String(route.query.offset??''))?Number(route.query.offset):0,limit:12}));
const query=ref(search.value.query);
const {value:page,error,loading,run,clear}=useRequest<InformationPage>();
const records=computed(()=>page.value?new Records(page.value.related):null);
const linkPages=computed(()=>new Map(page.value?.links.map(value=>[value.row,value])??[]));
function load(){const session=catalog.value;if(session)void run(signal=>session.information(search.value,signal));}
watch([catalog,search],()=>{clear();query.value=search.value.query;load();},{immediate:true});
function update(patch:Record<string,string|number|undefined>){void router.push({name:'information',query:{...route.query,offset:undefined,linkOffset:undefined,...patch}});}
function select(id:string,direction:'recipes'|'uses'){void router.push(itemLocation(id,route.query,direction==='uses'?'usedIn':'producedBy'));}
</script>
<template>
  <section v-if="opening" class="state-panel" role="status">{{t("正在读取物品说明…")}}</section>
  <section v-else-if="openError" class="state-panel error" role="alert">{{openError}} <button @click="open()">{{t("重试")}}</button></section>
  <main v-else-if="catalog" class="catalog-page panel information-page">
    <h1>{{t("物品说明")}}</h1>
    <p>{{t("查看原生资料中的物品说明。关联物品用于查阅与导航，不表示合成投入或产出。")}}</p>
    <form class="information-filters" @submit.prevent="update({query:query||undefined})">
      <label for="information-source">{{t("说明来源")}}</label><select id="information-source" :value="search.backend" @change="update({backend:($event.target as HTMLSelectElement).value||undefined})"><option value="">{{t("全部")}}</option><option value="nei">NEI</option><option value="extraUtilities">Extra Utilities</option></select>
      <label for="information-query">{{t("查找物品说明")}}</label><input id="information-query" v-model="query" type="search" maxlength="256" :placeholder="t('说明正文')" /><button>{{t("搜索")}}</button>
      <button type="button" @click="update({backend:undefined,query:undefined,item:undefined,document:undefined,includeUnmatched:undefined})">{{t("清空筛选")}}</button>
      <label class="information-unmatched"><input type="checkbox" :checked="search.includeUnmatched" @change="update({includeUnmatched:($event.target as HTMLInputElement).checked?'true':undefined})" />{{t("包含未关联物品的说明")}}</label>
    </form>
    <p v-if="loading" role="status">{{t("正在读取条目…")}}</p>
    <p v-else-if="error" class="inline-error" role="alert">{{error}} <button @click="load()">{{t("重试")}}</button></p>
    <p v-else-if="!page?.definitions.length">{{t("当前数据集中未采集所选来源的物品说明。")}}</p>
    <template v-else-if="page && records">
      <article v-for="row in page.rows" :key="row.id" class="information-entry" :data-native-page="row.data.page" :data-listed="row.data.listed">
        <h2>{{t("{0} · 说明 {1}", row.data.source.owner, row.data.page+1)}}</h2>
        <div class="information-items"><ItemLink v-for="(link,index) in linkPages.get(row.id)!.items" :key="index" :target="{kind:'item',id:link.item,amount:link.amount}" :records="records" :catalog="catalog" :animate="preferences.animate" @select="select" /></div>
        <template v-if="linkPages.get(row.id)!.total>search.linkLimit"><button v-if="!search.document" @click="update({document:row.id})">{{t("查看全部关联物品（{0}）", linkPages.get(row.id)!.total)}}</button><Pager v-else :total="linkPages.get(row.id)!.total" :offset="linkPages.get(row.id)!.offset" :limit="search.linkLimit" :busy="loading" :label="t('关联物品')" @change="update({linkOffset:$event})" /></template>
        <p v-if="!row.data.listed" class="information-unlinked">{{t("这条原生说明当前没有关联物品。")}}</p>
        <div class="information-text"><p v-for="(line,index) in row.data.lines" :key="index"><GameText :text="line" /></p></div>
      </article>
      <p v-if="!page.rows.length">{{t("没有符合当前筛选条件的物品说明。")}}</p>
      <button v-if="search.document" @click="update({document:undefined})">{{t("返回说明列表")}}</button>
      <Pager :total="page.total" :offset="page.offset" :limit="page.limit" :busy="loading" :label="t('物品说明')" @change="update({offset:$event})" />
    </template>
  </main>
</template>
<style scoped>
.information-page{margin:1rem;padding:1.2rem;max-width:1100px;min-height:0;width:auto}.information-page p{line-height:1.7;overflow-wrap:anywhere;margin:.6rem 0}.information-filters{display:flex;flex-wrap:wrap;align-items:center;gap:.6rem;margin:1rem 0}.information-filters input[type=search]{flex:1;min-width:180px}.information-unmatched{display:flex;align-items:center;gap:.4rem;flex-basis:100%}.information-entry{margin:1rem 0;padding:1rem;border:1px solid var(--border,#334155);border-radius:.7rem;background:var(--surface,#101b2b)}.information-items{display:flex;flex-wrap:wrap;gap:.7rem;margin:.8rem 0}.information-text p{white-space:pre-wrap;min-height:1.2em}.information-unlinked{color:var(--muted,#a0afc6)}
</style>
