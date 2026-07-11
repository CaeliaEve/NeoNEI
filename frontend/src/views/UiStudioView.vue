<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import {
  loadUiStudioReport,
  type UiStudioFamilyRow,
  type UiStudioFamilyStatus,
  type UiStudioReport,
  type UiStudioSlotSummary,
} from '../services/uiStudioRuntime';

const report = ref<UiStudioReport | null>(null);
const loading = ref(false);
const error = ref('');
const searchQuery = ref('');
const statusFilter = ref<'all' | UiStudioFamilyStatus>('all');
const selectedFamilyKey = ref<string | null>(null);
const copiedText = ref('');

const numberFormat = new Intl.NumberFormat('zh-CN');

const statusOptions: Array<{ key: 'all' | UiStudioFamilyStatus; label: string }> = [
  { key: 'all', label: '全部' },
  { key: 'unbound', label: '未绑定模板' },
  { key: 'missing-template', label: '缺少模板' },
  { key: 'unmapped-family', label: '未映射 UI' },
  { key: 'unregistered-component', label: '组件未注册' },
  { key: 'partial', label: '部分绑定' },
  { key: 'covered', label: '已适配' },
];

const filteredFamilies = computed(() => {
  const query = searchQuery.value.trim().toLowerCase();
  return (report.value?.families ?? []).filter((family) => {
    if (statusFilter.value !== 'all' && family.status !== statusFilter.value) return false;
    if (!query) return true;
    return [
      family.familyKey,
      family.canonicalMachineFamily,
      family.layoutKind,
      family.uiType,
      family.component,
      ...family.machineTypes,
      ...family.recipeTypes,
      ...family.modIds,
      ...family.handlerClasses,
      ...family.sampleRecipeIds,
    ]
      .filter(Boolean)
      .some((value) => `${value}`.toLowerCase().includes(query));
  });
});

const selectedRow = computed(() => {
  const families = report.value?.families ?? [];
  return families.find((row) => row.familyKey === selectedFamilyKey.value)
    ?? filteredFamilies.value[0]
    ?? null;
});

const statusCounts = computed(() => {
  const counts: Record<string, number> = { all: report.value?.families.length ?? 0 };
  for (const family of report.value?.families ?? []) {
    counts[family.status] = (counts[family.status] ?? 0) + 1;
  }
  return counts;
});

const kpis = computed(() => {
  const summary = report.value?.summary;
  return [
    { label: 'UI Families', value: formatNumber(summary?.familyCount), hint: `${formatNumber(summary?.coveredFamilyCount)} 已适配 / ${formatNumber(summary?.gapFamilyCount)} 缺口` },
    { label: 'Templates', value: formatNumber(summary?.templateCount), hint: `${formatNumber(summary?.slotCount)} slots / ${formatNumber(summary?.dynamicPrimitiveCount)} primitives` },
    { label: 'Recipe Bindings', value: formatNumber(summary?.bindingCount), hint: `${formatPercent(summary?.coverageRatio)} 已绑定` },
    { label: 'Unbound Recipes', value: formatNumber(summary?.unboundRecipeCount), hint: '优先处理未绑定和未映射 family' },
  ];
});

const canvasScale = computed(() => {
  const width = selectedRow.value?.width ?? 166;
  return Math.min(2.25, 390 / Math.max(1, width));
});

const canvasStyle = computed(() => {
  const row = selectedRow.value;
  const scale = canvasScale.value;
  const width = row?.width ?? 166;
  const height = row?.height ?? 90;
  return {
    width: `${Math.max(1, width * scale)}px`,
    height: `${Math.max(1, height * scale)}px`,
  };
});

function formatNumber(value: number | null | undefined): string {
  return typeof value === 'number' && Number.isFinite(value) ? numberFormat.format(value) : '—';
}

function formatPercent(value: number | null | undefined): string {
  return typeof value === 'number' && Number.isFinite(value) ? `${(value * 100).toFixed(2)}%` : '—';
}

function selectFamily(row: UiStudioFamilyRow): void {
  selectedFamilyKey.value = row.familyKey;
}

function slotRectStyle(slot: UiStudioSlotSummary): Record<string, string> {
  const scale = canvasScale.value;
  const columns = Math.max(1, slot.columns);
  const rows = Math.max(1, slot.rows);
  const width = slot.slotWidth + Math.max(0, columns - 1) * Math.max(slot.slotWidth, slot.pitchX || slot.slotWidth);
  const height = slot.slotHeight + Math.max(0, rows - 1) * Math.max(slot.slotHeight, slot.pitchY || slot.slotHeight);
  return {
    left: `${slot.x * scale}px`,
    top: `${slot.y * scale}px`,
    width: `${Math.max(1, width * scale)}px`,
    height: `${Math.max(1, height * scale)}px`,
  };
}

async function copyText(text: string | null | undefined): Promise<void> {
  const normalized = `${text ?? ''}`.trim();
  if (!normalized) return;
  try {
    await navigator.clipboard?.writeText(normalized);
    copiedText.value = normalized;
    window.setTimeout(() => {
      if (copiedText.value === normalized) copiedText.value = '';
    }, 1500);
  } catch (err) {
    console.warn('[ui-studio] clipboard write failed', err);
  }
}

async function loadStudio(): Promise<void> {
  loading.value = true;
  error.value = '';
  try {
    report.value = await loadUiStudioReport();
  } catch (err) {
    console.error('Failed to load UI Studio report:', err);
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    loading.value = false;
  }
}

watch(report, (next) => {
  if (!selectedFamilyKey.value && next?.families.length) {
    selectedFamilyKey.value = next.families[0].familyKey;
  }
});

onMounted(() => {
  void loadStudio();
});
</script>

<template>
  <main class="ui-studio-page">
    <header class="studio-hero">
      <div>
        <p class="eyebrow">NeoNEI Internal Tooling</p>
        <h1>配方 UI Studio / 适配工作台</h1>
        <p class="hero-copy">
          用当前 UI Pack 二进制运行时审计所有 recipe family：看哪些已经绑定到手写 Web UI，哪些还缺 template、mapping 或组件注册。
        </p>
      </div>
      <div class="hero-actions">
        <RouterLink class="ghost-button" to="/">返回首页</RouterLink>
        <button class="primary-button" :disabled="loading" @click="loadStudio">
          {{ loading ? '刷新中…' : '刷新 UI Pack' }}
        </button>
      </div>
    </header>

    <section v-if="error" class="error-card">
      <strong>UI Studio 加载失败</strong>
      <span>{{ error }}</span>
      <button class="ghost-button" @click="loadStudio">重试</button>
    </section>

    <section class="kpi-grid" aria-label="UI Studio summary">
      <article v-for="kpi in kpis" :key="kpi.label" class="kpi-card">
        <span>{{ kpi.label }}</span>
        <strong>{{ kpi.value }}</strong>
        <small>{{ kpi.hint }}</small>
      </article>
    </section>

    <section class="policy-strip">
      <div>
        <span class="policy-label">Asset Policy</span>
        <strong>{{ report?.policy.assetPolicy || '读取中…' }}</strong>
      </div>
      <div>
        <span class="policy-label">NEI 背景/整帧截图</span>
        <strong>{{ report?.policy.uiBackgroundStatus || '读取中…' }}</strong>
      </div>
      <div>
        <span class="policy-label">Pack Status</span>
        <strong>{{ report?.policy.packStatus || '读取中…' }}</strong>
      </div>
      <div>
        <span class="policy-label">Generated</span>
        <strong>{{ report?.policy.generatedAt || '—' }}</strong>
      </div>
    </section>

    <section class="studio-body">
      <aside class="family-panel">
        <div class="filters">
          <label>
            <span>搜索 family / machine / component / sample id</span>
            <input v-model="searchQuery" type="search" placeholder="gregtech-machine、Thaumcraft、GTUniversalMachineUI…" />
          </label>
          <div class="status-tabs" aria-label="status filters">
            <button
              v-for="option in statusOptions"
              :key="option.key"
              type="button"
              :class="{ active: statusFilter === option.key }"
              @click="statusFilter = option.key"
            >
              {{ option.label }}
              <span>{{ formatNumber(statusCounts[option.key] ?? 0) }}</span>
            </button>
          </div>
        </div>

        <div v-if="loading" class="loading-card">正在读取 UI Pack runtime…</div>
        <div v-else-if="filteredFamilies.length === 0" class="loading-card">没有匹配的 UI family。</div>
        <div v-else class="family-list" role="listbox" aria-label="UI family list">
          <button
            v-for="family in filteredFamilies"
            :key="family.familyKey"
            type="button"
            class="family-row"
            :class="[`status-${family.status}`, { selected: selectedRow?.familyKey === family.familyKey }]"
            @click="selectFamily(family)"
          >
            <span class="row-main">
              <strong>{{ family.familyKey }}</strong>
              <small>{{ family.layoutKind }} · {{ family.component || 'unmapped' }}</small>
            </span>
            <span class="row-metrics">
              <em>{{ family.statusLabel }}</em>
              <small>{{ formatNumber(family.boundRecipeCount) }} / {{ formatNumber(family.recipeCount) }}</small>
            </span>
          </button>
        </div>
      </aside>

      <section class="detail-panel" v-if="selectedRow">
        <div class="detail-header">
          <div>
            <p class="eyebrow">Selected Family</p>
            <h2>{{ selectedRow.familyKey }}</h2>
            <p>{{ selectedRow.gapReason || '该 family 已经绑定到手写组件，可作为新 UI 的参考样板。' }}</p>
          </div>
          <span class="status-badge" :class="`status-${selectedRow.status}`">{{ selectedRow.statusLabel }}</span>
        </div>

        <div class="detail-grid">
          <article>
            <span>UI Type</span>
            <strong>{{ selectedRow.uiType || '—' }}</strong>
          </article>
          <article>
            <span>Component</span>
            <strong>{{ selectedRow.component || '—' }}</strong>
          </article>
          <article>
            <span>Template</span>
            <button class="link-like" @click="copyText(selectedRow.templateKey)">{{ selectedRow.templateKey || '—' }}</button>
          </article>
          <article>
            <span>Coverage</span>
            <strong>{{ formatPercent(selectedRow.coverageRatio) }}</strong>
          </article>
          <article>
            <span>Canvas</span>
            <strong>{{ selectedRow.width || '—' }}×{{ selectedRow.height || '—' }} @ y={{ selectedRow.yShift ?? '—' }}</strong>
          </article>
          <article>
            <span>Slots</span>
            <strong>{{ formatNumber(selectedRow.slotCount) }} slots / {{ formatNumber(selectedRow.dynamicPrimitiveCount) }} primitives</strong>
          </article>
        </div>

        <div class="preview-and-metadata">
          <article class="template-preview-card">
            <div class="section-title">
              <h3>Template Geometry</h3>
              <span>{{ selectedRow.layoutKind }} · {{ selectedRow.canonicalMachineFamily }}</span>
            </div>
            <div class="template-canvas" :style="canvasStyle">
              <div
                v-for="slot in selectedRow.slots"
                :key="`${slot.role}-${slot.startIndex}-${slot.x}-${slot.y}`"
                class="slot-box"
                :style="slotRectStyle(slot)"
                :title="`${slot.role} ${slot.columns}×${slot.rows} @ ${slot.x},${slot.y}`"
              >
                <span>{{ slot.role }}</span>
              </div>
            </div>
            <p class="canvas-note">这里展示的是语义槽位几何，不加载 NEI 背景/整帧截图；后续手写 UI 以这些坐标做参考。</p>
          </article>

          <article class="metadata-card">
            <div class="section-title">
              <h3>适配线索</h3>
              <span>{{ formatNumber(selectedRow.handlerCount) }} handlers</span>
            </div>
            <dl>
              <dt>Machine Types</dt>
              <dd>{{ selectedRow.machineTypes.join('、') || '—' }}</dd>
              <dt>Mods</dt>
              <dd>{{ selectedRow.modIds.join('、') || '—' }}</dd>
              <dt>Handlers</dt>
              <dd>{{ selectedRow.handlerClasses.join('、') || '—' }}</dd>
            </dl>
          </article>
        </div>

        <div class="samples-card">
          <div class="section-title">
            <h3>Sample Recipe IDs</h3>
            <span v-if="copiedText">已复制</span>
          </div>
          <div class="sample-group">
            <strong>Bound</strong>
            <button
              v-for="recipeId in selectedRow.sampleBoundRecipeIds"
              :key="`bound-${recipeId}`"
              class="sample-pill"
              @click="copyText(recipeId)"
            >
              {{ recipeId }}
            </button>
            <span v-if="selectedRow.sampleBoundRecipeIds.length === 0">—</span>
          </div>
          <div class="sample-group warning">
            <strong>Unbound</strong>
            <button
              v-for="recipeId in selectedRow.sampleUnboundRecipeIds"
              :key="`unbound-${recipeId}`"
              class="sample-pill"
              @click="copyText(recipeId)"
            >
              {{ recipeId }}
            </button>
            <span v-if="selectedRow.sampleUnboundRecipeIds.length === 0">—</span>
          </div>
        </div>

        <div class="workflow-card">
          <h3>下一步适配流程</h3>
          <ol>
            <li>优先筛选“未绑定模板 / 未映射 UI”，复制 familyKey 和 sample recipeId。</li>
            <li>在 <code>uiTypeMapping.ts</code> 中把 familyKey 映射到明确的 uiType，不走启发式 NEI 背景兜底。</li>
            <li>为该 uiType 写独立组件，并在 recipe component catalog/registry 中注册。</li>
            <li>复跑 presentation coverage 与前端 typecheck/build，确认缺口减少。</li>
          </ol>
        </div>
      </section>
    </section>
  </main>
</template>

<style scoped>
.ui-studio-page {
  min-height: 100vh;
  padding: 28px;
  color: #e5eefc;
  background:
    radial-gradient(circle at 20% 0%, rgba(59, 130, 246, 0.22), transparent 34%),
    radial-gradient(circle at 85% 8%, rgba(14, 165, 233, 0.18), transparent 32%),
    #08111f;
}

.studio-hero,
.policy-strip,
.studio-body,
.error-card,
.kpi-card,
.detail-panel,
.family-panel {
  border: 1px solid rgba(148, 163, 184, 0.22);
  background: rgba(15, 23, 42, 0.82);
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.28);
  backdrop-filter: blur(14px);
}

.studio-hero {
  display: flex;
  justify-content: space-between;
  gap: 24px;
  align-items: flex-start;
  padding: 28px;
  border-radius: 24px;
}

.eyebrow,
.policy-label {
  margin: 0 0 8px;
  font-size: 12px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: #93c5fd;
}

.studio-hero h1,
.detail-header h2 {
  margin: 0;
  font-size: clamp(28px, 4vw, 44px);
  line-height: 1.05;
}

.hero-copy,
.detail-header p,
.canvas-note {
  max-width: 820px;
  color: #b6c4d9;
}

.hero-actions {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.primary-button,
.ghost-button,
.status-tabs button,
.family-row,
.sample-pill,
.link-like {
  cursor: pointer;
  color: inherit;
  border: 1px solid rgba(148, 163, 184, 0.28);
  background: rgba(15, 23, 42, 0.74);
}

.primary-button,
.ghost-button {
  padding: 10px 14px;
  border-radius: 999px;
  text-decoration: none;
}

.primary-button {
  border-color: rgba(96, 165, 250, 0.75);
  background: linear-gradient(135deg, #2563eb, #0891b2);
}

.primary-button:disabled {
  opacity: 0.55;
  cursor: wait;
}

.error-card {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-top: 18px;
  padding: 16px;
  border-color: rgba(248, 113, 113, 0.5);
  border-radius: 18px;
}

.kpi-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
  margin-top: 18px;
}

.kpi-card {
  padding: 18px;
  border-radius: 18px;
}

.kpi-card span,
.detail-grid span,
.section-title span {
  color: #94a3b8;
  font-size: 12px;
}

.kpi-card strong {
  display: block;
  margin: 8px 0;
  font-size: 30px;
}

.kpi-card small,
.row-main small,
.row-metrics small {
  color: #9fb0c8;
}

.policy-strip {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
  margin-top: 18px;
  padding: 16px;
  border-radius: 18px;
}

.policy-strip strong {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.studio-body {
  display: grid;
  grid-template-columns: minmax(360px, 0.42fr) minmax(520px, 1fr);
  gap: 18px;
  margin-top: 18px;
  padding: 18px;
  border-radius: 24px;
}

.family-panel,
.detail-panel {
  border-radius: 20px;
}

.family-panel {
  min-height: 620px;
  overflow: hidden;
}

.filters {
  position: sticky;
  top: 0;
  z-index: 1;
  padding: 16px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.18);
  background: rgba(15, 23, 42, 0.96);
}

.filters label span {
  display: block;
  margin-bottom: 8px;
  color: #b6c4d9;
  font-size: 12px;
}

.filters input {
  width: 100%;
  padding: 10px 12px;
  color: #e5eefc;
  border: 1px solid rgba(148, 163, 184, 0.28);
  border-radius: 12px;
  outline: none;
  background: rgba(2, 6, 23, 0.7);
}

.status-tabs {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 12px;
}

.status-tabs button {
  display: inline-flex;
  gap: 6px;
  align-items: center;
  padding: 7px 10px;
  border-radius: 999px;
  font-size: 12px;
}

.status-tabs button.active {
  border-color: rgba(96, 165, 250, 0.75);
  background: rgba(37, 99, 235, 0.3);
}

.family-list {
  max-height: 720px;
  overflow: auto;
  padding: 10px;
}

.family-row {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 12px;
  width: 100%;
  margin-bottom: 8px;
  padding: 12px;
  text-align: left;
  border-radius: 14px;
}

.family-row.selected {
  border-color: rgba(125, 211, 252, 0.9);
  background: rgba(14, 165, 233, 0.18);
}

.row-main,
.row-metrics {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.row-main strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.row-metrics {
  align-items: flex-end;
}

.row-metrics em {
  font-style: normal;
  font-size: 12px;
}

.loading-card {
  margin: 16px;
  padding: 20px;
  color: #b6c4d9;
  border: 1px dashed rgba(148, 163, 184, 0.35);
  border-radius: 16px;
}

.detail-panel {
  padding: 20px;
}

.detail-header {
  display: flex;
  justify-content: space-between;
  gap: 18px;
}

.status-badge {
  align-self: flex-start;
  padding: 7px 11px;
  border-radius: 999px;
  font-size: 12px;
  border: 1px solid rgba(148, 163, 184, 0.28);
}

.status-covered { border-color: rgba(34, 197, 94, 0.42); }
.status-partial { border-color: rgba(250, 204, 21, 0.48); }
.status-unbound,
.status-missing-template,
.status-unmapped-family,
.status-unregistered-component { border-color: rgba(248, 113, 113, 0.48); }

.detail-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  margin: 18px 0;
}

.detail-grid article,
.template-preview-card,
.metadata-card,
.samples-card,
.workflow-card {
  padding: 14px;
  border: 1px solid rgba(148, 163, 184, 0.18);
  border-radius: 16px;
  background: rgba(2, 6, 23, 0.38);
}

.detail-grid strong,
.detail-grid button {
  display: block;
  margin-top: 6px;
  overflow: hidden;
  max-width: 100%;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.link-like {
  padding: 0;
  text-align: left;
  color: #bfdbfe;
  border: none;
  background: transparent;
}

.preview-and-metadata {
  display: grid;
  grid-template-columns: minmax(360px, 0.9fr) minmax(240px, 1fr);
  gap: 14px;
}

.section-title {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: baseline;
  margin-bottom: 12px;
}

.section-title h3,
.workflow-card h3 {
  margin: 0;
}

.template-canvas {
  position: relative;
  overflow: hidden;
  min-width: 260px;
  min-height: 140px;
  border: 1px solid rgba(96, 165, 250, 0.3);
  border-radius: 12px;
  background:
    linear-gradient(rgba(148, 163, 184, 0.08) 1px, transparent 1px),
    linear-gradient(90deg, rgba(148, 163, 184, 0.08) 1px, transparent 1px),
    rgba(15, 23, 42, 0.8);
  background-size: 18px 18px;
}

.slot-box {
  position: absolute;
  display: grid;
  place-items: center;
  overflow: hidden;
  color: #dbeafe;
  border: 1px solid rgba(125, 211, 252, 0.75);
  border-radius: 6px;
  background: rgba(14, 165, 233, 0.2);
  font-size: 10px;
}

.slot-box span {
  max-width: 100%;
  overflow: hidden;
  padding: 0 3px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.metadata-card dl {
  display: grid;
  gap: 8px;
  margin: 0;
}

.metadata-card dt {
  color: #93c5fd;
  font-size: 12px;
}

.metadata-card dd {
  margin: 0;
  color: #d7e3f6;
}

.samples-card,
.workflow-card {
  margin-top: 14px;
}

.sample-group {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items: center;
  margin-top: 10px;
}

.sample-group strong {
  width: 72px;
  color: #93c5fd;
}

.sample-pill {
  max-width: 260px;
  overflow: hidden;
  padding: 7px 9px;
  border-radius: 999px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.warning .sample-pill {
  border-color: rgba(251, 191, 36, 0.48);
}

.workflow-card ol {
  margin: 10px 0 0;
  color: #cbd5e1;
}

.workflow-card code {
  color: #bfdbfe;
}

@media (max-width: 1180px) {
  .kpi-grid,
  .policy-strip,
  .studio-body,
  .preview-and-metadata,
  .detail-grid {
    grid-template-columns: 1fr;
  }

  .studio-hero {
    flex-direction: column;
  }
}
</style>
