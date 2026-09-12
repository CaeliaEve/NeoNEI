<script setup lang="ts">
import type { Gene } from '@elysium/contracts';
import type { Catalog, Records } from '../catalog/client.ts';
import GameText from './GameText.vue';
import Value from './Value.vue';

defineProps<{ genes: Gene[]; records: Records; catalog: Catalog; animate: boolean }>();
const emit = defineEmits<{ select: [id: string, direction: 'recipes' | 'uses'] }>();
const names: Record<string, string> = {
  speed: '生产速度', lifespan: '寿命', fertility: '繁殖力', temperature_tolerance: '耐温', humidity_tolerance: '耐湿',
  nocturnal: '跨昼夜活动', tolerant_flyer: '耐雨', cave_dwelling: '洞穴活动', flower_provider: '花朵', flowering: '授粉',
  territory: '领地', effect: '效果', growth: '生长', height: '高度', fruits: '果实', yield: '产量', plant: '植物类型',
  sappiness: '汁液', maturation: '成熟', girth: '树干尺寸', fireproof: '防火',
};
</script>

<template>
  <div class="gene-scroll"><table class="gene-table">
    <thead><tr><th scope="col">染色体</th><th scope="col">等位基因</th><th scope="col">显隐性</th><th scope="col">数值</th></tr></thead>
    <tbody><tr v-for="gene in genes" :key="gene.key">
      <th scope="row" :title="gene.key">{{ names[gene.key] || gene.key }}</th>
      <td :title="gene.allele"><GameText :text="records.text(gene.name)" /></td>
      <td>{{ gene.dominant ? '显性' : '隐性' }}</td>
      <td><Value v-if="gene.value" :value="gene.value" :records="records" :catalog="catalog" :animate="animate" @select="(id, direction) => emit('select', id, direction)" />
        <span v-else class="subtle">由模组定义</span></td>
    </tr></tbody>
  </table></div>
</template>
