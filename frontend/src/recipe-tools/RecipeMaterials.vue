<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import type { Input, Recipe } from '@elysium/contracts';
import type { Catalog, Records } from '../catalog/client.ts';
import { plain } from '../catalog/format.ts';
import { recipeChoiceIndex, recipeSampleIndex, selectRecipeChoice, selectRecipeSample } from '../catalog/selection.ts';
import { calculateMaterials, formatQuantity, type Materials } from './materials.ts';
import ItemLink from '../components/ItemLink.vue';

const props = defineProps<{ recipe: Recipe; records: Records; catalog: Catalog; batches: string }>();
const emit = defineEmits<{ select: [id: string, direction: 'recipes' | 'uses'] }>();
const selected = reactive<Record<string, number>>({});
const choiceError = ref('');
watch([() => props.recipe.id, () => props.catalog], () => {
  for (const key of Object.keys(selected)) delete selected[key];
  choiceError.value = '';
});
const correlatedOutput = computed(() => props.recipe.outputs.find(output => output.change?.bindings));
const result = computed(() => {
  try { return { materials: calculateMaterials(props.recipe, props.batches, selected), error: '' }; }
  catch (error) { return { materials: null, error: error instanceof Error ? error.message : String(error) }; }
});
const groups: { key: keyof Materials; label: string }[] = [
  { key: 'inputs', label: '确定投入' }, { key: 'outputs', label: '确定产出' }, { key: 'returns', label: '容器与物品归还' },
  { key: 'tools', label: '保留物与工具库存' }, { key: 'uncertain', label: '概率、动态与特殊规则' },
];
function name(kind: 'item' | 'fluid', id: string): string { return plain(props.records.text(props.records.substance(kind, id).name)); }
function choose(input: Input, event: Event): void {
  try { selectRecipeChoice(props.recipe, selected, input, Number((event.target as HTMLSelectElement).value)); choiceError.value = ''; }
  catch (error) { choiceError.value = error instanceof Error ? error.message : String(error); }
}
function chooseSample(event: Event): void {
  try { selectRecipeSample(props.recipe, selected, Number((event.target as HTMLSelectElement).value)); choiceError.value = ''; }
  catch (error) { choiceError.value = error instanceof Error ? error.message : String(error); }
}
</script>

<template>
  <div class="material-list">
    <div v-if="correlatedOutput || recipe.inputs.some(input => input.choices.length > 1)" class="material-choices">
      <p>清单候选（独立于原生槽位选择）</p>
      <label v-if="correlatedOutput">输入组合
        <select :value="recipeSampleIndex(recipe, selected, correlatedOutput)" @change="chooseSample">
          <option v-for="(_sample, index) in correlatedOutput.change!.samples" :key="index" :value="index">组合 {{ index + 1 }}</option>
        </select>
      </label>
      <template v-for="input in recipe.inputs" :key="input.kind + input.slot">
        <label v-if="input.choices.length > 1 || correlatedOutput">{{ input.kind === 'fluid' ? '流体' : '物品' }}槽 {{ input.slot + 1 }}
          <select :aria-label="(input.kind === 'fluid' ? '流体' : '物品') + '槽 ' + (input.slot + 1) + ' 清单候选'"
            :value="recipeChoiceIndex(recipe, selected, input)" @change="choose(input, $event)">
            <option v-if="recipeChoiceIndex(recipe, selected, input) === -1" :value="-1" disabled>此组合留空</option>
            <option v-for="(candidate, index) in input.choices" :key="index" :value="index">
              {{ name(input.kind, candidate.id) }} × {{ formatQuantity(candidate.amount) }}
            </option>
          </select>
        </label>
      </template>
    </div>
    <p v-if="choiceError || result.error" role="alert">{{ choiceError || result.error }}</p>
    <template v-if="result.materials">
      <section v-for="group in groups.filter(group => result.materials![group.key].length)" :key="group.key" :data-material-group="group.key">
        <h5>{{ group.label }}</h5>
        <ul>
          <li v-for="(row, index) in result.materials[group.key]" :key="row.kind + row.id + index">
            <ItemLink :target="{ kind: row.kind, id: row.id }" :records="records" :catalog="catalog" :animate="false"
              :width="20" :height="20" :amount-label="row.amount === null ? '' : formatQuantity(row.amount)"
              @select="(id, direction) => emit('select', id, direction)" />
            <small v-if="row.note">{{ row.note }}</small>
          </li>
        </ul>
      </section>
      <p v-if="groups.every(group => !result.materials![group.key].length)" class="material-empty">未列出物品或流体用量。</p>
    </template>
  </div>
</template>

<style scoped>
.material-list { min-width: 0; font-size: 12px; }
.material-choices { display: grid; gap: 6px; margin-bottom: 10px; }
.material-choices p { color: var(--muted); margin: 4px 0; }
label { display: flex; align-items: center; gap: 8px; }
select { flex: 1; min-width: 0; max-width: 100%; color: inherit; background: #172331; border: 1px solid var(--line); border-radius: 3px; padding: 4px; }
section { margin-top: 10px; }
h5 { font-size: 12px; margin: 0 0 4px; color: var(--accent); }
ul { list-style: none; padding: 0; margin: 0; }
li { display: flex; align-items: center; flex-wrap: wrap; gap: 4px 10px; border-top: 1px solid #22304180; padding: 3px 0; }
li small { flex: 1 1 180px; color: var(--muted); line-height: 1.5; overflow-wrap: anywhere; }
.material-list :deep(.item-link) { max-width: 100%; background: transparent; color: inherit; border: 0; }
.material-list :deep(.item-caption) { display: flex; gap: 8px; flex-wrap: wrap; text-align: left; overflow-wrap: anywhere; }
.material-empty { color: var(--muted); }
[role="alert"] { color: #ffb9a9; }
</style>
