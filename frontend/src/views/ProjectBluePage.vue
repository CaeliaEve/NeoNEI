<script setup lang="ts">
import {t} from '../i18n/index.ts';
import {computed,watch} from 'vue';
import {useRoute,useRouter} from 'vue-router';
import type {ProjectBluePage,ProjectBlueSearch} from '../catalog/projectblue.ts';
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
const search=computed<ProjectBlueSearch>(()=>({mode:['panel','miniature','paint'].includes(field('mode'))?field('mode') as ProjectBlueSearch['mode']:'all',offset:/^(0|[1-9][0-9]*)$/.test(field('offset'))?Number(field('offset')):0,limit:1}));
const {value:page,error,loading,run,clear}=useRequest<ProjectBluePage>();
const records=computed(()=>page.value?new Records(page.value.related):null);
const example=computed(()=>page.value?.examples[0]);
const rule=computed(()=>example.value?page.value?.rules[example.value.data.rule]:page.value?.rules.find(row=>search.value.mode==='all'||row.data.mode===search.value.mode));
const names={panel:'制作控制面板',miniature:'制作微型控件',paint:'给控件喷漆'};
function load(){const session=catalog.value;if(session)void run(signal=>session.projectBlue(search.value,signal));}
watch([catalog,search],()=>{clear();load();},{immediate:true});
function update(mode:ProjectBlueSearch['mode'],offset=0){void router.push({name:'projectblue',query:{...route.query,mode,offset}});}
function select(id:string,direction:'recipes'|'uses'){void router.push(itemLocation(id,route.query,direction==='uses'?'usedIn':'producedBy'));}
function cellLabel(index:number){return t(rule.value?.data.requiredEmpty.includes(index)?'必须为空':rule.value?.data.ignored.includes(index)?'不参与匹配':'输入材料');}
</script>
<template>
  <section v-if="opening" class="state-panel" role="status">{{t("正在读取 ProjectBlue…")}}</section>
  <section v-else-if="openError" class="state-panel error" role="alert">{{openError}} <button @click="open()">{{t("重试")}}</button></section>
  <main v-else-if="catalog" class="catalog-page panel projectblue-page">
    <h1>{{t("ProjectBlue 控制面板与控件")}}</h1>
    <p v-if="loading" role="status">{{t("正在读取原生动态规则…")}}</p>
    <p v-else-if="error" role="alert">{{error}} <button @click="load">{{t("重试")}}</button></p>
    <p v-else-if="page&&!page.definition">{{t("当前数据集未包含 ProjectBlue 规则。")}}</p>
    <template v-else-if="page?.definition&&records">
      <p v-if="!page.definition.data.nativeRules">{{t("原生规则表已就绪，当前没有登记的规则。")}}</p>
      <template v-else>
        <p>{{t("这些是按材料、颜色和物品状态计算输出的动态规则。下方展示当前物品清单中的具体样本，样本不代表所有可能的材料或状态。")}}</p>
        <nav class="rule-tabs" :aria-label="t('选择控件规则')"><button type="button" :aria-pressed="search.mode==='all'" @click="update('all')">{{t("全部规则")}}</button><button v-for="row in page.rules" :key="row.id" type="button" :aria-pressed="search.mode===row.data.mode" @click="update(row.data.mode)">{{t(names[row.data.mode])}}</button></nav>
        <section v-if="rule" class="rule-card" :aria-label="t('原生网格规则')">
          <h2>{{t(names[rule.data.mode])}}</h2>
          <p v-if="rule.data.mode==='panel'">{{t("锯放在左上，空心盖板放在中心；上中和左中必须为空。材料由盖板的 mat 标签解析；缺少标签时使用原生木材默认值。输出 1 个面板，只保留解析后的材料标签。")}}</p>
          <p v-else-if="rule.data.mode==='miniature'">{{t("锯放在左上，原尺寸控件或盖板放在中心；上中和左中必须为空。拉杆和按钮转成对应微型控件；灯具保留元数据。盖板必须带 mat 标签，否则原生匹配会报错。输出数量为 8。")}}</p>
          <p v-else>{{t("控件放在左上，喷罐放在上中。只接受原生拉杆或按钮类控件；输出保留控件种类，由喷罐的 color 标签决定元数据，原控件的 NBT 不会复制到输出。")}}</p>
          <p>{{t("规则固定在左上方，不支持镜像。标为“不参与匹配”的格子可以有额外物品；工作台领取结果时仍会处理每一个已占用格的消耗和容器回调。")}}</p>
          <div class="projectblue-grid" :aria-label="t('三乘三合成网格')">
            <div v-for="index in 9" :key="index" class="projectblue-cell" :class="{'required-empty':rule.data.requiredEmpty.includes(index-1),'unchecked':rule.data.ignored.includes(index-1)}" :data-cell="index-1">
              <span>{{cellLabel(index-1)}}</span>
              <ItemLink v-if="example?.data.cells[index-1]" :target="{kind:'item',id:example.data.cells[index-1]!.item,amount:example.data.cells[index-1]!.amount}" :records="records" :catalog="catalog" :compact="true" :animate="preferences.animate" @select="select" />
            </div>
          </div>
          <section v-if="example" class="projectblue-output" :aria-label="t('样本输出')">
            <h3>{{t("当前样本的实际输出")}}</h3>
            <ItemLink :target="{kind:'item',id:example.data.output.item,amount:example.data.output.amount}" :records="records" :catalog="catalog" :animate="preferences.animate" @select="select" />
            <p v-if="example.data.materialKey!=null">{{t("原生材料键：")}}<code>{{example.data.materialKey}}</code></p>
            <p>{{t("数量：{0}", example.data.output.amount)}}</p>
          </section>
          <p v-else>{{t("当前物品清单没有此规则的可用外观样本，规则定义仍然保留。")}}</p>
        </section>
        <Pager :offset="page.offset" :limit="page.limit" :total="page.total" :busy="loading" :label="t('控件样本')" @change="offset=>update(search.mode,offset)" />
        <section class="rule-card" :aria-label="t('工具与容器行为')"><h2>{{t("工具与容器")}}</h2>
          <p>{{t("可损耗的原生锯返回耐久消耗加 1 的新锯，不复制原 NBT；不可损耗的锯返回原始堆栈。原生锯的容器不离开合成网格。")}}</p>
          <p>{{t("喷罐消耗值小于 256 时返回消耗值加 1 的喷罐，NBT 只保留颜色；消耗值 255 会返回 256。消耗值达到 256 后原生容器存在判定为否，不承诺返还空罐。最终放回、损坏或掉落由工作台处理。")}}</p>
        </section>
      </template>
    </template>
  </main>
</template>
<style scoped>
.projectblue-page{padding:20px;min-width:0;max-width:1000px;overflow-wrap:anywhere}.projectblue-page p{line-height:1.7}.rule-tabs{display:flex;gap:8px;flex-wrap:wrap}.rule-tabs button[aria-pressed=true]{outline:2px solid var(--color-primary,#60a5fa)}.rule-card{border:1px solid var(--color-border,#334155);border-radius:8px;padding:16px;margin:16px 0}.rule-card h2{font-size:1.2rem}.projectblue-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;max-width:540px}.projectblue-cell{border:1px solid var(--color-border,#64748b);border-radius:4px;min-height:88px;padding:8px;display:flex;flex-direction:column;gap:8px;align-items:center}.projectblue-cell span{font-size:.85rem}.required-empty{border-style:dashed}.unchecked{background:rgba(127,127,127,.08)}.projectblue-output{margin-top:16px;padding-top:8px;border-top:1px solid var(--color-border,#334155)}
</style>
