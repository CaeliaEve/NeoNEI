<script setup lang="ts">
import {t} from '../i18n/index.ts';
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Records, required, type AspectDetail, type ResearchDetail } from '../catalog/client.ts';
import { amount, color } from '../catalog/format.ts';
import { useCatalog } from '../state/catalog.ts';
import { useRequest } from '../state/request.ts';
import { usePreferences } from '../state/preferences.ts';
import TopicBrowser from '../components/TopicBrowser.vue';
import TopicLink from '../components/TopicLink.vue';
import GameText from '../components/GameText.vue';
import Icon from '../components/Icon.vue';
import ItemLink from '../components/ItemLink.vue';
import Pager from '../components/Pager.vue';
import Clue from '../components/Clue.vue';
import type { ItemAspectSources } from '../catalog/item-aspects.ts';

const route = useRoute(), router = useRouter();
const { preferences } = usePreferences();
const kind = computed(() => route.name === 'aspect' || route.name === 'aspects' ? 'aspect' : 'research');
const snapshot = computed(() => typeof route.query.catalog === 'string' ? route.query.catalog : '');
const id = computed(() => typeof route.params.id === 'string' ? route.params.id : '');
const item = computed(() => typeof route.query.item === 'string' ? route.query.item : '');
const { catalog, opening, error: openError, offline, open } = useCatalog(snapshot);
const { value: detail, loading, error, run, clear } = useRequest<AspectDetail | ResearchDetail>();
const { value: sources, loading: sourcesLoading, error: sourcesError, run: runSources, clear: clearSources } = useRequest<ItemAspectSources>();
const sourcesOffset = ref(0);
const sourceRecords = computed(() => sources.value ? new Records(sources.value.related) : null);
const aspect = computed(() => detail.value && 'aspect' in detail.value ? detail.value : null);
const study = computed(() => detail.value && 'research' in detail.value ? detail.value : null);
const records = computed(() => detail.value ? new Records(detail.value.related) : null);
const references = computed(() => new Map((aspect.value?.components ?? study.value?.references ?? []).map(row => [row.id, row])));
const flagNames = { auto: '自动解锁', concealed: '前置发现后可见', hidden: '隐藏研究', lost: '通过扫描发现', round: '圆形标记', secondary: '次级研究', special: '特殊研究', stub: '关联解锁条目', virtual: '内部研究条目' } as const;
const groups = computed(() => study.value ? [
  { name: t('前置研究'), rows: study.value.research.parents },
  { name: t('隐藏连线的前置条件'), rows: study.value.research.hiddenParents },
  { name: t('关联解锁'), rows: study.value.research.siblings },
] : []);
const offset = ref(0);
const triggers = computed(() => study.value ? [
  ...study.value.research.itemTriggers.map(clue => ({ kind: 'item' as const, clue })),
  ...study.value.research.aspectTriggers.map(id => ({ kind: 'aspect' as const, id })),
  ...study.value.research.entityTriggers.map(id => ({ kind: 'entity' as const, id })),
] : []);
const shownTriggers = computed(() => triggers.value.slice(offset.value, offset.value + 24));
watch([catalog, kind, id], () => {
  clear(); clearSources(); offset.value = 0; sourcesOffset.value = 0;
  const session = catalog.value;
  if (session && id.value) void run(signal => kind.value === 'aspect' ? session.aspect(id.value, signal) : session.research(id.value, signal));
}, { immediate: true });
watch([catalog, kind, id, sourcesOffset], () => {
  clearSources(); const session = catalog.value;
  if (session && kind.value === 'aspect' && id.value) void runSources(signal => session.aspectSources(id.value,sourcesOffset.value,signal));
}, { immediate:true });
function show(id: string): void {
  if (catalog.value) void router.push({ name: kind.value, params: { id }, query: { ...(route.query.offline === '1' ? { offline: '1' } : {}), catalog: catalog.value.manifest.id, ...(item.value ? { item: item.value } : {}) } });
}
function all(): void { void router.push({ name: kind.value === 'aspect' ? 'aspects' : 'studies', query: catalog.value ? { ...(route.query.offline === '1' ? { offline: '1' } : {}), catalog: catalog.value.manifest.id } : {} }); }
function select(id: string, direction: 'recipes' | 'uses'): void {
  if (catalog.value) void router.push({ name: 'entry', params: { itemId: id }, query: { ...(route.query.offline === '1' ? { offline: '1' } : {}), catalog: catalog.value.manifest.id, direction } });
}
function completed(value: boolean | null | undefined): string { return t(value == null ? '状态未知' : value ? '已完成' : '尚未完成'); }
</script>

<template>
  <div class="catalog-page">

    <section v-if="opening" class="state-panel" role="status"><h1>{{t("正在读取魔法资料")}}</h1></section>
    <section v-else-if="openError" class="state-panel error" role="alert"><h1>{{t("数据集无法加载")}}</h1><p>{{ openError }}</p><button type="button" @click="open()">{{t("重试")}}</button></section>
    <template v-else-if="catalog">
      <nav class="magic-tabs" :aria-label="t('魔法资料分类')">
        <RouterLink :to="{ name: 'aspects', query: { ...(route.query.offline === '1' ? { offline: '1' } : {}), catalog: catalog.manifest.id } }">{{t("要素")}}</RouterLink>
        <RouterLink :to="{ name: 'studies', query: { ...(route.query.offline === '1' ? { offline: '1' } : {}), catalog: catalog.manifest.id } }">{{t("研究")}}</RouterLink>
      </nav>
      <div class="industry-workspace">
        <TopicBrowser :catalog="catalog" :kind="kind" :selected="id" :item="item" @select="show" @all="all" />
        <section class="panel industry-detail magic-detail" :aria-busy="loading">
          <p v-if="loading" role="status">{{t("正在读取详细资料…")}}</p>
          <p v-else-if="error" class="inline-error" role="alert">{{ error }} <button type="button" @click="open()">{{t("重试")}}</button></p>
          <template v-else-if="aspect && records">
            <header class="magic-title"><Icon v-if="aspect.aspect.icon" :atlas="catalog.atlas" :texture="required(records.textures, aspect.aspect.icon)" :width="48" :height="48" :animate="preferences.animate" :label="t('要素')" />
              <div><span class="eyebrow">{{t('要素')}}</span><h2><GameText :text="records.text(aspect.aspect.name)" /></h2></div></header>
            <p><GameText :text="records.text(aspect.aspect.description)" /></p>
            <p class="knowledge-state">{{t("快照知识：{0}", aspect.aspect.discovered == null ? t("状态未知") : aspect.aspect.discovered ? t("已发现") : t("尚未发现"))}}</p>
            <p v-for="row in aspect.references.filter(row => row.data.kind === 'aspectCombination')" :key="row.id" class="knowledge-state">{{t("原生组合页：{0}。这里记录要素组成关系，不表示材料消耗配方。", row.data.kind === 'aspectCombination' && row.data.visible ? t(aspect.aspect.discovered === true ? "当前知识可见" : "本次可见") : t("尚未发现，游戏中隐藏"))}}</p>
            <dl class="magic-facts"><dt>{{t("注册键")}}</dt><dd><code>{{ aspect.aspect.source.key }}</code></dd><dt>{{t("颜色")}}</dt><dd><i class="color-sample" :style="{ background: color(aspect.aspect.color) }" />{{ color(aspect.aspect.color) }}</dd></dl>
            <section :aria-label="t('要素组成')"><h3>{{ aspect.aspect.components.length ? t("组成要素") : t("原始要素") }}</h3>
              <div class="magic-parts"><template v-for="(id, index) in aspect.aspect.components" :key="index"><span v-if="index" aria-hidden="true">＋</span>
                <TopicLink :topic="required(references, id)" :records="records" :catalog="catalog" :animate="preferences.animate" /></template></div>
            </section>
            <section v-if="aspect.references.length" :aria-label="t('已发现的组合用途')"><h3>{{t("已发现的组合用途")}}</h3>
              <div class="magic-parts"><TopicLink v-for="topic in aspect.combinations" :key="topic.id" :topic="topic" :records="records" :catalog="catalog" :animate="preferences.animate" /></div>
              <p v-if="!aspect.combinations.length" class="subtle">{{t("当前知识快照没有可见的组合用途。")}}</p>
            </section>
            <section :aria-label="t('扫描物品来源')"><h3>{{t("扫描物品来源")}}</h3>
              <p v-if="sourcesLoading" role="status">{{t("正在读取扫描记录…")}}</p>
              <p v-else-if="sourcesError" role="alert">{{ sourcesError }}</p>
              <template v-else-if="sources && sourceRecords">
                <p v-if="!sources.definitions.length" class="subtle">{{t("本数据集未包含物品要素来源记录。")}}</p>
                <template v-else>
                  <p class="subtle">{{t("数量表示单件物品的原生要素含量，包含附加要素；这里只列出快照中已扫描的物品。")}}</p>
                  <p v-if="sources.gaps.cacheMiss || sources.gaps.invalidKey" class="inline-error">{{t("原生扫描记录中有 {0} 项缓存缺失、{1} 项无效键；这些记录保留在数据集中。", sources.gaps.cacheMiss, sources.gaps.invalidKey)}}</p>
                  <p v-if="sources.visible !== true" class="subtle">{{t("该要素尚未发现或知识状态未知，原生来源页不可见。")}}</p>
                  <div class="magic-parts"><span v-for="row in sources.rows" :key="row.id">
                    <ItemLink v-if="row.data.item" :target="{kind:'item',id:row.data.item}" :records="sourceRecords" :catalog="catalog" :animate="preferences.animate" @select="select" /> {{t("· 要素量")}} {{ row.data.aspects?.find(value => value.aspect === id)?.amount }}
                  </span></div>
                  <p v-if="sources.visible === true && !sources.total" class="subtle">{{t("当前扫描快照中没有含此要素的物品。")}}</p>
                  <Pager :total="sources.total" :offset="sourcesOffset" :limit="20" :busy="sourcesLoading" :label="t('来源')" @change="sourcesOffset=$event" />
                </template>
              </template>
            </section>
          </template>
          <template v-else-if="study && records">
            <header class="magic-title"><Icon v-if="study.research.texture" :atlas="catalog.atlas" :texture="required(records.textures, study.research.texture)" :width="48" :height="48" :animate="preferences.animate" :label="t('研究')" />
              <div><span class="eyebrow"><GameText :text="records.text(study.research.categoryName)" /></span><h2><GameText :text="records.text(study.research.name)" /></h2></div></header>
            <ItemLink v-if="study.research.icon" :target="{ kind: 'item', id: study.research.icon }" :records="records" :catalog="catalog" :animate="preferences.animate" @select="select" />
            <p><GameText :text="records.text(study.research.text)" /></p>
            <p class="knowledge-state">{{t("快照知识：{0}", completed(study.research.completed))}}</p>
            <div class="research-flags"><span v-for="flag in study.research.flags" :key="flag">{{ t(flagNames[flag]) }}</span></div>
            <p class="subtle">{{t("研究规模 {0} · 扭曲 {1} · {2}", study.research.complexity, study.research.warp, study.research.source.key)}}</p>
            <p class="subtle">{{t("这里展示定义与快照中的知识记录，实际解锁还取决于游戏中的研究模式和规则。")}}</p>
            <section :aria-label="t('研究要素')"><h3>{{t("研究要求的要素")}}</h3><div class="magic-parts"><span v-for="cost in study.research.aspects" :key="cost.aspect">
              <TopicLink :topic="required(references, cost.aspect)" :records="records" :catalog="catalog" :animate="preferences.animate" /> × {{ amount(cost.amount) }}
            </span></div></section>
            <section v-for="group in groups" :key="group.name" :aria-label="group.name">
              <h3>{{ group.name }}</h3><p v-if="!group.rows.length" class="subtle">{{t("无")}}</p>
              <ul class="research-links"><li v-for="(link, index) in group.rows" :key="index">
                <TopicLink v-if="link.id" :topic="required(references, link.id)" :records="records" :catalog="catalog" :animate="preferences.animate" />
                <span v-else>{{t("知识标记")}} <code>{{ link.key }}</code></span><small>{{ completed(link.completed) }}</small>
              </li></ul>
            </section>
            <section v-if="triggers.length" :aria-label="t('发现线索')"><h3>{{t("发现线索")}}</h3><p class="subtle">{{t("扫描这些条目可能触发隐藏研究，是否发现由游戏规则决定。")}}</p>
              <div class="magic-parts"><template v-for="(trigger, index) in shownTriggers" :key="index">
                <Clue v-if="trigger.kind === 'item'" :clue="trigger.clue" :records="records" :catalog="catalog" :animate="preferences.animate" @select="select" />
                <TopicLink v-else-if="trigger.kind === 'aspect'" :topic="required(references, trigger.id)" :records="records" :catalog="catalog" :animate="preferences.animate" />
                <span v-else>{{t("实体")}} <code>{{ trigger.id }}</code></span>
              </template></div><Pager :total="triggers.length" :offset="offset" :limit="24" :busy="false" :label="t('线索')" @change="offset = $event" />
            </section>
          </template>
          <div v-else class="state-panel empty"><h2>{{t("选择一条魔法资料")}}</h2><p>{{t("查看要素组成、研究前置条件和知识记录。")}}</p></div>
        </section>
      </div>
    </template>
  </div>
</template>

<style scoped>
.magic-tabs { display: flex; gap: 1rem; margin: 1rem 0; }
.magic-detail { padding: 24px; }
.magic-title, .magic-parts { display: flex; align-items: center; gap: 1rem; flex-wrap: wrap; }
.magic-title h2 { margin: .3rem 0; }
.magic-facts { display: grid; grid-template-columns: auto 1fr; gap: .5rem 1rem; }
.magic-facts dd { margin: 0; display: flex; align-items: center; gap: .5rem; }
.color-sample { width: 18px; height: 18px; border-radius: 4px; display: inline-block; }
.knowledge-state { color: #9fdae0; }
.research-flags { display: flex; gap: .4rem; flex-wrap: wrap; }
.research-flags span { background: #223442; padding: .3rem .5rem; border-radius: 6px; font-size: .8rem; }
.research-links { padding: 0; list-style: none; }
.research-links li { display: flex; align-items: center; gap: 1rem; margin: .7rem 0; }
.research-links small { color: #9bb2c3; }
.magic-detail section { margin-top: 1.4rem; }
</style>
