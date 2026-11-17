<script setup lang="ts">
import {computed,ref,watch,nextTick} from 'vue';
import {useRoute,useRouter} from 'vue-router';
import {usageBackends} from '@neonei/catalog/source';
import type {UsagePage,UsageSearch} from '../catalog/usage-queries.ts';
import {Records} from '../catalog/client.ts';
import {useCatalog} from '../state/catalog.ts';
import {useRequest} from '../state/request.ts';
import {usePreferences} from '../state/preferences.ts';
import {itemLocation} from '../router/workspace.ts';
import {t} from '../i18n/index.ts';
import ItemLink from '../components/ItemLink.vue';
import Pager from '../components/Pager.vue';
import UsageManual from '../components/UsageManual.vue';
const route=useRoute(),router=useRouter();
const {catalog,opening,error:openError,open}=useCatalog(computed(()=>typeof route.query.catalog==='string'?route.query.catalog:''));
const {preferences}=usePreferences();
function field(key:string){return typeof route.query[key]==='string'?route.query[key] as string:'';}
function offset(key:string){return /^(0|[1-9][0-9]*)$/.test(field(key))?Number(field(key)):0;}
const labels={aeItemCell:'AE2 物品元件',aeFluidCell:'AE2 流体元件',ocManual:'OpenComputers 手册',ocCallbacks:'OpenComputers API'} as const;
const search=computed<UsageSearch>(()=>({backend:usageBackends.includes(field('backend') as UsageSearch['backend'])?field('backend') as UsageSearch['backend']:'aeItemCell',query:field('query'),item:field('item'),observation:field('observation'),document:field('document'),offset:offset('offset'),limit:4,entryOffset:offset('entryOffset'),entryLimit:8,documentOffset:offset('documentOffset'),documentLimit:1}));
const query=ref(search.value.query),{value:page,error,loading,run,clear}=useRequest<UsagePage>();
const records=computed(()=>page.value?new Records(page.value.related):null);
function load(){const session=catalog.value;if(session)void run(signal=>session.usageQueries(search.value,signal));}
watch([catalog,search],()=>{clear();query.value=search.value.query;load();},{immediate:true});
function update(patch:Record<string,string|number|undefined>){void router.push({name:'usage-queries',query:{...route.query,offset:undefined,entryOffset:undefined,documentOffset:undefined,...patch}});}
function select(id:string,direction:'recipes'|'uses'){void router.push(itemLocation(id,route.query,direction==='uses'?'usedIn':'producedBy'));}
function documentFor(row:UsagePage['rows'][number]){const r=row.data.result;return r.kind==='manual'?r.document:r.kind==='callbacks'?r.documents[0]:undefined;}
async function navigate(path:string,anchor:string){const target=page.value?.directory.find(row=>row.label===path);if(target){await router.push({name:'usage-queries',query:{...route.query,document:target.key,item:undefined,observation:undefined,query:undefined,documentOffset:undefined},hash:anchor?'#'+encodeURIComponent(anchor):''});}}
watch([page,()=>route.hash],async()=>{await nextTick();if(route.hash)document.getElementById(decodeURIComponent(route.hash.slice(1)))?.scrollIntoView();});
</script>
<template>
  <section v-if="opening" class="state-panel" role="status">{{t('正在读取用途资料…')}}</section>
  <section v-else-if="openError" class="state-panel error" role="alert">{{openError}} <button @click="open()">{{t('重试')}}</button></section>
  <main v-else-if="catalog" class="catalog-page panel usage-page">
    <h1>{{t('元件内容与用途文档')}}</h1>
    <p>{{t('查看采集物品的存储内容、手册和 API 文档。存储内容保留原始数量，不表示合成配方。')}}</p>
    <form class="usage-filters" @submit.prevent="update({query:query||undefined,document:undefined})">
      <label for="usage-backend">{{t('资料类型')}}</label><select id="usage-backend" :value="search.backend" @change="update({backend:($event.target as HTMLSelectElement).value,item:undefined,observation:undefined,document:undefined,query:undefined})"><option v-for="backend in usageBackends" :key="backend" :value="backend">{{t(labels[backend])}}</option></select>
      <label for="usage-query">{{t('查找内容')}}</label><input id="usage-query" v-model="query" type="search" maxlength="256" /><button>{{t('搜索')}}</button>
      <button type="button" @click="update({item:undefined,observation:undefined,document:undefined,query:undefined})">{{t('清空筛选')}}</button>
    </form>
    <p v-if="loading" role="status">{{t('正在读取条目…')}}</p>
    <p v-else-if="error" class="inline-error" role="alert">{{error}} <button @click="load()">{{t('重试')}}</button></p>
    <p v-else-if="!page?.definitions.length">{{t('当前数据集未采集此类用途资料。')}}</p>
    <template v-else-if="page && records">
      <p class="usage-scope">{{t('当前内容来自导出时的物品快照。要查看游戏中的新内容，需要重新采集。')}}</p>
      <article v-for="(row,index) in page.rows" :key="row.id" class="usage-observation" :data-observation="row.id">
        <ItemLink :target="{kind:'item',id:row.data.input.item,amount:row.data.input.amount}" :records="records" :catalog="catalog" :animate="preferences.animate" @select="select" />
        <template v-if="row.data.result.kind==='cell'">
          <p class="cell-capacity">{{t('存储字节：{0} / {1}；类型：{2} / {3}',row.data.result.usedBytes,row.data.result.totalBytes,row.data.result.usedTypes,row.data.result.totalTypes)}}</p>
          <p v-if="!row.data.result.entries.length">{{t('空存储元件')}}</p>
          <div class="cell-contents"><ItemLink v-for="entry in page.entries[index].entries" :key="entry.id" :target="{kind:entry.kind,id:entry.id,amount:entry.amount}" :records="records" :catalog="catalog" :animate="preferences.animate" @select="select" /></div>
          <Pager v-if="page.entries[index].total>search.entryLimit" :total="page.entries[index].total" :offset="search.entryOffset" :limit="search.entryLimit" :busy="loading" :label="t('存储内容')" @change="update({observation:row.id,entryOffset:$event})" />
        </template>
        <p v-else-if="row.data.result.kind==='cellFault'">{{t('这个元件无法提供内容列表。')}}</p>
        <button v-else @click="update({document:documentFor(row),observation:row.id,query:undefined})">{{t('打开文档')}}</button>
        <RouterLink :to="{name:'usage-queries',query:{...route.query,observation:row.id,offset:undefined,entryOffset:undefined}}">{{t('固定链接')}}</RouterLink>
      </article>
      <Pager :total="page.total" :offset="page.offset" :limit="page.limit" :busy="loading" :label="t('用途查询')" @change="update({offset:$event})" />
      <template v-if="page.directory.length">
        <label for="usage-document">{{t('选择文档')}}</label><select id="usage-document" :value="search.document" @change="update({document:($event.target as HTMLSelectElement).value||undefined,item:undefined,observation:undefined,query:undefined})"><option value="">{{t('全部')}}</option><option v-for="doc in page.directory" :key="doc.key" :value="doc.key">{{doc.label}}</option></select>
        <article v-for="doc in page.documents" :key="doc.id" class="usage-document" :data-document="doc.data.key">
          <UsageManual v-if="doc.data.content.kind==='manual'" :document="doc" :resources="page.resources" :records="records" :catalog="catalog" :animate="preferences.animate" @navigate="navigate" @select="select" />
          <template v-else>
            <h2>{{doc.data.content.environment}}</h2><p>{{t('这是原生 API 注解文档；操作不会在网页中执行。')}}</p>
            <dl class="callback-docs"><template v-for="method in doc.data.content.methods" :key="method.name"><dt><code>{{method.name}}</code></dt><dd><pre>{{method.doc}}</pre><small>{{t('直接调用：{0}；每轮上限：{1}',method.direct?t('是'):t('否'),method.limit)}}</small></dd></template></dl>
          </template>
        </article>
        <Pager :total="page.documentTotal" :offset="page.documentOffset" :limit="page.documentLimit" :busy="loading" :label="t('文档')" @change="update({documentOffset:$event})" />
      </template>
      <p v-if="!page.total && !page.documentTotal">{{t('没有符合筛选条件的用途资料。')}}</p>
    </template>
  </main>
</template>
<style scoped>
.usage-page{padding:20px;max-width:1100px;min-width:0;overflow-wrap:anywhere}.usage-page p{line-height:1.7}.usage-filters{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:16px 0}.usage-observation,.usage-document{border:1px solid var(--color-border,#334155);border-radius:8px;padding:16px;margin:12px 0}.cell-contents{display:flex;flex-wrap:wrap;gap:16px;margin:12px 0}.usage-observation>a{display:inline-block;margin:8px}.callback-docs dt{font-weight:bold;margin-top:16px}.callback-docs pre{white-space:pre-wrap;overflow-wrap:anywhere;font:inherit}.callback-docs dd{margin:8px 0}.usage-scope{color:var(--color-text-secondary,#a0afc6)}#usage-document{max-width:100%}
</style>
