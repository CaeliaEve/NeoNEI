<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import type { Input, Output, Match } from '@elysium/contracts';
import { Catalog, Records } from '../catalog/client.ts';
import { amount, chance } from '../catalog/format.ts';
import ItemLink from './ItemLink.vue';
import Pager from './Pager.vue';
const props = withDefaults(defineProps<{ stack: Input | Output; catalog: Catalog; records: Records; size?: number; height?: number; animate?: boolean;
  amountLabel?: string; quantityNote?: string }>(),
  { size: 32, height: 32, animate: true, amountLabel: '', quantityNote: '' });
const emit = defineEmits<{ select: [id: string, direction: 'recipes' | 'uses'] }>();
const selected = defineModel<number>('choice', { default: 0 });
const offset = ref(0), dialog = ref<HTMLDialogElement | null>(null);
const expanded = ref(false);
const choices = computed(() => 'choices' in props.stack ? props.stack.choices : []);
function current() {
  const choice = choices.value[selected.value];
  if (!choice) throw new Error('配方输入缺少所选候选');
  return choice;
}
const target = computed(() => 'choices' in props.stack ? { kind: props.stack.kind, ...current() } : props.stack);
const note = computed(() => {
  if (!('choices' in props.stack)) return props.stack.quantity ? props.quantityNote
    : props.stack.change?.action.kind === 'analyze' ? '与输入堆叠数量相同；显示单个样本'
    : props.stack.change?.action.kind === 'runic' ? '升级所投入的装备并保留其他数据；所示为样本'
    : props.stack.change?.action.kind === 'mapScaling' ? '待完成地图样本；实际产物由世界分配新地图 ID'
    : '概率 ' + chance(props.stack.chance) + (props.stack.role === 'return' ? ' · 归还' : '');
  return choiceNote(current());
});
function choiceNote(choice: Input['choices'][number]): string {
  if (choice.consume.kind === 'reserve') return '可选研磨珠库存；装载新珠时消耗一件 · ' + matchNote(choice.rule);
  if (choice.consume.kind === 'wear') return '完工时尝试损耗工具；附魔与工具状态决定实际耐久变化 · ' + matchNote(choice.rule);
  if (choice.consume.kind === 'allocated') return '原生顺序分配需求；实际扣料由配方过程决定 · ' + matchNote(choice.rule);
  if (choice.consume.kind === 'upto') return '至少一件即可；启动时最多消耗 ' + amount(choice.amount) + ' 件 · ' + matchNote(choice.rule);
  if (choice.consume.kind === 'pedestals') return '样本需 ' + choice.amount + ' 座基座，每座一件；实际座数 = 1 + max(0, 输入屏障值) · ' + matchNote(choice.rule);
  const consumption = choice.consume.kind === 'keep' ? '不消耗' : choice.consume.kind === 'buffer' ? '启动时耗尽对应内部流体存量（显示最低门槛）' : choice.consume.kind === 'stack' ? '处理整个输入堆叠' : choice.consume.kind === 'damage' ? '消耗耐久 ' + choice.consume.points : '消耗';
  return consumption + ' · ' + matchNote(choice.rule) + (choice.returns.length ? ' · 归还容器' : '');
}
function matchNote(rule: Match, nested = false): string {
  if (rule.kind === 'ae') return 'AE2 精确匹配：同物品与变体；空 NBT 等价，其他标签按原生类型和值比较';
  if (rule.kind === 'infusion') return '原生注魔匹配：同物品与变体，或首个矿辞组为 ' + (rule.ores.join('、') || '无') + '；仅列出已观察候选';
  if (rule.kind === 'except') {
    if (nested) throw new Error('配方包含嵌套匹配排除条件');
    const examples = rule.exclude.slice(0, 3).map(prior => {
      const item = props.records.substance('item', prior.id);
      return props.records.text(item.name) + '（' + matchNote(prior.rule, true) + '）';
    });
    return matchNote(rule.base, true) + '；排除 ' + rule.exclude.length + ' 条前序匹配：' + examples.join('、')
      + (rule.exclude.length > 3 ? '；另有 ' + (rule.exclude.length - 3) + ' 条' : '') + '；所示物品是匹配模板';
  }
  return rule.kind === 'ore' ? '矿辞：' + rule.name + (rule.exclusive ? '（唯一矿辞）' : '')
    : rule.kind === 'member' ? (rule.analyzed ? '已分析' : '未分析') + '的有效基因个体（不限于列出的品种）'
    : rule.kind === 'without_tags' ? '仅忽略字段：' + rule.keys.join('、') + '；其余 NBT 精确匹配'
    : rule.kind === 'wildcard' ? '通配匹配' : rule.kind === 'tags' ? [
      rule.keys.length ? '匹配字段：' + rule.keys.join('、') : '',
      rule.present.length ? '必须存在：' + rule.present.join('、') : '',
      rule.absent.length ? '必须缺失：' + rule.absent.join('、') : '',
      '允许其他 NBT 数据',
    ].filter(Boolean).join('；') : '精确匹配';
}
watch(() => props.stack, () => { offset.value = 0; dialog.value?.close(); expanded.value = false; });
async function expand(): Promise<void> {
  expanded.value = true;
  await nextTick();
  dialog.value?.showModal();
}
function choose(index: number, id: string, direction: 'recipes' | 'uses'): void {
  selected.value = index; dialog.value?.close();
  if (direction === 'uses') emit('select', id, direction);
}
</script>

<template>
  <div class="stack-slot">
    <ItemLink :target="target" :catalog="catalog" :records="records" :width="size" :height="height" :animate="animate" compact :note="note" :amount-label="amountLabel"
      @select="(id, direction) => emit('select', id, direction)" />
    <button v-if="choices.length > 1" type="button" class="alternatives" :aria-label="'查看 ' + choices.length + ' 个候选输入'"
      @click="expand">{{ choices.length }}</button>
    <dialog v-if="expanded && choices.length > 1" ref="dialog" class="dialog choices-dialog" @close="expanded = false">
      <header><h2>候选输入</h2><button type="button" aria-label="关闭候选输入" @click="dialog?.close()">×</button></header>
      <p>选择当前显示的物品；右键查看其用途。</p>
      <div class="choice-list"><div v-for="(choice, index) in choices.slice(offset, offset + 24)" :key="offset + index">
        <ItemLink :target="{ kind: stack.kind, ...choice }" :note="choiceNote(choice)"
          :amount-label="choice.consume.kind === 'upto' ? '≤' + amount(choice.amount) : ''"
          :catalog="catalog" :records="records" :animate="animate" @select="(id, direction) => choose(offset + index, id, direction)" />
        <small class="choice-note">{{ choiceNote(choice) }}</small>
      </div></div>
      <Pager :total="choices.length" :offset="offset" :limit="24" label="候选输入" @change="offset = $event" />
    </dialog>
  </div>
</template>

<style scoped>
/* Retain the original catalog choice dialog without leaking into the homepage. */
.choices-dialog { color: #e4eaf0; background: #111c2a; border: 1px solid #405164; border-radius: 12px; padding: 22px; width: min(480px, calc(100vw - 30px)); max-height: 85vh; overflow: auto; box-shadow: 0 24px 90px #0009; margin: auto; }
.choices-dialog::backdrop { background: #03080bc9; }
.choices-dialog > header { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 22px; }
.choices-dialog > header h2 { font-size: 18px; }
.choices-dialog > header button { padding: 2px 8px; font-size: 20px; background: transparent; border-color: transparent; color: inherit; }
.choices-dialog > p { color: #8b9aaf; font-size: 12px; margin-bottom: 15px; line-height: 1.8; }
.choice-list { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin-bottom: 15px; }
.choice-list :deep(.item-link) { background: #182637; border: 1px solid #253143; width: 100%; color: inherit; }
.choice-note { display: block; padding: 4px 8px; color: #8b9aaf; overflow-wrap: anywhere; font-size: 11px; }
</style>
