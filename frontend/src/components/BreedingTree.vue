<script setup lang="ts">
import {t} from "../i18n/index.ts";
import { computed, watch } from 'vue';
import type { Catalog } from '../catalog/client.ts';
import { breedingTree, type BreedingNode } from '../catalog/breeding-tree.ts';
import { useRequest } from '../state/request.ts';
import BreedingTreeNode from './BreedingTreeNode.vue';
const props = defineProps<{ id: string; catalog: Catalog; animate: boolean }>();
const emit = defineEmits<{ select: [id: string] }>();
const { value: tree, error, loading, run, clear } = useRequest<BreedingNode>();
function load() { void run(signal => breedingTree(props.id, id => props.catalog.mutations(id, { direction: 'origins', offset: 0, limit: 50 }, signal))); }
watch([() => props.id, () => props.catalog], () => { clear(); load(); }, { immediate: true });
const names = computed(() => {
  const result = new Map<string, string>();
  function visit(node: BreedingNode) { node.data?.species.forEach(row => result.set(row.id, row.name)); node.parents.forEach(visit); }
  if (tree.value) visit(tree.value);
  return result;
});
</script>
<template>
  <section class="breeding-tree" :aria-label="t('育种路线图')">
    <p class="subtle">{{t("每个物种展示已读取路径中基础概率最高的一条，最多四代。条件决定路径是否可用；完整备选路径见杂交列表。")}}</p>
    <p v-if="error" role="alert">{{ error }} <button type="button" @click="load">{{t("重试")}}</button></p>
    <p v-else-if="loading" role="status">{{t("正在读取亲本路线…")}}</p>
    <ul v-else-if="tree"><BreedingTreeNode :node="tree" :catalog="catalog" :animate="animate" :names="names" @select="id => emit('select', id)" /></ul>
  </section>
</template>
