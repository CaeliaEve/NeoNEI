<script setup lang="ts">
import {t} from '../i18n/index.ts';
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useCatalog } from '../state/catalog.ts';
import { useRequest } from '../state/request.ts';
import { Records } from '../catalog/client.ts';
import type { GeneticReferencePage } from '../catalog/references.ts';
import ItemLink from '../components/ItemLink.vue';
import Pager from '../components/Pager.vue';
import GameText from '../components/GameText.vue';
const route = useRoute(), router = useRouter();
const snapshot = computed(() => typeof route.query.catalog === 'string' ? route.query.catalog : '');
const { catalog, opening, error: openError, offline, open } = useCatalog(snapshot);
const { value: page, error, loading, run, clear } = useRequest<GeneticReferencePage>();
const root = ref(''), query = ref(''), offset = ref(0);
const records = computed(() => page.value ? new Records(page.value.related) : null);
const roots = computed(() => page.value?.roots.flatMap(row => row.data.kind === 'root' ? [row.data.definition] : []) ?? []);
const genes = computed(() => page.value?.rows.flatMap(row => row.data.kind === 'gene' ? [row.data.gene] : []) ?? []);
const counts = computed(() => page.value?.definition?.data.kind === 'definition' ? page.value.definition.data.counts : null);
const containers = computed(() => page.value?.definition?.data.kind === 'definition' ? page.value.definition.data.containers : []);
const explanation = computed(() => page.value?.definition?.data.kind === 'definition' ? page.value.definition.data.explanation.text : '');
const labels: Record<string, string> = { rootBees: '蜜蜂', rootTrees: '树木', rootButterflies: '蝴蝶', rootFlowers: '花卉' };
function chromosome(uid: string, ordinal: number): string { const row = page.value?.chromosomes.find(row => row.data.kind === 'chromosome' && row.data.root === uid && row.data.chromosome.ordinal === ordinal); return row?.data.kind === 'chromosome' ? row.data.chromosome.name : String(ordinal); }
function load(): void { const session = catalog.value; if (session) void run(signal => session.references({ domain: '', root: root.value, query: query.value, offset: offset.value, limit: 20 }, signal)); }
watch([catalog, root, query], () => { const paged = offset.value !== 0; offset.value = 0; clear(); if (!paged) load(); }, { immediate: true });
watch(offset, load);
function select(id: string, direction: 'recipes' | 'uses'): void { if (catalog.value) void router.push({ name: 'entry', params: { itemId: id }, query: { ...(route.query.offline === '1' ? { offline: '1' } : {}), catalog: catalog.value.manifest.id, direction, ...(offline.value ? { offline: '1' } : {}) } }); }
</script>
<template>
  <div class="catalog-page">
    <section v-if="opening" class="state-panel" role="status">{{t("正在读取基因数据库…")}}</section>
    <section v-else-if="openError" class="state-panel error" role="alert"><h1>{{t("数据集无法加载")}}</h1><p>{{ openError }}</p><button @click="open()">{{t("重试")}}</button></section>
    <main v-else-if="catalog" class="panel database-panel">
      <header class="panel-heading"><div><h1><GameText v-if="records && page?.related.categories[0]" :text="records.text(page.related.categories[0].name)" /><template v-else>{{t("基因数据库")}}</template></h1><p>{{t("查看原生基因、血清和基因组的对应关系。")}}</p></div>
        <span v-if="counts">{{t("{0} 个基因 · {1} 个物种领域", counts.genes, counts.roots)}}</span></header>
      <p v-if="explanation" class="subtle"><GameText :text="explanation" /></p>
      <p class="subtle">{{t("完成序列分析后，基因会登记到当前世界玩家的基因记录中。血清与基因组需要耗尽充能才能替换基因；基因组保留相同物种领域，替换相同染色体或添加新的染色体。")}}</p>
      <div class="database-filters"><label>{{t("物种领域")}}<select v-model="root"><option value="">{{t("全部")}}</option><option v-for="entry in roots" :key="entry.root" :value="entry.root">{{ labels[entry.root] ? t(labels[entry.root]) : entry.root }}</option></select></label>
        <label>{{t("查找基因")}}<input v-model="query" type="search" :placeholder="t('输入基因 UID')" maxlength="256" /></label></div>
      <div v-if="loading" class="state-panel" role="status">{{t("正在读取基因…")}}</div>
      <div v-else-if="error" class="state-panel error" role="alert">{{ error }} <button @click="load()">{{t("重试")}}</button></div>
      <template v-else-if="page && records">
        <p v-if="!page.definition" class="state-panel">{{t("当前数据集中没有采集基因数据库。")}}</p>
        <div v-else class="database-table"><table><thead><tr><th>{{t("领域 / 染色体")}}</th><th>{{t("基因")}}</th><th>{{t("血清")}}</th><th>{{t("基因组")}}</th><th>{{t("序列")}}</th></tr></thead>
          <tbody><tr v-for="gene in genes" :key="gene.root + ':' + gene.chromosome + ':' + gene.allele"><td>{{ labels[gene.root] ? t(labels[gene.root]) : gene.root }}<small>{{ chromosome(gene.root, gene.chromosome) }}</small></td><td class="registry">{{ gene.allele }}</td>
            <td><ItemLink :target="{kind:'item',id:gene.serum}" :records="records" :catalog="catalog" compact @select="select" /></td>
            <td><ItemLink :target="{kind:'item',id:gene.genome}" :records="records" :catalog="catalog" compact @select="select" /></td>
            <td><ItemLink :target="{kind:'item',id:gene.sequence}" :records="records" :catalog="catalog" compact @select="select" /></td></tr></tbody></table></div>
        <Pager :total="page.total" :offset="offset" :limit="20" :busy="loading" @change="offset = $event" />
        <section v-if="containers.length"><h2>{{t("空容器")}}</h2><ItemLink v-for="container in containers" :key="container.empty" :target="{kind:'item',id:container.empty}" :records="records" :catalog="catalog" @select="select" /></section>
      </template>
    </main>
  </div>
</template>
<style scoped>
.database-panel{margin:20px auto;padding:20px;max-width:1200px}.database-filters{display:flex;gap:20px;margin:20px 0;flex-wrap:wrap}.database-filters label{display:grid;gap:6px}.database-filters input,.database-filters select{padding:8px;background:var(--panel);color:inherit;border:1px solid var(--border);border-radius:6px}.database-table{overflow:auto}table{width:100%;border-collapse:collapse;text-align:left}th,td{padding:12px;border-bottom:1px solid var(--border)}td small{display:block;color:var(--muted)}.registry{overflow-wrap:anywhere}h2{margin-top:24px}
</style>
