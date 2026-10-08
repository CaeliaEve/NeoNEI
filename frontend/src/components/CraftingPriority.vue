<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import type { CraftingSelector } from '@elysium/contracts';
import { Catalog, Records } from '../catalog/client.ts';
import ItemLink from './ItemLink.vue';

const props = defineProps<{ earlier: CraftingSelector[]; records: Records; catalog: Catalog; animate: boolean }>();
const emit = defineEmits<{ select: [id: string, direction: 'recipes' | 'uses'] }>();
const open = ref(false), offset = ref(0), pages = reactive<Record<string, number>>({});
const visible = computed(() => open.value ? props.earlier.slice(offset.value, offset.value + 8) : []);
watch(() => props.earlier, () => {
  offset.value = 0;
  for (const key of Object.keys(pages)) delete pages[key];
});
function page(index: number, slot: number) { return pages[`${offset.value + index}:${slot}`] ?? 0; }
function move(index: number, slot: number, delta: number) { pages[`${offset.value + index}:${slot}`] = page(index, slot) + delta; }
</script>

<template>
  <details v-if="earlier.length" @toggle="open = ($event.target as HTMLDetailsElement).open">
    <summary>{{ earlier.length }} 条前序匹配条件</summary>
    <p>机器只选择第一条匹配的配方。当前配方需要先不满足以下条件。</p>
    <ol :start="offset + 1">
      <li v-for="(prior, index) in visible" :key="offset + index">
        <p v-if="prior.grid">有序 {{ prior.grid.width }} × {{ prior.grid.height }}，可平移{{ prior.grid.mirror ? '、可镜像' : '、不可镜像' }}。格子从左到右、从上到下：
          <span v-for="(cell, position) in prior.grid.cells" :key="position">{{ position ? ' / ' : '' }}{{ cell == null ? '空' : `材料 ${cell + 1}` }}</span>
        </p>
        <p v-else>无序：按格子顺序匹配尚未使用的材料需求。</p>
        <div v-for="(choices, slot) in prior.inputs" :key="slot" class="requirement">
          <span>材料 {{ slot + 1 }}（{{ choices.length }} 个候选）：</span>
          <span v-for="(choice, option) in choices.slice(page(index, slot), page(index, slot) + 8)" :key="page(index, slot) + option" class="choice">
            <ItemLink :target="{ kind: 'item', id: choice.id }" :catalog="catalog" :records="records" :animate="animate" @select="(id, direction) => emit('select', id, direction)" />
            <small v-if="choice.rule.kind === 'wildcard'">{{ choice.rule.meta ? '任意元数据' : '所示元数据' }}{{ choice.rule.nbt ? '，忽略 NBT' : '' }}</small>
          </span>
          <span v-if="choices.length > 8" class="paging">
            <button type="button" :disabled="page(index, slot) === 0" @click="move(index, slot, -8)">上一组候选</button>
            <span>{{ page(index, slot) + 1 }}–{{ Math.min(page(index, slot) + 8, choices.length) }}</span>
            <button type="button" :disabled="page(index, slot) + 8 >= choices.length" @click="move(index, slot, 8)">下一组候选</button>
          </span>
        </div>
      </li>
    </ol>
    <nav v-if="earlier.length > 8" class="paging" aria-label="前序条件翻页">
      <button type="button" :disabled="offset === 0" @click="offset -= 8">上一页</button>
      <span>{{ offset + 1 }}–{{ Math.min(offset + 8, earlier.length) }} / {{ earlier.length }}</span>
      <button type="button" :disabled="offset + 8 >= earlier.length" @click="offset += 8">下一页</button>
    </nav>
  </details>
</template>

<style scoped>
.requirement, .paging { display: flex; flex-wrap: wrap; align-items: center; gap: .5rem; margin: .5rem 0; }
.choice { display: inline-flex; flex-direction: column; gap: .25rem; }
.choice small { opacity: .75; }
</style>
