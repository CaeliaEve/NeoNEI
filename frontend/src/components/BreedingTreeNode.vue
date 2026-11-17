<script setup lang="ts">
import {t} from "../i18n/index.ts";
import { computed } from 'vue';
import type { BreedingNode } from '../catalog/breeding-tree.ts';
import { Records, type Catalog } from '../catalog/client.ts';
import { chance } from '../catalog/format.ts';
import GameText from './GameText.vue';
import Icon from './Icon.vue';
const props = defineProps<{ node: BreedingNode; catalog: Catalog; animate: boolean; names: Map<string, string> }>();
const emit = defineEmits<{ select: [id: string] }>();
const records = computed(() => props.node.data ? new Records(props.node.data.related) : null);
const topic = computed(() => props.node.data?.species.find(row => row.id === props.node.id));
</script>
<template>
  <li class="breeding-node">
    <button type="button" class="breeding-species" @click="emit('select', node.id)">
      <Icon v-if="topic?.icon && records" :atlas="catalog.atlas" :texture="records.picture(topic)" :width="24" :height="24" :animate="animate" :label="topic.name" />
      <GameText :text="topic?.name || names.get(node.id) || node.id" />
    </button>
    <p v-if="node.mutation">{{t("基础概率")}} {{ chance(node.mutation.chance) }}<span v-if="node.mutation.secret">{{t("· 隐藏突变")}}</span></p>
    <ul v-if="node.mutation?.conditions.length && records" class="breeding-conditions"><li v-for="condition in node.mutation.conditions" :key="condition"><GameText :text="records.text(condition)" /></li></ul>
    <p v-if="node.partial" class="subtle">{{t("仅比较已读取的前 50 条路径。")}}</p>
    <p v-if="node.stop" class="subtle">{{ node.stop === 'cycle' ? t("循环关系，停止展开") : t("已达到四代展示上限") }}</p>
    <p v-else-if="!node.mutation" class="subtle">{{t("未登记亲本路径。")}}</p>
    <ul v-if="node.parents.length" class="breeding-parents"><BreedingTreeNode v-for="(parent, index) in node.parents" :key="index" :node="parent" :catalog="catalog" :animate="animate" :names="names" @select="id => emit('select', id)" /></ul>
  </li>
</template>
<style scoped>
.breeding-node { list-style: none; border-left: 1px solid #34485b; padding: 8px 0 8px 14px; font-size: 12px; }
.breeding-species { display: flex; align-items: center; gap: 8px; color: #cfe4f8; cursor: pointer; }
.breeding-parents { margin-left: 10px; } .breeding-conditions { color: #a0b0c2; padding-left: 16px; }
</style>
