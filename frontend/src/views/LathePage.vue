<script setup lang="ts">
import {t} from '../i18n/index.ts';
import {computed,ref,watch} from 'vue';
import {useRoute,useRouter} from 'vue-router';
import type {LathePage,LatheSearch} from '../catalog/lathe.ts';
import type {LatheState} from '@neonei/catalog/source';
import {Records} from '../catalog/client.ts';
import {plain} from '../catalog/format.ts';
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
const offset=(key:string)=>/^(0|[1-9][0-9]*)$/.test(field(key))?Number(field(key)):0;
const search=computed<LatheSearch>(()=>({workpiece:field('workpiece'),state:field('state'),tool:field('tool'),toolState:field('toolState'),offset:offset('offset'),limit:12,toolOffset:offset('toolOffset'),toolLimit:12}));
const {value:page,error,loading,run,clear}=useRequest<LathePage>();
const records=computed(()=>page.value?new Records(page.value.related):null);
const buffer=ref<number|null>(null),space=ref('unknown');
const usableTool=computed(()=>!!page.value?.state&&!!page.value?.toolState&&page.value.toolState.data.hardness>page.value.state.data.hardness);
const ready=computed(()=>usableTool.value&&buffer.value!==null&&Number.isInteger(buffer.value)&&buffer.value>=1000&&buffer.value<=page.value!.definition!.data.bufferCapacity&&space.value==='available');
const stateNbt=computed(()=>page.value?.state?JSON.stringify(records.value?.items.get(page.value.state.data.item)?.nbt,null,2):'');
function load(){const session=catalog.value;if(session)void run(signal=>session.lathe(search.value,signal));}
watch([catalog,search],()=>{clear();load();},{immediate:true});
function update(patch:Record<string,string|number|undefined>){void router.push({name:'lathe',query:{...route.query,...patch}});}
function select(id:string,direction:'recipes'|'uses'){void router.push(itemLocation(id,route.query,direction==='uses'?'usedIn':'producedBy'));}
function itemName(id:string){const item=records.value?.items.get(id);return item?plain(records.value!.text(item.name)):id;}
function cut(edge:LatheState['data']['transitions'][number]){
  if(!ready.value||!page.value?.state||!page.value.toolState)return;
  buffer.value=buffer.value!-page.value.definition!.data.energyPerCut;
  update({workpiece:page.value.state.data.workpiece,state:edge.after,tool:page.value.toolState.data.after?page.value.toolState.data.tool:'none',
    toolState:page.value.toolState.data.after||undefined});
  // Removing an exhausted tool must not silently select a fresh replacement for the next calculation.
  if(!page.value.toolState.data.after)space.value='unknown';
}
function height(radius:number){return radius/(page.value?.state?.data.width??1)*70;}
</script>
<template>
  <section v-if="opening" class="state-panel" role="status">{{t("正在读取车床规则…")}}</section>
  <section v-else-if="openError" class="state-panel error" role="alert">{{openError}} <button @click="open()">{{t("重试")}}</button></section>
  <main v-else-if="catalog" class="catalog-page panel lathe-page">
    <h1>{{t("IC2 车床")}}</h1>
    <p>{{t("查看工件的段位、削减结果、碎屑规则和刀具损耗。状态演算使用你设定的条件，不表示游戏中的机台正在加工。")}}</p>
    <p v-if="loading" role="status">{{t("正在读取原生状态…")}}</p>
    <p v-else-if="error" role="alert" class="inline-error">{{error}} <button @click="load">{{t("重试")}}</button></p>
    <p v-else-if="page&&!page.definition">{{t("当前数据集未包含车床状态规则。")}}</p>
    <template v-else-if="page?.definition&&records">
      <section class="lathe-policy" :aria-label="t('原生车床条件')">
        <h2>{{t("原生加工条件")}}</h2>
        <p>{{t("每次削减需要 {0} kU，刀具硬度必须严格大于工件硬度。先检查变换前碎屑是否能放入输出槽，再削减一段；碎屑数量和概率按变换后的工件读取。即使本次没有抽到碎屑，也需要通过输出空间检查。", page.definition.data.energyPerCut)}}</p>
        <p>{{t("每次成功削减增加 {0} 点自定义刀具损耗，达到上限后移除刀具。工件保留，单段不能削减到小于 {1}。", page.definition.data.toolWear, page.definition.data.minimumRadius)}}</p>
        <details><summary>{{t("动能缓冲与取能规则")}}</summary>
          <p>{{t("缓冲容量 {0} kU。每 tick 先扣除原生损耗，再按 {1} 顺序检查相邻动能源，以相反面请求能量；遇到第一个报价非零的来源后就结束该 tick 的检查。", page.definition.data.bufferCapacity, page.definition.data.intakeDirections.join(' → '))}}</p>
          <p>{{t("损耗按原生整数除法与 Float 运算处理，不是每次削减的额外固定费用。此页面的单步演算只扣每次削减费用，不模拟 tick 损耗或相邻设备供能。")}}</p>
          <code>buffer = int(float(buffer) - (float(buffer / {{page.definition.data.bufferLeakDivisor}}) + 0.5f))</code>
        </details>
      </section>
      <section class="lathe-select" :aria-label="t('工件与刀具选择')">
        <h2>{{t("原生工件")}}</h2><div class="lathe-options"><button v-for="work in page.workpieces" :key="work.id" type="button" :aria-pressed="page.workpiece?.data.workpiece===work.data.workpiece" @click="update({workpiece:work.data.workpiece,state:undefined})">{{t("{0} · 硬度 {1}", itemName(work.data.workpiece), work.data.hardness)}}</button></div>
        <Pager :total="page.total" :offset="page.offset" :limit="page.limit" :label="t('车床工件')" @change="update({offset:$event})" />
        <h2>{{t("原生刀具")}}</h2><div class="lathe-options"><button v-for="tool in page.tools" :key="tool.id" type="button" :aria-pressed="page.tool?.data.tool===tool.data.tool" @click="update({tool:tool.data.tool,toolState:undefined})">{{t("{0} · 损耗 {1} / {2}", itemName(tool.data.tool), tool.data.damage, tool.data.maximum)}}</button><button type="button" :aria-pressed="!page.tool" @click="update({tool:'none',toolState:undefined})">{{t("未装入刀具")}}</button></div>
        <Pager :total="page.toolTotal" :offset="page.toolOffset" :limit="page.toolLimit" :label="t('车床刀具')" @change="update({toolOffset:$event})" />
      </section>
      <section v-if="page.state" class="lathe-current" :aria-label="t('当前工件状态')">
        <h2>{{t("当前工件状态")}}</h2>
        <ItemLink :target="{kind:'item',id:page.state.data.item}" :records="records" :catalog="catalog" :width="32" :height="32" :animate="preferences.animate" @select="select" />
        <p class="lathe-lanes">{{t("段位：{0} · 原生宽度 {1} · 硬度 {2}", page.state.data.lanes.join(' / '), page.state.data.width, page.state.data.hardness)}}</p>
        <svg class="lathe-profile" role="img" :aria-label="t('工件段位截面示意')" :viewBox="`0 0 ${page.state.data.lanes.length*60} 105`">
          <line x1="0" y1="43" :x2="page.state.data.lanes.length*60" y2="43" class="lathe-axis" />
          <g v-for="(radius,lane) in page.state.data.lanes" :key="lane"><rect :x="lane*60+1" :y="43-height(radius)/2" width="58" :height="height(radius)" /><text :x="lane*60+30" y="98">{{lane+1}}：{{radius}}</text></g>
        </svg>
        <p>{{t("截面示意按原生段位数据绘制；上方物品外观使用该状态的已采集纹理。")}}</p>
        <details><summary>{{t("工件状态（NBT）")}}</summary><pre>{{stateNbt}}</pre></details>
        <button type="button" @click="update({state:undefined})">{{t("返回初始工件状态")}}</button>
      </section>
      <section v-if="page.toolState" class="lathe-tool" :aria-label="t('当前刀具状态')">
        <h2>{{t("当前刀具状态")}}</h2><ItemLink :target="{kind:'item',id:page.toolState.data.item}" :records="records" :catalog="catalog" :width="32" :height="32" :animate="preferences.animate" @select="select" />
        <p class="lathe-wear">{{t("自定义损耗 {0} / {1} · 刀具硬度 {2}", page.toolState.data.damage, page.toolState.data.maximum, page.toolState.data.hardness)}}</p>
        <p v-if="!page.toolState.data.after">{{t("下一次成功削减后，该刀具将被移除。")}}</p>
      </section>
      <section v-if="page.state" class="lathe-cuts" :aria-label="t('单段削减结果')">
        <h2>{{t("单段削减结果")}}</h2>
        <p v-if="!page.state.data.transitions.length">{{t("所有段位已达到最小值，不能继续削减。")}}</p>
        <div class="lathe-assumptions"><label>{{t("演算动能缓冲（kU）")}}<input v-model.number="buffer" type="number" min="0" :max="page.definition.data.bufferCapacity" :placeholder="t('自行设定')" /></label>
          <div class="lathe-space"><label for="lathe-output-space">{{t("变换前输出空间")}}</label><select id="lathe-output-space" v-model="space"><option value="unknown">{{t("尚未设定")}}</option><option value="available">{{t("可放入要求的碎屑")}}</option><option value="blocked">{{t("空间不足")}}</option></select></div></div>
        <p v-if="!usableTool" class="lathe-blocked">{{t("当前没有硬度满足要求的刀具。")}}</p>
        <article v-for="edge in page.state.data.transitions" :key="edge.lane" class="lathe-cut">
          <h3>{{t("段 {0}：{1} → {2}", edge.lane+1, page.state.data.lanes[edge.lane], page.state.data.lanes[edge.lane]!-1)}}</h3>
          <p>{{t("输出空间检查：")}}</p><ItemLink :target="{kind:'item',id:edge.preflightOutput.item,amount:edge.preflightOutput.amount}" :records="records" :catalog="catalog" :animate="preferences.animate" @select="select" />
          <p>{{t("可能生成的碎屑：")}}</p><ItemLink :target="{kind:'item',id:edge.byproduct.item,amount:edge.byproduct.amount}" :records="records" :catalog="catalog" :animate="preferences.animate" @select="select" />
          <p class="lathe-probability">{{t("实际选择概率：{0} / {1}（{2}%）", edge.roll.tickets, edge.roll.samples, edge.roll.tickets/edge.roll.samples*100)}}</p>
          <p>{{t("原生 Float 位值：{0}。这是一次碎屑抽取概率，不能按必定产出计算。", edge.roll.thresholdBits)}}</p>
          <div class="lathe-actions"><button type="button" @click="update({workpiece:page.state!.data.workpiece,state:edge.after})">{{t("查看段 {0} 削减后状态", edge.lane+1)}}</button><button type="button" :disabled="!ready||loading" @click="cut(edge)">{{t("演算一次削减：段 {0}", edge.lane+1)}}</button></div>
        </article>
      </section>
      <details class="lathe-samples"><summary>{{t("原生样本与状态规范化")}}</summary><p>{{t("列出当前工件与刀具的前 {0} 个原生列表样本。原始元数据与 NBT 保留；原生物品读取函数可能将其规范化成具体段位状态。", page.samples.length)}}</p><pre v-for="row in page.samples" :key="row.id">{{t("列表序号 {0} · {1} · 原始元数据 {2} · 数量 {3}", row.data.panelOrder, row.data.role, row.data.rawMeta, row.data.amount)}}
{{JSON.stringify(row.data.rawNbt,null,2)}}</pre></details>
    </template>
  </main>
</template>
<style scoped>
.lathe-page{margin:1rem;max-width:1100px;width:auto;min-height:0;padding:1.2rem}.lathe-page p{line-height:1.65;overflow-wrap:anywhere}.lathe-page h2{font-size:1.1rem;margin:1rem 0 .6rem}.lathe-policy,.lathe-select,.lathe-current,.lathe-tool,.lathe-cuts,.lathe-samples{margin-top:1rem;padding:1rem;border:1px solid var(--border,#334155);border-radius:.6rem}.lathe-options,.lathe-assumptions,.lathe-actions{display:flex;gap:.5rem;flex-wrap:wrap}.lathe-options button[aria-pressed=true]{border-color:var(--accent,#93c5fd)}.lathe-assumptions label{display:flex;flex-direction:column;gap:.3rem}.lathe-assumptions input{max-width:12rem}.lathe-profile{width:100%;max-width:600px;height:auto;margin-top:.5rem}.lathe-profile rect{fill:#425c74;stroke:#abc5df;stroke-width:1}.lathe-profile text{fill:currentColor;text-anchor:middle;font-size:12px}.lathe-axis{stroke:#8996a8;stroke-dasharray:4 3}.lathe-cut{padding:1rem;margin-top:.7rem;border:1px solid var(--border,#334155);border-radius:.4rem}.lathe-cut h3{font-size:1rem}.lathe-page pre{white-space:pre-wrap;overflow-wrap:anywhere;max-height:25rem;overflow:auto}.lathe-blocked{color:var(--warning,#fbbf24)}
</style>
