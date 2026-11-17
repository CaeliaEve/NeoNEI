<script setup lang="ts">
import {t} from '../i18n/index.ts';
import {computed,ref,watch} from 'vue';
import {useRoute,useRouter} from 'vue-router';
import type {UndergroundPage,UndergroundSearch} from '../catalog/underground-fluids.ts';
import type {UndergroundEntry} from '@neonei/catalog/source';
import {Records} from '../catalog/client.ts';
import {useCatalog} from '../state/catalog.ts';
import {useRequest} from '../state/request.ts';
import {usePreferences} from '../state/preferences.ts';
import {itemLocation} from '../router/workspace.ts';
import ItemLink from '../components/ItemLink.vue';
import Pager from '../components/Pager.vue';
const route=useRoute(),router=useRouter();
const {catalog,opening,error:openError,open}=useCatalog(computed(()=>typeof route.query.catalog==='string'?route.query.catalog:''));
const {preferences}=usePreferences();
const field=(key:string)=>typeof route.query[key]==='string'?route.query[key] as string:'';
const search=computed<UndergroundSearch>(()=>({dimension:field('dimension'),query:field('query'),fluid:field('fluid'),
  offset:/^(0|[1-9][0-9]*)$/.test(field('offset'))?Number(field('offset')):0,limit:12}));
const query=ref(search.value.query);
const {value:page,error,loading,run,clear}=useRequest<UndergroundPage>();
const records=computed(()=>page.value?new Records(page.value.related):null);
const dimensions=computed(()=>new Map(page.value?.dimensions.map(row=>[row.data.dimension,row.data])??[]));
function load(){const session=catalog.value;if(session)void run(signal=>session.undergroundFluids(search.value,signal));}
watch([catalog,search],()=>{clear();query.value=search.value.query;load();},{immediate:true});
function update(patch:Record<string,string|number|undefined>){void router.push({name:'underground-fluids',query:{...route.query,offset:undefined,...patch}});}
function select(id:string,direction:'recipes'|'uses'){void router.push(itemLocation(id,route.query,direction==='uses'?'usedIn':'producedBy'));}
function nativeChance(entry:UndergroundEntry['data']){const dimension=dimensions.value.get(entry.dimension);return page.value?.displays.find(row=>row.data.registry===entry.registry&&row.data.dimension===dimension?.displayDimension&&row.data.minAmount===entry.minAmount&&row.data.maxAmount===entry.maxAmount&&row.data.nativeChance===Math.floor(entry.weight*10000/dimension!.totalWeight))?.data.nativeChance;}
</script>
<template>
  <section v-if="opening" class="state-panel" role="status">{{t("正在读取地下流体资料…")}}</section>
  <section v-else-if="openError" class="state-panel error" role="alert">{{openError}} <button @click="open()">{{t("重试")}}</button></section>
  <main v-else-if="catalog" class="catalog-page panel underground-page">
    <h1>{{t("地下流体")}}</h1>
    <p>{{t("展示导出时的世界生成配置。维度是生成环境，流体是可能选中的矿藏类型；这些不是投入材料或固定产出的加工配方。")}}</p>
    <form class="underground-search" @submit.prevent="update({query:query||undefined})">
      <input v-model="query" type="search" :aria-label="t('查找地下流体')" :placeholder="t('流体注册名或维度')" /><button>{{t("搜索")}}</button>
      <label>{{t("维度")}} <select :value="search.dimension" @change="update({dimension:($event.target as HTMLSelectElement).value||undefined})"><option value="">{{t("全部维度")}}</option><option v-for="row in page?.dimensions" :key="row.id" :value="row.data.dimension">{{row.data.displayDimension??row.data.dimension}}（{{row.data.dimension}}）</option></select></label>
      <button type="button" @click="update({dimension:undefined,query:undefined,fluid:undefined})">{{t("清空筛选")}}</button>
    </form>
    <p v-if="loading" role="status">{{t("正在读取原生定义…")}}</p>
    <p v-else-if="error" role="alert" class="inline-error">{{error}} <button @click="load">{{t("重试")}}</button></p>
    <p v-else-if="page && !page.definition">{{t("当前数据集未包含地下流体资料。")}}</p>
    <template v-else-if="page && records">
      <p class="underground-policy">{{t("原生选择从 1,000 个随机输入中，按当前配置迭代顺序与整数边界决定结果。NEI 显示值使用权重取整，二者可能不同；这里分别列出。未注册流体仍保留配置权重，不会偷偷重新分配给其他流体。")}}</p>
      <article v-for="row in page.rows" :key="row.id" class="underground-entry">
        <h2>{{row.data.registry}}</h2>
        <ItemLink v-if="row.data.fluid" :target="{kind:'fluid',id:row.data.fluid}" :records="records" :catalog="catalog" :animate="preferences.animate" @select="select" />
        <p v-else class="unresolved">{{t("流体未注册：仅保留配置，不生成占位贴图或伪造可用矿藏。")}}</p>
        <dl><dt>{{t("维度配置")}}</dt><dd>{{row.data.dimension}}<span v-if="dimensions.get(row.data.dimension)?.displayDimension">（{{dimensions.get(row.data.dimension)?.displayDimension}}）</span><span v-else>{{t("· NEI 未映射维度")}}</span></dd>
          <dt>{{t("原生权重")}}</dt><dd>{{row.data.weight}} / {{dimensions.get(row.data.dimension)?.totalWeight}}</dd>
          <dt>{{t("原生选择结果")}}</dt><dd>{{row.data.selectedTickets}} / 1,000（{{row.data.selectedTickets/10}}%）</dd>
          <dt>{{t("NEI 显示值")}}</dt><dd>{{nativeChance(row.data)===undefined?t("原生列表未显示"):`${nativeChance(row.data)!/100}%`}}</dd>
          <dt>{{t("配置量范围")}}</dt><dd>{{row.data.minAmount}} ～ {{row.data.maxAmount}}</dd><dt>{{t("每次操作减少量")}}</dt><dd>{{row.data.decreasePerOperation}}</dd>
          <dt>{{t("该维度空选择")}}</dt><dd>{{dimensions.get(row.data.dimension)?.nullTickets}} / 1,000</dd></dl>
        <details><summary>{{t("数量规则与解释范围")}}</summary><p>{{t("配置量参与原生五次幂矿藏初始化公式；它不是每次泵送固定得到的 mB 数量。实际产量还受矿藏当前状态和开采设备影响。选择百分比描述原生配置条目被选中，不保证存在可开采流体。")}}</p><code>upper = floor((MaxAmount × 100 × 5000)^(1/5))<br />minimum = (MinAmount × 100 × 5000)^(1/5)<br />veinData = int(max(minimum, nextInt(upper) + nextDouble())^5 / 100)</code></details>
      </article>
      <p v-if="!page.rows.length">{{t("没有符合筛选条件的流体配置。")}}</p>
      <Pager :total="page.total" :offset="page.offset" :limit="page.limit" :busy="loading" :label="t('地下流体')" @change="update({offset:$event})" />
    </template>
  </main>
</template>
<style scoped>
.underground-page{margin:1rem;max-width:1100px;width:auto;min-height:0;padding:1.2rem}.underground-page p{line-height:1.65;overflow-wrap:anywhere}.underground-search{display:flex;flex-wrap:wrap;gap:.5rem;margin:1rem 0;align-items:center}.underground-search input{min-width:180px;flex:1}.underground-entry{padding:1rem;margin-top:1rem;border:1px solid var(--border,#334155);border-radius:.7rem;background:var(--surface,#101b2b)}.underground-entry h2{font-size:1.1rem;overflow-wrap:anywhere}.underground-entry dl{display:grid;grid-template-columns: minmax(8em,auto) 1fr;gap:.5rem 1rem;margin:1rem 0}.underground-entry dd{margin:0;overflow-wrap:anywhere}.underground-entry details{margin-top:.75rem}.underground-entry code{display:block;white-space:normal;overflow-wrap:anywhere}.unresolved{color:var(--warning,#fbbf24)}
</style>
