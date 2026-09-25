<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { api, type RuntimeHealthSummary } from '../services/api';

const health = ref<RuntimeHealthSummary | null>(null);
const loading = ref(false);
const error = ref('');

const numberFormat = new Intl.NumberFormat('zh-CN');
const byteFormat = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 });

const statusLabel = computed(() => {
  const status = health.value?.status ?? (loading.value ? 'loading' : 'degraded');
  if (status === 'ok') return '健康';
  if (status === 'warning') return '警告';
  if (status === 'blocked') return '阻塞';
  if (status === 'loading') return '读取中';
  return '降级';
});

const statusTone = computed(() => `tone-${health.value?.status ?? (loading.value ? 'loading' : 'degraded')}`);

const keyCounts = computed<Array<[string, number | null | undefined]>>(() => {
  const counts = health.value?.counts ?? {};
  return [
    ['物品', counts.items],
    ['配方', counts.recipes],
    ['浏览条目', counts.browserItems],
    ['折叠分组', counts.browserGroups],
    ['纹理', counts.textures],
    ['Atlas 条目', counts.browserAtlasItems],
    ['动画 Atlas', counts.animatedBrowserAtlasItems],
    ['处理器', counts.recipeHandlers],
  ];
});

const validationRows = computed<Array<[string, string | number | null | undefined]>>(() => {
  const validation = health.value?.validation;
  const coverage = health.value?.coverage ?? {};
  return [
    ['迁移准备', validation?.migrationReadinessStatus],
    ['浏览契约', validation?.neiBrowserContractStatus],
    ['配方碎片', validation?.recipeFragmentationStatus],
    ['路径卫生', validation?.exportPathHygieneStatus],
    ['Atlas 覆盖率', formatRatio(coverage.atlasCoverageRatio)],
    ['缺失 Atlas', coverage.semanticAtlasMissing],
    ['预期动画', coverage.expectedAnimatedItems],
    ['动画缺口', coverage.staticWhenExpectedAnimated],
  ];
});

const runtimeSnapshotRows = computed<Array<[string, string | number | null | undefined]>>(() => {
  const snapshot = health.value?.runtimeSnapshot;
  return [
    ['探针状态', snapshot?.status],
    ['可用', snapshot?.available ? 'yes' : 'no'],
    ['Revision', snapshot?.revision],
    ['Runtime ID', snapshot?.runtimeId],
    ['Schema', snapshot?.runtimeSchemaRevision],
    ['Manifest', snapshot?.manifestPath],
    ['Fingerprint', snapshot?.fingerprint],
  ];
});

const nativeUiRows = computed<Array<[string, string | number | null | undefined]>>(() => {
  const nativeUi = health.value?.nativeUi;
  return [
    ['证明状态', nativeUi?.status],
    ['布局数', nativeUi?.counts.layouts],
    ['槽位数', nativeUi?.counts.slots],
    ['UI Pack artifacts', nativeUi?.counts.uiPackArtifacts],
    ['UI Pack bytes', nativeUi?.counts.uiPackArtifactBytes],
    ['违规数', nativeUi?.counts.violationCount],
    ['Export ABI report', nativeUi?.reports.nativeUiExportAbi.path],
    ['UI Pack ABI report', nativeUi?.reports.uiPackAbi.path],
  ];
});

const nativeRenderRows = computed<Array<[string, string | number | null | undefined]>>(() => {
  const nativeRender = health.value?.nativeRender;
  return [
    ['诊断状态', nativeRender?.status],
    ['Manifest', nativeRender?.manifestPath],
    ['Native Render Index', nativeRender?.nativeRenderIndexPath],
    ['缺失/失败检查', nativeRender?.missing.length],
    ['错误数', nativeRender?.errors.length],
    ['Item renderers', nativeRender?.counts.itemRendererByItemId],
    ['Shader items', nativeRender?.counts.shaderItems],
    ['Framebuffer captures', nativeRender?.counts.framebufferCaptures],
    ['Capture gate', nativeRender?.validation.status],
  ];
});

const runtimeHealthArtifacts = computed(() => Object.values(health.value?.artifacts?.probes ?? {}));
const nativeRenderArtifacts = computed(() => Object.values(health.value?.nativeRender?.artifacts ?? {}));

function formatNumber(value: number | null | undefined): string {
  return typeof value === 'number' && Number.isFinite(value) ? numberFormat.format(value) : '—';
}

function formatBytes(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  let current = value;
  let unitIndex = 0;
  while (current >= 1024 && unitIndex < units.length - 1) {
    current /= 1024;
    unitIndex += 1;
  }
  return `${byteFormat.format(current)} ${units[unitIndex]}`;
}

function formatRatio(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  return `${(value * 100).toFixed(3)}%`;
}

async function loadHealth(): Promise<void> {
  loading.value = true;
  error.value = '';
  try {
    health.value = await api.getRuntimeHealth();
  } catch (err) {
    console.error('Failed to load runtime health:', err);
    error.value = '读取运行时健康信息失败，请确认后端已启动并且 /runtime/health 可访问。';
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  void loadHealth();
});
</script>

<template>
  <main class="runtime-health-view">
    <section class="health-hero">
      <div>
        <p class="eyebrow">NeoNEI Runtime Observatory</p>
        <h1>运行时健康面板</h1>
        <p class="subtitle">
          汇总当前 dist-data、图集、搜索、配方、语义分组和 API 契约状态。
        </p>
      </div>
      <div class="status-orb" :class="statusTone">
        <span>{{ statusLabel }}</span>
        <small>{{ health?.status ?? (loading ? 'loading' : 'empty') }}</small>
      </div>
    </section>

    <div class="toolbar">
      <RouterLink class="back-link" to="/">返回主页</RouterLink>
      <button type="button" :disabled="loading" @click="loadHealth">
        {{ loading ? '刷新中…' : '刷新状态' }}
      </button>
    </div>

    <p v-if="error" class="error">{{ error }}</p>

    <section v-if="loading && !health" class="panel empty-panel">
      <h2>正在读取运行时数据…</h2>
      <p>正在连接后端健康接口，请稍候。</p>
    </section>

    <section v-else-if="!health && !error" class="panel empty-panel">
      <h2>暂无健康数据</h2>
      <p>点击“刷新状态”重新读取。</p>
    </section>

    <section v-if="health" class="health-grid">
      <article class="panel wide">
        <h2>数据身份</h2>
        <dl class="identity-list">
          <div><dt>来源</dt><dd>{{ health.distData?.source ?? '—' }}</dd></div>
          <div><dt>导出名称</dt><dd>{{ health.distData?.sourceRepository ?? '—' }}</dd></div>
          <div><dt>生成时间</dt><dd>{{ health.distData?.generatedAt ?? health.generatedAt ?? '—' }}</dd></div>
          <div><dt>导出配置</dt><dd>{{ health.distData?.runtime?.exporterSelection ?? '—' }}</dd></div>
        </dl>
      </article>

      <article class="panel">
        <h2>核心计数</h2>
        <div class="metric-grid">
          <div v-for="[label, value] in keyCounts" :key="label" class="metric">
            <span>{{ label }}</span>
            <strong>{{ formatNumber(value) }}</strong>
          </div>
        </div>
      </article>

      <article class="panel">
        <h2>契约与覆盖率</h2>
        <dl class="validation-list">
          <div v-for="[label, value] in validationRows" :key="label">
            <dt>{{ label }}</dt>
            <dd>{{ typeof value === 'number' ? formatNumber(value) : (value ?? '—') }}</dd>
          </div>
        </dl>
      </article>

      <article class="panel">
        <h2>文件包</h2>
        <div class="metric-grid compact">
          <div class="metric"><span>声明文件</span><strong>{{ formatNumber(health.files?.declared) }}</strong></div>
          <div class="metric"><span>存在文件</span><strong>{{ formatNumber(health.files?.present) }}</strong></div>
          <div class="metric"><span>缺失文件</span><strong>{{ formatNumber(health.files?.missing?.length) }}</strong></div>
          <div class="metric"><span>总大小</span><strong>{{ formatBytes(health.files?.totalBytes) }}</strong></div>
        </div>
        <ul v-if="health.files?.missing?.length" class="issue-list">
          <li v-for="entry in health.files.missing.slice(0, 8)" :key="entry.key">
            {{ entry.key }} · {{ entry.path }}
          </li>
        </ul>
      </article>

      <article class="panel wide">
        <h2>Runtime Health Artifact Probes</h2>
        <div class="metric-grid compact">
          <div class="metric"><span>Probe status</span><strong>{{ health.artifacts?.status ?? 'unknown' }}</strong></div>
          <div class="metric"><span>Probe count</span><strong>{{ formatNumber(runtimeHealthArtifacts.length) }}</strong></div>
          <div class="metric"><span>Probe errors</span><strong>{{ formatNumber(health.artifacts?.errors?.length) }}</strong></div>
        </div>
        <ul v-if="runtimeHealthArtifacts.length" class="issue-list">
          <li v-for="artifact in runtimeHealthArtifacts" :key="artifact.name">
            {{ artifact.name }} / {{ artifact.status }} / {{ artifact.relativePath ?? artifact.path ?? 'unknown' }}
            <template v-if="artifact.error"> / {{ artifact.error }}</template>
          </li>
        </ul>
      </article>

      <article class="panel">
        <h2>Runtime Snapshot</h2>
        <dl class="validation-list single">
          <div v-for="[label, value] in runtimeSnapshotRows" :key="label">
            <dt>{{ label }}</dt>
            <dd>{{ typeof value === 'number' ? formatNumber(value) : (value ?? '—') }}</dd>
          </div>
        </dl>
        <div class="metric-grid compact">
          <div class="metric"><span>Snapshot 声明</span><strong>{{ formatNumber(health.runtimeSnapshot?.declaredFiles) }}</strong></div>
          <div class="metric"><span>Snapshot 存在</span><strong>{{ formatNumber(health.runtimeSnapshot?.presentArtifacts) }}</strong></div>
          <div class="metric"><span>Snapshot 缺失</span><strong>{{ formatNumber(health.runtimeSnapshot?.missingArtifacts?.length) }}</strong></div>
          <div class="metric"><span>Snapshot 大小</span><strong>{{ formatBytes(health.runtimeSnapshot?.totalBytes) }}</strong></div>
        </div>
        <ul v-if="health.runtimeSnapshot?.missingArtifacts?.length" class="issue-list">
          <li v-for="artifact in health.runtimeSnapshot.missingArtifacts.slice(0, 8)" :key="artifact">
            {{ artifact }}
          </li>
        </ul>
      </article>

      <article class="panel">
        <h2>阻塞项</h2>
        <ul class="issue-list">
          <li v-for="gate in health.validation?.blockedGates ?? []" :key="gate">{{ gate }}</li>
          <li v-for="reason in health.nativeUi?.blocked ?? []" :key="reason">{{ reason }}</li>
          <li v-for="artifactError in health.artifacts?.errors ?? []" :key="artifactError">{{ artifactError }}</li>
          <li v-for="snapshotError in health.runtimeSnapshot?.errors ?? []" :key="snapshotError">{{ snapshotError }}</li>
          <li v-if="health.validation?.compilerValidationBlocked">compiler validation blocked</li>
          <li
            v-if="!(health.validation?.blockedGates ?? []).length
              && !(health.nativeUi?.blocked ?? []).length
              && !(health.artifacts?.errors ?? []).length
              && !(health.runtimeSnapshot?.errors ?? []).length
              && !health.validation?.compilerValidationBlocked"
          >
            暂无阻塞
          </li>
        </ul>
      </article>

      <article class="panel wide">
        <h2>Native UI 证明链</h2>
        <dl class="validation-list">
          <div v-for="[label, value] in nativeUiRows" :key="label">
            <dt>{{ label }}</dt>
            <dd>
              {{
                label.toLowerCase().includes('bytes')
                  ? formatBytes(typeof value === 'number' ? value : null)
                  : typeof value === 'number' ? formatNumber(value) : (value ?? '—')
              }}
            </dd>
          </div>
        </dl>
      </article>

      <article class="panel wide">
        <h2>Native Render 诊断探针</h2>
        <dl class="validation-list">
          <div v-for="[label, value] in nativeRenderRows" :key="label">
            <dt>{{ label }}</dt>
            <dd>{{ typeof value === 'number' ? formatNumber(value) : (value ?? '—') }}</dd>
          </div>
        </dl>
        <ul v-if="nativeRenderArtifacts.length" class="issue-list">
          <li v-for="artifact in nativeRenderArtifacts" :key="artifact.name">
            {{ artifact.name }} · {{ artifact.status }} · {{ artifact.relativePath ?? artifact.path ?? '—' }}
            <template v-if="artifact.error"> · {{ artifact.error }}</template>
          </li>
        </ul>
        <ul v-if="health.nativeRender?.errors?.length" class="issue-list">
          <li v-for="nativeRenderError in health.nativeRender.errors" :key="nativeRenderError">
            {{ nativeRenderError }}
          </li>
        </ul>
      </article>
    </section>
  </main>
</template>

<style scoped>
.runtime-health-view {
  min-height: 100vh;
  padding: 34px clamp(18px, 4vw, 60px);
  color: rgba(245, 248, 255, 0.94);
  background:
    radial-gradient(circle at 18% 12%, rgba(78, 189, 255, 0.13), transparent 34%),
    radial-gradient(circle at 82% 8%, rgba(180, 117, 255, 0.11), transparent 32%),
    linear-gradient(135deg, #05070d 0%, #0b1020 48%, #060811 100%);
}

.health-hero,
.panel {
  border: 1px solid rgba(162, 183, 220, 0.18);
  background:
    radial-gradient(120% 160% at 18% 0%, rgba(83, 111, 165, 0.18), transparent 48%),
    linear-gradient(145deg, rgba(18, 22, 32, 0.86), rgba(7, 9, 15, 0.78));
  box-shadow: 0 22px 70px rgba(0, 0, 0, 0.42), inset 0 1px 0 rgba(255, 255, 255, 0.06);
  backdrop-filter: blur(18px);
  border-radius: 26px;
}

.health-hero {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  padding: 30px;
}

.eyebrow {
  margin: 0 0 8px;
  color: rgba(133, 211, 255, 0.78);
  font-size: 12px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
}

h1,
h2,
.subtitle { margin: 0; }

h1 {
  font-size: clamp(30px, 4vw, 52px);
  letter-spacing: -0.04em;
}

h2 {
  font-size: 16px;
  color: rgba(234, 241, 255, 0.9);
}

.subtitle {
  margin-top: 10px;
  color: rgba(206, 216, 237, 0.68);
}

.status-orb {
  width: 126px;
  height: 126px;
  flex: 0 0 auto;
  border-radius: 50%;
  display: grid;
  place-items: center;
  text-align: center;
  border: 1px solid rgba(255, 255, 255, 0.16);
  background: radial-gradient(circle at 50% 42%, rgba(116, 225, 255, 0.25), rgba(13, 18, 30, 0.86) 62%);
  box-shadow: 0 0 38px rgba(83, 185, 255, 0.2), inset 0 0 26px rgba(255, 255, 255, 0.08);
}

.status-orb span { font-weight: 800; font-size: 20px; }
.status-orb small {
  display: block;
  margin-top: -28px;
  color: rgba(221, 231, 255, 0.56);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}

.tone-warning { background: radial-gradient(circle at 50% 42%, rgba(255, 195, 92, 0.34), rgba(18, 18, 27, 0.9) 62%); }
.tone-blocked { background: radial-gradient(circle at 50% 42%, rgba(255, 94, 139, 0.34), rgba(18, 18, 27, 0.9) 62%); }
.tone-loading,
.tone-degraded { background: radial-gradient(circle at 50% 42%, rgba(148, 163, 184, 0.28), rgba(18, 18, 27, 0.9) 62%); }

.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 14px;
  margin: 18px 0;
}

.back-link,
.toolbar button {
  border: 1px solid rgba(151, 191, 255, 0.22);
  border-radius: 14px;
  padding: 10px 14px;
  color: rgba(235, 244, 255, 0.9);
  background: rgba(13, 19, 31, 0.74);
  text-decoration: none;
}

.toolbar button:not(:disabled):hover,
.back-link:hover { border-color: rgba(116, 225, 255, 0.5); }
.toolbar button:disabled { opacity: 0.58; cursor: wait; }

.error {
  border: 1px solid rgba(255, 118, 118, 0.35);
  border-radius: 16px;
  padding: 12px 14px;
  color: #ffd6dc;
  background: rgba(100, 20, 38, 0.24);
}

.health-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.15fr) minmax(0, 0.85fr);
  gap: 18px;
}

.panel { padding: 22px; }
.panel.wide { grid-column: 1 / -1; }
.empty-panel { margin-top: 18px; }
.empty-panel p { color: rgba(206, 216, 237, 0.68); }

.identity-list,
.validation-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  margin: 16px 0 0;
}

.validation-list.single { grid-template-columns: 1fr; }

.identity-list div,
.validation-list div,
.metric {
  border: 1px solid rgba(148, 163, 184, 0.12);
  border-radius: 16px;
  padding: 12px;
  background: rgba(7, 11, 18, 0.4);
}

dt,
.metric span {
  color: rgba(172, 187, 214, 0.66);
  font-size: 12px;
}

dd {
  margin: 6px 0 0;
  color: rgba(245, 248, 255, 0.92);
  word-break: break-all;
}

.metric-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  margin-top: 16px;
}

.metric-grid.compact { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.metric strong {
  display: block;
  margin-top: 7px;
  font-size: 22px;
  color: rgba(150, 224, 255, 0.94);
}

.issue-list {
  margin: 14px 0 0;
  padding-left: 18px;
  color: rgba(219, 229, 248, 0.78);
}

@media (max-width: 900px) {
  .health-hero,
  .toolbar { flex-direction: column; align-items: stretch; }
  .health-grid,
  .identity-list,
  .validation-list,
  .metric-grid { grid-template-columns: 1fr; }
}
</style>
