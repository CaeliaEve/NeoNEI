<script setup lang="ts">
import {t} from '../i18n/index.ts';
import {computed,ref,watch} from 'vue';
import {useRoute,useRouter} from 'vue-router';
import {Records} from '../catalog/client.ts';
import type {MobIndex,MobDropsPage,MobSearch} from '../catalog/mob-drops.ts';
import {useCatalog} from '../state/catalog.ts';
import {useRequest} from '../state/request.ts';
import {usePreferences} from '../state/preferences.ts';
import {itemLocation} from '../router/workspace.ts';
import GameText from '../components/GameText.vue';
import ItemLink from '../components/ItemLink.vue';
import Pager from '../components/Pager.vue';

const route=useRoute(),router=useRouter();
const param=(key:string)=>typeof route.query[key]==='string'?route.query[key] as string:'';
const entity=computed(()=>typeof route.params.entity==='string'?route.params.entity:'');
const {catalog,opening,error:openError,open}=useCatalog(computed(()=>param('catalog')));
const {preferences}=usePreferences();
const {value:index,error:indexError,loading:indexLoading,run:indexRun,clear:indexClear}=useRequest<MobIndex>();
const {value:details,error:detailsError,loading:detailsLoading,run:detailsRun,clear:detailsClear}=useRequest<MobDropsPage>();
const options=computed<MobSearch>(()=>({query:param('query'),item:param('item'),offset:Number(param('offset')||0),limit:20}));
const search=ref(param('query'));
const records=computed(()=>details.value?new Records(details.value.related):index.value?new Records(index.value.related):null);
const mobRecords=computed(()=>new Map(index.value?.mobs.map(row=>[row.id,row.data])??[]));
const info=computed(()=>details.value?.mob?.data??null);
const infernal=['未启用强化生物','不能成为强化生物','可以成为强化生物','固定强化生物'];
function load() {
  const session=catalog.value;if(!session) return;
  if(entity.value) void detailsRun(signal=>session.mobDrops(entity.value,options.value.offset,signal));
  else void indexRun(signal=>session.mobs(options.value,signal));
}
watch([catalog,entity,options],()=>{indexClear();detailsClear();load();},{immediate:true});
watch(()=>param('query'),value=>{search.value=value;});
function find() {void router.push({name:'mobs',query:{...route.query,query:search.value||undefined,offset:undefined}});}
function move(offset:number) {void router.push({query:{...route.query,offset:String(offset)}});}
function select(id:string,direction:'recipes'|'uses') {void router.push(itemLocation(id,route.query,direction==='uses'?'usedIn':'producedBy'));}
function mobLocation(id:string) {return {name:'mob-drops',params:{entity:id},query:{...route.query,offset:undefined}};}
</script>

<template>
  <section v-if="opening" class="state-panel" role="status">{{t("正在读取生物资料…")}}</section>
  <section v-else-if="openError" class="state-panel error" role="alert">{{openError}} <button @click="open()">{{t("重试")}}</button></section>
  <main v-else-if="catalog" class="panel mob-page">
    <header><h1>{{t("生物与掉落")}}</h1><p>{{t("原生 Mobs Info 记录。掉落受击杀条件与修正规则影响。")}}</p></header>
    <template v-if="!entity">
      <form class="mob-search" @submit.prevent="find"><label>{{t("查找生物")}} <input v-model="search" type="search" maxlength="256" /></label><button type="submit">{{t("搜索")}}</button></form>
      <p v-if="options.item">{{t("已按物品筛选。")}}<RouterLink :to="{query:{...route.query,item:undefined,offset:undefined}}">{{t("清除筛选")}}</RouterLink></p>
      <p v-if="indexLoading" role="status">{{t("正在读取生物列表…")}}</p>
      <p v-else-if="indexError" class="inline-error" role="alert">{{indexError}} <button @click="load">{{t("重试")}}</button></p>
      <template v-else-if="index">
        <p v-if="!index.definitions.length" class="state-panel">{{t("当前数据集未包含生物掉落资料。")}}</p>
        <p v-else-if="!index.total" class="state-panel">{{t("没有符合筛选条件的生物。")}}</p>
        <article v-for="row in index.rows" :key="row.id" class="mob-card">
          <h2><RouterLink v-if="row.visible" :to="mobLocation(row.entity)"><GameText :text="row.name" /></RouterLink><GameText v-else :text="row.name" /></h2>
          <p>{{row.mod}} · {{row.visible?t("{0} 项原生掉落记录", row.drops):t("尚未解锁：需要玩家击杀发现")}}</p>
          <div v-if="row.visible && records" class="mob-representations"><ItemLink v-for="(id,i) in mobRecords.get(row.id)?.representations??[]" :key="i" :target="{kind:'item',id}" :records="records" :catalog="catalog" :animate="preferences.animate" @select="select" /></div>
        </article>
        <Pager :total="index.total" :offset="index.offset" :limit="index.limit" :busy="indexLoading" :label="t('生物')" @change="move" />
      </template>
    </template>
    <template v-else>
      <RouterLink :to="{name:'mobs',query:{...route.query,offset:undefined}}">{{t("返回生物列表")}}</RouterLink>
      <p v-if="detailsLoading" role="status">{{t("正在读取掉落规则…")}}</p>
      <p v-else-if="detailsError" class="inline-error" role="alert">{{detailsError}} <button @click="load">{{t("重试")}}</button></p>
      <template v-else-if="details && records">
        <p v-if="!details.visible" class="state-panel">{{t("该生物尚未解锁，需要玩家击杀发现；当前不展示隐藏的掉落和条件。")}}</p>
        <section v-else-if="info" class="mob-info">
          <h2><GameText :text="info.name" /></h2>
          <p>{{t("{0} · 最大生命 {1} · {2}", info.mod, info.maxHealth, t(infernal[info.infernalType+1]!))}}</p>
          <p>{{t("原生统计为平均掉落参考，不保证每次击杀获得；动态条件以对应说明为准。")}}</p>
          <p>{{info.peaceful?t("允许和平环境"):t("非和平生物")}} · {{info.vial?t("可用灵魂瓶捕获"):t("不能用灵魂瓶捕获")}}</p>
          <p v-for="(line,i) in info.additionalInfo" :key="i"><GameText :text="line" /></p>
          <details><summary>{{t("原生生成地点")}}</summary><p v-if="!info.spawnKnown">{{t("原生记录没有提供生成地点。")}}</p><p v-else-if="!info.spawns.length">{{t("原生生成地点列表为空。")}}</p><p v-for="(spawn,i) in info.spawns" :key="i"><GameText :text="spawn.description" /></p></details>
          <p v-if="!details.total">{{t("该生物的原生掉落列表为空。")}}</p>
          <article v-for="row in details.rows" :key="row.id" class="drop-card">
            <ItemLink :target="{kind:'item',id:row.data.item}" :records="records" :catalog="catalog" :animate="preferences.animate" @select="select" />
            <p>{{t("数量 {0} · {1}", row.data.amount, row.data.dropType)}}</p>
            <p v-if="row.data.variableChance">{{t("概率由以下原生条件修正规则决定。基准记录 {0} / {1}。", row.data.baseChance, row.data.chanceScale)}}</p>
            <p v-else-if="row.data.baseChance===0">{{t("原生显示低于 0.01%；记录值为 0 / 10000。")}}</p>
            <p v-else-if="row.data.baseChance>10000">{{t("原始基准值 {0} / 10000；不能视为固定概率。", row.data.baseChance)}}</p>
            <p v-else>{{t("原生基准概率 {0}%", row.data.baseChance/100)}}</p>
            <p v-if="row.data.lootable">{{t("受抢夺影响")}}</p><p v-if="row.data.playerOnly">{{t("仅玩家击杀")}}</p>
            <p v-if="row.data.enchantmentPower!==null">{{t("随机附魔，原生附魔强度 {0}", row.data.enchantmentPower)}}</p>
            <details v-if="row.data.damages"><summary>{{t("随机损伤")}}</summary><p>{{t("保留原生权重；该生物的共享总权重为 {0}。", info.damageWeightTotal)}}</p><p v-for="damage in row.data.damages" :key="damage.meta">{{t("元数据 {0}：权重 {1}", damage.meta, damage.weight)}}</p></details>
            <section v-for="(modifier,i) in row.data.modifiers" :key="i" class="drop-condition"><p v-for="(line,j) in modifier.description" :key="j"><GameText :text="line" /></p><p v-if="!modifier.description.length">{{t("原生修正器没有提供文字说明。")}}</p></section>
            <p v-for="(line,i) in row.data.additionalInfo" :key="i"><GameText :text="line" /></p>
          </article>
          <Pager :total="details.total" :offset="details.offset" :limit="details.limit" :busy="detailsLoading" :label="t('掉落')" @change="move" />
        </section>
      </template>
    </template>
  </main>
</template>

<style scoped>
.mob-page{margin:1rem;max-width:1100px;padding:1.2rem;color:var(--text,#e2e8f0)}
.mob-search,.mob-search label{display:flex;align-items:center;gap:.6rem;flex-wrap:wrap}
.mob-card,.drop-card{margin-top:1rem;padding:1rem;border:1px solid var(--border,#334155);border-radius:.7rem;background:var(--surface,#101b2b)}
.mob-card h2,.mob-info h2{font-size:1.15rem;margin:.5rem 0}.mob-card a{color:var(--accent,#8acbff)}
.mob-page p{overflow-wrap:anywhere;line-height:1.6}.drop-condition{border-left:2px solid var(--accent,#8acbff);padding-left:.7rem}
</style>
