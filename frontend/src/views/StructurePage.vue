<script setup lang="ts">
import {t,language} from '../i18n/index.ts';
import { computed, ref, shallowRef, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { canonical, type Cell, type Probe } from '@elysium/contracts';
import { Records, type StructureDetail, type BuildDetail, type StructureComponents } from '../catalog/client.ts';
import { ruleColor, type Volume } from '../catalog/scene.ts';
import { Models } from '../catalog/models.ts';
import { useCatalog } from '../state/catalog.ts';
import { useRequest } from '../state/request.ts';
import { usePreferences } from '../state/preferences.ts';
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
const information = computed(() => detail.value?.information ?? null);
const showComponents=ref(false),componentOffset=ref(0);
const {value:components,loading:loadingComponents,error:componentError,run:readComponents,clear:clearComponents}=useRequest<StructureComponents>();
const componentRecords=computed(()=>components.value?new Records(components.value.related):null);
const nativeTiers=computed(()=>new Map(information.value?.controller.data.tierItems.map(tier=>[tier.nativeHash,tier])??[]));
watch([id,snapshot],()=>{showComponents.value=false;componentOffset.value=0;clearComponents();});
watch([catalog,structure,showComponents,componentOffset],()=>{
  clearComponents();const session=catalog.value,selected=structure.value;
  if(session&&selected&&showComponents.value)void readComponents(signal=>session.structureComponents(selected.id,componentOffset.value,signal));
});
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
    if (value.build.structure !== definition.id) throw new Error(t('整体装配引用了其他结构'));
    if (canonical(value.build.probe) !== canonical(selected.probe)) throw new Error(t('整体装配参数与所选变体不一致'));
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
      if (page.offset !== offset || page.total !== part.chunks.length || !page.rows.length) throw new Error(t('结构分块分页与定义不一致'));
      for (let index = 0; index < page.rows.length; index++) {
        const shape = page.rows[index]!;
        if (shape.id !== part.chunks[offset + index]) throw new Error(t('结构引用与返回的几何不一致'));
        for (const cell of shape.cells) result.push(cell);
        if (result.length > part.cells || result.length > 1_048_576) throw new Error(t('结构几何超过声明大小'));
      }
      offset += page.rows.length;
      if (!signal.aborted) progress.value = result.length;
    }
    if (result.length !== part.cells) throw new Error(t('结构几何缺少声明的格位'));
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
  return [t('数量 {0}',probe.count), ...(channels.length ? channels : [t('默认通道')])].join(' · ');
}
function color(index: number): string { return 'rgb(' + ruleColor(index, piece.value?.rules[index]).map(value => Math.round(value * 255)).join(',') + ')'; }
function select(id: string, direction: 'recipes' | 'uses'): void {
  if (catalog.value) void router.push({ name: 'entry', params: { itemId: id }, query: { ...(route.query.offline === '1' ? { offline: '1' } : {}), catalog: catalog.value.manifest.id, direction } });
}
function show(id: string): void {
  if (catalog.value) void router.push({ name: 'structure', params: { id }, query: { ...(route.query.offline === '1' ? { offline: '1' } : {}), catalog: catalog.value.manifest.id, ...(item.value ? { item: item.value } : {}) } });
}
function all(): void { void router.push({ name: 'structures', query: catalog.value ? { ...(route.query.offline === '1' ? { offline: '1' } : {}), catalog: catalog.value.manifest.id } : {} }); }
</script>

<template>
  <div class="catalog-page">

    <section v-if="opening" class="state-panel" role="status"><h1>{{t("正在读取结构资料")}}</h1></section>
    <section v-else-if="openError" class="state-panel error" role="alert"><h1>{{t("数据集无法加载")}}</h1><p>{{ openError }}</p><button type="button" @click="open()">{{t("重试")}}</button></section>
    <template v-else-if="catalog">
      <aside v-if="catalog.manifest.scope === 'selection'" class="notice">{{t("当前为选定范围的采集结果。")}}</aside>
      <div class="industry-workspace">
        <TopicBrowser :catalog="catalog" kind="structure" :selected="id" :item="item" @select="show" @all="all" />
        <section class="panel industry-detail structure-detail" :aria-busy="reading">
          <div v-if="reading" class="state-panel" role="status">{{t("正在读取结构定义…")}}</div>
          <div v-else-if="detailError" class="state-panel error" role="alert">{{ detailError }} <button type="button" @click="open()">{{t("重试")}}</button></div>
          <template v-else-if="structure && records">
            <header><span class="eyebrow">{{t('结构')}}</span><h2><GameText :text="records.text(structure.name)" /></h2>
              <ItemLink :target="{ kind: 'item', id: structure.controller }" :records="records" :catalog="catalog" :animate="preferences.animate" @select="select" />
            </header>
            <div class="structure-description"><p v-for="line in structure.description" :key="line"><GameText :text="records.text(line)" /></p></div>
            <section v-if="information" class="native-structure-information">
              <h3>{{t("原生部件与构建参数")}}</h3>
              <p v-if="information.controller.data.hasTierData">{{t("原生扫描记录的参数上限：{0}。这是构建参数信息，不代表机器电压或完整成型条件。", information.controller.data.maxTier)}}</p>
              <p v-else-if="information.controller.data.hasData">{{t("原生扫描未记录分级规则。")}}</p>
              <p v-else>{{t("原生扫描未记录构建参数。")}}</p>
              <dl><template v-for="(maximum,channel) in information.controller.data.channels" :key="channel"><dt>{{ channel }}</dt><dd>{{ maximum }}</dd></template></dl>
              <button type="button" :aria-expanded="showComponents" @click="showComponents=!showComponents">{{ showComponents?t("收起部件关联"):t("查看部件关联") }}</button>
              <div v-if="showComponents">
                <p class="subtle">{{t("用于按部件查找结构，不代表必需数量或完整材料清单。")}}</p>
                <p v-if="loadingComponents" role="status">{{t("正在读取部件关联…")}}</p>
                <p v-else-if="componentError" role="alert">{{ componentError }}</p>
                <template v-else-if="components && componentRecords">
                  <div v-for="component in components.rows" :key="component.id" class="native-component-row">
                    <p v-if="!component.data.items.length">{{t("原生关联没有可显示的物品列表样本。")}}</p>
                    <ItemLink v-for="item in component.data.items" :key="item" :target="{ kind: 'item', id: item }"
                      :catalog="catalog" :records="componentRecords" :animate="preferences.animate" @select="select" />
                    <p v-if="nativeTiers.has(component.data.nativeHash)" class="subtle">{{t("构建参数")}} {{ nativeTiers.get(component.data.nativeHash)?.tier }}<template v-if="nativeTiers.get(component.data.nativeHash)?.channels.length"> · {{ nativeTiers.get(component.data.nativeHash)?.channels.join(' / ') }}</template></p>
                  </div>
                  <Pager :total="components.total" :offset="componentOffset" :limit="20" :busy="loadingComponents" :label="t('部件关联')" @change="componentOffset=$event" />
                </template>
              </div>
            </section>
            <p v-if="structure.problem" class="notice"><GameText :text="records.text(structure.problem)" /></p>
            <p v-if="structure.definitionKind === 'construction' || structure.definitionKind === 'gtconstruction'" class="piece-note">{{t("原生构建器通过回调生成几何，未提供可枚举的片段定义。下方展示实际构建结果与方块状态。")}}</p>
            <div class="segmented structure-modes" role="group" :aria-label="t('结构视图')"><button type="button" :aria-pressed="whole" :class="{ active: whole }" @click="mode = 'build'">{{t("整体装配")}}</button>
              <button type="button" :aria-pressed="!whole" :class="{ active: !whole }" :disabled="!structure.pieces.length" @click="mode = 'piece'">{{t("片段定义")}}</button></div>
            <label v-if="whole && structure.variants.length > 1" class="piece-picker">{{t("构建参数")}} <select v-model.number="variantIndex" :aria-label="t('构建参数')"><option v-for="(entry, index) in structure.variants" :key="index" :value="index">{{ parameters(entry.probe) }}{{ entry.problem ? t("（无法构建）") : '' }}</option></select></label>
            <p v-if="whole && !variant" class="notice" role="alert">{{t("请求的构建参数不存在。")}}<button type="button" @click="variantIndex = 0">{{t("查看首组参数")}}</button></p>
            <p v-else-if="whole && variant?.problem" class="notice" role="status">{{t("当前参数无法构建：")}}<GameText :text="records.text(variant.problem)" /></p>
            <p v-if="whole && loadingBuild" role="status">{{t("正在读取整体装配…")}}</p>
            <p v-else-if="whole && buildError" class="inline-error" role="alert">{{ buildError }} <button type="button" @click="open()">{{t("重试")}}</button></p>
            <template v-if="current && volume">
              <label v-if="!whole" class="piece-picker">{{t("结构片段")}} <select v-model.number="pieceIndex" :aria-label="t('结构片段')"><option v-for="(part, index) in structure.pieces" :key="part.name" :value="index">{{ part.name }}</option></select></label>
              <p class="subtle">{{t("坐标范围 {0} · {1} 个{2}", current.size.join(' × '), current.cells.toLocaleString(language), whole ? t("已放置方块") : t("规则格位"))}}</p>
              <p class="piece-note">{{ whole ? t("原生构建器在独立预览世界中放置的整体结构。成型条件仍由游戏模组判定。") : t("游戏提供的结构定义与建议部件，保留各个片段的原始坐标。") }}</p>
              <p v-if="whole && built?.build.completion === 'nativeDisplayBeforeControllerTick'" class="piece-note">{{t("此为原生构建器的展示结构，保留展示花，采集于控制器执行游戏逻辑之前；不代表附魔台已满足成型条件。")}}</p>
              <p v-if="whole && built?.build.completion === 'nativeDisplayBeforeUnavailableTileTick'" class="piece-note">{{t("此为当前环境未启用的 Railcraft 碎石机原生展示结构，采集于其控制器自移除之前；不表示该机器在当前环境可用。")}}</p>
              <p v-if="whole && built" class="subtle">{{ parameters(built.build.probe) }} · {{ built.build.facing === 'north' ? t("构建朝向北（原生默认）") : t("构建朝向南") }}</p>
              <div v-if="whole && built" class="segmented structure-modes" role="group" :aria-label="t('装配显示')">
                <button type="button" :aria-pressed="native" :class="{ active: native }" :disabled="!built.build.rendered || !built.build.palette.some(entry => entry.model)" @click="appearance = 'model'">{{t("原生外观")}}</button>
                <button type="button" :aria-pressed="!native" :class="{ active: !native }" @click="appearance = 'blocks'">{{t("方块示意")}}</button>
              </div>
              <p v-if="whole && built && !built.build.rendered" class="subtle">{{t("此数据集未采集外观，当前显示方块示意。")}}</p>
              <details v-if="whole && modelProblems.length && buildRecords" class="notice"><summary>{{t("部分外观未采集（{0}）", modelProblems.length)}}</summary>
                <p v-for="problem in modelProblems" :key="problem"><GameText :text="buildRecords.text(problem)" /></p></details>
              <p v-if="loadingGeometry" role="status">{{t("正在读取几何：{0} / {1}", progress.toLocaleString(language), current.cells.toLocaleString(language))}}</p>
              <p v-else-if="geometryError" class="inline-error" role="alert">{{ geometryError }} <button type="button" @click="geometry">{{t("重试")}}</button></p>
              <p v-if="native && loadingModels" role="status">{{t("正在读取模型与纹理…")}}</p>
              <p v-else-if="native && modelError" class="inline-error" role="alert">{{ modelError }}</p>
              <p v-if="native && hiddenCells" class="subtle">{{t("原生渲染中有 {0} 个位置不单独绘制，方块数量仍计入统计。", hiddenCells)}}</p>
              <StructureView v-if="cells && !geometryError && (!native || models)" :volume="volume" :cells="cells" :models="native ? models : null" :animate="preferences.animate" :label="whole ? t('方块') : t('规则')"
                :caption="native ? '原生模型与纹理，金色线框标记控制器。' : whole ? '方块示意图，金色标记控制器。' : '颜色表示结构规则，金色标记控制器，蓝色标记空气。'" @select="pick" />
              <p v-if="selected" class="structure-position" role="status">{{t("坐标 A {0} · B {1} · C {2} — {3}", selected.at[0], selected.at[1], selected.at[2], selected.index < 0 ? t("控制器") : whole ? activeBlock?.registry : t("规则 ") + activeRule?.symbol)}}</p>
              <section v-if="!whole && piece" class="structure-rules" :aria-label="t('结构规则')">
                <h3>{{t("部件提示")}}</h3>
                <p class="subtle">{{t("片段提示采集参数：{0}。建议放置物品不等同于完整材料清单。", parameters(structure.probe))}}</p>
                <div class="rule-buttons"><button v-for="(entry, index) in rules" :key="entry.symbol" type="button" :aria-pressed="ruleIndex === ruleOffset + index"
                  @click="ruleIndex = ruleOffset + index; selected = null"><i :style="{ background: color(ruleOffset + index) }" />{{ entry.symbol }} <span>{{ entry.kind === 'air' ? t("空气") : entry.kind === 'solid' ? t("非空气") : t("部件") }}</span></button></div>
                <Pager :total="piece.rules.length" :offset="ruleOffset" :limit="24" :busy="false" :label="t('规则')" @change="ruleOffset = $event" />
                <template v-if="activeRule">
                  <p v-if="activeRule.kind === 'air'">{{t("此位置要求为空气。")}}</p><p v-else-if="activeRule.kind === 'solid'">{{t("此位置要求非空气方块。")}}</p>
                  <p v-else-if="activeRule.placements == null">{{t("提供方没有列出此规则的建议放置物品。")}}</p>
                  <p v-else-if="!activeRule.placements?.length">{{t("此规则未提供可放置物品。")}}</p>
                  <div class="structure-items"><ItemLink v-for="id in placements" :key="id" :target="{ kind: 'item', id }" :records="records" :catalog="catalog" :animate="preferences.animate" @select="select" /></div>
                  <Pager v-if="activeRule.placements" :total="activeRule.placements.length" :offset="itemOffset" :limit="24" :busy="false" :label="t('部件')" @change="itemOffset = $event" />
                </template>
              </section>
              <section v-if="whole && built && buildRecords" class="structure-rules" :aria-label="t('装配方块')">
                <h3>{{t("放置的方块")}}</h3><div class="rule-buttons"><button v-for="(block, index) in blockRows" :key="block.id" type="button"
                  :aria-pressed="blockIndex === blockOffset + index" @click="blockIndex = blockOffset + index; selected = null; showNbt = false">
                  {{ block.registry }} : {{ block.meta }} × {{ blockCounts.get(block.id) ?? 0 }}</button></div>
                <Pager :total="built.blocks.length" :offset="blockOffset" :limit="24" :label="t('方块状态')" @change="blockOffset = $event" />
                <template v-if="activeBlock"><p>{{ activeBlock.registry }} : {{ activeBlock.meta }}</p>
                  <ItemLink v-if="activeBlock.item" :target="{ kind: 'item', id: activeBlock.item }" :catalog="catalog" :records="buildRecords" :animate="preferences.animate" @select="select" />
                  <div v-if="activeBlock.nbt"><button type="button" class="quiet" :aria-expanded="showNbt" @click="showNbt = !showNbt">{{t("方块实体数据")}}</button>
                    <pre v-if="showNbt" class="block-data">{{ JSON.stringify(activeBlock.nbt, null, 2) }}</pre></div>
                </template>
                <p v-for="note in built.build.notes" :key="note"><GameText :text="buildRecords.text(note)" /></p>
              </section>
            </template>
          </template>
          <div v-else class="state-panel empty"><h2>{{t("选择一个多方块")}}</h2><p>{{t("查看结构片段、规则和控制器位置。")}}</p></div>
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
.native-structure-information {margin:1rem 0;padding:1rem;border:1px solid var(--border);border-radius:8px;overflow-wrap:anywhere;}
.native-structure-information dl {display:grid;grid-template-columns:minmax(0,1fr) auto;gap:.35rem 1rem;max-width:28rem;}
.native-component-row {display:flex;flex-wrap:wrap;gap:.5rem;align-items:center;margin:.75rem 0;}
.native-component-row p {flex-basis:100%;}
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
