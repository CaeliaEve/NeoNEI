<script setup lang="ts">
import {t} from '../i18n/index.ts';
import {computed, watch} from 'vue';
import {useRoute} from 'vue-router';
import {useRouter} from 'vue-router';
import {Records} from '../catalog/client.ts';
import type {DraconicReactorPage} from '../catalog/draconic-reactor.ts';
import {useCatalog} from '../state/catalog.ts';
import {useRequest} from '../state/request.ts';
import {usePreferences} from '../state/preferences.ts';
import {itemLocation} from '../router/workspace.ts';
import ItemLink from '../components/ItemLink.vue';

const route = useRoute(), router = useRouter();
const {catalog, opening, error: openError, open} = useCatalog(computed(() => typeof route.query.catalog === 'string' ? route.query.catalog : ''));
const {preferences} = usePreferences();
const {value: page, error, loading, run, clear} = useRequest<DraconicReactorPage>();
const records = computed(() => page.value ? new Records(page.value.related) : null);
const data = computed(() => page.value?.definition?.data);
const fuelNames = {block: '燃料块', ingot: '燃料锭', nugget: '燃料粒'};
const productNames = {tiny: '微型碎片', small: '小型碎片', large: '大型碎片', full: '完整碎片'};
function load() { const session = catalog.value; if (session) void run(signal => session.draconicReactor(signal)); }
watch(catalog, () => { clear(); load(); }, {immediate: true});
function select(id: string, direction: 'recipes' | 'uses') { void router.push(itemLocation(id, route.query, direction === 'uses' ? 'usedIn' : 'producedBy')); }
</script>

<template>
  <section v-if="opening" role="status" class="state-panel">{{t("正在读取反应堆资料…")}}</section>
  <section v-else-if="openError" role="alert" class="state-panel error">{{openError}} <button @click="open()">{{t("重试")}}</button></section>
  <main v-else-if="catalog" class="panel reactor-page">
    <h1>{{t("龙之进化反应堆")}}</h1>
    <p>{{t("燃料会在运行中转换，功率和速度受温度、能量饱和度、转换比例与配置影响；不能按一件材料换一件成品理解。")}}</p>
    <p v-if="loading" role="status">{{t("正在读取原生定义…")}}</p>
    <p v-else-if="error" role="alert" class="inline-error">{{error}} <button @click="load">{{t("重试")}}</button></p>
    <p v-else-if="!data" class="state-panel">{{t("当前数据集未包含反应堆资料。")}}</p>
    <template v-else-if="records">
      <ItemLink :target="{kind:'item', id:data.core}" :records="records" :catalog="catalog" :animate="preferences.animate" @select="select" />
      <section class="reactor-section">
        <h2>{{t("燃料单位")}}</h2>
        <p>{{t("按矿辞匹配燃料；匹配顺序为块、锭、粒。图标表示原生示例，不是只允许这一种物品。")}}</p>
        <table><thead><tr><th>{{t("形式")}}</th><th>{{t("物品")}}</th><th>{{t("单件燃料单位")}}</th></tr></thead><tbody>
          <tr v-for="row in data.fuels" :key="row.role"><td>{{t(fuelNames[row.role])}}</td><td><ItemLink :target="{kind:'item',id:row.item}" :records="records" :catalog="catalog" :animate="preferences.animate" @select="select" /></td><td>{{row.units}}</td></tr>
        </tbody></table>
      </section>
      <section class="reactor-section">
        <h2>{{t("转换燃料与产物单位")}}</h2>
        <table><thead><tr><th>{{t("形式")}}</th><th>{{t("物品")}}</th><th>{{t("单件所需转换单位")}}</th></tr></thead><tbody>
          <tr v-for="row in data.products" :key="row.role"><td>{{t(productNames[row.role])}}</td><td><ItemLink :target="{kind:'item',id:row.item}" :records="records" :catalog="catalog" :animate="preferences.animate" @select="select" /></td><td>{{row.units}}</td></tr>
        </tbody></table>
        <p v-if="data.fuels.some(row=>row.units==='0') || data.products.some(row=>row.units==='0')">{{t("配置包含零单位值，不能据此计算正常转换比例。")}}</p>
      </section>
      <section class="reactor-section reactor-rules">
        <h2>{{t("取出规则")}}</h2>
        <p>{{t("手动取放只在反应堆停机（OFFLINE）状态提供。优先返还未转换的燃料，再取出微型、小型或大型碎片。")}}</p>
        <p>{{t("原生界面以 {0} 份为升级取出形式的门槛：燃料锭数量达到门槛才优先返还块，小型碎片数量达到门槛才优先取出大型碎片；手动取出不直接生成完整碎片。", data.manualStackUpgradeThreshold)}}</p>
        <p>{{t("自动化{0}。原生自动化接口只有在转换燃料严格大于完整碎片所需 {1} 单位时才提供完整碎片；等于该值时不提供。", data.config.automation?t("已启用"):t("未启用"), data.products[3]?.units)}}</p>
      </section>
      <section class="reactor-section">
        <h2>{{t("导出时配置")}}</h2>
        <dl><dt>{{t("已加载燃料容量")}}</dt><dd>{{data.config.maximumFuelStorage}}</dd><dt>{{t("当前配置容量")}}</dt><dd>{{data.config.configuredFuelStorage}}</dd>
          <dt>{{t("发电倍率")}}</dt><dd>{{data.config.outputMultiplier}}</dd><dt>{{t("燃料用量倍率")}}</dt><dd>{{data.config.fuelUsageMultiplier}}</dd>
          <dt>{{t("燃料公式")}}</dt><dd>{{data.config.linearFuelUsage?t("线性"):t("饱和度幂函数")}}</dd><dt>{{t("大型爆炸")}}</dt><dd>{{data.config.largeExplosion?t("启用"):t("关闭")}}</dd></dl>
        <p>{{t("这是导出时客户端的定义与配置；实际运行状态和服务器配置可能不同，没有固定运行时间或固定发电量。")}}</p>
      </section>
    </template>
  </main>
</template>

<style scoped>
.reactor-page{margin:1rem;max-width:1100px;padding:1.2rem;color:var(--text,#e2e8f0)}
.reactor-section{margin-top:1rem;padding:1rem;border:1px solid var(--border,#334155);border-radius:.7rem;background:var(--surface,#101b2b)}
.reactor-page p{line-height:1.65;overflow-wrap:anywhere}.reactor-page h2{font-size:1.1rem}.reactor-page table{width:100%;border-collapse:collapse}
.reactor-page th,.reactor-page td{text-align:left;padding:.6rem;border-bottom:1px solid var(--border,#334155)}
.reactor-page dl{display:grid;grid-template-columns:auto 1fr;gap:.6rem 1rem}.reactor-page dd{margin:0}
</style>
