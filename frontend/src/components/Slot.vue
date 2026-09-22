<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import type { Input, Output } from '@elysium/contracts';
import { Catalog, Records } from '../catalog/client.ts';
import { chance } from '../catalog/format.ts';
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
    : '概率 ' + chance(props.stack.chance) + (props.stack.role === 'return' ? ' · 归还' : '');
  return choiceNote(current());
});
function choiceNote(choice: Input['choices'][number]): string {
  const consumption = choice.consume.kind === 'keep' ? '不消耗' : choice.consume.kind === 'damage' ? '消耗耐久 ' + choice.consume.points : '消耗';
  const rule = choice.rule.kind === 'ore' ? '矿辞：' + choice.rule.name + (choice.rule.exclusive ? '（唯一矿辞）' : '')
    : choice.rule.kind === 'wildcard' ? '通配匹配' : choice.rule.kind === 'tags' ? [
      choice.rule.keys.length ? '匹配字段：' + choice.rule.keys.join('、') : '',
      choice.rule.present.length ? '必须存在：' + choice.rule.present.join('、') : '',
      choice.rule.absent.length ? '必须缺失：' + choice.rule.absent.join('、') : '',
      '允许其他 NBT 数据',
    ].filter(Boolean).join('；') : '精确匹配';
  return consumption + ' · ' + rule + (choice.returns.length ? ' · 归还容器' : '');
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
          :catalog="catalog" :records="records" :animate="animate" @select="(id, direction) => choose(offset + index, id, direction)" />
        <small class="choice-note">{{ choiceNote(choice) }}</small>
      </div></div>
      <Pager :total="choices.length" :offset="offset" :limit="24" label="候选输入" @change="offset = $event" />
    </dialog>
  </div>
</template>
