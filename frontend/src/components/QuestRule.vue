<script setup lang="ts">
import {t} from "../i18n/index.ts";
import { computed, ref } from 'vue';
import type { QuestTaskRule, QuestRewardRule, QuestBigItemStack } from '@elysium/contracts';
import { Catalog, Records } from '../catalog/client.ts';
import QuestStack from './QuestStack.vue';
import ItemLink from './ItemLink.vue';
const props = defineProps<{ rule: QuestTaskRule | QuestRewardRule; reward?: boolean; records: Records; catalog: Catalog; animate: boolean }>();
const emit = defineEmits<{ select: [id: string, direction: 'recipes' | 'uses'] }>();
const offset = ref(0);
const stacks = computed<QuestBigItemStack[]>(() => 'items' in props.rule ? props.rule.items : 'item' in props.rule && props.rule.item ? [props.rule.item] : []);
const flags = computed(() => Object.entries(props.rule).filter(([key,value]) => typeof value==='boolean' && !['optional','hideCommand','hideInfo'].includes(key)));
const labels: Record<string,string> = {
  consume:'消耗提交内容',groupDetect:'共享组检测',autoConsume:'自动提交',partialMatch:'部分 NBT 匹配',ignoreNBT:'忽略 NBT',
  allowAnvil:'计入铁砧',allowSmelt:'计入烧制',allowCraft:'计入合成',allowCraftedFromStatistics:'计入原生制作统计',
  ignoreItemNBT:'忽略物品 NBT',partialItemMatch:'部分物品 NBT 匹配',ignoreEntityNBT:'忽略实体 NBT',
  entitySubtypes:'接受实体子类型',subtypes:'接受实体子类型',onInteract:'右键交互',onHit:'击打交互',
  levels:'以经验等级计量',visible:'原生目标指示可见',invert:'反向目标',taxiCab:'使用曼哈顿距离',
  viaPlayer:'以玩家身份运行',relative:'相对分数',ignoreDisabled:'忽略全局禁用奖励',
};
function flagName(key: string): string { const label=labels[key]; return label?t(label):key; }
</script>
<template>
  <div class="quest-rule">
    <p v-if="rule.type==='retrieval' && rule.optional" class="quest-optional">{{t("可选提交；不作为任务逻辑的必需条件。")}}</p>
    <p v-if="rule.type==='choice'" class="quest-choice">{{t("从奖励条目中选择 {0} 项，不是全部发放。", rule.selectionCount)}}</p>
    <QuestStack v-for="(stack,index) in stacks.slice(offset,offset+12)" :key="offset+index" :stack="stack" :reward="reward" :catalog="catalog" :records="records" :animate="animate" @select="(id,direction)=>emit('select',id,direction)" />
    <p v-if="stacks.length>12" class="quest-rule-pager"><button :disabled="offset===0" @click="offset=Math.max(0,offset-12)">{{t("上一组材料")}}</button>
      {{offset+1}}～{{Math.min(offset+12,stacks.length)}} / {{stacks.length}}<button :disabled="offset+12>=stacks.length" @click="offset+=12">{{t("下一组材料")}}</button></p>
    <template v-if="rule.type==='fluid'"><ItemLink v-for="(fluid,index) in rule.fluids.slice(offset,offset+12)" :key="offset+index" :target="{kind:'fluid',id:fluid.fluid,amount:String(fluid.amount)}" :catalog="catalog" :records="records" :animate="animate" @select="(id,direction)=>emit('select',id,direction)" />
      <p v-if="rule.fluids.length>12"><button :disabled="offset===0" @click="offset=Math.max(0,offset-12)">{{t("上一组流体")}}</button>{{offset+1}} / {{rule.fluids.length}}<button :disabled="offset+12>=rule.fluids.length" @click="offset+=12">{{t("下一组流体")}}</button></p>
    </template>
    <p v-if="rule.type==='meeting'">{{t("发现 {0} · 距离 {1} · 数量 {2}", rule.entity, rule.range, rule.amount)}}</p>
    <p v-if="rule.type==='hunt'">{{t("击杀 {0} · 数量 {1} · 伤害类型 {2}", rule.entity, rule.required, rule.damageType || t("原生未指定"))}}</p>
    <p v-if="rule.type==='interactEntity'">{{t("与 {0} 交互 {1} 次。", rule.entity, rule.required)}}</p>
    <template v-if="rule.type==='interactItem'"><p>{{t("与方块 {0}（meta {1}）交互 {2} 次 · 方块数量 {3} · 矿辞 {4}", rule.block.registry || t("原生未指定"), rule.block.meta, rule.required, rule.block.amount, rule.block.oreKey || t("未指定"))}}</p><details v-if="rule.block.nbt"><summary>{{t("方块 NBT 条件")}}</summary><pre>{{JSON.stringify(rule.block.nbt,null,2)}}</pre></details></template>
    <p v-if="rule.type==='checkbox'">{{t("需要原生玩家确认；此资料页仅展示声明。")}}</p>
    <template v-if="rule.type==='location'"><p>{{rule.name || t("地点任务")}}</p><p v-if="rule.hideInfo">{{t("原生任务隐藏目标信息。")}}</p><p v-else>{{t("维度 {0} · 坐标 {1}, {2}, {3} · 范围 {4} · 生物群系 {5} · 结构 {6}", rule.dim, rule.x, rule.y, rule.z, rule.range, rule.biome, rule.structure || t("未指定"))}}</p></template>
    <p v-if="rule.type==='xp'">{{rule.amount}} {{rule.levels?t("经验等级"):t("经验点")}}</p>
    <template v-if="rule.type==='blockBreak'"><section v-for="(block,index) in rule.blocks.slice(offset,offset+12)" :key="offset+index"><p>{{t("破坏 {0} · meta {1} · 数量 {2} · 矿辞 {3}", block.registry || t("原生未指定方块"), block.meta, block.amount, block.oreKey || t("未指定"))}}</p><details v-if="block.nbt"><summary>{{t("方块 NBT 条件")}}</summary><pre>{{JSON.stringify(block.nbt,null,2)}}</pre></details></section>
      <p v-if="rule.blocks.length>12"><button :disabled="offset===0" @click="offset=Math.max(0,offset-12)">{{t("上一组方块")}}</button>{{offset+1}} / {{rule.blocks.length}}<button :disabled="offset+12>=rule.blocks.length" @click="offset+=12">{{t("下一组方块")}}</button></p>
    </template>
    <template v-if="rule.type==='scoreboard'"><p v-if="'target' in rule">{{t("{0} · 原生条件 {1} {2} · criteria {3} · 浮点转换位 {4} · 单位 {5}", rule.scoreDisp || rule.scoreName, rule.operation, rule.target, rule.criteria, rule.conversionBits, rule.suffix || t("无"))}}</p><p v-else>{{t("记分项 {0} · {1} {2} · criteria {3}", rule.score, rule.relative?t("相对增加"):t("设置"), rule.value, rule.criteria)}}</p></template>
    <template v-if="rule.type==='command'"><p v-if="rule.hideCommand">{{t("原生奖励隐藏命令内容。")}}</p><pre v-else>{{rule.command}}</pre></template>
    <p v-if="rule.type==='questCompletion'">{{t("完成任务 {0}", rule.questUuid || t("原生未指定目标"))}}</p>
    <dl class="quest-flags"><template v-for="[key,value] in flags" :key="key"><dt>{{flagName(key)}}</dt><dd>{{value?t("是"):t("否")}}</dd></template></dl>
    <details v-if="'targetNBT' in rule && rule.targetNBT"><summary>{{t("实体 NBT 条件")}}</summary><pre>{{JSON.stringify(rule.targetNBT,null,2)}}</pre></details>
  </div>
</template>
<style scoped>
.quest-rule{display:grid;gap:.5rem;padding:.7rem}.quest-rule p{margin:.3rem 0;line-height:1.6;overflow-wrap:anywhere}.quest-flags{display:grid;grid-template-columns:minmax(10em,auto) 1fr;gap:.25rem 1rem}.quest-flags dd{margin:0}.quest-rule button{margin:.2rem;padding:.3rem;border:1px solid var(--border,#334155)}pre{overflow:auto;max-height:18rem}.quest-optional,.quest-choice{color:var(--accent,#8fd8ff)}
</style>
