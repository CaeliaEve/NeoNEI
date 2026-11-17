<script setup lang="ts">
import {t} from "../i18n/index.ts";
import { computed, ref } from 'vue';
import type { QuestBigItemStack, QuestItemPattern } from '@elysium/contracts';
import { Catalog, Records } from '../catalog/client.ts';
import ItemLink from './ItemLink.vue';
const props = defineProps<{ stack: QuestBigItemStack; records: Records; catalog: Catalog; reward?: boolean; animate: boolean }>();
const emit = defineEmits<{ select: [id: string, direction: 'recipes' | 'uses'] }>();
const expanded = ref(false), offset = ref(0), sampleOffsets = ref<Record<number, number>>({});
const patterns = computed(() => [props.stack.base, ...(!props.reward && props.stack.oreActive ? props.stack.candidates : [])]);
const pattern = (value: QuestItemPattern) => `${value.registry} · meta ${value.meta}${value.damageable ? t(' · 可损耗物品') : ''}`;
const sampleOffset = (index: number) => sampleOffsets.value[index] ?? 0;
function moveSamples(index: number, delta: number) { sampleOffsets.value[index] = Math.max(0, sampleOffset(index) + delta); }
</script>
<template>
  <section class="quest-stack">
    <ItemLink v-if="stack.base.examples[0]" :target="{kind:'item',id:stack.base.examples[0],amount:String(stack.amount)}"
      :records="records" :catalog="catalog" :animate="animate" @select="(id,direction)=>emit('select',id,direction)" />
    <p v-else>{{t("{0} × {1}（原生没有可渲染的具体样本）", pattern(stack.base), stack.amount)}}</p>
    <p v-if="reward" class="quest-stack-policy">{{t("发放基础物品，按原生堆叠上限拆分；矿辞候选不是额外奖励。")}}<span v-if="stack.amount < 1">{{t("声明数量为 {0}，原生发放规则按至少 1 件处理。", stack.amount)}}</span></p>
    <p v-else-if="stack.oreActive">{{t("接受基础物品或矿辞 {0}；候选是匹配示例，需要的数量为 {1}。", stack.oreKey, stack.amount)}}</p>
    <p v-if="stack.base.damageable && !reward">{{t("原生任务匹配忽略可损耗物品的元数据。")}}</p>
    <details @toggle="expanded=($event.target as HTMLDetailsElement).open">
      <summary>{{t("物品匹配声明与样本（{0} 项）", patterns.length)}}</summary>
      <template v-if="expanded">
        <section v-for="(value,index) in patterns.slice(offset,offset+12)" :key="offset+index" class="quest-pattern">
          <p>{{offset+index===0?t("基础声明"):t("矿辞候选")}} · {{pattern(value)}}<span v-if="value.meta===32767">{{t("· 通配元数据")}}</span></p>
          <div class="quest-samples"><ItemLink v-for="(id,example) in value.examples.slice(sampleOffset(offset+index),sampleOffset(offset+index)+12)" :key="example" :target="{kind:'item',id}"
            :records="records" :catalog="catalog" :animate="animate" @select="(id,direction)=>emit('select',id,direction)" /></div>
          <p v-if="!value.examples.length">{{t("原生子物品列表为空，未补造样本。")}}</p>
          <p v-if="value.examples.length>12">{{t("样本")}} {{sampleOffset(offset+index)+1}}～{{Math.min(sampleOffset(offset+index)+12,value.examples.length)}} / {{value.examples.length}}
            <button v-if="sampleOffset(offset+index)" @click="moveSamples(offset+index,-12)">{{t("上一组样本")}}</button>
            <button v-if="sampleOffset(offset+index)+12<value.examples.length" @click="moveSamples(offset+index,12)">{{t("下一组样本")}}</button></p>
          <details v-if="value.nbt"><summary>{{t("NBT 匹配声明")}}</summary><pre>{{JSON.stringify(value.nbt,null,2)}}</pre></details>
        </section>
        <p v-if="patterns.length>12"><button :disabled="offset===0" @click="offset=Math.max(0,offset-12)">{{t("上一组声明")}}</button>
          {{offset+1}}～{{Math.min(offset+12,patterns.length)}} / {{patterns.length}}
          <button :disabled="offset+12>=patterns.length" @click="offset+=12">{{t("下一组声明")}}</button></p>
      </template>
    </details>
  </section>
</template>
<style scoped>
.quest-stack{padding:.6rem;border:1px solid var(--border,#334155);border-radius:.4rem}.quest-stack p{margin:.4rem 0;line-height:1.6;overflow-wrap:anywhere}.quest-pattern{padding:.4rem 0}.quest-samples{display:flex;gap:.5rem;flex-wrap:wrap}pre{overflow:auto;max-height:18rem;font-size:.75rem}button{margin:.25rem;padding:.2rem .5rem;border:1px solid var(--border,#334155);border-radius:.25rem}
</style>
