<script setup lang="ts">
import {t} from '../i18n/index.ts';
import {computed, watch} from 'vue';
import {useRoute, useRouter} from 'vue-router';
import {Records} from '../catalog/client.ts';
import type {InfernalPoolsPage, InfernalSearch, InfernalTierName} from '../catalog/infernal-drops.ts';
import {useCatalog} from '../state/catalog.ts';
import {useRequest} from '../state/request.ts';
import {usePreferences} from '../state/preferences.ts';
import {itemLocation} from '../router/workspace.ts';
import ItemLink from '../components/ItemLink.vue';
import Pager from '../components/Pager.vue';

const route = useRoute(), router = useRouter();
const param = (key: string) => typeof route.query[key] === 'string' ? route.query[key] as string : '';
const names = {elite: '精英', ultra: '超级', inferno: '炼狱'};
const {catalog, opening, error: openError, open} = useCatalog(computed(() => param('catalog')));
const {preferences} = usePreferences();
const {value: page, error, loading, run, clear} = useRequest<InfernalPoolsPage>();
const options = computed<InfernalSearch>(() => ({tier: (param('tier') || 'elite') as InfernalTierName, offset: Number(param('offset') || 0), limit: 20}));
const records = computed(() => page.value ? new Records(page.value.related) : null);
const header = computed(() => page.value?.tiers.find(row => row.data.tier === options.value.tier));
function load() { const session = catalog.value; if (session) void run(signal => session.infernalPools(options.value, signal)); }
watch([catalog, options], () => { clear(); load(); }, {immediate: true});
function tier(tier: InfernalTierName) { void router.push({query: {...route.query, tier, offset: undefined}}); }
function move(offset: number) { void router.push({query: {...route.query, offset: String(offset)}}); }
function select(id: string, direction: 'recipes' | 'uses') { void router.push(itemLocation(id, route.query, direction === 'uses' ? 'usedIn' : 'producedBy')); }
</script>

<template>
  <section v-if="opening" class="state-panel" role="status">{{t("正在读取强化生物资料…")}}</section>
  <section v-else-if="openError" class="state-panel error" role="alert">{{openError}} <button @click="open()">{{t("重试")}}</button></section>
  <main v-else-if="catalog" class="panel infernal-page">
    <h1>{{t("强化生物掉落池")}}</h1>
    <p>{{t("此处记录导出时客户端的配置与已加载物品池；服务器可能使用不同配置。")}}</p>
    <p v-if="loading" role="status">{{t("正在读取掉落池…")}}</p>
    <p v-else-if="error" role="alert" class="inline-error">{{error}} <button @click="load">{{t("重试")}}</button></p>
    <template v-else-if="page && records">
      <p v-if="!page.definition" class="state-panel">{{t("当前数据集未包含强化生物资料。")}}</p>
      <p v-else-if="!page.definition.data.enabled" class="state-panel">{{t("导出时已关闭强化生物掉落资料。")}}</p>
      <template v-else>
        <nav :aria-label="t('强化等级')" class="infernal-tiers"><button v-for="(label, key) in names" :key="key" :aria-pressed="options.tier === key" @click="tier(key)">{{t(label)}}</button></nav>
        <section class="infernal-policy">
          <h2>{{t("原生选择规则")}}</h2>
          <p>{{t("按生物最终词缀数选择一个池：1–5 为精英，6–10 为超级，11 及以上为炼狱。每次在该池中等概率选取一个条目；重复条目各占一份权重。")}}</p>
          <p>{{t("成功抽取后，剩余词缀数减 5；仍大于 0 则继续抽取。空池不会产出物品。生成和附魔还受生物类型、词缀可用性与维度规则影响。")}}</p>
          <p v-if="page.definition.data.dimensionBlacklist.length">{{t("禁止自然生成强化生物的维度：{0}", page.definition.data.dimensionBlacklist.join('、'))}}</p>
          <p v-else>{{t("维度禁用列表为空。")}}</p>
        </section>
        <section v-if="header" class="infernal-tier-info">
          <h2>{{t("{0}池", t(names[header.data.tier]))}}</h2>
          <p>{{t("该等级配置的条件抽选权重为 1 / {0}，三档判断逐层进行；这不是全局掉落概率。", header.data.rarity)}}</p>
          <p>{{t("配置请求的词缀范围：{0} 至 {1}。实际词缀数可能因可用词缀与兼容条件减少。", header.data.requestedMinModifiers, header.data.requestedMaxModifiers)}}</p>
          <p>{{t("{0} 个条目。所列数量已在加载配置时确定，不表示每次击杀重新随机数量。", header.data.entries)}}</p>
        </section>
        <p v-if="!page.total" class="state-panel">{{t("该等级原生掉落池为空。")}}</p>
        <article v-for="row in page.rows" :key="row.id" class="infernal-pool-item">
          <ItemLink :target="{kind: 'item', id: row.data.item}" :records="records" :catalog="catalog" :animate="preferences.animate" @select="select" />
          <div>
            <p>{{t("条目 {0} · 单次池内抽选权重 1 / {1}", row.data.entry + 1, page.total)}}</p>
            <template v-if="row.data.enchantmentKind === 'nativeRandomEnchantedBook'"><p>{{t("原生随机附魔书：抽中后生成新附魔书，池内数量 {0} 与 NBT 不作为最终成品。", row.data.amount)}}</p></template>
            <template v-else><p>{{t("加载时数量 {0} · 原生附魔能力 {1}", row.data.amount, row.data.enchantability)}}</p><p>{{t("每次按剩余词缀数和物品附魔能力尝试附魔；不保证一定获得附魔。")}}</p></template>
          </div>
        </article>
        <Pager :total="page.total" :offset="page.offset" :limit="page.limit" :busy="loading" :label="t('掉落条目')" @change="move" />
      </template>
    </template>
  </main>
</template>

<style scoped>
.infernal-page{margin:1rem;max-width:1100px;padding:1.2rem;color:var(--text,#e2e8f0)}
.infernal-tiers{display:flex;gap:.6rem;flex-wrap:wrap}.infernal-tiers button[aria-pressed=true]{border-color:var(--accent,#8acbff)}
.infernal-policy,.infernal-tier-info,.infernal-pool-item{margin-top:1rem;padding:1rem;border:1px solid var(--border,#334155);border-radius:.7rem;background:var(--surface,#101b2b)}
.infernal-pool-item{display:flex;gap:1rem;align-items:center}.infernal-page p{line-height:1.65;overflow-wrap:anywhere}.infernal-page h2{font-size:1.1rem}
</style>
