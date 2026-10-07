<script setup lang="ts">
import { computed, ref } from 'vue';
import { Catalog, Records, required, type Detail } from '../catalog/client.ts';
import { ticks } from '../catalog/format.ts';
import { formatQuantity } from '../recipe-tools/materials.ts';
import { useRecipeReference } from '../recipe-tools/reference.ts';
import RecipeMaterials from '../recipe-tools/RecipeMaterials.vue';
import Recipe from './Recipe.vue';
import GameText from './GameText.vue';

const props = defineProps<{ catalog: Catalog; detail: Detail; records: Records; mode: 'materials' | 'compare' }>();
const emit = defineEmits<{
  'update:mode': [mode: 'materials' | 'compare']; close: []; select: [id: string, direction: 'recipes' | 'uses']; open: [id: string];
}>();
const batches = ref('1');
const reference = useRecipeReference(() => props.catalog, () => props.detail, () => props.mode === 'compare');
const columns = computed(() => {
  const current = { title: '当前配方', detail: props.detail, records: props.records };
  const saved = reference.detail.value;
  if (!saved || saved.recipe.id === props.detail.recipe.id) return [current];
  return [{ title: '参考配方', detail: saved, records: new Records(saved.related) }, current];
});
function energy(detail: Detail): string {
  const recipe = detail.recipe, process = recipe.process;
  if (recipe.energy != null) return formatQuantity(recipe.energy) + ' EU/t' + (recipe.energy.startsWith('-') ? '（发电）' : '');
  if (process?.kind === 'buildcraftIntegration') return formatQuantity(String(process.rule.energy)) + ' RF（激光能量）';
  if (process && 'energy' in process) return formatQuantity(String(process.energy)) + ' RF（原生基础值）';
  if (process?.kind === 'rolling') return process.powered ? '5,000 RF（正常完整加工）' : '0 RF';
  return '未提供固定能耗';
}
</script>

<template>
  <section class="recipe-tools" aria-label="配方材料与对比">
    <header class="tools-header">
      <div class="tools-modes" aria-label="工具视图">
        <button type="button" :aria-pressed="mode === 'materials'" @click="emit('update:mode', 'materials')">材料清单</button>
        <button type="button" :aria-pressed="mode === 'compare'" @click="emit('update:mode', 'compare')">配方对比</button>
      </div>
      <button type="button" class="close-tools" aria-label="关闭配方工具" @click="emit('close')">关闭</button>
    </header>
    <div class="tools-controls">
      <label>执行批次 <input v-model="batches" type="text" inputmode="numeric" maxlength="80" aria-label="执行批次" autocomplete="off" /></label>
      <button type="button" :disabled="reference.id.value === detail.recipe.id" @click="reference.remember()">
        {{ reference.id.value === detail.recipe.id ? '当前已设为参考' : '设为参考配方' }}
      </button>
      <button v-if="reference.id.value" type="button" @click="reference.forget()">清除参考</button>
    </div>
    <p class="tools-note">按成功执行的正整数批次汇总；工具库存不随批次增加。原生条件、失败损失和概率结果见下列说明与配方详情。</p>
    <RecipeMaterials v-if="mode === 'materials'" :key="detail.recipe.id" :recipe="detail.recipe" :records="records" :catalog="catalog" :batches="batches"
      @select="(id, direction) => emit('select', id, direction)" />
    <template v-else>
      <p v-if="!reference.id.value" class="tools-note">先将一份配方设为参考，再打开另一份配方进行对比。参考仅在当前数据集中使用。</p>
      <p v-else-if="reference.id.value === detail.recipe.id" class="tools-note">当前就是参考配方。打开另一份配方后，可在此并排对比。</p>
      <p v-if="reference.loading.value" role="status">正在读取参考配方…</p>
      <p v-if="reference.error.value" role="alert">{{ reference.error.value }} <button type="button" @click="reference.reload()">重试</button></p>
      <div class="comparison-grid" :class="{ paired: columns.length === 2 }">
        <article v-for="column in columns" :key="column.detail.recipe.id" class="comparison-column" :aria-label="column.title">
          <h4>{{ column.title }} · <GameText :text="column.records.text(required(column.records.categories, column.detail.recipe.category).name)" /></h4>
          <dl class="comparison-stats">
            <dt>标注耗时</dt><dd>{{ column.detail.recipe.duration == null ? '未提供固定耗时' : ticks(column.detail.recipe.duration) }}</dd>
            <dt>能耗</dt><dd>{{ energy(column.detail) }}</dd>
          </dl>
          <Recipe :recipe="column.detail.recipe" :records="column.records" :catalog="catalog" :animate="true" :scale="1"
            @select="(id, direction) => emit('select', id, direction)" @open="id => emit('open', id)" />
          <RecipeMaterials :recipe="column.detail.recipe" :records="column.records" :catalog="catalog" :batches="batches"
            @select="(id, direction) => emit('select', id, direction)" />
        </article>
      </div>
    </template>
  </section>
</template>

<style scoped>
.recipe-tools { container-type: inline-size; margin-top: 6px; padding: 10px; border: 1px solid var(--line); border-radius: 5px; background: #101b28; font-size: 12px; }
.tools-header, .tools-controls, .tools-modes { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.tools-header { justify-content: space-between; margin-bottom: 8px; }
.recipe-tools button { padding: 4px 8px; color: inherit; background: #1a2a3a; border: 1px solid #34485b; border-radius: 3px; cursor: pointer; }
.recipe-tools button[aria-pressed="true"] { color: #0e2334; background: var(--accent); }
.recipe-tools button:disabled { opacity: .65; cursor: default; }
.tools-controls label { display: flex; align-items: center; gap: 6px; }
.tools-controls input { width: 88px; padding: 4px; color: inherit; background: #0b1420; border: 1px solid #34485b; border-radius: 3px; }
.tools-note { color: var(--muted); margin: 8px 0; line-height: 1.5; }
.comparison-grid { display: grid; grid-template-columns: minmax(0, 1fr); gap: 12px; }
.comparison-grid.paired { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.comparison-column { min-width: 0; }
.comparison-column h4 { margin: 8px 0; font-size: 13px; color: var(--accent); }
.comparison-stats { display: grid; grid-template-columns: auto 1fr; gap: 4px 8px; margin: 8px 0; }
.comparison-stats dt { color: var(--muted); }
.comparison-stats dd { margin: 0; overflow-wrap: anywhere; }
.comparison-column :deep(.view-scroll) { max-width: 100%; }
[role="alert"] { color: #ffb9a9; }
@media (max-width: 560px) { .comparison-grid.paired { grid-template-columns: minmax(0, 1fr); } }
@container (max-width: 360px) { .comparison-grid.paired { grid-template-columns: minmax(0, 1fr); } }
</style>
