<script setup lang="ts">
import {t} from '../i18n/index.ts';
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import type { FuelPage, FuelSearch } from '../catalog/furnace-fuels.ts';
import { Records } from '../catalog/client.ts';
import { useCatalog } from '../state/catalog.ts';
import { useRequest } from '../state/request.ts';
import { usePreferences } from '../state/preferences.ts';
import { itemLocation } from '../router/workspace.ts';
import ItemLink from '../components/ItemLink.vue';
import Pager from '../components/Pager.vue';

const route = useRoute(), router = useRouter();
const { catalog, opening, error: openError, open } = useCatalog(computed(() => typeof route.query.catalog === 'string' ? route.query.catalog : ''));
const { preferences } = usePreferences();
const field = (key: string) => typeof route.query[key] === 'string' ? route.query[key] as string : '';
const search = computed<FuelSearch>(() => ({ query: field('query'), item: field('item'),
  offset: /^(0|[1-9][0-9]*)$/.test(field('offset')) ? Number(field('offset')) : 0, limit: 12 }));
const query = ref(search.value.query), expanded = ref(new Set<string>()), candidateOffsets = ref(new Map<string, number>());
const { value: page, error, loading, run, clear } = useRequest<FuelPage>();
const records = computed(() => page.value ? new Records(page.value.related) : null);
function load() { const session = catalog.value; if (session) void run(signal => session.furnaceFuels(search.value, signal)); }
watch([catalog, search], () => { clear(); expanded.value.clear(); candidateOffsets.value.clear(); query.value = search.value.query; load(); }, { immediate: true });
function update(patch: Record<string, string | number | undefined>) {
  void router.push({ name: 'furnace-fuels', query: { ...route.query, offset: undefined, ...patch } });
}
function select(id: string, direction: 'recipes' | 'uses') {
  void router.push(itemLocation(id, route.query, direction === 'uses' ? 'usedIn' : 'producedBy'));
}
function toggle(id: string) { if (expanded.value.has(id)) expanded.value.delete(id); else expanded.value.add(id); }
function candidatePage(id: string) { return candidateOffsets.value.get(id) ?? 0; }
type FuelRule = NonNullable<FuelPage['rows'][number]['data']['candidates'][number]['containerRule']>;
function branches(rule: FuelRule) {
  return rule.kind === 'railcraftFirestone'
    ? [{ label: t('正常分支'), returned: rule.normalReturn }, { label: t('退化分支'), returned: rule.degradedReturn }]
    : [{ label: t('返还水晶'), returned: rule.returned }];
}
</script>

<template>
  <section v-if="opening" class="state-panel" role="status">{{t("正在读取燃料资料…")}}</section>
  <section v-else-if="openError" class="state-panel error" role="alert">{{ openError }} <button @click="open()">{{t("重试")}}</button></section>
  <main v-else-if="catalog" class="catalog-page panel fuels-page">
    <h1>{{t("熔炉燃料")}}</h1>
    <p>{{t("这里列出 NEI 燃料表中的原生样本。时长保留该样本已有的观测值；随机燃料、物品状态或游戏条件变化时，实际燃烧值可能不同。烧制产物由另一条熔炉配方决定，燃料本身没有固定的烧制产出。")}}</p>
    <form class="fuel-search" @submit.prevent="update({query:query.trim()||undefined})">
      <input v-model="query" type="search" :aria-label="t('查找熔炉燃料')" :placeholder="t('物品名称或注册名')" /><button>{{t("搜索")}}</button>
      <button type="button" @click="update({query:undefined,item:undefined})">{{t("清空筛选")}}</button>
    </form>
    <p v-if="loading" role="status">{{t("正在读取原生燃料条目…")}}</p>
    <p v-else-if="error" class="inline-error" role="alert">{{ error }} <button @click="load">{{t("重试")}}</button></p>
    <p v-else-if="page && !page.definition">{{t("当前数据集未包含熔炉燃料资料。")}}</p>
    <template v-else-if="page && page.definition && records">
      <p class="fuel-policy">{{t("每次开始燃烧消耗 1 个燃料。仅在该燃料堆耗尽时调用原生容器返还规则；模板样本的数量与实际每次消耗分开显示。")}}</p>
      <p>{{t("原生条目 {0} 个 · 当前筛选 {1} 个。保留原生顺序和重复条目。", page.definition.data.fuels, page.total)}}</p>
      <article v-for="row in page.rows" :key="row.id" class="fuel-entry" :data-order="row.order">
        <h2>{{t("燃料条目 {0}", row.order)}}</h2>
        <dl><dt>{{t("样本燃烧时长")}}</dt><dd class="burn-ticks">{{t("{0} ticks（20 TPS 下 {1} 秒）", row.data.burnTicks, row.data.burnTicks / 20)}}</dd>
          <dt>{{t("烧制等效值")}}</dt><dd>{{t("{0} 次标准烧制（按 200 ticks / 次换算）", row.data.burnTicks / page.definition.data.referenceSmeltTicks)}}</dd></dl>
        <p class="fuel-equivalent-note">{{t("换算值用于比较燃料时长，不保证实际能产出该数量的物品。")}}</p>
        <button v-if="row.data.candidates.length > 1" type="button" :aria-expanded="expanded.has(row.id)" @click="toggle(row.id)">
          {{ expanded.has(row.id) ? t("收起原生样本") : t("查看全部 {0} 个原生样本", row.data.candidates.length) }}
        </button>
        <div v-for="(candidate,index) in row.data.candidates.slice(expanded.has(row.id) ? candidatePage(row.id) : 0, expanded.has(row.id) ? candidatePage(row.id)+24 : 1)" :key="index" class="fuel-candidate">
          <ItemLink :target="{kind:'item',id:candidate.item}" :records="records" :catalog="catalog" :animate="preferences.animate" @select="select" />
          <span>{{t("模板样本数量 {0} · 每次消耗 1", candidate.templateAmount)}}</span>
          <div v-if="candidate.container" class="fuel-container">
            <span>{{t("燃料堆耗尽时返还")}}</span>
            <ItemLink :target="{kind:'item',id:candidate.container.item,amount:candidate.container.amount}" :records="records" :catalog="catalog" :animate="preferences.animate" @select="select" />
          </div>
          <div v-else-if="candidate.containerRule" class="fuel-dynamic-container">
            <p v-if="candidate.containerRule.kind==='railcraftFirestone'">{{t("燃料堆耗尽时按损耗比例决定是否退化。本样本的退化判断为：0～1 随机值小于 {0}。 正常分支增加 1 点损耗；超过耐久上限才消失，带有不可破坏标记时不增加损耗。 {1}", candidate.containerRule.degradationThreshold, candidate.containerRule.stage==='refined' ? t("退化后变为耗尽的破裂火石，再增加 1 点损耗，仅保留自定义名称。") : t("退化后变为原始火石。"))}}
            </p>
            <p v-else>{{t("燃料堆耗尽时尝试从绑定玩家的生命网络扣除 {0} LP，使用服务端主世界的网络。 网络缺失时按原生规则创建；未绑定、服务端不可用或资源不足时不扣除。 无论扣除是否成功，容器规则都返还原状态水晶；这不保证燃料可以开始燃烧。", candidate.containerRule.energyUsed)}}</p>
            <div v-for="branch in branches(candidate.containerRule)" :key="branch.label" class="fuel-container">
              <span>{{ branch.label }}</span>
              <ItemLink v-if="branch.returned" :target="{kind:'item',id:branch.returned.item,amount:branch.returned.amount}" :records="records" :catalog="catalog" :animate="preferences.animate" @select="select" />
              <span v-else>{{t("不返还物品")}}</span>
            </div>
          </div>
          <span v-else class="fuel-no-container">{{t("燃料堆耗尽时无容器返还")}}</span>
        </div>
        <Pager v-if="expanded.has(row.id)" :total="row.data.candidates.length" :offset="candidatePage(row.id)" :limit="24" :label="t('原生燃料样本')" @change="candidateOffsets.set(row.id,$event)" />
      </article>
      <p v-if="!page.rows.length">{{t("没有符合筛选条件的燃料。")}}</p>
      <Pager :total="page.total" :offset="page.offset" :limit="page.limit" :busy="loading" :label="t('熔炉燃料')" @change="update({offset:$event})" />
    </template>
  </main>
</template>

<style scoped>
.fuels-page{margin:1rem;max-width:1100px;width:auto;min-height:0;padding:1.2rem}.fuels-page p{line-height:1.65;overflow-wrap:anywhere}.fuel-search{display:flex;flex-wrap:wrap;gap:.5rem;margin:1rem 0}.fuel-search input{min-width:180px;flex:1}.fuel-entry{padding:1rem;margin-top:1rem;border:1px solid var(--border,#334155);border-radius:.6rem;background:var(--surface,#101b2b)}.fuel-entry h2{font-size:1.1rem}.fuel-entry dl{display:grid;grid-template-columns:minmax(7em,auto) 1fr;gap:.5rem 1rem}.fuel-entry dd{margin:0;overflow-wrap:anywhere}.fuel-candidate{display:flex;align-items:center;gap:.75rem;flex-wrap:wrap;padding:.5rem 0}.fuel-container{display:flex;align-items:center;gap:.5rem}.fuel-no-container,.fuel-equivalent-note{color:var(--muted,#a3b3c8);font-size:.9rem}
</style>
