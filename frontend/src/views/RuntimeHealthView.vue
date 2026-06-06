<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { api, type RuntimeHealthSummary } from '../services/api';

const health = ref<RuntimeHealthSummary | null>(null);
const loading = ref(false);
const error = ref('');

const numberFormat = new Intl.NumberFormat('zh-CN');
const byteFormat = new Intl.NumberFormat('zh-CN', {
  maximumFractionDigits: 2,
});

const statusLabel = computed(() => {
  const status = health.value?.status ?? 'degraded';
  if (status === 'ok') return '健康';
  if (status === 'warning') return '警告';
  if (status === 'blocked') return '阻塞';
  return '降级';
});

const statusTone = computed(() => `tone-${health.value?.status ?? 'degraded'}`);

const keyCounts = computed(() => {
  const counts = health.value?.counts ?? {};
  return [
    ['物品', counts.items],
    ['配方', counts.recipes],
    ['浏览项', counts.browserItems],
    ['分组', counts.browserGroups],
    ['纹理', counts.textures],
    ['图集项', counts.browserAtlasItems],
    ['动态图集项', counts.animatedBrowserAtlasItems],
    ['配方处理器', counts.recipeHandlers],
  ] as Array<[string, number | null | undefined]>;
});

const validationRows = computed(() => {
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
    ['仍为静态动画', coverage.staticWhenExpectedAnimated],
  ];
});

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
    error.value = '读取运行时健康信息失败';
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
        <small>{{ health?.status ?? 'loading' }}</small>
      </div>
    </section>

    <div class="toolbar">
      <RouterLink class="back-link" to="/">返回主页</RouterLink>
      <button type="button" :disabled="loading" @click="loadHealth">
        {{ loading ? '刷新中…' : '刷新状态' }}
      </button>
    </div>

    <p v-if="error" class="error">{{ error }}</p>

    <section v-if="health" class="health-grid">
      <article class="panel wide">
        <h2>数据身份</h2>
        <dl class="identity-list">
          <div><dt>来源</dt><dd>{{ health.distData.source ?? '—' }}</dd></div>
          <div><dt>导出名</dt><dd>{{ health.distData.sourceRepository ?? '—' }}</dd></div>
          <div><dt>生成时间</dt><dd>{{ health.distData.generatedAt ?? '—' }}</dd></div>
          <div><dt>导出配置</dt><dd>{{ health.distData.runtime?.exporterSelection ?? '—' }}</dd></div>
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
          <div class="metric"><span>声明文件</span><strong>{{ formatNumber(health.files.declared) }}</strong></div>
          <div class="metric"><span>存在文件</span><strong>{{ formatNumber(health.files.present) }}</strong></div>
          <div class="metric"><span>缺失文件</span><strong>{{ formatNumber(health.files.missing.length) }}</strong></div>
          <div class="metric"><span>总大小</span><strong>{{ formatBytes(health.files.totalBytes) }}</strong></div>
        </div>
        <ul v-if="health.files.missing.length" class="issue-list">
          <li v-for="entry in health.files.missing.slice(0, 8)" :key="entry.key">
            {{ entry.key }} · {{ entry.path }}
          </li>
        </ul>
      </article>

      <article class="panel">
        <h2>阻塞项</h2>
        <ul class="issue-list">
          <li v-for="gate in health.validation.blockedGates" :key="gate">{{ gate }}</li>
          <li v-if="health.validation.compilerValidationBlocked">compiler validation blocked</li>
          <li v-if="!health.validation.blockedGates.length && !health.validation.compilerValidationBlocked">暂无阻塞</li>
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
.subtitle {
  margin: 0;
}

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
  border-radius: 50%;
  display: grid;
  place-items: center;
  text-align: center;
  border: 1px solid rgba(255, 255, 255, 0.16);
  background: radial-gradient(circle at 50% 42%, rgba(116, 225, 255, 0.25), rgba(13, 18, 30, 0.86) 62%);
  box-shadow: 0 0 38px rgba(83, 185, 255, 0.2), inset 0 0 26px rgba(255, 255, 255, 0.08);
}

.status-orb span {
  font-weight: 800;
  font-size: 20px;
}

.status-orb small {
  display: block;
  margin-top: -28px;
  color: rgba(221, 231, 255, 0.56);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}

.tone-warning {
  background: radial-gradient(circle at 50% 42%, rgba(255, 195, 92, 0.34), rgba(18, 18, 27, 0.9) 62%);
}

.tone-blocked {
  background: radial-gradient(circle at 50% 42%, rgba(255, 94, 139, 0.34), rgba(18, 18, 27, 0.9) 62%);
}

.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin: 18px 0;
}

.back-link,
button {
  border: 1px solid rgba(143, 184, 233, 0.22);
  border-radius: 999px;
  color: rgba(235, 244, 255, 0.86);
  background: rgba(25, 32, 48, 0.72);
  padding: 10px 16px;
  text-decoration: none;
  cursor: pointer;
}

.health-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 18px;
}

.panel {
  padding: 22px;
}

.panel.wide {
  grid-column: 1 / -1;
}

.identity-list,
.validation-list {
  display: grid;
  gap: 12px;
  margin: 16px 0 0;
}

.identity-list div,
.validation-list div {
  display: grid;
  grid-template-columns: 120px 1fr;
  gap: 16px;
  align-items: baseline;
}

dt,
.metric span {
  color: rgba(182, 197, 224, 0.62);
  font-size: 12px;
}

dd {
  margin: 0;
  overflow-wrap: anywhere;
}

.metric-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  margin-top: 16px;
}

.metric {
  border-radius: 16px;
  padding: 14px;
  background: rgba(255, 255, 255, 0.045);
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.metric strong {
  display: block;
  margin-top: 6px;
  font-size: 22px;
}

.issue-list {
  margin: 14px 0 0;
  padding-left: 18px;
  color: rgba(226, 233, 248, 0.74);
}

.error {
  color: #ffb7c8;
}

@media (max-width: 860px) {
  .health-hero,
  .toolbar {
    align-items: flex-start;
    flex-direction: column;
  }

  .health-grid {
    grid-template-columns: 1fr;
  }
}
</style>
