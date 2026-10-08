<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Records, type OreGroupDetail, type OreMembers } from '../catalog/client.ts';
import { useRequest } from '../state/request.ts';
import { useCatalog } from '../state/catalog.ts';
import { usePreferences } from '../state/preferences.ts';
import SiteHeader from '../components/SiteHeader.vue';
import TopicBrowser from '../components/TopicBrowser.vue';
import ItemLink from '../components/ItemLink.vue';
import Pager from '../components/Pager.vue';

const route = useRoute(), router = useRouter();
const { preferences } = usePreferences();
const snapshot = computed(() => typeof route.query.catalog === 'string' ? route.query.catalog : '');
const item = computed(() => typeof route.query.item === 'string' ? route.query.item : '');
const id = computed(() => typeof route.params.id === 'string' ? route.params.id : '');
const { catalog, opening, error: openError, offline, open } = useCatalog(snapshot);
const offset = ref(0), expanded = ref(new Set<string>());
const { value: detail, error: detailError, loading: reading, run: read, clear: clearDetail } = useRequest<OreGroupDetail>();
const { value: members, error: membersError, loading: paging, run: page, clear: clearMembers } = useRequest<OreMembers>();
const records = computed(() => members.value ? new Records(members.value.related) : null);
watch([catalog, id], () => {
  clearDetail(); clearMembers(); offset.value = 0; expanded.value = new Set();
  const session = catalog.value;
  if (session && id.value) void read(signal => session.oreGroup(id.value, signal));
}, { immediate: true });
watch([catalog, detail, offset], () => {
  clearMembers(); expanded.value = new Set();
  const session = catalog.value, group = detail.value?.group;
  if (session && group) void page(signal => session.oreMembers(group.id, offset.value, signal));
}, { immediate: true });
function query() { return catalog.value ? { catalog: catalog.value.manifest.id, ...(offline.value ? { offline: '1' } : {}) } : {}; }
function show(id: string): void { void router.push({ name: 'ore', params: { id }, query: { ...query(), ...(item.value ? { item: item.value } : {}) } }); }
function all(): void { void router.push({ name: 'ores', query: query() }); }
function select(id: string, direction: 'recipes' | 'uses'): void { void router.push({ name: 'entry', params: { itemId: id }, query: { ...query(), direction } }); }
function toggle(id: string): void { expanded.value.has(id) ? expanded.value.delete(id) : expanded.value.add(id); }
</script>

<template>
  <div class="catalog-page">
    <SiteHeader :catalog="catalog?.manifest.id" :offline="offline" />
    <section v-if="opening" class="state-panel" role="status"><h1>正在读取资料</h1></section>
    <section v-else-if="openError" class="state-panel error" role="alert"><h1>数据集无法加载</h1><p>{{ openError }}</p><button type="button" @click="open()">重试</button></section>
    <template v-else-if="catalog">
      <aside v-if="catalog.manifest.scope === 'selection'" class="notice">当前为选定范围的采集结果。</aside>
      <div class="industry-workspace">
        <TopicBrowser :catalog="catalog" kind="ore" :selected="id" :item="item" @select="show" @all="all" />
        <section class="panel industry-detail ore-detail" :aria-busy="reading || paging">
          <div v-if="reading" class="state-panel" role="status">正在读取矿辞组…</div>
          <div v-else-if="detailError || membersError" class="state-panel error" role="alert"><h2>资料无法加载</h2><p>{{ detailError || membersError }}</p><button type="button" @click="open()">重试</button></div>
          <template v-else-if="detail">
            <header class="panel-heading"><div><span class="eyebrow">ORE DICTIONARY</span><h2>{{ detail.group.name }}</h2></div><span class="subtle">{{ detail.group.members.toLocaleString('zh-CN') }} 个登记位置</span></header>
            <div class="industry-body">
              <p class="subtle">按原始登记顺序列出，保留重复项。登记数量仅描述原始记录。</p>
              <p v-if="paging" role="status">正在读取登记成员…</p>
              <p v-else-if="!detail.group.members" class="subtle">此组没有登记成员。</p>
              <div v-else-if="members && records" class="ore-members">
                <article v-for="member in members.rows" :key="member.id" class="ore-member">
                  <span class="ore-position">#{{ member.index + 1 }}</span>
                  <div>
                    <ItemLink v-if="member.display" :target="{ kind: 'item', id: member.display }" :catalog="catalog" :records="records" :animate="preferences.animate" @select="select" />
                    <span v-else class="subtle">无展示项</span>
                    <p class="registry">{{ member.template.registry }}</p>
                    <dl><div><dt>原始元数据</dt><dd>{{ member.template.meta }}{{ member.template.meta === 32767 ? '（通配）' : '' }}</dd></div><div><dt>登记数量</dt><dd>{{ member.template.amount }}</dd></div></dl>
                    <button v-if="member.template.nbt" type="button" :aria-expanded="expanded.has(member.id)" @click="toggle(member.id)">查看原始 NBT</button>
                    <span v-else class="subtle">NBT：无</span>
                    <pre v-if="expanded.has(member.id)">{{ JSON.stringify(member.template.nbt, null, 2) }}</pre>
                  </div>
                </article>
                <Pager :total="members.total" :offset="members.offset" :limit="members.limit" :busy="paging" label="登记成员" @change="offset = $event" />
              </div>
            </div>
          </template>
          <div v-else class="recipe-welcome"><span class="recipe-glyph" aria-hidden="true">◇</span><h2>查看矿辞登记</h2><p>选择一个组，查看原始登记模板与可用的展示物品。</p></div>
        </section>
      </div>
    </template>
    <footer class="site-footer"><span>NeoNEI</span><span>矿辞登记资料</span></footer>
  </div>
</template>

<style scoped>
.ore-members { display: grid; gap: 1rem; }
.ore-member { display: grid; grid-template-columns: 3rem minmax(0, 1fr); gap: .75rem; padding: 1rem 0; border-bottom: 1px solid #ffffff18; }
.ore-position { color: #97a6b9; font-variant-numeric: tabular-nums; }
.ore-member dl { display: flex; flex-wrap: wrap; gap: 1rem 2rem; margin: .6rem 0; }
.ore-member dl div { display: flex; gap: .5rem; }
.ore-member dt { color: #97a6b9; }.ore-member dd { margin: 0; font-variant-numeric: tabular-nums; }
.ore-member pre { max-height: 20rem; overflow: auto; white-space: pre-wrap; overflow-wrap: anywhere; background: #080d15; padding: .75rem; border-radius: .4rem; }
.ore-detail h2, .registry { overflow-wrap: anywhere; }
</style>
