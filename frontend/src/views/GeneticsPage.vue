<script setup lang="ts">
import {t} from '../i18n/index.ts';
import { computed, defineAsyncComponent, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import type { Mutation, Topic, SpeciesKind } from '@elysium/contracts';
import { ApiError, Records, required, type SpeciesDetail, type Mutations, type MutationSearch } from '../catalog/client.ts';
import { chance, plain } from '../catalog/format.ts';
import { useCatalog } from '../state/catalog.ts';
import { useRequest } from '../state/request.ts';
import { usePreferences } from '../state/preferences.ts';
import TopicBrowser from '../components/TopicBrowser.vue';
import GameText from '../components/GameText.vue';
import ItemLink from '../components/ItemLink.vue';
import Icon from '../components/Icon.vue';
import Genes from '../components/Genes.vue';
import Pager from '../components/Pager.vue';

const BreedingTree = defineAsyncComponent(() => import('../components/BreedingTree.vue'));
const route = useRoute(), router = useRouter();
const { preferences } = usePreferences();
const snapshot = computed(() => typeof route.query.catalog === 'string' ? route.query.catalog : '');
const families = { bee: 'bees', tree: 'trees', butterfly: 'butterflies', flower: 'flowers' } as const;
const kind = computed<SpeciesKind>(() => (Object.keys(families) as SpeciesKind[]).find(key => route.name === key || route.name === families[key]) ?? 'bee');
const id = computed(() => typeof route.params.id === 'string' ? route.params.id : '');
const item = computed(() => typeof route.query.item === 'string' ? route.query.item : '');
const { catalog, opening, error: openError, offline, open } = useCatalog(snapshot);
const { value: detail, error: detailError, loading: reading, run: read, clear: clearDetail } = useRequest<SpeciesDetail>();
const { value: mutations, error: mutationError, loading: mutating, run: load, clear: clearMutations } = useRequest<Mutations>();
const records = computed(() => detail.value ? new Records(detail.value.related) : null);
const mutationRecords = computed(() => mutations.value ? new Records(mutations.value.related) : null);
const neighbors = computed(() => new Map(mutations.value?.species.map(row => [row.id, row]) ?? []));
const direction = ref<MutationSearch['direction']>('origins'), offset = ref(0);
const productOffsets = ref({ products: 0, specialties: 0 });
const climate: Record<string, string> = { none: '无', icy: '冰冷', cold: '寒冷', normal: '普通', warm: '温暖', hot: '炎热', hellish: '地狱', arid: '干燥', damp: '潮湿' };
const forms: Record<string, string> = { queen: '蜂后', princess: '公主蜂', drone: '雄蜂', larvae: '幼虫', sapling: '树苗', pollen: '花粉', butterfly: '蝴蝶', serum: '血清', caterpillar: '毛毛虫', flower: '花朵', seed: '种子' };
const soil: Record<string, string> = { acid: '酸性', neutral: '中性', alkaline: '碱性', dry: '干燥', normal: '普通', damp: '湿润' };
const yields = computed(() => kind.value === 'bee' || kind.value === 'tree' ? [{ key: 'products', name: t('产物') }, { key: 'specialties', name: t('特产') }] as const : []);
function label(names: Record<string, string>, key: string): string { return names[key] ? t(names[key]) : key; }

watch([catalog, kind, id], () => {
  clearDetail(); clearMutations(); direction.value = 'origins'; offset.value = 0;
  productOffsets.value = { products: 0, specialties: 0 };
  const session = catalog.value, selected = id.value, family = kind.value;
  if (session && selected) void read(async signal => {
    const result = await session.species(selected, signal);
    if (result.species.kind !== family) throw new ApiError('species_kind', t('链接中的物种分类不匹配'));
    return result;
  });
}, { immediate: true });
watch(direction, () => { offset.value = 0; });
function loadMutations(): void {
  const session = catalog.value, species = detail.value?.species;
  if (session && species) void load(signal => session.mutations(species.id, { direction: direction.value, offset: offset.value, limit: 6 }, signal));
}
watch([catalog, detail, direction, offset], () => { clearMutations(); loadMutations(); });
function participants(mutation: Mutation): Topic[] { return [...mutation.parents, mutation.result].map(id => required(neighbors.value, id)); }
function select(id: string, direction: 'recipes' | 'uses'): void {
  if (catalog.value) void router.push({ name: 'entry', params: { itemId: id }, query: { ...(route.query.offline === '1' ? { offline: '1' } : {}), catalog: catalog.value.manifest.id, direction } });
}
function show(id: string): void {
  if (catalog.value) void router.push({ name: kind.value, params: { id }, query: { ...(route.query.offline === '1' ? { offline: '1' } : {}), catalog: catalog.value.manifest.id, ...(item.value ? { item: item.value } : {}), ...(route.query.view === 'tree' ? { view: 'tree' } : {}) } });
}
function all(): void {
  void router.push({ name: families[kind.value], query: catalog.value ? { ...(route.query.offline === '1' ? { offline: '1' } : {}), catalog: catalog.value.manifest.id } : {} });
}
</script>

<template>
  <div class="catalog-page">

    <section v-if="opening" class="state-panel" role="status"><h1>{{t("正在读取遗传资料")}}</h1></section>
    <section v-else-if="openError" class="state-panel error" role="alert"><h1>{{t("数据集无法加载")}}</h1><p>{{ openError }}</p><button type="button" @click="open()">{{t("重试")}}</button></section>
    <template v-else-if="catalog">
      <aside v-if="catalog.manifest.scope === 'selection'" class="notice">{{t("当前为选定范围的采集结果。")}}</aside>
      <div class="industry-workspace">
        <TopicBrowser :catalog="catalog" :kind="kind" :selected="id" :item="item" @select="show" @all="all" />
        <section class="panel industry-detail genetics-detail" :aria-busy="reading">
          <div v-if="reading" class="state-panel" role="status">{{t("正在读取物种…")}}</div>
          <div v-else-if="detailError" class="state-panel error" role="alert"><h2>{{t("物种无法加载")}}</h2><p>{{ detailError }}</p><button type="button" @click="open()">{{t("重试")}}</button></div>
          <template v-else-if="detail && records">
            <header class="panel-heading"><div><span class="eyebrow">{{t('遗传')}}</span>
              <h2><GameText :text="records.text(detail.species.name)" /></h2><p class="registry">{{ detail.species.source.key }}</p></div>
              <div class="species-badges"><span v-if="detail.species.secret">{{t("隐藏物种")}}</span><span v-if="detail.species.blacklisted">{{t("已列入黑名单")}}</span></div></header>
            <div class="industry-body">
              <p v-if="records.text(detail.species.description)" class="subtle"><GameText :text="records.text(detail.species.description)" /></p>
              <p class="species-attribution"><i>{{ detail.species.binomial }}</i><span>{{ detail.species.authority }}</span></p>
              <div class="species-traits"><span>{{t("温度：{0}", label(climate,detail.species.temperature))}}</span>
                <span>{{t("湿度：{0}", label(climate,detail.species.humidity))}}</span><span>{{ detail.species.dominant ? t("显性物种") : t("隐性物种") }}</span>
                <span v-if="detail.species.nocturnal !== null && detail.species.nocturnal !== undefined">{{t("自然活动：{0}", detail.species.nocturnal ? t("夜间") : t("白天"))}}</span>
                <template v-if="detail.species.flower"><span>{{t("土壤酸碱度：{0}", label(soil,detail.species.flower.acidity))}}</span>
                  <span>{{t("土壤湿度：{0}", label(soil,detail.species.flower.moisture))}}</span></template></div>
              <section :aria-label="t('物种形态')"><h3>{{t("物品形态")}}</h3><div class="species-members">
                <article v-for="member in detail.species.members" :key="member.form"><small>{{ label(forms,member.form) }}</small>
                  <ItemLink :target="{ kind: 'item', id: member.item }" :catalog="catalog" :records="records" :animate="preferences.animate" @select="select" /></article>
              </div></section>
              <p v-if="kind === 'bee'" class="subtle">{{t("产物显示每个生产周期的基础概率；实际产出受基因、蜂箱和养蜂模式影响，特产还要求蜜蜂满足适宜条件。")}}</p>
              <p v-else-if="kind === 'tree'" class="subtle">{{t("这里列出默认果实基因的可能产物，游戏没有为这份列表提供掉落概率。")}}</p>
              <p v-if="detail.species.fruitCompatible === false" class="notice">{{t("此物种与默认模板的果实家族不匹配；列出的可能产物不代表它可以直接结果。")}}</p>
              <section v-for="section in yields" :key="section.key" :aria-label="section.name">
                <h3>{{ section.name }}</h3>
                <p v-if="section.key === 'specialties' && detail.species.jubilance" class="subtle"><strong>{{t("特产条件：")}}</strong><GameText :text="records.text(detail.species.jubilance)" /></p>
                <div class="species-products">
                  <article v-for="(product, index) in detail.species[section.key].slice(productOffsets[section.key], productOffsets[section.key] + 48)" :key="index">
                    <ItemLink :target="{ kind: 'item', id: product.item, amount: product.amount }" :catalog="catalog" :records="records" :animate="preferences.animate" @select="select" />
                    <small>{{ product.chance ? t("基础概率 ") + chance(product.chance) : t("可能产物 · 概率未提供") }}</small>
                  </article>
                </div><p v-if="!detail.species[section.key].length" class="subtle">{{t("未登记{0}。", section.name)}}</p>
                <Pager v-if="detail.species[section.key].length > 48" :total="detail.species[section.key].length" :offset="productOffsets[section.key]" :limit="48" :busy="false" :label="section.name" @change="productOffsets[section.key] = $event" />
              </section>
              <details class="species-genes"><summary>{{t("默认基因")}}</summary>
                <Genes :genes="detail.species.genes" :records="records" :catalog="catalog" :animate="preferences.animate" @select="select" />
              </details>
              <details class="species-genes" :open="route.query.view === 'tree'"><summary>{{t("育种路线图")}}</summary>
                <BreedingTree v-if="route.query.view === 'tree'" :id="detail.species.id" :catalog="catalog" :animate="preferences.animate" @select="show" />
                <button v-else type="button" @click="router.replace({ query: { ...route.query, view: 'tree' } })">{{t("展开四代亲本路线")}}</button>
              </details>
              <section class="mutations" :aria-label="t('杂交路径')">
                <h3>{{t("杂交路径")}}</h3><div class="segmented">
                  <button type="button" :class="{ active: direction === 'origins' }" :aria-pressed="direction === 'origins'" @click="direction = 'origins'">{{t("如何获得 · {0}", detail.origins)}}</button>
                  <button type="button" :class="{ active: direction === 'crosses' }" :aria-pressed="direction === 'crosses'" @click="direction = 'crosses'">{{t("参与杂交 · {0}", detail.crosses)}}</button>
                </div>
                <p class="subtle mutation-note">{{t("突变概率为未修正的基础值。列出的条件为模组说明，不表示当前世界已满足条件。")}}</p>
                <p v-if="mutationError" class="inline-error" role="alert">{{ mutationError }} <button type="button" @click="loadMutations">{{t("重试")}}</button></p>
                <p v-else-if="mutating" role="status" class="subtle">{{t("正在读取杂交路径…")}}</p>
                <template v-else-if="mutations && mutationRecords">
                  <article v-for="mutation in mutations.rows" :key="mutation.id" class="mutation-card">
                    <div class="mutation-cross"><template v-for="(topic, index) in participants(mutation)" :key="index">
                      <span v-if="index" class="cross-symbol" aria-hidden="true">{{ index === 1 ? '×' : '→' }}</span>
                      <RouterLink :to="{ name: topic.kind, params: { id: topic.id }, query: { ...(route.query.offline === '1' ? { offline: '1' } : {}), catalog: catalog.manifest.id } }" :aria-label="plain(topic.name)">
                        <Icon v-if="topic.icon" :atlas="catalog.atlas" :texture="mutationRecords.texture(topic.icon.kind, topic.icon.id)" :width="24" :height="24" :animate="preferences.animate" :label="plain(topic.name)" />
                        <GameText :text="topic.name" /></RouterLink>
                    </template></div>
                    <p class="mutation-rate">{{t("基础概率")}} {{ chance(mutation.chance) }} <span v-if="mutation.secret">{{t("· 隐藏突变")}}</span><span v-if="mutation.occurrence">{{t("· 重复登记 {0}", mutation.occurrence + 1)}}</span></p>
                    <ul v-if="mutation.conditions.length" class="mutation-conditions"><li v-for="(condition, index) in mutation.conditions" :key="index"><GameText :text="mutationRecords.text(condition)" /></li></ul>
                    <details class="species-genes"><summary>{{t("突变结果基因")}}</summary>
                      <Genes :genes="mutation.genes" :records="mutationRecords" :catalog="catalog" :animate="preferences.animate" @select="select" />
                    </details>
                  </article>
                  <p v-if="!mutations.rows.length" class="subtle">{{t("未登记{0}突变路径。", direction === 'origins' ? t("获得该物种的") : t("该物种参与的"))}}</p>
                  <Pager :total="mutations.total" :offset="mutations.offset" :limit="mutations.limit" :busy="mutating" :label="t('杂交路径')" @change="offset = $event" />
                </template>
              </section>
            </div>
          </template>
          <div v-else class="recipe-welcome"><span class="recipe-glyph" aria-hidden="true">❧</span><h2>{{t("探索物种与遗传")}}</h2><p>{{t("选择物种，查看形态、默认基因与亲本后代关系。")}}</p></div>
        </section>
      </div>
    </template>
    <footer class="site-footer"><span>NeoNEI</span><span>{{t("从物种出发，追溯每一次杂交。")}}</span></footer>
  </div>
</template>
