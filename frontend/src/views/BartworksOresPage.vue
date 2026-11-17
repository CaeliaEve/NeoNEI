<script setup lang="ts">
import {t} from '../i18n/index.ts';
import {computed,ref,watch} from 'vue';
import {useRoute,useRouter} from 'vue-router';
import type {BartworksPage,BartworksSearch} from '../catalog/bartworks-ores.ts';
import type {BartworksLayer,BartworksMaterial} from '@neonei/catalog/source';
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
const search=computed<BartworksSearch>(()=>({mode:field('mode')==='materials'?'materials':'layers',query:field('query'),dimension:field('dimension'),item:field('item'),offset:/^(0|[1-9][0-9]*)$/.test(field('offset'))?Number(field('offset')):0,limit:12}));
const query=ref(search.value.query);
const {value:page,error,loading,run,clear}=useRequest<BartworksPage>();
const records=computed(()=>page.value?new Records(page.value.related):null);
const roles:Record<string,string>={primary:'主矿层',secondary:'副矿层',between:'中间矿层',sporadic:'散布矿层'};
const layerCompanions=computed(()=>page.value?.companions.filter((row):row is BartworksLayer=>row.data.kind==='bartworksOreLayer')??[]);
const materialCompanions=computed(()=>page.value?.companions.filter((row):row is BartworksMaterial=>row.data.kind==='bartworksOreMaterial')??[]);
function relatedLayers(meta:number){return layerCompanions.value.filter(layer=>page.value!.lookups.some(lookup=>lookup.data.meta===meta&&lookup.data.layers.includes(layer.data.key)));}
function load(){if(catalog.value)void run(signal=>catalog.value!.bartworksOres(search.value,signal));}
watch([catalog,search],()=>{clear();query.value=search.value.query;load();},{immediate:true});
function update(patch:Record<string,string|number|undefined>){void router.push({name:'bartworks-ores',query:{...route.query,offset:undefined,...patch}});}
function select(id:string,direction:'recipes'|'uses'){void router.push(itemLocation(id,route.query,direction==='uses'?'usedIn':'producedBy'));}
</script>
<template>
  <section v-if="opening" class="state-panel" role="status">{{t("正在读取 Bartworks 矿物资料…")}}</section>
  <section v-else-if="openError" class="state-panel error" role="alert">{{openError}} <button @click="open()">{{t("重试")}}</button></section>
  <main v-else-if="catalog" class="catalog-page panel bw-page">
    <h1>{{t("Bartworks 矿物资料")}}</h1>
    <p class="bw-policy">{{t("矿层、维度与矿石形式是原生生成资料，不是投入材料或必得产物。权重、密度和尺寸保留原生参数，不换算成世界生成概率。")}}</p>
    <form class="bw-search" @submit.prevent="update({query:query||undefined})">
      <input v-model="query" type="search" :aria-label="t('查找 Bartworks 矿物')" :placeholder="t('矿层、材料或维度')" /><button>{{t("搜索")}}</button>
      <label>{{t("资料类型")}} <select :value="search.mode" @change="update({mode:($event.target as HTMLSelectElement).value,query:undefined})"><option value="layers">{{t("矿层")}}</option><option value="materials">{{t("矿石形式")}}</option></select></label>
      <label>{{t("维度")}} <select :value="search.dimension" @change="update({dimension:($event.target as HTMLSelectElement).value||undefined})"><option value="">{{t("全部维度")}}</option><option v-for="dimension in page?.dimensions" :key="dimension" :value="dimension">{{dimension}}</option></select></label>
      <button type="button" @click="update({mode:undefined,dimension:undefined,query:undefined,item:undefined})">{{t("清空筛选")}}</button>
    </form>
    <p v-if="loading" role="status">{{t("正在读取原生规则…")}}</p>
    <p v-else-if="error" role="alert">{{error}} <button @click="load">{{t("重试")}}</button></p>
    <p v-else-if="page && !page.definitions.length">{{t("当前数据集未包含 Bartworks 矿物资料。")}}</p>
    <template v-else-if="page && records">
      <p>{{t("已启用矿层的原生全局权重和：{0}。此值不是当前维度的生成概率分母。", page.definitions[0].data.enabledWeight)}}</p>
      <article v-for="row in page.rows" :key="row.id" class="bw-entry" :data-kind="row.data.kind">
        <template v-if="row.data.kind==='bartworksOreLayer'">
          <h2>{{row.data.key}}</h2>
          <dl><dt>{{t("生成状态")}}</dt><dd>{{row.data.enabled?t("已启用"):t("已禁用（原生查询表仍保留）")}}</dd><dt>{{t("维度")}}</dt><dd>{{row.data.dimension.name}} · ID {{row.data.dimension.id}}</dd>
            <dt>{{t("高度范围")}}</dt><dd>{{row.data.minY}} ～ {{row.data.maxY}}</dd><dt>{{t("权重 / 密度 / 尺寸")}}</dt><dd>{{row.data.weight}} / {{row.data.density}} / {{row.data.size}}</dd></dl>
          <div class="bw-roles"><section v-for="role in row.data.roles" :key="role.role" class="bw-role"><h3>{{t(roles[role.role]!)}}</h3>
            <p>{{t("{0} · 元数据 {1}", role.bartworks?'Bartworks':'GregTech', role.meta)}}</p><ItemLink :target="{kind:'item',id:role.item}" :records="records" :catalog="catalog" :animate="preferences.animate" @select="select" />
          </section></div>
          <details class="bw-generator"><summary>{{t("原生环境与替换规则")}}</summary>
            <p>{{t("维度键：{0}；提供者：{1}。", row.data.dimension.key, row.data.dimension.provider)}}</p>
            <p>{{t("替换方块：{0}。允许元数据（原生顺序）：{1}。", row.data.replacement.registry??t("原生回调未提供可用方块"), row.data.replacement.metas.join('、'))}}</p>
            <p>{{t("保留已初始化生成器的实际数值与所有四个角色；这里不模拟世界、地形、原生随机选取或矿石掉落，也不承诺固定产量。")}}</p>
          </details>
        </template>
        <template v-else-if="row.data.kind==='bartworksOreMaterial'">
          <h2>{{row.data.name}}</h2><p>{{row.data.key}}</p>
          <p>{{t("原生生成特性：普通矿石 {0}；小矿石 {1}。", row.data.oreFeature?t("启用"):t("禁用"), row.data.smallOreFeature?t("启用"):t("禁用"))}}</p>
          <div class="bw-samples"><section v-for="sample in row.data.samples" :key="sample.variant"><h3>{{sample.variant==='ore'?t("普通矿石"):t("小矿石")}}</h3>
            <ItemLink v-if="sample.item" :target="{kind:'item',id:sample.item,amount:String(sample.amount)}" :records="records" :catalog="catalog" :animate="preferences.animate" @select="select" /><p v-else>{{t("原生样本为空，未补造图标。")}}</p>
            <p>{{t("原生完整列表{0}此形式。", sample.nativeOverlayEligible?t("会枚举"):t("不会枚举"))}}</p>
          </section></div>
          <p class="bw-variant-policy">{{t("安装版原生页面对两种形式都使用“普通矿石生成特性”筛选，并按矿层去重。这里保留两种样本与真实特性，不沿用会隐藏差异的界面去重。")}}</p>
          <details><summary>{{t("按原生元数据查询的关联矿层")}}</summary>
            <ol class="bw-native-members"><template v-for="lookup in page.lookups" :key="lookup.id"><template v-if="lookup.data.meta===row.data.meta"><li v-for="(key,index) in lookup.data.layers" :key="index"><button @click="update({mode:'layers',query:key,dimension:undefined})">{{key}}</button></li></template></template></ol>
            <p>{{t("原生查询只使用 short 元数据，不区分 GT/Bartworks 所有者；重复成员与注册顺序原样保留，不能理解为多次必得。")}}</p>
            <p v-for="layer in relatedLayers(row.data.meta)" :key="layer.id">{{layer.data.key}} · {{layer.data.enabled?t("启用"):t("禁用")}} · {{layer.data.dimension.name}} · {{layer.data.minY}} ～ {{layer.data.maxY}}</p>
          </details>
        </template>
      </article>
      <details v-if="search.mode==='layers' && materialCompanions.length" class="bw-materials"><summary>{{t("当前矿层对应的原生材料与两种形式")}}</summary>
        <p v-for="material in materialCompanions" :key="material.id"><button @click="update({mode:'materials',query:material.data.key,dimension:undefined})">{{material.data.name}}</button> {{t("· 普通矿石特性")}} {{material.data.oreFeature}} {{t("/ 小矿石特性")}} {{material.data.smallOreFeature}}</p>
      </details>
      <p v-if="!page.rows.length">{{t("没有符合筛选条件的 Bartworks 资料。")}}</p>
      <Pager :total="page.total" :offset="page.offset" :limit="page.limit" :busy="loading" :label="t('Bartworks 资料')" @change="update({offset:$event})" />
    </template>
  </main>
</template>
<style scoped>
.bw-page{margin:1rem;max-width:1100px;width:auto;min-height:0;padding:1.2rem}.bw-page p{line-height:1.65;overflow-wrap:anywhere}.bw-search{display:flex;flex-wrap:wrap;gap:.5rem;align-items:center;margin:1rem 0}.bw-search input{min-width:180px;flex:1}.bw-entry{padding:1rem;margin-top:1rem;border:1px solid var(--border,#334155);border-radius:.7rem;background:var(--surface,#101b2b)}.bw-entry h2{font-size:1.15rem;overflow-wrap:anywhere}.bw-entry dl{display:grid;grid-template-columns:minmax(9em,auto) 1fr;gap:.5rem 1rem}.bw-entry dd{margin:0;overflow-wrap:anywhere}.bw-roles,.bw-samples{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:.8rem}.bw-role,.bw-samples>section{padding:.7rem;border:1px solid var(--border,#334155);border-radius:.4rem}.bw-role h3,.bw-samples h3{font-size:1rem;margin-top:0}.bw-generator,.bw-materials{margin-top:1rem}.bw-native-members button{overflow-wrap:anywhere;text-align:left}
</style>
