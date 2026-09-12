<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Records, required, type MaterialDetail, type CircuitDetail } from '../catalog/client.ts';
import { amount } from '../catalog/format.ts';
import { useRequest } from '../state/request.ts';
import { useCatalog } from '../state/catalog.ts';
import { usePreferences } from '../state/preferences.ts';
import SiteHeader from '../components/SiteHeader.vue';
import GameText from '../components/GameText.vue';
import TopicBrowser from '../components/TopicBrowser.vue';
import ItemLink from '../components/ItemLink.vue';
import Pager from '../components/Pager.vue';

const route = useRoute(), router = useRouter();
const { preferences } = usePreferences();
const kind = computed(() => route.name === 'materials' || route.name === 'material' ? 'material' : 'circuit');
const snapshot = computed(() => typeof route.query.catalog === 'string' ? route.query.catalog : '');
const item = computed(() => typeof route.query.item === 'string' ? route.query.item : '');
const id = computed(() => typeof route.params.id === 'string' ? route.params.id : '');
const { catalog, opening, error: openError, offline, open } = useCatalog(snapshot);
const partQuery = ref(''), partOffset = ref(0);
const { value: detail, error: detailError, loading: reading, run: read, clear: clearDetail } = useRequest<MaterialDetail | CircuitDetail>();
const material = computed(() => detail.value && 'material' in detail.value ? detail.value : null);
const circuit = computed(() => detail.value && 'circuit' in detail.value ? detail.value : null);
const records = computed(() => detail.value ? new Records(detail.value.related) : null);
const components = computed(() => new Map(material.value?.components.map(row => [row.id, row]) ?? []));
const parts = computed(() => {
  const search = partQuery.value.trim().toLocaleLowerCase('en-US');
  return material.value?.material.parts.filter(part => !search || [part.key,
    records.value?.text(records.value.substance(part.target.kind, part.target.id).name)].join(' ').toLocaleLowerCase('en-US').includes(search)) ?? [];
});
const shownParts = computed(() => parts.value.slice(partOffset.value, partOffset.value + 48));
watch([catalog, kind, id], () => {
  clearDetail(); partQuery.value = ''; partOffset.value = 0;
  const session = catalog.value;
  if (session && id.value) void read(signal => kind.value === 'material' ? session.material(id.value, signal) : session.circuit(id.value, signal));
}, { immediate: true });
watch(partQuery, () => { partOffset.value = 0; });

function select(id: string, direction: 'recipes' | 'uses'): void {
  if (catalog.value) void router.push({ name: 'entry', params: { itemId: id }, query: { catalog: catalog.value.manifest.id, direction } });
}
function show(id: string): void {
  if (catalog.value) void router.push({ name: kind.value, params: { id }, query: { catalog: catalog.value.manifest.id, ...(item.value ? { item: item.value } : {}) } });
}
function all(): void {
  void router.push({ name: kind.value === 'material' ? 'materials' : 'circuits', query: catalog.value ? { catalog: catalog.value.manifest.id } : {} });
}
</script>

<template>
  <div class="catalog-page">
    <SiteHeader :catalog="catalog?.manifest.id" :offline="offline" />
    <section v-if="opening" class="state-panel" role="status"><h1>正在读取资料</h1></section>
    <section v-else-if="openError" class="state-panel error" role="alert"><h1>数据集无法加载</h1><p>{{ openError }}</p><button type="button" @click="open()">重试</button></section>
    <template v-else-if="catalog">
      <aside v-if="catalog.manifest.scope === 'selection'" class="notice">当前为选定范围的采集结果。</aside>
      <div class="industry-workspace">
        <TopicBrowser :catalog="catalog" :kind="kind" :selected="id" :item="item" @select="show" @all="all" />

        <section class="panel industry-detail" :aria-busy="reading">
          <div v-if="reading" class="state-panel" role="status">正在读取详细资料…</div>
          <div v-else-if="detailError" class="state-panel error" role="alert"><h2>资料无法加载</h2><p>{{ detailError }}</p><button type="button" @click="open()">重试</button></div>
          <template v-else-if="material && records">
            <header class="panel-heading"><div><span class="eyebrow">MATERIAL</span><h2><GameText :text="records.text(material.material.name)" /></h2>
              <p class="registry">{{ material.material.source.key }}</p></div>
              <span class="material-color" :style="{ backgroundColor: '#' + material.material.color.toString(16).padStart(8, '0').slice(2) }" aria-label="材料颜色" /></header>
            <div class="industry-body">
              <p v-if="material.material.formula" class="material-formula">{{ material.material.formula }}</p>
              <section v-if="material.material.components.length" class="material-components" aria-label="材料组成">
                <h3>组成 <small>相对份数</small></h3><div>
                  <RouterLink v-for="component in material.material.components" :key="component.material"
                    :to="{ name: 'material', params: { id: component.material }, query: { catalog: catalog.manifest.id } }">
                    <GameText :text="required(components, component.material).name" /><strong>{{ amount(component.amount) }}</strong></RouterLink>
                </div>
              </section>
              <div class="parts-heading"><h3>物品与流体形态</h3><input v-model="partQuery" type="search" aria-label="筛选材料形态" placeholder="筛选形态…" maxlength="256" /></div>
              <div class="material-parts">
                <article v-for="part in shownParts" :key="part.target.kind + ':' + part.key">
                  <ItemLink :target="part.target" :catalog="catalog" :records="records" :animate="preferences.animate" @select="select" />
                  <small v-if="part.content">{{ amount(part.content.numerator) }}<template v-if="part.content.denominator !== '1'">/{{ amount(part.content.denominator) }}</template> 材料单位 / 件</small>
                  <small v-else-if="part.target.kind === 'fluid'">流体</small>
                </article>
              </div>
              <p v-if="!parts.length" class="subtle">{{ partQuery ? '没有匹配的形态。' : '此材料定义没有登记物品或流体形态。' }}</p>
              <Pager v-if="parts.length > 48" :total="parts.length" :offset="partOffset" :limit="48" :busy="false" label="形态" @change="partOffset = $event" />
            </div>
          </template>
          <template v-else-if="circuit && records">
            <header class="panel-heading"><div><span class="eyebrow">{{ circuit.circuit.kind === 'line' ? 'CIRCUIT FAMILY' : 'COMPONENTS' }}</span>
              <h2><GameText :text="records.text(circuit.circuit.name)" /></h2></div></header>
            <div class="industry-body">
              <section v-if="circuit.circuit.boards.length" class="circuit-boards"><h3>电路板</h3><div>
                <ItemLink v-for="board in circuit.circuit.boards" :key="board" :target="{ kind: 'item', id: board }" :catalog="catalog" :records="records" :animate="preferences.animate" @select="select" />
              </div></section>
              <h3>{{ circuit.circuit.kind === 'line' ? '电压等级' : '配件系列' }}</h3>
              <p class="subtle">点击物品查看制造配方；右键查看用途。</p>
              <div class="circuit-steps">
                <article v-for="step in circuit.circuit.steps" :key="step.item">
                  <div v-if="step.tier" class="tier"><GameText :text="records.text(step.tier.name)" /><small>{{ amount(step.tier.voltage) }} EU</small></div>
                  <ItemLink :target="{ kind: 'item', id: step.item }" :catalog="catalog" :records="records" :animate="preferences.animate" @select="select" />
                </article>
              </div>
            </div>
          </template>
          <div v-else class="recipe-welcome"><span class="recipe-glyph" aria-hidden="true">{{ kind === 'material' ? '◇' : '⌘' }}</span><h2>{{ kind === 'material' ? '从材料追溯部件' : '查看电路的发展系列' }}</h2>
            <p>{{ kind === 'material' ? '选择材料，查看成分、部件和流体形态。' : '选择系列，查看电路板、配件与电压等级。' }}</p></div>
        </section>
      </div>
    </template>
    <footer class="site-footer"><span>NeoNEI</span><span>从游戏中采集，在材料间探索。</span></footer>
  </div>
</template>
