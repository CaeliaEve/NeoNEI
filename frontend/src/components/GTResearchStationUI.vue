<script setup lang="ts">
import { computed } from 'vue';
import { type Recipe } from '../services/api';
import type { UITypeConfig } from '../services/uiTypeMapping';
import RecipeItemTooltip from './RecipeItemTooltip.vue';
import AnimatedItemIcon from './AnimatedItemIcon.vue';

interface Props {
  recipe: Recipe;
  uiConfig?: UITypeConfig;
}

interface Emits {
  (e: 'item-click', itemId: string): void;
}

interface ItemStack {
  itemId: string;
  count: number;
  renderAssetRef?: string | null;
  imageFileName?: string | null;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

function normalizeCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 1;
}

function extractItemStack(node: unknown): ItemStack | null {
  if (!node || typeof node !== 'object') return null;
  const obj = node as {
    itemId?: unknown;
    count?: unknown;
    stackSize?: unknown;
    item?: { itemId?: unknown };
    items?: unknown[];
  };

  if (typeof obj.itemId === 'string' && obj.itemId.length > 0) {
    return {
      itemId: obj.itemId,
      count: normalizeCount(obj.count ?? obj.stackSize),
      renderAssetRef: typeof obj.renderAssetRef === 'string' ? obj.renderAssetRef : null,
      imageFileName: typeof obj.imageFileName === 'string' ? obj.imageFileName : null,
    };
  }
  if (obj.item && typeof obj.item.itemId === 'string' && obj.item.itemId.length > 0) {
    const nested = obj.item as { itemId: string; renderAssetRef?: unknown; imageFileName?: unknown };
    return {
      itemId: nested.itemId,
      count: normalizeCount(obj.count ?? obj.stackSize),
      renderAssetRef:
        typeof obj.renderAssetRef === 'string'
          ? obj.renderAssetRef
          : (typeof nested.renderAssetRef === 'string' ? nested.renderAssetRef : null),
      imageFileName:
        typeof obj.imageFileName === 'string'
          ? obj.imageFileName
          : (typeof nested.imageFileName === 'string' ? nested.imageFileName : null),
    };
  }
  if (Array.isArray(obj.items)) {
    for (const it of obj.items) {
      const extracted = extractItemStack(it);
      if (extracted) return extracted;
    }
  }
  return null;
}

function extractCellStack(cell: unknown): ItemStack | null {
  if (!cell) return null;
  if (Array.isArray(cell)) {
    for (const candidate of cell) {
      const extracted = extractItemStack(candidate);
      if (extracted) return extracted;
    }
    return null;
  }
  return extractItemStack(cell);
}

const machineLabel = computed(() => {
  const machine = props.recipe.machineInfo?.machineType;
  if (machine && machine.trim()) return machine;
  return props.recipe.recipeType || 'GT Research Station';
});

const mergedMeta = computed<Record<string, unknown>>(() => {
  const a = props.recipe.additionalData && typeof props.recipe.additionalData === 'object'
    ? (props.recipe.additionalData as Record<string, unknown>)
    : {};
  const b = props.recipe.metadata && typeof props.recipe.metadata === 'object'
    ? (props.recipe.metadata as Record<string, unknown>)
    : {};
  return { ...a, ...b };
});

function pickNumber(...values: unknown[]): number | null {
  for (const value of values) {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

const voltageTier = computed(() => {
  const tier = mergedMeta.value.voltageTier ?? props.recipe.machineInfo?.parsedVoltageTier;
  return typeof tier === 'string' && tier.trim() ? tier.trim() : '--';
});

const euPerTick = computed(() => pickNumber(mergedMeta.value.euPerTick, mergedMeta.value.eut, mergedMeta.value.EUt));
const durationTicks = computed(() => pickNumber(mergedMeta.value.duration));

const totalEU = computed(() => {
  const explicit = pickNumber(
    mergedMeta.value.totalEU,
    mergedMeta.value.maxConsumption,
    mergedMeta.value.maxEUConsumption,
    mergedMeta.value.euTotal,
  );
  if (explicit !== null) return explicit;
  if (euPerTick.value === null || durationTicks.value === null) return null;
  return euPerTick.value * durationTicks.value;
});

const computationRequired = computed(() => {
  const explicit = pickNumber(
    mergedMeta.value.computation,
    mergedMeta.value.computationRequired,
    mergedMeta.value.totalComputation,
  );
  return explicit;
});

const minimumComputationInput = computed(() => {
  const explicit = pickNumber(
    mergedMeta.value.computationPerTick,
    mergedMeta.value.minComputationInput,
    mergedMeta.value.cwut,
    mergedMeta.value.CWUt,
  );
  return explicit;
});

function formatMetric(value: number | null): string {
  return value === null ? '--' : value.toLocaleString();
}

const metricCards = computed(() => ([
  {
    label: '最多消耗',
    value: formatMetric(totalEU.value),
    hint: '总量',
    tone: 'metric-chip-cool',
  },
  {
    label: '消耗功率',
    value: formatMetric(euPerTick.value),
    hint: 'EU/t',
    tone: 'metric-chip-neutral',
  },
  {
    label: '算力',
    value: formatMetric(computationRequired.value),
    hint: '需求',
    tone: 'metric-chip-cool',
  },
  {
    label: '最小算力输入',
    value: formatMetric(minimumComputationInput.value),
    hint: '门槛',
    tone: 'metric-chip-amber',
  },
]));

const machineStatus = computed(() => {
  if (computationRequired.value !== null && minimumComputationInput.value !== null) return '已同步';
  if (inputItem.value || totalEU.value !== null) return '部分就绪';
  return '等待扫描';
});

const inputItem = computed<ItemStack | null>(() => {
  const rows = Array.isArray(props.recipe.inputs) ? props.recipe.inputs : [];
  for (const row of rows) {
    if (!Array.isArray(row)) continue;
    for (const cell of row) {
      const stack = extractCellStack(cell);
      if (stack) return stack;
    }
  }
  return null;
});

const outputItem = computed<ItemStack | null>(() => {
  const outputs = Array.isArray(props.recipe.outputs) ? props.recipe.outputs : [];
  const first = outputs.find((out) => out && typeof out.itemId === 'string');
  if (!first || typeof first.itemId !== 'string') return null;
  return { itemId: first.itemId, count: normalizeCount(first.count) };
});

function onClickItem(itemId: string): void {
  emit('item-click', itemId);
}
</script>

<template>
  <div class="gt-research-ui">
    <div class="scene-bg" aria-hidden="true">
      <div class="scene-grid" />
      <div class="scene-glow scene-glow-left" />
      <div class="scene-glow scene-glow-right" />
      <div class="scene-scanline" />
    </div>

    <header class="machine-header">
      <div class="machine-title-shell">
        <div class="machine-overline">GT 研究平台</div>
        <div class="machine-title-row">
          <div class="machine-title">{{ machineLabel }}</div>
          <div class="machine-subtitle-badge">研究站</div>
        </div>
      </div>
      <div class="machine-tier-shell">
        <div class="machine-tier-block">
          <span class="machine-tier-label">电压</span>
          <span class="machine-tier">{{ voltageTier }}</span>
        </div>
        <div class="machine-status-block">
          <span class="machine-tier-label">状态</span>
          <span class="machine-status">{{ machineStatus }}</span>
        </div>
      </div>
    </header>

    <section class="metrics-strip">
      <article
        v-for="metric in metricCards"
        :key="metric.label"
        class="metric-chip"
        :class="metric.tone"
      >
        <div class="metric-head">
          <span class="metric-label">{{ metric.label }}</span>
          <span class="metric-hint">{{ metric.hint }}</span>
        </div>
        <div class="metric-body">
          <strong class="metric-value">{{ metric.value }}</strong>
        </div>
      </article>
    </section>

    <section class="scan-stage">
      <div class="chamber chamber-input">
        <div class="chamber-tag">Input</div>
        <div class="chamber-shell">
          <div class="chamber-frame">
            <RecipeItemTooltip
              v-if="inputItem"
              :item-id="inputItem.itemId"
              :count="inputItem.count"
              @click="onClickItem(inputItem.itemId)"
            >
              <div class="slot item slot-input">
                <AnimatedItemIcon
                  :item-id="inputItem.itemId"
                  :render-asset-ref="inputItem.renderAssetRef || null"
                  :image-file-name="inputItem.imageFileName || null"
                  :size="42"
                  class="icon"
                />
                <span v-if="inputItem.count > 1" class="count">{{ inputItem.count }}</span>
              </div>
            </RecipeItemTooltip>
            <div v-else class="slot empty slot-input" />
          </div>
          <div class="chamber-caption">样本输入</div>
        </div>
      </div>

      <div class="scan-core" aria-hidden="true">
        <div class="scan-core-shell">
          <div class="scan-core-ring scan-core-ring-outer" />
          <div class="scan-core-ring scan-core-ring-middle" />
          <div class="scan-core-ring scan-core-ring-inner" />
          <div class="scan-core-column" />
          <div class="scan-core-beam scan-core-beam-left" />
          <div class="scan-core-beam scan-core-beam-right" />
          <div class="scan-core-node">
            <div class="scan-core-node-inner" />
            <div class="scan-core-node-cross scan-core-node-cross-h" />
            <div class="scan-core-node-cross scan-core-node-cross-v" />
          </div>
          <div class="scan-core-pulse scan-core-pulse-a" />
          <div class="scan-core-pulse scan-core-pulse-b" />
          <div class="scan-core-readout scan-core-readout-top">解析</div>
          <div class="scan-core-readout scan-core-readout-bottom">转移</div>
        </div>
      </div>

      <div class="chamber chamber-output">
        <div class="chamber-tag chamber-tag-output">Output</div>
        <div class="chamber-shell">
          <div class="chamber-frame chamber-frame-output">
            <RecipeItemTooltip
              v-if="outputItem"
              :item-id="outputItem.itemId"
              :count="outputItem.count"
              @click="onClickItem(outputItem.itemId)"
            >
              <div class="slot item slot-output">
                <AnimatedItemIcon
                  :item-id="outputItem.itemId"
                  :render-asset-ref="outputItem.renderAssetRef || null"
                  :image-file-name="outputItem.imageFileName || null"
                  :size="42"
                  class="icon"
                />
                <span v-if="outputItem.count > 1" class="count">{{ outputItem.count }}</span>
              </div>
            </RecipeItemTooltip>
            <div v-else class="slot empty slot-output" />
          </div>
          <div class="chamber-caption chamber-caption-output">结果输出</div>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.gt-research-ui {
  position: relative;
  overflow: hidden;
  width: min(1180px, 98vw);
  border-radius: 24px;
  border: 1px solid rgba(148, 163, 184, 0.24);
  background:
    linear-gradient(180deg, rgba(7, 11, 16, 0.98), rgba(4, 8, 13, 0.99)),
    radial-gradient(circle at top left, rgba(56, 189, 248, 0.08), transparent 34%),
    radial-gradient(circle at right bottom, rgba(251, 191, 36, 0.06), transparent 26%);
  color: #eef5ff;
  padding: 20px;
  box-shadow:
    0 32px 62px rgba(0, 0, 0, 0.42),
    inset 0 1px 0 rgba(255, 255, 255, 0.06),
    inset 0 0 0 1px rgba(148, 163, 184, 0.05);
}

.scene-bg {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.scene-grid {
  position: absolute;
  inset: 0;
  background:
    linear-gradient(rgba(255, 255, 255, 0.018) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 255, 255, 0.018) 1px, transparent 1px);
  background-size: 20px 20px;
  opacity: 0.18;
}

.scene-glow {
  position: absolute;
  border-radius: 999px;
  filter: blur(34px);
  opacity: 0.42;
}

.scene-glow-left {
  width: 320px;
  height: 220px;
  left: -80px;
  top: -70px;
  background: radial-gradient(circle, rgba(56, 189, 248, 0.28), transparent 72%);
}

.scene-glow-right {
  width: 280px;
  height: 220px;
  right: -70px;
  bottom: -70px;
  background: radial-gradient(circle, rgba(251, 191, 36, 0.2), transparent 70%);
}

.scene-scanline {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    180deg,
    transparent 0%,
    rgba(125, 211, 252, 0.045) 14%,
    transparent 26%,
    transparent 100%
  );
  animation: scanSweep 9s linear infinite;
}

.machine-header,
.metrics-strip,
.scan-stage {
  position: relative;
  z-index: 1;
}

.machine-header {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 18px;
  align-items: center;
  padding: 14px 18px;
  border-radius: 16px;
  border: 1px solid rgba(148, 163, 184, 0.2);
  background:
    linear-gradient(180deg, rgba(18, 25, 34, 0.96), rgba(10, 14, 19, 0.98)),
    linear-gradient(90deg, rgba(255, 255, 255, 0.05), transparent 62%);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.04),
    0 12px 24px rgba(2, 8, 23, 0.2);
}

.machine-title-shell {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.machine-overline {
  font-size: 10px;
  letter-spacing: 0.28em;
  text-transform: uppercase;
  color: #7dd3fc;
}

.machine-title-row {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.machine-title {
  font-size: 22px;
  font-weight: 700;
  letter-spacing: 0.045em;
  text-transform: uppercase;
  line-height: 1.1;
  min-width: 0;
}

.machine-subtitle-badge {
  flex: 0 0 auto;
  padding: 5px 9px;
  border-radius: 999px;
  border: 1px solid rgba(125, 211, 252, 0.18);
  background: rgba(10, 18, 28, 0.8);
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: #b7e6ff;
}

.machine-subtitle {
  display: flex;
  align-items: center;
  gap: 10px;
  max-width: 620px;
}

.machine-subtitle-key {
  flex: 0 0 auto;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: #7dd3fc;
}

.machine-subtitle-text {
  min-width: 0;
  font-size: 11px;
  line-height: 1.4;
  color: #8fa3b7;
}

.machine-tier-shell {
  display: grid;
  grid-template-columns: repeat(2, minmax(120px, auto));
  gap: 8px;
  padding: 10px;
  border-radius: 16px;
  border: 1px solid rgba(186, 230, 253, 0.2);
  background: linear-gradient(180deg, rgba(12, 20, 31, 0.92), rgba(7, 11, 18, 0.96));
}

.machine-tier-block,
.machine-status-block {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 4px;
  padding: 9px 11px;
  border-radius: 12px;
  border: 1px solid rgba(148, 163, 184, 0.12);
  background: linear-gradient(180deg, rgba(17, 27, 39, 0.72), rgba(8, 13, 20, 0.78));
}

.machine-tier-label {
  font-size: 9px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: #8ea3b8;
}

.machine-tier {
  font-size: 16px;
  font-weight: 700;
  color: #f3f8ff;
  line-height: 1.05;
}

.machine-status {
  font-size: 13px;
  font-weight: 600;
  color: #bdeaff;
  line-height: 1.1;
}

.metrics-strip {
  margin-top: 12px;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
}

.metric-chip {
  position: relative;
  overflow: hidden;
  min-height: 68px;
  padding: 11px 12px 10px;
  border-radius: 12px;
  border: 1px solid rgba(148, 163, 184, 0.18);
  background: linear-gradient(180deg, rgba(16, 23, 33, 0.94), rgba(9, 13, 18, 0.96));
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.04),
    0 10px 18px rgba(2, 8, 23, 0.16);
}

.metric-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
}

.metric-chip::after {
  content: '';
  position: absolute;
  left: 12px;
  right: 12px;
  bottom: 0;
  height: 2px;
  border-radius: 999px;
  opacity: 0.85;
}

.metric-chip-cool::after {
  background: linear-gradient(90deg, rgba(56, 189, 248, 0.2), rgba(125, 211, 252, 0.96), rgba(56, 189, 248, 0.2));
}

.metric-chip-neutral::after {
  background: linear-gradient(90deg, rgba(148, 163, 184, 0.18), rgba(203, 213, 225, 0.74), rgba(148, 163, 184, 0.18));
}

.metric-chip-amber::after {
  background: linear-gradient(90deg, rgba(251, 191, 36, 0.16), rgba(253, 224, 71, 0.9), rgba(251, 191, 36, 0.16));
}

.metric-label {
  display: block;
  font-size: 9px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: #8fa3b8;
}

.metric-hint {
  flex: 0 0 auto;
  font-size: 9px;
  color: #5f7287;
}

.metric-body {
  display: flex;
  align-items: flex-end;
  min-height: 34px;
}

.metric-value {
  display: block;
  margin-top: 6px;
  font-size: 19px;
  font-weight: 700;
  color: #f5f9ff;
  letter-spacing: 0.02em;
}

.scan-stage {
  margin-top: 16px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  gap: 22px;
  align-items: stretch;
}

.chamber {
  position: relative;
  min-height: 290px;
  border-radius: 22px;
  border: 1px solid rgba(148, 163, 184, 0.18);
  overflow: hidden;
}

.chamber::before {
  content: '';
  position: absolute;
  inset: 10px;
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.04);
  pointer-events: none;
}

.chamber-input {
  background:
    linear-gradient(180deg, rgba(12, 20, 29, 0.98), rgba(7, 11, 16, 0.98)),
    radial-gradient(circle at top, rgba(56, 189, 248, 0.1), transparent 52%);
  box-shadow:
    inset 0 0 0 1px rgba(255, 255, 255, 0.02),
    0 18px 28px rgba(2, 8, 23, 0.22);
}

.chamber-output {
  background:
    linear-gradient(180deg, rgba(26, 21, 15, 0.98), rgba(14, 10, 7, 0.99)),
    radial-gradient(circle at top, rgba(251, 191, 36, 0.1), transparent 52%);
  box-shadow:
    inset 0 0 0 1px rgba(255, 255, 255, 0.02),
    0 18px 28px rgba(2, 8, 23, 0.24);
}

.chamber-tag {
  position: absolute;
  top: 14px;
  left: 16px;
  padding: 6px 10px;
  border-radius: 999px;
  border: 1px solid rgba(125, 211, 252, 0.24);
  background: rgba(8, 15, 23, 0.85);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: #bff4ff;
  z-index: 1;
}

.chamber-tag-output {
  border-color: rgba(253, 224, 71, 0.22);
  color: #ffedb6;
}

.chamber-shell {
  position: relative;
  z-index: 1;
  display: flex;
  height: 100%;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  padding: 58px 28px 28px;
}

.chamber-frame {
  position: relative;
  width: 184px;
  height: 184px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 26px;
  border: 1px solid rgba(125, 211, 252, 0.2);
  background:
    linear-gradient(180deg, rgba(11, 18, 28, 0.92), rgba(6, 10, 16, 0.96)),
    linear-gradient(135deg, rgba(255, 255, 255, 0.04), transparent 58%);
  box-shadow:
    inset 0 0 34px rgba(56, 189, 248, 0.08),
    0 18px 30px rgba(2, 8, 23, 0.28);
}

.chamber-frame::before,
.chamber-frame::after {
  content: '';
  position: absolute;
  border-radius: 999px;
  background: rgba(125, 211, 252, 0.48);
  box-shadow: 0 0 10px rgba(56, 189, 248, 0.32);
}

.chamber-frame::before {
  width: 42px;
  height: 1px;
  top: 18px;
  left: 50%;
  transform: translateX(-50%);
}

.chamber-frame::after {
  width: 1px;
  height: 42px;
  left: 18px;
  top: 50%;
  transform: translateY(-50%);
}

.chamber-frame-output {
  border-color: rgba(253, 224, 71, 0.18);
  box-shadow:
    inset 0 0 34px rgba(251, 191, 36, 0.08),
    0 18px 30px rgba(2, 8, 23, 0.3);
}

.chamber-frame-output::before,
.chamber-frame-output::after {
  background: rgba(253, 224, 71, 0.48);
  box-shadow: 0 0 10px rgba(251, 191, 36, 0.28);
}

.chamber-caption {
  font-size: 11px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #88a9bf;
}

.chamber-caption-output {
  color: #d7b98a;
}

.slot {
  position: relative;
  width: 96px;
  height: 96px;
  border-radius: 18px;
  border: 1px solid rgba(148, 163, 184, 0.28);
  background:
    linear-gradient(180deg, rgba(10, 16, 24, 0.94), rgba(5, 8, 14, 0.96)),
    url('/textures/nei/slot.png');
  background-repeat: no-repeat;
  background-position: center;
  background-size: 100% 100%, 24px 24px;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.05),
    0 12px 20px rgba(2, 8, 23, 0.28);
  overflow: hidden;
}

.slot::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: radial-gradient(circle at 28% 24%, rgba(255, 255, 255, 0.16), transparent 46%);
  opacity: 0.6;
  pointer-events: none;
}

.slot.item {
  cursor: pointer;
  transition: transform 160ms ease, box-shadow 160ms ease, border-color 160ms ease;
}

.slot.item:hover {
  transform: translateY(-2px) scale(1.02);
}

.slot-input:hover {
  border-color: rgba(125, 211, 252, 0.62);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.08),
    0 16px 26px rgba(2, 8, 23, 0.34),
    0 0 0 1px rgba(125, 211, 252, 0.14);
}

.slot-output {
  border-color: rgba(251, 191, 36, 0.4);
}

.slot-output:hover {
  border-color: rgba(253, 224, 71, 0.62);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.08),
    0 16px 26px rgba(2, 8, 23, 0.34),
    0 0 0 1px rgba(251, 191, 36, 0.16);
}

.slot.empty {
  opacity: 0.42;
}

.icon {
  width: 100%;
  height: 100%;
  object-fit: contain;
  image-rendering: pixelated;
}

.count {
  position: absolute;
  right: 4px;
  bottom: 3px;
  font-size: 12px;
  color: #fff;
  text-shadow: 0 1px 1px rgba(15, 23, 42, 0.92);
}

.scan-core {
  width: 360px;
  min-height: 290px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.scan-core-shell {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 290px;
  border-radius: 30px;
  border: 1px solid rgba(148, 163, 184, 0.16);
  background:
    radial-gradient(circle at center, rgba(56, 189, 248, 0.1), transparent 38%),
    linear-gradient(180deg, rgba(10, 15, 22, 0.98), rgba(6, 10, 16, 0.98));
  box-shadow:
    inset 0 0 0 1px rgba(255, 255, 255, 0.02),
    0 22px 34px rgba(2, 8, 23, 0.28);
  overflow: hidden;
}

.scan-core-shell::before,
.scan-core-shell::after {
  content: '';
  position: absolute;
  inset: 16px;
  border-radius: 24px;
  pointer-events: none;
}

.scan-core-shell::before {
  border: 1px solid rgba(125, 211, 252, 0.08);
}

.scan-core-shell::after {
  inset: 34px 28px;
  border: 1px dashed rgba(148, 163, 184, 0.12);
}

.scan-core-ring {
  position: absolute;
  left: 50%;
  top: 50%;
  border-radius: 50%;
  border: 1px solid rgba(186, 230, 253, 0.2);
  transform: translate(-50%, -50%);
}

.scan-core-ring-outer {
  width: 220px;
  height: 220px;
  animation: orbitSpin 14s linear infinite;
}

.scan-core-ring-middle {
  width: 164px;
  height: 164px;
  border-style: dashed;
  border-color: rgba(148, 163, 184, 0.26);
  animation: orbitSpinReverse 10s linear infinite;
}

.scan-core-ring-inner {
  width: 108px;
  height: 108px;
  border-color: rgba(125, 211, 252, 0.34);
  box-shadow: 0 0 18px rgba(56, 189, 248, 0.12);
}

.scan-core-column {
  position: absolute;
  left: 50%;
  top: 34px;
  bottom: 34px;
  width: 1px;
  transform: translateX(-50%);
  background: linear-gradient(180deg, transparent, rgba(125, 211, 252, 0.32), transparent);
}

.scan-core-beam {
  position: absolute;
  top: 50%;
  width: 142px;
  height: 2px;
  transform: translateY(-50%);
}

.scan-core-beam-left {
  left: 0;
  background: linear-gradient(90deg, transparent, rgba(125, 211, 252, 0.78), rgba(125, 211, 252, 0.14));
}

.scan-core-beam-right {
  right: 0;
  background: linear-gradient(90deg, rgba(253, 224, 71, 0.12), rgba(253, 224, 71, 0.76), transparent);
}

.scan-core-node {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 104px;
  height: 104px;
  transform: translate(-50%, -50%);
  border-radius: 26px;
  border: 1px solid rgba(226, 232, 240, 0.4);
  background:
    linear-gradient(145deg, rgba(19, 31, 47, 0.96), rgba(10, 16, 24, 0.98)),
    radial-gradient(circle at center, rgba(125, 211, 252, 0.16), transparent 64%);
  box-shadow:
    inset 0 0 24px rgba(191, 219, 254, 0.08),
    0 0 28px rgba(56, 189, 248, 0.12);
}

.scan-core-node-inner {
  position: absolute;
  inset: 25px;
  border-radius: 16px;
  border: 1px solid rgba(191, 219, 254, 0.56);
  background: linear-gradient(145deg, rgba(220, 238, 255, 0.18), rgba(56, 189, 248, 0.08));
  box-shadow: 0 0 18px rgba(125, 211, 252, 0.18);
}

.scan-core-node-cross {
  position: absolute;
  left: 50%;
  top: 50%;
  background: rgba(226, 232, 240, 0.56);
  box-shadow: 0 0 12px rgba(125, 211, 252, 0.22);
}

.scan-core-node-cross-h {
  width: 34px;
  height: 1px;
  transform: translate(-50%, -50%);
}

.scan-core-node-cross-v {
  width: 1px;
  height: 34px;
  transform: translate(-50%, -50%);
}

.scan-core-pulse {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 176px;
  height: 176px;
  border-radius: 50%;
  border: 1px solid rgba(125, 211, 252, 0.12);
  transform: translate(-50%, -50%);
  animation: pulseOut 4.6s ease-out infinite;
}

.scan-core-pulse-b {
  animation-delay: 1.8s;
}

.scan-core-readout {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  font-size: 10px;
  letter-spacing: 0.28em;
  text-transform: uppercase;
  color: rgba(191, 219, 254, 0.72);
}

.scan-core-readout-top {
  top: 22px;
}

.scan-core-readout-bottom {
  bottom: 20px;
  color: rgba(253, 224, 71, 0.68);
}

@keyframes orbitSpin {
  from { transform: translate(-50%, -50%) rotate(0deg); }
  to { transform: translate(-50%, -50%) rotate(360deg); }
}

@keyframes orbitSpinReverse {
  from { transform: translate(-50%, -50%) rotate(360deg); }
  to { transform: translate(-50%, -50%) rotate(0deg); }
}

@keyframes pulseOut {
  0% {
    opacity: 0;
    transform: translate(-50%, -50%) scale(0.78);
  }
  28% {
    opacity: 0.52;
  }
  100% {
    opacity: 0;
    transform: translate(-50%, -50%) scale(1.22);
  }
}

@keyframes scanSweep {
  from { transform: translateY(-100%); }
  to { transform: translateY(100%); }
}

@media (max-width: 920px) {
  .machine-header {
    grid-template-columns: 1fr;
  }

  .metrics-strip {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .scan-stage {
    grid-template-columns: 1fr;
    justify-items: stretch;
  }

  .scan-core {
    width: 100%;
  }
}

@media (max-width: 560px) {
  .gt-research-ui {
    padding: 16px;
  }

  .machine-title-row {
    flex-direction: column;
    align-items: flex-start;
    gap: 6px;
  }

  .machine-tier-shell {
    grid-template-columns: 1fr;
  }

  .machine-subtitle {
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
  }

  .metrics-strip {
    grid-template-columns: 1fr;
  }

  .chamber-shell {
    padding-left: 18px;
    padding-right: 18px;
  }
}
</style>
