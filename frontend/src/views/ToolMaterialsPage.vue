<script setup lang="ts">
import {t} from '../i18n/index.ts';
import { computed, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useCatalog } from '../state/catalog.ts';
import { useRequest } from '../state/request.ts';
import type { ToolMaterialPage } from '../catalog/tool-materials.ts';
import type { GeneticReferenceRow, ReferenceData } from '@elysium/contracts';

const route = useRoute();
const snapshot = computed(() => typeof route.query.catalog === 'string' ? route.query.catalog : '');
const { catalog, opening, error: openError, offline, open } = useCatalog(snapshot);
const {value:page,error,loading,run,clear} = useRequest<ToolMaterialPage>();
const query = ref('');

function load() {
  const session=catalog.value;
  if(session)void run(signal=>session.toolMaterials({domain:'',query:query.value,offset:0,limit:50},signal));
}
type MaterialRow = GeneticReferenceRow & { data: Extract<ReferenceData, { kind: 'toolMaterial' }> };
const materials = computed<MaterialRow[]>(() => (page.value?.rows.filter((row): row is MaterialRow => row.data.kind === 'toolMaterial') ?? []));
watch(catalog,()=>{clear();load();},{immediate:true});
</script>

<template>
  <div class="catalog-page">
  <section v-if="opening" class="state-panel" role="status">{{t("正在读取工具材料…")}}</section>
  <section v-else-if="openError" class="state-panel error" role="alert"><h1>{{t("数据集无法加载")}}</h1><p>{{ openError }}</p><button @click="open()">{{t("重试")}}</button></section>
  <main v-else-if="catalog" class="panel tool-materials-page">
    <div class="page-heading"><h1>{{t("工具材料")}}</h1><p v-if="page">{{t("{0} 种原生材料", page.total)}}</p></div>
    <form class="search-row" @submit.prevent="load"><input v-model="query" type="search" :placeholder="t('搜索材料名称')" /><button type="submit" :disabled="loading">{{t("搜索")}}</button></form>
    <p v-if="error" class="error">{{ error }}</p>
    <p v-else-if="loading" class="status">{{t("加载中…")}}</p>
    <section v-else class="tool-material-grid" aria-live="polite">
      <article v-for="row in materials" :key="row.id" class="tool-material-card">
        <h2>{{ row.data.material.localizedName || row.data.material.materialName }}</h2>
        <dl><dt>{{t("材料 ID")}}</dt><dd>{{ row.data.material.materialId }}</dd><dt>{{t("耐久")}}</dt><dd>{{ row.data.material.durability }}</dd><dt>{{t("挖掘速度")}}</dt><dd>{{ row.data.material.miningSpeed }}</dd><dt>{{t("攻击")}}</dt><dd>{{ row.data.material.attack }}</dd><dt>{{t("强化")}}</dt><dd>{{ row.data.material.reinforced }}</dd></dl>
        <p class="parts">{{t("部件 {0}", row.data.material.parts)}}</p>
      </article>
    </section>
  </main></div>
</template>
