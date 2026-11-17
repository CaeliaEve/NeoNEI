<script setup lang="ts">
import {t,language} from '../i18n/index.ts';
import {computed,ref,watch} from 'vue';
import {useRoute,useRouter} from 'vue-router';
import type {ForestryPage,ForestrySearch} from '../catalog/forestry-info.ts';
import {nativeForestryFloat} from '@neonei/catalog/source';
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
const search=computed<ForestrySearch>(()=>({mode:route.query.mode==='breeding'?'breeding':'produce',root:typeof route.query.root==='string'?route.query.root:'',
  species:typeof route.query.species==='string'?route.query.species:'',query:typeof route.query.query==='string'?route.query.query:'',
  offset:/^(0|[1-9][0-9]*)$/.test(String(route.query.offset??''))?Number(route.query.offset):0,limit:12}));
const query=ref(search.value.query);
const {value:page,error,loading,run,clear}=useRequest<ForestryPage>();
const records=computed(()=>page.value?new Records(page.value.related):null);
const definitions=computed(()=>new Map(page.value?.definitions.map(row=>[row.domain,row.data])??[]));
const species=computed(()=>new Map(page.value?.species.map(row=>[row.domain+':'+row.data.species,row.data])??[]));
const speciesRows=computed(()=>page.value?.rows.flatMap(row=>row.data.kind==='forestryAddonsSpecies'?[{id:row.id,domain:row.domain,data:row.data}]:[])??[]);
const outputs=computed(()=>page.value?.outputs??[]);
const mutations=computed(()=>page.value?.rows.flatMap(row=>row.data.kind==='forestryAddonsMutation'?[{id:row.id,domain:row.domain,data:row.data}]:[])??[]);
const rootNames:Record<string,string>={rootBees:'蜜蜂',rootTrees:'树木',rootButterflies:'蝴蝶',rootFlowers:'花卉'};
const roles:Record<string,string>={producer:'生产物种样本',parent1:'亲本一',parent2:'亲本二',offspring:'后代样本'};
const availableRoots=computed(()=>search.value.mode==='produce'?['rootBees','rootTrees']:Object.keys(rootNames));
function load(){const session=catalog.value;if(session)void run(signal=>session.forestryInfo(search.value,signal));}
watch([catalog,search],()=>{clear();query.value=search.value.query;load();},{immediate:true});
function update(patch:Record<string,string|number|undefined>){void router.push({name:'forestry-info',query:{...route.query,offset:undefined,...patch}});}
function pick(domain:string,uid:string){update({root:definitions.value.get(domain)!.root,species:uid});}
function select(id:string,direction:'recipes'|'uses'){void router.push(itemLocation(id,route.query,direction==='uses'?'usedIn':'producedBy'));}
function percentage(value:{bits:string;decimal:string},fraction:boolean){const native=nativeForestryFloat(value);return new Intl.NumberFormat(language.value,{maximumSignificantDigits:7}).format(native*(fraction?100:1))+'%';}
</script>
<template>
  <section v-if="opening" class="state-panel" role="status">{{t("正在读取林业资料…")}}</section>
  <section v-else-if="openError" class="state-panel error" role="alert">{{openError}} <button @click="open()">{{t("重试")}}</button></section>
  <main v-else-if="catalog" class="catalog-page panel forestry-info-page">
    <h1>{{t("林业生产与育种")}}</h1>
    <p>{{t("查看物种的原始产物、特产品和突变路线。样本用于展示物种与基因，不表示固定数量的合成材料。")}}</p>
    <nav class="forestry-modes" :aria-label="t('林业资料类型')"><button :aria-pressed="search.mode==='produce'" @click="update({mode:'produce',root:undefined,species:undefined})">{{t("物种生产")}}</button><button :aria-pressed="search.mode==='breeding'" @click="update({mode:'breeding',root:undefined,species:undefined})">{{t("育种路线")}}</button></nav>
    <form class="forestry-filters" @submit.prevent="update({query:query||undefined})">
      <label for="forestry-root">{{t("物种领域")}}</label><select id="forestry-root" :value="search.root" @change="update({root:($event.target as HTMLSelectElement).value||undefined,species:undefined})"><option value="">{{t("全部")}}</option><option v-for="root in availableRoots" :key="root" :value="root">{{t(rootNames[root]!)}}</option></select>
      <label for="forestry-query">{{t("查找物种")}}</label><input id="forestry-query" v-model="query" type="search" :placeholder="t('物种名称或 UID')" maxlength="256" /><button>{{t("搜索")}}</button>
      <button type="button" @click="update({query:undefined,species:undefined,offset:undefined})">{{t("查看全部")}}</button>
    </form>
    <p v-if="search.species" class="forestry-selection"><code>{{search.species}}</code><button @click="update({species:undefined})">{{t("返回物种列表")}}</button></p>
    <p v-if="loading" role="status">{{t("正在读取条目…")}}</p>
    <p v-else-if="error" role="alert" class="inline-error">{{error}} <button @click="load()">{{t("重试")}}</button></p>
    <p v-else-if="!page?.definitions.length">{{t("当前数据集中未采集所选领域的林业资料。")}}</p>
    <template v-else-if="page && records">
      <p class="forestry-policy">{{t("基础值来自物种或突变注册信息。实际产出与突变概率会随基因、环境和运行模式变化。")}}</p>
      <section v-if="page.view==='species'" class="forestry-cards" :aria-label="t('生产物种')">
        <article v-for="row in speciesRows" :key="row.id" class="forestry-card">
          <h2><GameText :text="row.data.name" /></h2><p>{{t("{0} · {1} 条生产记录", t(rootNames[definitions.get(row.domain)!.root]!), row.data.outputs)}}</p>
          <div class="forestry-specimens"><div v-for="form in row.data.specimens" :key="form.role"><span>{{t(roles[form.role]!)}}</span><ItemLink :target="{kind:'item',id:form.item}" :records="records" :catalog="catalog" :animate="preferences.animate" @select="select" /></div></div>
          <p v-if="row.data.jubilance"><GameText :text="row.data.jubilance" /></p>
          <button @click="pick(row.domain,row.data.species)">{{t("查看产物")}}</button>
        </article>
      </section>
      <section v-else-if="page.view==='outputs'" :aria-label="t('物种产物')">
        <header v-for="row in page.species" :key="row.id" class="forestry-owner"><h2><GameText :text="row.data.name" /></h2><p v-if="row.data.jubilance">{{t("特产品适宜条件：")}}<GameText :text="row.data.jubilance" /></p><p>{{t("下列条目保留物种声明的堆叠数量和基础生产值。")}}</p></header>
        <div class="forestry-cards"><article v-for="row in outputs" :key="row.id" class="forestry-card">
          <strong>{{row.data.role==='specialty'?t("特产品"):t("普通产物")}}</strong>
          <ItemLink :target="{kind:'item',id:row.data.item}" :records="records" :catalog="catalog" :animate="preferences.animate" @select="select" />
          <p>{{t("原始数量 ×{0} · 基础生产值 {1}", row.data.amount, percentage(row.data.rate,true))}}</p>
        </article></div>
      </section>
      <section v-else :aria-label="t('育种路线')"><article v-for="row in mutations" :key="row.id" class="forestry-card">
        <div class="forestry-cross"><template v-for="(uid,index) in [...row.data.parents,row.data.result]" :key="index"><span v-if="index" aria-hidden="true">{{index===1?'×':'→'}}</span><div><button @click="pick(row.domain,uid)"><GameText :text="species.get(row.domain+':'+uid)!.name" /></button><ItemLink :target="{kind:'item',id:species.get(row.domain+':'+uid)!.specimens.find(form=>form.role===(index===0?'parent1':index===1?'parent2':'offspring'))!.item}" :records="records" :catalog="catalog" :animate="preferences.animate" @select="select" /></div></template></div>
        <p>{{t("基础突变值")}} {{percentage(row.data.base,false)}} {{t("· 原生登记")}} {{row.data.ordinal+1}}<span v-if="row.data.secret">{{t("· 隐藏突变")}}</span></p>
        <ul v-if="row.data.conditions?.length"><li v-for="(condition,index) in row.data.conditions" :key="index"><GameText :text="condition" /></li></ul>
        <p v-else>{{t("原生资料未提供附加条件说明。")}}</p>
        <details><summary>{{t("后代基因模板")}}</summary><ol><li v-for="(allele,index) in row.data.template" :key="index">{{index}}：{{allele??t("原生空染色体")}}</li></ol></details>
      </article></section>
      <p v-if="!page.rows.length">{{t("没有符合当前筛选条件的条目。")}}</p>
      <Pager :total="page.total" :offset="page.offset" :limit="page.limit" :busy="loading" :label="t('林业条目')" @change="update({offset:$event})" />
    </template>
  </main>
</template>
<style scoped>
.forestry-info-page{margin:1rem;padding:1.2rem;max-width:1100px;min-height:0;width:auto}.forestry-info-page p{line-height:1.65;overflow-wrap:anywhere;margin:.7rem 0}.forestry-modes,.forestry-filters,.forestry-selection{display:flex;flex-wrap:wrap;gap:.5rem;align-items:center;margin:1rem 0}.forestry-filters input{flex:1;min-width:170px}.forestry-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(250px,100%),1fr));gap:1rem}.forestry-card{padding:1rem;border:1px solid var(--border,#334155);border-radius:.7rem;margin:.8rem 0;background:var(--surface,#101b2b)}.forestry-specimens,.forestry-cross{display:flex;flex-wrap:wrap;align-items:center;gap:.7rem}.forestry-specimens>div,.forestry-cross>div{display:grid;gap:.4rem}.forestry-card details,.forestry-cross button{overflow-wrap:anywhere}.forestry-owner{padding:.7rem 0}
</style>
