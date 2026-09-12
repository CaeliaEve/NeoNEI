<script setup lang="ts">
import { computed, ref, shallowRef, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { canonical, type Cell, type Probe } from '@elysium/contracts';
import { Records, type StructureDetail, type BuildDetail } from '../catalog/client.ts';
import { ruleColor, type Volume } from '../catalog/scene.ts';
import { Models } from '../catalog/models.ts';
import { useCatalog } from '../state/catalog.ts';
import { useRequest } from '../state/request.ts';
import { usePreferences } from '../state/preferences.ts';
import SiteHeader from '../components/SiteHeader.vue';
import TopicBrowser from '../components/TopicBrowser.vue';
import GameText from '../components/GameText.vue';
import ItemLink from '../components/ItemLink.vue';
import StructureView from '../components/StructureView.vue';
import Pager from '../components/Pager.vue';

const route = useRoute(), router = useRouter();
const { preferences } = usePreferences();
const snapshot = computed(() => typeof route.query.catalog === 'string' ? route.query.catalog : '');
const id = computed(() => typeof route.params.id === 'string' ? route.params.id : '');
const item = computed(() => typeof route.query.item === 'string' ? route.query.item : '');
const { catalog, opening, error: openError, offline, open } = useCatalog(snapshot);
const { value: detail, loading: reading, error: detailError, run: read, clear: clearDetail } = useRequest<StructureDetail>();
const { value: built, loading: loadingBuild, error: buildError, run: readBuild, clear: clearBuild } = useRequest<BuildDetail>();
const { value: cells, loading: loadingGeometry, error: geometryError, run: load, clear: clearGeometry } = useRequest<Cell[]>();
const { value: models, loading: loadingModels, error: modelError, run: readModels, clear: clearModels } = useRequest<Models>();
const appearance = ref<'model' | 'blocks'>('model');
const pieceIndex = ref(0), ruleIndex = ref(-1), progress = ref(0), ruleOffset = ref(0), itemOffset = ref(0);
const mode = ref<'build' | 'piece'>('build'), blockIndex = ref(-1), blockOffset = ref(0), showNbt = ref(false);
const variantIndex = computed({
  get: () => route.query.variant == null ? 0 : typeof route.query.variant === 'string' && /^(0|[1-9]\d?)$/.test(route.query.variant) ? Number(route.query.variant) : -1,
  set: (index: number) => { void router.push({ query: { ...route.query, catalog: catalog.value?.manifest.id, variant: String(index) } }); },
});
const whole = computed(() => mode.value === 'build');
const selected = shallowRef<Cell | null>(null);
const structure = computed(() => detail.value?.structure ?? null);
const variant = computed(() => structure.value?.variants[variantIndex.value] ?? null);
const piece = computed(() => structure.value?.pieces[pieceIndex.value] ?? null);
const records = computed(() => detail.value ? new Records(detail.value.related) : null);
const buildRecords = computed(() => built.value ? new Records(built.value.related) : null);
const native = computed(() => whole.value && appearance.value === 'model' && built.value?.build.rendered);
const modelProblems = computed(() => [...new Set(built.value?.build.palette.flatMap(entry => entry.problem ? [entry.problem] : []) ?? [])]);
const hiddenCells = computed(() => {
  if (!built.value || !models.value || !cells.value) return 0;
  return cells.value.reduce((count, cell) => {
    const id = built.value!.build.palette[cell.index]?.model;
    return count + Number(Boolean(id && models.value!.rows.get(id)?.hidden));
  }, 0);
});
const current = computed(() => whole.value ? built.value?.build ?? null : piece.value);
const volume = computed<Volume | null>(() => {
  if (whole.value) {
    const data = built.value;
    const groups = new Map(data?.blocks.map((block, index) => [block.id, index]) ?? []);
    return data ? { size: data.build.size, cells: data.build.cells, markers: [data.build.controller],
      palette: data.build.palette.map(entry => {
        const group = groups.get(entry.block)!, block = data.blocks[group]!;
        return { label: block.registry + ':' + block.meta, air: false, color: ruleColor(group), group, model: entry.model };
      }) } : null;
  }
  const part = piece.value;
  return part ? { size: part.size, cells: part.cells, markers: part.anchors,
    palette: part.rules.map((rule, index) => ({ label: rule.symbol, air: rule.kind === 'air', color: ruleColor(index, rule) })) } : null;
});
const blockRows = computed(() => built.value?.blocks.slice(blockOffset.value, blockOffset.value + 24) ?? []);
const activeBlock = computed(() => built.value?.blocks[blockIndex.value] ?? null);
const blockCounts = computed(() => {
  const counts = new Map<string, number>();
  if (whole.value) for (const cell of cells.value ?? []) {
    const block = built.value?.build.palette[cell.index]?.block;
    if (block) counts.set(block, (counts.get(block) ?? 0) + 1);
  }
  return counts;
});
const activeRule = computed(() => piece.value?.rules[ruleIndex.value] ?? null);
const rules = computed(() => piece.value?.rules.slice(ruleOffset.value, ruleOffset.value + 24) ?? []);
const placements = computed(() => activeRule.value?.placements?.slice(itemOffset.value, itemOffset.value + 24) ?? []);
watch([catalog, id], () => {
  clearDetail(); pieceIndex.value = 0; mode.value = 'build';
  const session = catalog.value;
  if (session && id.value) void read(signal => session.structure(id.value, signal));
}, { immediate: true });
watch([catalog, structure, whole, variant], () => {
  clearBuild();
  const session = catalog.value, definition = structure.value, selected = variant.value, id = selected?.build;
  if (whole.value && session && definition && id) void readBuild(async signal => {
    const value = await session.build(id, signal);
    if (value.build.structure !== definition.id) throw new Error('整体装配引用了其他结构');
    if (canonical(value.build.probe) !== canonical(selected.probe)) throw new Error('整体装配参数与所选变体不一致');
    return value;
  });
});
watch(built, value => { appearance.value = value?.build.rendered && value.build.palette.some(entry => entry.model) ? 'model' : 'blocks'; });
watch([catalog, built, native], () => {
  clearModels();
  const session = catalog.value, data = built.value;
  if (native.value && session && data) void readModels(signal => Models.load(session, data.build, signal));
});
function geometry(): void {
  clearGeometry(); progress.value = 0; selected.value = null; ruleIndex.value = -1; ruleOffset.value = 0;
  blockIndex.value = -1; blockOffset.value = 0; showNbt.value = false;
  const session = catalog.value, definition = structure.value, part = current.value;
  const build = whole.value ? built.value?.build : null, name = piece.value?.name;
  if (!session || !definition || !part) return;
  void load(async signal => {
    const result: Cell[] = [];
    for (let offset = 0; offset < part.chunks.length;) {
      const page = build ? await session.buildShapes(build.id, offset, signal) : await session.shapes(definition.id, name!, offset, signal);
      if (page.offset !== offset || page.total !== part.chunks.length || !page.rows.length) throw new Error('结构分块分页与定义不一致');
      for (let index = 0; index < page.rows.length; index++) {
        const shape = page.rows[index]!;
        if (shape.id !== part.chunks[offset + index]) throw new Error('结构引用与返回的几何不一致');
        for (const cell of shape.cells) result.push(cell);
        if (result.length > part.cells || result.length > 1_048_576) throw new Error('结构几何超过声明大小');
      }
      offset += page.rows.length;
      if (!signal.aborted) progress.value = result.length;
    }
    if (result.length !== part.cells) throw new Error('结构几何缺少声明的格位');
    return result;
  });
}
watch([catalog, structure, current], geometry);
watch(ruleIndex, () => { itemOffset.value = 0; });
function pick(cell: Cell | null): void {
  selected.value = cell; ruleIndex.value = cell?.index ?? -1;
  const block = cell ? built.value?.build.palette[cell.index]?.block : null;
  blockIndex.value = block ? built.value!.blocks.findIndex(entry => entry.id === block) : -1; showNbt.value = false;
}
function parameters(probe: Probe): string {
  const channels = Object.entries(probe.channels).sort(([a], [b]) => a < b ? -1 : Number(a > b)).map(([name, value]) => `${name}=${value}`);
  return ['数量 ' + probe.count, ...(channels.length ? channels : ['默认通道'])].join(' · ');
}
function color(index: number): string { return 'rgb(' + ruleColor(index, piece.value?.rules[index]).map(value => Math.round(value * 255)).join(',') + ')'; }
function select(id: string, direction: 'recipes' | 'uses'): void {
  if (catalog.value) void router.push({ name: 'entry', params: { itemId: id }, query: { catalog: catalog.value.manifest.id, direction } });
}
function show(id: string): void {
  if (catalog.value) void router.push({ name: 'structure', params: { id }, query: { catalog: catalog.value.manifest.id, ...(item.value ? { item: item.value } : {}) } });
}
function all(): void { void router.push({ name: 'structures', query: catalog.value ? { catalog: catalog.value.manifest.id } : {} }); }
</script>

<template>
  <div class="catalog-page">
    <SiteHeader :catalog="catalog?.manifest.id" :offline="offline" />
    <section v-if="opening" class="state-panel" role="status"><h1>正在读取结构资料</h1></section>
    <section v-else-if="openError" class="state-panel error" role="alert"><h1>数据集无法加载</h1><p>{{ openError }}</p><button type="button" @click="open()">重试</button></section>
    <template v-else-if="catalog">
      <aside v-if="catalog.manifest.scope === 'selection'" class="notice">当前为选定范围的采集结果。</aside>
      <div class="industry-workspace">
        <TopicBrowser :catalog="catalog" kind="structure" :selected="id" :item="item" @select="show" @all="all" />
        <section class="panel industry-detail structure-detail" :aria-busy="reading">
          <div v-if="reading" class="state-panel" role="status">正在读取结构定义…</div>
          <div v-else-if="detailError" class="state-panel error" role="alert">{{ detailError }} <button type="button" @click="open()">重试</button></div>
          <template v-else-if="structure && records">
            <header><span class="eyebrow">STRUCTURE</span><h2><GameText :text="records.text(structure.name)" /></h2>
              <ItemLink :target="{ kind: 'item', id: structure.controller }" :records="records" :catalog="catalog" :animate="preferences.animate" @select="select" />
            </header>
            <div class="structure-description"><p v-for="line in structure.description" :key="line"><GameText :text="records.text(line)" /></p></div>
            <p v-if="structure.problem" class="notice"><GameText :text="records.text(structure.problem)" /></p>
            <div class="segmented structure-modes" role="group" aria-label="结构视图"><button type="button" :aria-pressed="whole" :class="{ active: whole }" @click="mode = 'build'">整体装配</button>
              <button type="button" :aria-pressed="!whole" :class="{ active: !whole }" :disabled="!structure.pieces.length" @click="mode = 'piece'">片段定义</button></div>
            <label v-if="whole && structure.variants.length > 1" class="piece-picker">构建参数 <select v-model.number="variantIndex" aria-label="构建参数"><option v-for="(entry, index) in structure.variants" :key="index" :value="index">{{ parameters(entry.probe) }}{{ entry.problem ? '（无法构建）' : '' }}</option></select></label>
            <p v-if="whole && !variant" class="notice" role="alert">请求的构建参数不存在。<button type="button" @click="variantIndex = 0">查看首组参数</button></p>
            <p v-else-if="whole && variant?.problem" class="notice" role="status">当前参数无法构建：<GameText :text="records.text(variant.problem)" /></p>
            <p v-if="whole && loadingBuild" role="status">正在读取整体装配…</p>
            <p v-else-if="whole && buildError" class="inline-error" role="alert">{{ buildError }} <button type="button" @click="open()">重试</button></p>
            <template v-if="current && volume">
              <label v-if="!whole" class="piece-picker">结构片段 <select v-model.number="pieceIndex" aria-label="结构片段"><option v-for="(part, index) in structure.pieces" :key="part.name" :value="index">{{ part.name }}</option></select></label>
              <p class="subtle">坐标范围 {{ current.size.join(' × ') }} · {{ current.cells.toLocaleString('zh-CN') }} 个{{ whole ? '已放置方块' : '规则格位' }}</p>
              <p class="piece-note">{{ whole ? '原生构建器在独立预览世界中放置的整体结构。成型条件仍由游戏模组判定。' : '游戏提供的结构定义与建议部件，保留各个片段的原始坐标。' }}</p>
              <p v-if="whole && built" class="subtle">{{ parameters(built.build.probe) }} · 控制器朝南</p>
              <div v-if="whole && built" class="segmented structure-modes" role="group" aria-label="装配显示">
                <button type="button" :aria-pressed="native" :class="{ active: native }" :disabled="!built.build.rendered || !built.build.palette.some(entry => entry.model)" @click="appearance = 'model'">原生外观</button>
                <button type="button" :aria-pressed="!native" :class="{ active: !native }" @click="appearance = 'blocks'">方块示意</button>
              </div>
              <p v-if="whole && built && !built.build.rendered" class="subtle">此数据集未采集外观，当前显示方块示意。</p>
              <details v-if="whole && modelProblems.length && buildRecords" class="notice"><summary>部分外观未采集（{{ modelProblems.length }}）</summary>
                <p v-for="problem in modelProblems" :key="problem"><GameText :text="buildRecords.text(problem)" /></p></details>
              <p v-if="loadingGeometry" role="status">正在读取几何：{{ progress.toLocaleString('zh-CN') }} / {{ current.cells.toLocaleString('zh-CN') }}</p>
              <p v-else-if="geometryError" class="inline-error" role="alert">{{ geometryError }} <button type="button" @click="geometry">重试</button></p>
              <p v-if="native && loadingModels" role="status">正在读取模型与纹理…</p>
              <p v-else-if="native && modelError" class="inline-error" role="alert">{{ modelError }}</p>
              <p v-if="native && hiddenCells" class="subtle">原生渲染中有 {{ hiddenCells }} 个位置不单独绘制，方块数量仍计入统计。</p>
              <StructureView v-if="cells && !geometryError && (!native || models)" :volume="volume" :cells="cells" :models="native ? models : null" :animate="preferences.animate" :label="whole ? '方块' : '规则'"
                :caption="native ? '原生模型与纹理，金色线框标记控制器。' : whole ? '方块示意图，金色标记控制器。' : '颜色表示结构规则，金色标记控制器，蓝色标记空气。'" @select="pick" />
              <p v-if="selected" class="structure-position" role="status">坐标 A {{ selected.at[0] }} · B {{ selected.at[1] }} · C {{ selected.at[2] }} — {{ selected.index < 0 ? '控制器' : whole ? activeBlock?.registry : '规则 ' + activeRule?.symbol }}</p>
              <section v-if="!whole && piece" class="structure-rules" aria-label="结构规则">
                <h3>部件提示</h3>
                <p class="subtle">片段提示采集参数：{{ parameters(structure.probe) }}。建议放置物品不等同于完整材料清单。</p>
                <div class="rule-buttons"><button v-for="(entry, index) in rules" :key="entry.symbol" type="button" :aria-pressed="ruleIndex === ruleOffset + index"
                  @click="ruleIndex = ruleOffset + index; selected = null"><i :style="{ background: color(ruleOffset + index) }" />{{ entry.symbol }} <span>{{ entry.kind === 'air' ? '空气' : entry.kind === 'solid' ? '非空气' : '部件' }}</span></button></div>
                <Pager :total="piece.rules.length" :offset="ruleOffset" :limit="24" :busy="false" label="规则" @change="ruleOffset = $event" />
                <template v-if="activeRule">
                  <p v-if="activeRule.kind === 'air'">此位置要求为空气。</p><p v-else-if="activeRule.kind === 'solid'">此位置要求非空气方块。</p>
                  <p v-else-if="activeRule.placements == null">提供方没有列出此规则的建议放置物品。</p>
                  <p v-else-if="!activeRule.placements?.length">此规则未提供可放置物品。</p>
                  <div class="structure-items"><ItemLink v-for="id in placements" :key="id" :target="{ kind: 'item', id }" :records="records" :catalog="catalog" :animate="preferences.animate" @select="select" /></div>
                  <Pager v-if="activeRule.placements" :total="activeRule.placements.length" :offset="itemOffset" :limit="24" :busy="false" label="部件" @change="itemOffset = $event" />
                </template>
              </section>
              <section v-if="whole && built && buildRecords" class="structure-rules" aria-label="装配方块">
                <h3>放置的方块</h3><div class="rule-buttons"><button v-for="(block, index) in blockRows" :key="block.id" type="button"
                  :aria-pressed="blockIndex === blockOffset + index" @click="blockIndex = blockOffset + index; selected = null; showNbt = false">
                  {{ block.registry }} : {{ block.meta }} × {{ blockCounts.get(block.id) ?? 0 }}</button></div>
                <Pager :total="built.blocks.length" :offset="blockOffset" :limit="24" label="方块状态" @change="blockOffset = $event" />
                <template v-if="activeBlock"><p>{{ activeBlock.registry }} : {{ activeBlock.meta }}</p>
                  <ItemLink v-if="activeBlock.item" :target="{ kind: 'item', id: activeBlock.item }" :catalog="catalog" :records="buildRecords" :animate="preferences.animate" @select="select" />
                  <div v-if="activeBlock.nbt"><button type="button" class="quiet" :aria-expanded="showNbt" @click="showNbt = !showNbt">方块实体数据</button>
                    <pre v-if="showNbt" class="block-data">{{ JSON.stringify(activeBlock.nbt, null, 2) }}</pre></div>
                </template>
                <p v-for="note in built.build.notes" :key="note"><GameText :text="buildRecords.text(note)" /></p>
              </section>
            </template>
          </template>
          <div v-else class="state-panel empty"><h2>选择一个多方块</h2><p>查看结构片段、规则和控制器位置。</p></div>
        </section>
      </div>
    </template>
  </div>
</template>

<style scoped>
.structure-detail { padding: 24px; }
.piece-note { color: #b2c8d6; border-left: 2px solid #70c6ce; padding-left: 12px; font-size: .85rem; }
.structure-description { margin: 1rem 0; font-size: .9rem; }
.structure-description p { margin: .4rem 0; }
.piece-picker { display: flex; align-items: center; gap: .6rem; margin: 1rem 0; }
.structure-modes { width: fit-content; margin: 1rem 0; }
.block-data { overflow: auto; max-height: 320px; padding: 12px; background: #0a121c; font-size: 11px; }
.structure-position { padding: .7rem; border: 1px solid #416375; border-radius: 8px; }
.rule-buttons, .structure-items { display: flex; flex-wrap: wrap; gap: .5rem; }
.rule-buttons button { display: flex; align-items: center; gap: .5rem; }
.rule-buttons i { display: inline-block; width: 14px; height: 14px; border-radius: 3px; }
.rule-buttons span { font-size: .8rem; color: #a3b5c4; }
.structure-rules { border-top: 1px solid #294253; margin-top: 1rem; padding-top: 1rem; }
</style>
