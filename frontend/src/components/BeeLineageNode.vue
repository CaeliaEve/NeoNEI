<script setup lang="ts">
import {t} from "../i18n/index.ts";
import type {BeeTreeNode} from '../catalog/bee-tree.ts';
import type {BeeTreeSpecies} from '@neonei/catalog/source';
import type {Catalog,Records} from '../catalog/client.ts';
import {chance} from '../catalog/format.ts';
import GameText from './GameText.vue';
import ItemLink from './ItemLink.vue';
defineProps<{node:BeeTreeNode;species:Map<string,BeeTreeSpecies>;records:Records;catalog:Catalog;animate:boolean}>();
const emit=defineEmits<{select:[id:string,direction:'recipes'|'uses']}>();
</script>
<template>
  <li class="bee-lineage-node">
    <div class="bee-node-content">
      <strong><GameText :text="species.get(node.species)?.data.name || node.species" /></strong>
      <ItemLink :target="{kind:'item',id:node.depth===0?species.get(node.species)!.data.princess:species.get(node.species)!.data.drone}" :records="records" :catalog="catalog" :animate="animate" @select="(id,direction)=>emit('select',id,direction)" />
      <template v-if="node.route"><span>{{t("基础概率 {0}", chance(node.route.data.chance))}}</span><small v-if="node.route.data.secret">{{t("原生祖先路线包含隐藏突变")}}</small>
        <ul v-if="node.route.data.conditions.length" class="bee-node-conditions"><li v-for="(condition,i) in node.route.data.conditions" :key="i"><GameText :text="condition" /></li></ul>
      </template>
      <small v-else>{{t("原生列表没有登记亲本路线")}}</small>
      <small v-if="node.repeated">{{t("重复分支 · 原生配置折叠")}}</small><small v-if="node.truncated">{{t("还有祖先分支 · 原生可见深度截断")}}</small>
    </div>
    <ul v-if="node.children.length" class="bee-node-parents"><BeeLineageNode v-for="(child,i) in node.children" :key="i" :node="child" :species="species" :records="records" :catalog="catalog" :animate="animate" @select="(id,direction)=>emit('select',id,direction)" /></ul>
  </li>
</template>
<style scoped>
.bee-lineage-node{list-style:none;min-width:180px;flex:1}.bee-node-content{display:flex;flex-direction:column;gap:.4rem;padding:.75rem;border:1px solid var(--border,#334155);border-radius:.6rem;background:var(--surface,#101b2b);overflow-wrap:anywhere}
.bee-node-parents{display:flex;gap:.75rem;margin:.75rem 0 0;padding:0}.bee-node-conditions{padding-left:1.2rem;white-space:pre-wrap}.bee-node-content small{color:var(--muted,#a4b1c1)}
</style>
