<script setup lang="ts">
import {t} from '../i18n/index.ts';
import {computed,ref,watch} from 'vue';
import {useRoute,useRouter} from 'vue-router';
import type {GtMineralPage,GtMineralSearch} from '../catalog/gt-minerals.ts';
import type {GtMineralEntry} from '@neonei/catalog/source';
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
const search=computed<GtMineralSearch>(()=>({family:field('family'),dimension:field('dimension'),query:field('query'),item:field('item'),offset:/^(0|[1-9][0-9]*)$/.test(field('offset'))?Number(field('offset')):0,limit:12}));
const query=ref(search.value.query),expanded=ref<Record<string,boolean>>({});
const {value:page,error,loading,run,clear}=useRequest<GtMineralPage>();
const records=computed(()=>page.value?new Records(page.value.related):null);
const definitions=computed(()=>new Map(page.value?.definitions.map(row=>[row.domain,row.data])??[]));
const roles:Record<string,string>={small:'小矿石',primary:'主矿层',secondary:'副矿层',between:'中间矿层',sporadic:'散布矿层'};
const hosts=['石头','地狱岩','末地石','黑色花岗岩','红色花岗岩','大理石','玄武岩'];
function load(){if(catalog.value)void run(signal=>catalog.value!.gtMinerals(search.value,signal));}
watch([catalog,search],()=>{clear();expanded.value={};query.value=search.value.query;load();},{immediate:true});
function update(patch:Record<string,string|number|undefined>){void router.push({name:'gt-minerals',query:{...route.query,offset:undefined,...patch}});}
function select(id:string,direction:'recipes'|'uses'){void router.push(itemLocation(id,route.query,direction==='uses'?'usedIn':'producedBy'));}
function shares(row:GtMineralEntry){return page.value?.shares.filter(share=>share.domain===row.domain&&share.data.key===row.data.key)??[];}
function toggle(key:string,event:Event){expanded.value={...expanded.value,[key]:(event.target as HTMLDetailsElement).open};}
</script>
<template>
  <section v-if="opening" class="state-panel" role="status">{{t("正在读取矿物资料…")}}</section>
  <section v-else-if="openError" class="state-panel error" role="alert">{{openError}} <button @click="open()">{{t("重试")}}</button></section>
  <main v-else-if="catalog" class="catalog-page panel minerals-page">
    <h1>{{t("矿脉与小矿石")}}</h1>
    <p class="mineral-policy">{{t("保留原生生成定义与 NEI 资料列表。维度、矿层和宿主是生成环境与矿石形式，不是投入材料；列表中的相对份额不是实际世界生成概率。")}}</p>
    <form class="mineral-search" @submit.prevent="update({query:query||undefined})">
      <input v-model="query" type="search" :aria-label="t('查找矿物资料')" :placeholder="t('矿物、原生注册名或维度')" /><button>{{t("搜索")}}</button>
      <label>{{t("类型")}} <select :value="search.family" @change="update({family:($event.target as HTMLSelectElement).value||undefined})"><option value="">{{t("全部类型")}}</option><option value="smallOre">{{t("小矿石")}}</option><option value="vein">{{t("矿脉")}}</option></select></label>
      <label>{{t("维度")}} <select :value="search.dimension" @change="update({dimension:($event.target as HTMLSelectElement).value||undefined})"><option value="">{{t("全部维度")}}</option><option v-for="dimension in page?.dimensions" :key="dimension" :value="dimension">{{dimension}}</option></select></label>
      <button type="button" @click="update({family:undefined,dimension:undefined,query:undefined,item:undefined})">{{t("清空筛选")}}</button>
    </form>
    <p v-if="loading" role="status">{{t("正在读取原生定义…")}}</p>
    <p v-else-if="error" role="alert" class="inline-error">{{error}} <button @click="load">{{t("重试")}}</button></p>
    <p v-else-if="page && !page.definitions.length">{{t("当前数据集未包含矿脉或小矿石资料。")}}</p>
    <template v-else-if="page && records">
      <article v-for="row in page.rows" :key="row.id" class="mineral-entry">
        <h2>{{row.data.displayName??row.data.roles[0].material.name}}</h2><p class="native-key">{{row.data.key}}</p>
        <dl><dt>{{t("定义高度")}}</dt><dd>{{row.data.displayHeight}}</dd><dt>{{t("实际生成高度")}}</dt><dd>{{row.data.generator?`${row.data.generator.minY} ～ ${row.data.generator.maxY}`:t("未注册生成器（禁用定义）")}}</dd>
          <template v-if="definitions.get(row.domain)?.family==='smallOre'"><dt>{{t("列表数量参数")}}</dt><dd>{{row.data.configured.amount}}</dd><dt>{{t("实际生成数量参数")}}</dt><dd>{{row.data.generator?.amount??t("未注册")}}</dd></template>
          <template v-else><dt>{{t("列表权重")}}</dt><dd>{{row.data.nativeWeight}}</dd><dt>{{t("密度 / 尺寸参数")}}</dt><dd>{{row.data.configured.density}} / {{row.data.configured.size}}</dd></template>
          <dt>{{t("原始维度设置")}}</dt><dd><span v-for="dimension in row.data.dimensions" :key="dimension.name" class="dimension">{{dimension.name}} · {{dimension.enabled?t("启用"):t("禁用")}}</span></dd></dl>
        <div class="mineral-roles"><section v-for="role in row.data.roles" :key="role.role" class="mineral-role">
          <h3>{{t(roles[role.role]!)}} · {{role.material.name}}</h3>
          <ItemLink :target="{kind:'item',id:role.hosts[0].item}" :records="records" :catalog="catalog" :animate="preferences.animate" @select="select" />
          <details @toggle="toggle(row.id+role.role,$event)"><summary>{{t("7 种原生宿主样本")}}</summary>
            <div v-if="expanded[row.id+role.role]" class="host-list"><div v-for="host in role.hosts" :key="host.host"><span>{{t(hosts[host.host]!)}}</span><ItemLink :target="{kind:'item',id:host.item}" :records="records" :catalog="catalog" :animate="preferences.animate" @select="select" /></div></div>
          </details>
        </section></div>
        <section v-if="definitions.get(row.domain)?.family==='smallOre'" class="mineral-drops"><h3>{{t("原生掉落候选")}}</h3>
          <p>{{t("这是 NEI 实际掉落候选列表，数量为样本堆叠量；原生列表没有提供每项概率，不能据此认定必得或平均分配概率。")}}</p>
          <div class="drop-list"><ItemLink v-for="(drop,index) in row.data.drops" :key="index" :target="{kind:'item',id:drop.item,amount:String(drop.amount)}" :records="records" :catalog="catalog" :animate="preferences.animate" @select="select" /></div>
          <p v-if="!row.data.drops.length">{{t("原生候选列表为空。")}}</p>
        </section>
        <section class="mineral-shares"><h3>{{t("维度列表相对份额")}}</h3><p>{{t("小矿石按列表数量归一化，矿脉按列表权重归一化。这里同时保留分子、分母与原生显示结果。")}}</p>
          <ul><li v-for="share in shares(row)" :key="share.id">{{share.data.dimension}} · {{share.data.numerator}} / {{share.data.denominator}} · <span v-if="share.data.nativeShare!==null">{{(Number(share.data.nativeShare)*100).toFixed(3)}}%</span><span v-else>{{t("原生 {0}（非有限结果，不能当作概率）", share.data.nonFinite)}}</span></li></ul>
          <p v-if="!shares(row).length">{{t("原生维度列表没有显示此定义。")}}</p>
        </section>
        <details class="mineral-generator"><summary>{{t("实际生成规则与解释范围")}}</summary>
          <template v-if="row.data.generator"><p>{{t("生物群系约束：{0}。原生提供者：{1}；排除提供者：{2}。", row.data.generator.biome, row.data.generator.providers.join('、')||t("空列表"), row.data.generator.blacklistedProviders.join('、')||t("空列表"))}}</p>
            <p>{{t("维度开关：主世界")}} {{row.data.generator.flags.overworld}}{{t("、地狱")}} {{row.data.generator.flags.nether}}{{t("、末地")}} {{row.data.generator.flags.end}}{{t("、暮色森林")}} {{row.data.generator.flags.twilightForest}}<span v-if="row.data.generator.flags.endAsteroid!==null">{{t("、末地小行星 {0}", row.data.generator.flags.endAsteroid)}}</span>。</p></template>
          <p>{{t("定义参数与已初始化生成器分别保留。实际生成还受世界、地形、宿主、生物群系与原生重试条件影响；此页面不模拟地图，也不承诺每个区块固定产量。")}}</p>
        </details>
        <details v-if="definitions.get(row.domain)?.family==='smallOre'" class="mineral-helper" @toggle="toggle(row.id+'helper',$event)"><summary>{{t("原生辅助粉尘与掉落索引")}}</summary>
          <template v-if="expanded[row.id+'helper']"><p>{{t("原生生物群系显示支持：{0}。辅助粉尘列表按原顺序保留：{1}。", definitions.get(row.domain)?.restrictBiomeSupport?t("启用"):t("禁用"), definitions.get(row.domain)?.dustMaterials.map(material=>material.name).join('、'))}}</p>
            <p>{{t("以下是 NEI 按未本地化名称建立的反向索引，供查找对应矿石元数据；它不提供掉落概率。")}}</p>
            <ul><li v-for="lookup in definitions.get(row.domain)?.dropLookup.filter(lookup=>lookup.meta===row.data.roles[0].meta)" :key="lookup.name">{{lookup.name}} → {{lookup.meta}}</li></ul>
          </template>
        </details>
      </article>
      <p v-if="!page.rows.length">{{t("没有符合筛选条件的矿物定义。")}}</p>
      <Pager :total="page.total" :offset="page.offset" :limit="page.limit" :busy="loading" :label="t('矿物资料')" @change="update({offset:$event})" />
    </template>
  </main>
</template>
<style scoped>
.minerals-page{margin:1rem;max-width:1100px;width:auto;min-height:0;padding:1.2rem}.minerals-page p{line-height:1.65;overflow-wrap:anywhere}.mineral-search{display:flex;flex-wrap:wrap;gap:.5rem;align-items:center;margin:1rem 0}.mineral-search input{min-width:180px;flex:1}.mineral-entry{padding:1rem;margin-top:1rem;border:1px solid var(--border,#334155);border-radius:.7rem;background:var(--surface,#101b2b)}.native-key{font-family:monospace}.mineral-entry dl{display:grid;grid-template-columns:minmax(9em,auto) 1fr;gap:.5rem 1rem}.mineral-entry dd{margin:0;overflow-wrap:anywhere}.dimension{display:inline-block;margin-right:.8rem}.mineral-roles{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:1rem}.mineral-role{border:1px solid var(--border,#334155);padding:.8rem;border-radius:.4rem}.mineral-role h3{font-size:1rem;margin-top:0}.host-list{display:grid;gap:.5rem;margin-top:.75rem}.host-list>div{display:flex;align-items:center;gap:.5rem}.drop-list{display:flex;flex-wrap:wrap;gap:.6rem}.mineral-generator{margin-top:1rem}.mineral-entry h2{font-size:1.2rem}
</style>
