<script setup lang="ts">
import { computed, watch } from 'vue';
import { Records, required, type Catalog, type ItemAspects } from '../catalog/client.ts';
import { amount } from '../catalog/format.ts';
import { useRequest } from '../state/request.ts';
import TopicLink from './TopicLink.vue';
const props = defineProps<{ item: string; catalog: Catalog; animate: boolean }>();
const { value, error, loading, run, clear } = useRequest<ItemAspects>();
const records = computed(() => value.value ? new Records(value.value.related) : null);
const aspects = computed(() => new Map(value.value?.aspects.map(row => [row.id, row]) ?? []));
function load(): void { clear(); void run(signal => props.catalog.itemAspects(props.item, signal)); }
watch([() => props.item, () => props.catalog], load, { immediate: true });
</script>

<template>
  <section class="aspect-bar" aria-label="物品要素">
    <p v-if="loading" class="subtle" role="status">正在读取要素…</p>
    <p v-else-if="error" class="inline-error" role="alert">{{ error }} <button type="button" @click="load">重试</button></p>
    <template v-else-if="value && records">
      <span v-if="value.item.aspects == null" class="subtle">此物品的要素信息未提供。</span>
      <span v-else-if="!value.item.aspects.length" class="subtle">此物品没有要素。</span>
      <span v-for="entry in value.item.aspects" :key="entry.aspect" class="aspect-amount">
        <TopicLink :topic="required(aspects, entry.aspect)" :catalog="catalog" :records="records" :animate="animate" /> × {{ amount(entry.amount) }}
      </span>
    </template>
  </section>
</template>

<style scoped>
.aspect-bar { display: flex; flex-wrap: wrap; gap: .7rem; padding: .7rem 0; }
.aspect-amount { display: inline-flex; align-items: center; gap: .4rem; padding: .35rem .6rem; border-radius: 6px; background: #182837; }
</style>
