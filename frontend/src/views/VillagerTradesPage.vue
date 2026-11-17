<script setup lang="ts">
import {t} from '../i18n/index.ts';
import { computed, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useCatalog } from '../state/catalog.ts';
import { useRequest } from '../state/request.ts';
import { Records } from '../catalog/client.ts';
import type { VillagerPage, VillagerSearch } from '../catalog/villager-trades.ts';
import { itemLocation } from '../router/workspace.ts';
import ItemLink from '../components/ItemLink.vue';
import Pager from '../components/Pager.vue';
import GameText from '../components/GameText.vue';

const route = useRoute(), router = useRouter();
const param = (key: string) => typeof route.query[key] === 'string' ? route.query[key] as string : '';
const snapshot = computed(() => param('catalog'));
const { catalog, opening, error: openError, open } = useCatalog(snapshot);
const { value: page, error, loading, run, clear } = useRequest<VillagerPage>();
const options = computed<VillagerSearch>(() => ({ domain: param('domain'), profession: param('profession'), item: param('item'),
  direction: (param('direction') || 'all') as VillagerSearch['direction'], offset: Number(param('offset') || 0), limit: 20 }));
const records = computed(() => page.value ? new Records(page.value.related) : null);
function load() { const session = catalog.value; if (session) void run(signal => session.villagerTrades(options.value, signal)); }
watch([catalog, options], () => { clear(); load(); }, { immediate: true });
function profession(id: number) { return page.value?.professions.find(row => row.data.profession === id)?.data.name ?? String(id); }
function filter(value: string) { void router.push({ query: { ...route.query, profession: value || undefined, offset: undefined } }); }
function move(offset: number) { void router.push({ query: { ...route.query, offset: String(offset) } }); }
function select(id: string, direction: 'recipes' | 'uses') { void router.push(itemLocation(id, route.query, direction === 'uses' ? 'usedIn' : 'producedBy')); }
</script>

<template>
  <section v-if="opening" class="state-panel" role="status">{{t("正在读取村民交易…")}}</section>
  <section v-else-if="openError" class="state-panel error" role="alert">{{ openError }} <button @click="open()">{{t("重试")}}</button></section>
  <main v-else-if="catalog" class="panel trades-page">
    <header><h1>{{t("村民交易")}}</h1><p>{{t("按职业查看每笔兑换所需的物品、数量与附魔规则。")}}</p></header>
    <label>{{t("职业")}} <select :value="options.profession" @change="filter(($event.target as HTMLSelectElement).value)">
        <option value="">{{t("全部职业")}}</option>
        <option v-for="row in page?.professions" :key="row.id" :value="String(row.data.profession)">{{ row.data.name }}</option>
      </select>
    </label>
    <p v-if="options.item">{{t("已按物品筛选。")}}<RouterLink :to="{ query: { ...route.query, item: undefined, direction: undefined, offset: undefined } }">{{t("清除物品筛选")}}</RouterLink></p>
    <p v-if="loading" class="state-panel" role="status">{{t("正在读取交易…")}}</p>
    <p v-else-if="error" class="state-panel error" role="alert">{{ error }} <button @click="load">{{t("重试")}}</button></p>
    <template v-else-if="page && records">
      <p v-if="!page.domain" class="state-panel">{{t("当前数据集未包含村民交易。")}}</p>
      <p v-else-if="!page.total" class="state-panel">{{t("没有符合筛选条件的交易。")}}</p>
      <div class="offers">
        <article v-for="row in page.rows" :key="row.id" class="offer">
          <h2><GameText :text="profession(row.data.profession)" /> · {{ row.data.offer + 1 }}</h2>
          <div class="exchange">
            <div class="trade-items">
              <div v-for="(input, index) in row.data.inputs" :key="index">
                <ItemLink :target="{ kind: 'item', id: input.item }" :amount-label="input.sizes.join(' / ')" :records="records" :catalog="catalog" @select="select" />
                <small v-if="input.enchantmentPower !== null">{{t("随机附魔等级 {0}", input.enchantmentPower)}}</small>
              </div>
            </div>
            <span class="exchange-arrow" :aria-label="t('兑换为')">→</span>
            <div class="trade-items">
              <ItemLink :target="{ kind: 'item', id: row.data.output.item }" :amount-label="row.data.output.sizes.join(' / ')" :records="records" :catalog="catalog" @select="select" />
              <small v-if="row.data.output.enchantmentPower !== null">{{t("随机附魔等级 {0}", row.data.output.enchantmentPower)}}</small>
            </div>
          </div>
          <p v-if="[...row.data.inputs, row.data.output].some(item => item.sizes.some(size => size < 0))" class="native-count-note">{{t("此交易包含原生记录的负数量，按原值展示；这不是可执行的物品消耗规则。")}}</p>
          <details><summary>{{t("交易出现与数量说明")}}</summary>
            <p>{{t("原生记录频率：{0}。该值用于描述交易列表的生成记录，不是兑换成功率；相同交易的记录可能累加。", row.data.nativeFrequency)}}</p>
            <p>{{t("以“/”分隔的数量是可能值，不代表同时支付；原生资料未提供各数量的概率或联合分布。")}}</p>
          </details>
        </article>
      </div>
      <Pager :total="page.total" :offset="options.offset" :limit="options.limit" :busy="loading" @change="move" />
    </template>
  </main>
</template>

<style scoped>
.trades-page{--panel:#101722;--border:#34485b;--muted:#9eafc3;color:#dce8f6;padding:20px;margin:16px auto;max-width:1100px}.trades-page header{margin-bottom:16px}.trades-page h1{font-size:20px;margin-bottom:8px}.trades-page select{margin-left:8px;padding:6px;background:var(--panel);color:inherit;border:1px solid var(--border);border-radius:4px}.offers{display:grid;gap:14px;margin:16px 0}.offer{padding:14px;background:var(--panel);border:1px solid var(--border);border-radius:6px}.offer h2{font-size:14px;margin-bottom:12px}.exchange{display:flex;align-items:center;gap:20px;flex-wrap:wrap}.trade-items{display:flex;gap:12px;flex-wrap:wrap;align-items:center;min-width:0}.trade-items small{display:block;color:var(--muted)}.trade-items :deep(.item-link){display:flex;align-items:center;gap:8px;padding:8px;color:inherit;border:1px solid var(--border);border-radius:4px;text-align:left;cursor:pointer}.trade-items :deep(.item-caption small){display:block;margin-top:3px;color:var(--muted)}.exchange-arrow{font-size:24px}details{margin-top:12px;font-size:12px;color:var(--muted)}details p{margin-top:8px}summary{cursor:pointer}.trades-page :deep(.pager){display:flex;justify-content:space-between;align-items:center;gap:12px}.trades-page :deep(.pager button){padding:4px 10px;color:inherit;border:1px solid var(--border);border-radius:4px;margin:0 6px}.trades-page :deep(.pager button:disabled){opacity:.4}
</style>
