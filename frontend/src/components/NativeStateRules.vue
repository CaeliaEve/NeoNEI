<script setup lang="ts">
import {computed} from 'vue';
import type {Recipe} from '@elysium/contracts';
import type {Catalog,Records} from '../catalog/client.ts';
import {language} from '../i18n/index.ts';
import {nativeStateRules} from '../catalog/native-state-rules.ts';
import ItemLink from './ItemLink.vue';
const props=defineProps<{recipe:Recipe;catalog:Catalog;records:Records;animate:boolean}>();
const emit=defineEmits<{select:[id:string,direction:'recipes'|'uses']}>();
const rules=computed(()=>nativeStateRules(props.recipe.process,language.value));
const label=(zh:string,en:string)=>language.value==='en-US'?en:zh;
</script>

<template>
  <section v-if="rules" class="native-state-rules recipe-extra" :aria-label="rules.title">
    <h4>{{rules.title}}</h4>
    <dl><template v-for="(fact,index) in rules.facts" :key="index"><dt>{{fact.label}}</dt><dd>{{fact.value}}</dd></template></dl>
    <p v-for="paragraph in rules.paragraphs" :key="paragraph">{{paragraph}}</p>
    <details v-if="rules.structure"><summary>{{rules.structure.label}}</summary>
      <table><thead><tr><th v-for="column in rules.structure.columns" :key="column">{{column}}</th></tr></thead>
        <tbody><tr v-for="(stone,index) in rules.structure.stones" :key="index"><td>{{stone.x}}</td><td>{{stone.y}}</td><td>{{stone.z}}</td><td>{{stone.stone}}</td></tr></tbody></table>
    </details>
    <details v-for="(pool,index) in rules.pools" :key="index"><summary>{{pool.label}} ({{pool.entries.length}})</summary>
      <ul><li v-for="(entry,entryIndex) in pool.entries" :key="entryIndex">
        <ItemLink v-if="entry.id" :target="{kind:'item',id:entry.id}" :catalog="catalog" :records="records" :animate="animate" @select="(id,direction)=>emit('select',id,direction)" />
        <span v-else>{{label('原生空项','Native empty entry')}}</span>
        <span>{{label('权重','Weight')}} {{entry.weight}}</span>
        <span v-if="entry.required.length">{{label('所需试剂','Required reagents')}}: {{entry.required.join(', ')}}</span>
      </li></ul>
    </details>
  </section>
</template>

<style scoped>
.native-state-rules {overflow-wrap:anywhere;border-top:1px solid var(--line,#223041);}
h4 {margin:4px 0 12px;}dl {display:grid;grid-template-columns:minmax(130px,1fr) minmax(80px,2fr);gap:5px 14px;margin:0;}
dt {color:var(--muted,#a0b0c2);}dd {margin:0;font-variant-numeric:tabular-nums;}p {line-height:1.6;}summary {cursor:pointer;padding:6px 0;}
table {border-collapse:collapse;}td,th {padding:4px 10px;text-align:right;}li {display:flex;align-items:center;gap:12px;flex-wrap:wrap;}
</style>
