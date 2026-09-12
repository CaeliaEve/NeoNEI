<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Records, required, type AspectDetail, type ResearchDetail } from '../catalog/client.ts';
import { amount, color } from '../catalog/format.ts';
import { useCatalog } from '../state/catalog.ts';
import { useRequest } from '../state/request.ts';
import { usePreferences } from '../state/preferences.ts';
import SiteHeader from '../components/SiteHeader.vue';
import TopicBrowser from '../components/TopicBrowser.vue';
import TopicLink from '../components/TopicLink.vue';
import GameText from '../components/GameText.vue';
import Icon from '../components/Icon.vue';
import ItemLink from '../components/ItemLink.vue';
import Pager from '../components/Pager.vue';

const route = useRoute(), router = useRouter();
const { preferences } = usePreferences();
const kind = computed(() => route.name === 'aspect' || route.name === 'aspects' ? 'aspect' : 'research');
const snapshot = computed(() => typeof route.query.catalog === 'string' ? route.query.catalog : '');
const id = computed(() => typeof route.params.id === 'string' ? route.params.id : '');
const item = computed(() => typeof route.query.item === 'string' ? route.query.item : '');
const { catalog, opening, error: openError, offline, open } = useCatalog(snapshot);
const { value: detail, loading, error, run, clear } = useRequest<AspectDetail | ResearchDetail>();
const aspect = computed(() => detail.value && 'aspect' in detail.value ? detail.value : null);
const study = computed(() => detail.value && 'research' in detail.value ? detail.value : null);
const records = computed(() => detail.value ? new Records(detail.value.related) : null);
const references = computed(() => new Map((aspect.value?.components ?? study.value?.references ?? []).map(row => [row.id, row])));
const flagNames = { auto: '自动解锁', concealed: '前置发现后可见', hidden: '隐藏研究', lost: '通过扫描发现', round: '圆形标记', secondary: '次级研究', special: '特殊研究', stub: '关联解锁条目', virtual: '内部研究条目' } as const;
const groups = computed(() => study.value ? [
  { name: '前置研究', rows: study.value.research.parents },
  { name: '隐藏连线的前置条件', rows: study.value.research.hiddenParents },
  { name: '关联解锁', rows: study.value.research.siblings },
] : []);
const offset = ref(0);
const triggers = computed(() => study.value ? [
  ...study.value.research.itemTriggers.map(id => ({ kind: 'item' as const, id })),
  ...study.value.research.aspectTriggers.map(id => ({ kind: 'aspect' as const, id })),
  ...study.value.research.entityTriggers.map(id => ({ kind: 'entity' as const, id })),
] : []);
const shownTriggers = computed(() => triggers.value.slice(offset.value, offset.value + 24));
watch([catalog, kind, id], () => {
  clear(); offset.value = 0;
  const session = catalog.value;
  if (session && id.value) void run(signal => kind.value === 'aspect' ? session.aspect(id.value, signal) : session.research(id.value, signal));
}, { immediate: true });
function show(id: string): void {
  if (catalog.value) void router.push({ name: kind.value, params: { id }, query: { catalog: catalog.value.manifest.id, ...(item.value ? { item: item.value } : {}) } });
}
function all(): void { void router.push({ name: kind.value === 'aspect' ? 'aspects' : 'studies', query: catalog.value ? { catalog: catalog.value.manifest.id } : {} }); }
function select(id: string, direction: 'recipes' | 'uses'): void {
  if (catalog.value) void router.push({ name: 'entry', params: { itemId: id }, query: { catalog: catalog.value.manifest.id, direction } });
}
function completed(value: boolean | null | undefined): string { return value == null ? '状态未知' : value ? '已完成' : '尚未完成'; }
</script>

<template>
  <div class="catalog-page">
    <SiteHeader :catalog="catalog?.manifest.id" :offline="offline" />
    <section v-if="opening" class="state-panel" role="status"><h1>正在读取魔法资料</h1></section>
    <section v-else-if="openError" class="state-panel error" role="alert"><h1>数据集无法加载</h1><p>{{ openError }}</p><button type="button" @click="open()">重试</button></section>
    <template v-else-if="catalog">
      <nav class="magic-tabs" aria-label="魔法资料分类">
        <RouterLink :to="{ name: 'aspects', query: { catalog: catalog.manifest.id } }">要素</RouterLink>
        <RouterLink :to="{ name: 'studies', query: { catalog: catalog.manifest.id } }">研究</RouterLink>
      </nav>
      <div class="industry-workspace">
        <TopicBrowser :catalog="catalog" :kind="kind" :selected="id" :item="item" @select="show" @all="all" />
        <section class="panel industry-detail magic-detail" :aria-busy="loading">
          <p v-if="loading" role="status">正在读取详细资料…</p>
          <p v-else-if="error" class="inline-error" role="alert">{{ error }} <button type="button" @click="open()">重试</button></p>
          <template v-else-if="aspect && records">
            <header class="magic-title"><Icon v-if="aspect.aspect.icon" :atlas="catalog.atlas" :texture="required(records.textures, aspect.aspect.icon)" :width="48" :height="48" :animate="preferences.animate" label="要素" />
              <div><span class="eyebrow">ASPECT</span><h2><GameText :text="records.text(aspect.aspect.name)" /></h2></div></header>
            <p><GameText :text="records.text(aspect.aspect.description)" /></p>
            <p class="knowledge-state">快照知识：{{ aspect.aspect.discovered == null ? '状态未知' : aspect.aspect.discovered ? '已发现' : '尚未发现' }}</p>
            <dl class="magic-facts"><dt>注册键</dt><dd><code>{{ aspect.aspect.source.key }}</code></dd><dt>颜色</dt><dd><i class="color-sample" :style="{ background: color(aspect.aspect.color) }" />{{ color(aspect.aspect.color) }}</dd></dl>
            <section aria-label="要素组成"><h3>{{ aspect.aspect.components.length ? '组成要素' : '原始要素' }}</h3>
              <div class="magic-parts"><template v-for="(id, index) in aspect.aspect.components" :key="index"><span v-if="index" aria-hidden="true">＋</span>
                <TopicLink :topic="required(references, id)" :records="records" :catalog="catalog" :animate="preferences.animate" /></template></div>
            </section>
          </template>
          <template v-else-if="study && records">
            <header class="magic-title"><Icon v-if="study.research.texture" :atlas="catalog.atlas" :texture="required(records.textures, study.research.texture)" :width="48" :height="48" :animate="preferences.animate" label="研究" />
              <div><span class="eyebrow"><GameText :text="records.text(study.research.categoryName)" /></span><h2><GameText :text="records.text(study.research.name)" /></h2></div></header>
            <ItemLink v-if="study.research.icon" :target="{ kind: 'item', id: study.research.icon }" :records="records" :catalog="catalog" :animate="preferences.animate" @select="select" />
            <p><GameText :text="records.text(study.research.text)" /></p>
            <p class="knowledge-state">快照知识：{{ completed(study.research.completed) }}</p>
            <div class="research-flags"><span v-for="flag in study.research.flags" :key="flag">{{ flagNames[flag] }}</span></div>
            <p class="subtle">研究规模 {{ study.research.complexity }} · 扭曲 {{ study.research.warp }} · {{ study.research.source.key }}</p>
            <p class="subtle">这里展示定义与快照中的知识记录，实际解锁还取决于游戏中的研究模式和规则。</p>
            <section aria-label="研究要素"><h3>研究要求的要素</h3><div class="magic-parts"><span v-for="cost in study.research.aspects" :key="cost.aspect">
              <TopicLink :topic="required(references, cost.aspect)" :records="records" :catalog="catalog" :animate="preferences.animate" /> × {{ amount(cost.amount) }}
            </span></div></section>
            <section v-for="group in groups" :key="group.name" :aria-label="group.name">
              <h3>{{ group.name }}</h3><p v-if="!group.rows.length" class="subtle">无</p>
              <ul class="research-links"><li v-for="(link, index) in group.rows" :key="index">
                <TopicLink v-if="link.id" :topic="required(references, link.id)" :records="records" :catalog="catalog" :animate="preferences.animate" />
                <span v-else>知识标记 <code>{{ link.key }}</code></span><small>{{ completed(link.completed) }}</small>
              </li></ul>
            </section>
            <section v-if="triggers.length" aria-label="发现线索"><h3>发现线索</h3><p class="subtle">扫描这些条目可能触发隐藏研究，是否发现由游戏规则决定。</p>
              <div class="magic-parts"><template v-for="(trigger, index) in shownTriggers" :key="index">
                <ItemLink v-if="trigger.kind === 'item'" :target="{ kind: 'item', id: trigger.id }" :records="records" :catalog="catalog" :animate="preferences.animate" @select="select" />
                <TopicLink v-else-if="trigger.kind === 'aspect'" :topic="required(references, trigger.id)" :records="records" :catalog="catalog" :animate="preferences.animate" />
                <span v-else>实体 <code>{{ trigger.id }}</code></span>
              </template></div><Pager :total="triggers.length" :offset="offset" :limit="24" :busy="false" label="线索" @change="offset = $event" />
            </section>
          </template>
          <div v-else class="state-panel empty"><h2>选择一条魔法资料</h2><p>查看要素组成、研究前置条件和知识记录。</p></div>
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
