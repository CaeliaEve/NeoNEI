<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { Clue } from '@elysium/contracts';
import type { Catalog, Records } from '../catalog/client.ts';
import ItemLink from './ItemLink.vue';
import Pager from './Pager.vue';

const props = defineProps<{ clue: Clue; catalog: Catalog; records: Records; animate: boolean }>();
const emit = defineEmits<{ select: [id: string, direction: 'recipes' | 'uses'] }>();
const offset = ref(0);
const shown = computed(() => props.clue.matches.slice(offset.value, offset.value + 12));
watch(() => props.clue, () => { offset.value = 0; });
</script>

<template>
  <article class="research-clue" :aria-label="'物品线索 ' + clue.registry">
    <p><code>{{ clue.registry }}</code> · {{ clue.meta === 32767 ? '任意元数据' : '元数据 ' + clue.meta }}</p>
    <p v-if="clue.ore" class="subtle">同时按游戏规则匹配矿辞组：<code>{{ clue.ore }}</code></p>
    <details v-if="clue.nbt"><summary>NBT 条件</summary><pre>{{ JSON.stringify(clue.nbt, null, 2) }}</pre></details>
    <div v-if="clue.matches.length" class="examples" aria-label="资料库中的匹配示例">
      <ItemLink v-for="id in shown" :key="id" :target="{ kind: 'item', id }" :records="records" :catalog="catalog" :animate="animate"
        @select="(id, direction) => emit('select', id, direction)" />
      <Pager :total="clue.matches.length" :offset="offset" :limit="12" :busy="false" label="示例" @change="offset = $event" />
    </div>
    <p v-else class="subtle">资料库中无具体物品示例，原始触发条件已保留。</p>
  </article>
</template>

<style scoped>
.research-clue { width: 100%; padding: .8rem 1rem; border: 1px solid #304353; border-radius: 8px; }
p { margin: .35rem 0; }
code { overflow-wrap: anywhere; }
.examples { display: flex; gap: .75rem; align-items: center; flex-wrap: wrap; margin-top: .6rem; }
pre { overflow: auto; max-height: 18rem; font-size: .8rem; }
summary { cursor: pointer; margin: .5rem 0; }
</style>
