<script setup lang="ts">
import {t} from '../i18n/index.ts';
import {computed,ref,watch} from 'vue';
import {useRoute,useRouter} from 'vue-router';
import type {BeeTreePage,BeeTreeSearch} from '../catalog/bee-tree.ts';
import {Records} from '../catalog/client.ts';
import {chance} from '../catalog/format.ts';
import {useCatalog} from '../state/catalog.ts';
import {useRequest} from '../state/request.ts';
import {usePreferences} from '../state/preferences.ts';
import {itemLocation} from '../router/workspace.ts';
import ItemLink from '../components/ItemLink.vue';
import GameText from '../components/GameText.vue';
import Pager from '../components/Pager.vue';
import BeeLineageNode from '../components/BeeLineageNode.vue';
const route=useRoute(),router=useRouter();
const {catalog,opening,error:openError,open}=useCatalog(computed(()=>typeof route.query.catalog==='string'?route.query.catalog:''));
const {preferences}=usePreferences();
const search=computed<BeeTreeSearch>(()=>({species:typeof route.query.species==='string'?route.query.species:'',
  direction:route.query.direction==='crosses'?'crosses':'origins',query:typeof route.query.query==='string'?route.query.query:'',
  offset:/^(0|[1-9][0-9]*)$/.test(String(route.query.offset??''))?Number(route.query.offset):0,limit:12}));
const query=ref(search.value.query);
const {value:page,error,loading,run,clear}=useRequest<BeeTreePage>();
const records=computed(()=>page.value?new Records(page.value.related):null);
const species=computed(()=>new Map(page.value?.species.map(row=>[row.data.species,row])??[]));
function load(){const session=catalog.value;if(session) void run(signal=>session.beeTree(search.value,signal));}
watch([catalog,search],()=>{clear();query.value=search.value.query;load();},{immediate:true});
function update(patch:Record<string,string|number|undefined>){void router.push({name:'bee-tree',query:{...route.query,offset:undefined,...patch}});}
function select(id:string,direction:'recipes'|'uses'){void router.push(itemLocation(id,route.query,direction==='uses'?'usedIn':'producedBy'));}
</script>
<template>
  <section v-if="opening" class="state-panel" role="status">{{t("正在读取蜜蜂育种树…")}}</section>
  <section v-else-if="openError" class="state-panel error" role="alert">{{openError}} <button @click="open()">{{t("重试")}}</button></section>
  <main v-else-if="catalog" class="catalog-page panel bee-tree-page">
    <h1>{{t("蜜蜂育种树")}}</h1>
    <p>{{t("展示真实注册的突变路线、基础概率和条件；已分析的公主蜂与雄蜂是物种示例，不表示固定数量的材料消耗。")}}</p>
    <form class="bee-tree-search" @submit.prevent="update({query:query||undefined})">
      <input v-model="query" type="search" :aria-label="t('查找蜜蜂路线')" :placeholder="t('物种名称或 UID')" /><button>{{t("搜索")}}</button>
      <button type="button" @click="update({species:undefined,query:undefined,direction:undefined})">{{t("全部路线")}}</button>
    </form>
    <div v-if="search.species" class="bee-tree-filter"><code>{{search.species}}</code><button @click="update({direction:'origins'})" :aria-pressed="search.direction==='origins'">{{t("如何获得")}}</button><button @click="update({direction:'crosses'})" :aria-pressed="search.direction==='crosses'">{{t("参与杂交")}}</button></div>
    <p v-if="loading" role="status">{{t("正在读取路线…")}}</p>
    <p v-else-if="error" role="alert" class="inline-error">{{error}} <button @click="load()">{{t("重试")}}</button></p>
    <p v-else-if="!page?.definition">{{t("当前数据集未包含蜜蜂育种树资料。")}}</p>
    <template v-else-if="page && records">
      <p class="bee-tree-policy">{{t("原生树选择每个物种第一个注册的突变路线，显示三层亲本。根路线{0}隐藏突变；祖先查询沿用原生未过滤列表。重复分支{1}。下方路线列表保留所有可见注册，包括重复登记，不把概率相加。", page.definition.data.showSecret?t("允许"):t("过滤"), page.definition.data.showDuplicateTrees?t("展开"):t("折叠"))}}</p>
      <section v-if="page.lineage" class="bee-lineage" :aria-label="t('原生路线关系')"><h2>{{t("原生选择的祖先路线")}}</h2><p>{{t("条件是模组提供的说明，未模拟当前蜂箱、基因和养蜂模式。")}}</p>
        <div class="bee-lineage-scroll"><ul><BeeLineageNode :node="page.lineage" :species="species" :records="records" :catalog="catalog" :animate="preferences.animate" @select="select" /></ul></div>
      </section>
      <section class="bee-tree-routes" :aria-label="t('突变路线')">
        <article v-for="row in page.rows" :key="row.id" class="bee-tree-route">
          <div class="bee-cross"><template v-for="(uid,i) in [...row.data.parents,row.data.result]" :key="i">
            <span v-if="i" aria-hidden="true">{{i===1?'×':'→'}}</span><div><button class="bee-species-select" @click="update({species:uid})"><GameText :text="species.get(uid)!.data.name" /></button>
              <ItemLink :target="{kind:'item',id:i===2?species.get(uid)!.data.princess:species.get(uid)!.data.drone}" :records="records" :catalog="catalog" :animate="preferences.animate" @select="select" />
            </div>
          </template></div>
          <p>{{t("基础概率")}} {{chance(row.data.chance)}} {{t("· 原生登记")}} {{row.data.ordinal+1}}<span v-if="row.data.secret">{{t("· 隐藏突变")}}</span></p>
          <ul v-if="row.data.conditions.length" class="bee-route-conditions"><li v-for="(condition,i) in row.data.conditions" :key="i"><GameText :text="condition" /></li></ul>
          <details><summary>{{t("突变结果基因 UID")}}</summary><ol><li v-for="(allele,i) in row.data.template" :key="i">{{i}}：{{allele??t("原生空染色体")}}</li></ol></details>
        </article>
        <p v-if="!page.rows.length">{{t("没有符合筛选条件的可见路线。")}}</p>
        <Pager :total="page.total" :offset="page.offset" :limit="page.limit" :busy="loading" :label="t('蜜蜂路线')" @change="update({offset:$event})" />
      </section>
    </template>
  </main>
</template>
<style scoped>
.bee-tree-page{margin:1rem;max-width:1100px;width:auto;min-height:0;padding:1.2rem}.bee-tree-page p{line-height:1.65;overflow-wrap:anywhere}.bee-tree-page>p{margin-top:.65rem}.bee-tree-search,.bee-tree-filter{display:flex;flex-wrap:wrap;align-items:center;gap:.5rem;margin:1rem 0}.bee-tree-search input{min-width:180px;flex:1}
.bee-tree-route,.bee-lineage{padding:1rem;margin-top:1rem;border:1px solid var(--border,#334155);border-radius:.7rem;background:var(--surface,#101b2b)}.bee-cross{display:flex;align-items:center;gap:.7rem;flex-wrap:wrap}.bee-cross>div{display:flex;flex-direction:column;gap:.4rem}.bee-species-select{overflow-wrap:anywhere;text-align:left}.bee-lineage-scroll{overflow:auto}.bee-lineage-scroll>ul{padding:0}.bee-route-conditions{white-space:pre-wrap}.bee-tree-page details{overflow-wrap:anywhere}
</style>
