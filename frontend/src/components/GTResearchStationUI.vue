<script setup lang="ts">
import { computed } from 'vue';
import { getImageUrl, type Recipe } from '../services/api';
import type { UITypeConfig } from '../services/uiTypeMapping';
import RecipeItemTooltip from './RecipeItemTooltip.vue';

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
    return { itemId: obj.itemId, count: normalizeCount(obj.count ?? obj.stackSize) };
  }
  if (obj.item && typeof obj.item.itemId === 'string' && obj.item.itemId.length > 0) {
    return { itemId: obj.item.itemId, count: normalizeCount(obj.count ?? obj.stackSize) };
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
  const explicit = pickNumber(mergedMeta.value.totalEU);
  if (explicit !== null) return explicit;
  if (euPerTick.value === null || durationTicks.value === null) return null;
  return euPerTick.value * durationTicks.value;
});

const ruCost = computed(() => {
  const explicit = pickNumber(
    mergedMeta.value.ru,
    mergedMeta.value.RU,
    mergedMeta.value.researchUnits,
    mergedMeta.value.researchCost,
  );
  if (explicit !== null) return explicit;
  return totalEU.value;
});

const computationCost = computed(() => {
  const explicit = pickNumber(
    mergedMeta.value.computation,
    mergedMeta.value.computationRequired,
    mergedMeta.value.cwut,
    mergedMeta.value.CWUt,
    mergedMeta.value.computationPerTick,
  );
  if (explicit !== null) return explicit;
  return durationTicks.value;
});

function formatDuration(ticks: number | null): string {
  if (ticks === null) return '--';
  const sec = ticks / 20;
  if (sec >= 60) {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}m ${s}s`;
  }
  return `${sec.toFixed(1)}s`;
}

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
      <div class="scene-halo halo-a" />
      <div class="scene-halo halo-b" />
      <div class="scene-grid" />
    </div>

    <header class="machine-header">
      <div class="machine-title-shell">
      <div class="machine-title">{{ machineLabel }}</div>
      <div class="machine-subtitle">Research Station</div>
      </div>
      <div class="machine-tier">{{ voltageTier }}</div>
    </header>

    <section class="meta-grid">
      <div class="meta-chip"><span>EU/t</span><strong>{{ euPerTick?.toLocaleString?.() ?? '--' }}</strong></div>
      <div class="meta-chip"><span>Duration</span><strong>{{ formatDuration(durationTicks) }}</strong></div>
      <div class="meta-chip"><span>RU Cost</span><strong>{{ ruCost?.toLocaleString?.() ?? '--' }}</strong></div>
      <div class="meta-chip"><span>Computation</span><strong>{{ computationCost?.toLocaleString?.() ?? '--' }}</strong></div>
    </section>

    <section class="stage">
      <div class="io-panel">
        <div class="panel-label">Input</div>
        <div class="slot-wrap">
          <RecipeItemTooltip v-if="inputItem" :item-id="inputItem.itemId" :count="inputItem.count" @click="onClickItem(inputItem.itemId)">
            <div class="slot item">
              <img :src="getImageUrl(inputItem.itemId)" class="icon" @error="(e) => { (e.target as HTMLImageElement).src = '/placeholder.png'; }" />
              <span v-if="inputItem.count > 1" class="count">{{ inputItem.count }}</span>
            </div>
          </RecipeItemTooltip>
          <div v-else class="slot empty"></div>
        </div>
      </div>

      <div class="research-core" aria-hidden="true">
        <div class="core-orbit orbit-a" />
        <div class="core-orbit orbit-b" />
        <div class="core-beam" />
        <div class="core-node">
          <div class="core-node-inner" />
        </div>
        <div class="core-arrow-lane">
          <div class="core-arrow-track" />
          <svg viewBox="0 0 24 24" class="core-arrow">
            <path d="M4 11h12.17l-5.59-5.59L12 4l8 8-8 8-1.41-1.41L16.17 13H4v-2z" />
          </svg>
        </div>
      </div>

      <div class="io-panel io-panel-output">
        <div class="panel-label panel-label-output">Output</div>
        <div class="slot-wrap">
          <RecipeItemTooltip v-if="outputItem" :item-id="outputItem.itemId" :count="outputItem.count" @click="onClickItem(outputItem.itemId)">
            <div class="slot item output-slot">
              <img :src="getImageUrl(outputItem.itemId)" class="icon" @error="(e) => { (e.target as HTMLImageElement).src = '/placeholder.png'; }" />
              <span v-if="outputItem.count > 1" class="count">{{ outputItem.count }}</span>
            </div>
          </RecipeItemTooltip>
          <div v-else class="slot empty output-slot"></div>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.gt-research-ui {
  position: relative;
  overflow: hidden;
  width: min(980px, 96vw);
  border-radius: 20px;
  border: 1px solid rgba(148, 163, 184, 0.22);
  background:
    linear-gradient(180deg, rgba(9, 13, 20, 0.96), rgba(6, 10, 16, 0.98)),
    radial-gradient(circle at top, rgba(125, 211, 252, 0.09), transparent 40%);
  color: #f3f7ff;
  padding: 18px;
  box-shadow:
    0 24px 52px rgba(0, 0, 0, 0.48),
    inset 0 1px 0 rgba(255, 255, 255, 0.08);
}

.scene-bg {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.scene-halo {
  position: absolute;
  border-radius: 50%;
  filter: blur(28px);
  opacity: 0.38;
}

.halo-a {
  width: 320px;
  height: 220px;
  left: -40px;
  top: -40px;
  background: radial-gradient(circle, rgba(191, 219, 254, 0.32), transparent 70%);
}

.halo-b {
  width: 360px;
  height: 260px;
  right: -80px;
  bottom: -60px;
  background: radial-gradient(circle, rgba(125, 211, 252, 0.24), transparent 72%);
}

.scene-grid {
  position: absolute;
  inset: 0;
  background:
    linear-gradient(rgba(255, 255, 255, 0.014) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 255, 255, 0.014) 1px, transparent 1px);
  background-size: 18px 18px;
  opacity: 0.22;
}

.machine-header {
  position: relative;
  z-index: 1;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 18px 9px;
  background:
    linear-gradient(180deg, rgba(29, 36, 47, 0.94), rgba(18, 23, 30, 0.98)),
    linear-gradient(90deg, rgba(255, 255, 255, 0.06), transparent 58%);
  border: 1px solid rgba(148, 163, 184, 0.18);
  border-radius: 14px;
}

.machine-title-shell {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.machine-title {
  font-size: 15px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.machine-subtitle {
  font-size: 12px;
  color: #aeb9c8;
}

.machine-tier {
  padding: 6px 10px;
  border-radius: 999px;
  border: 1px solid rgba(208, 223, 244, 0.32);
  background: rgba(23, 32, 45, 0.72);
  font-size: 12px;
  color: #e9f2ff;
}

.meta-grid {
  position: relative;
  z-index: 1;
  margin-top: 12px;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
}

.meta-chip {
  border: 1px solid rgba(205, 220, 240, 0.3);
  border-radius: 12px;
  background: linear-gradient(180deg, rgba(24, 33, 48, 0.74), rgba(15, 21, 33, 0.74));
  padding: 8px 10px;
}

.meta-chip span {
  display: block;
  font-size: 10px;
  color: #aeb9c8;
}

.meta-chip strong {
  display: block;
  margin-top: 2px;
  font-size: 14px;
  color: #f2f8ff;
}

.stage {
  position: relative;
  z-index: 1;
  margin-top: 14px;
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  gap: 16px;
  align-items: center;
}

.io-panel {
  position: relative;
  min-height: 150px;
  padding: 18px 12px 12px;
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 16px;
  background:
    linear-gradient(180deg, rgba(18, 24, 32, 0.94), rgba(10, 14, 20, 0.98)),
    radial-gradient(circle at top, rgba(255, 255, 255, 0.05), transparent 48%),
    url('/textures/nei/recipebg.png');
  background-repeat: no-repeat, no-repeat, repeat;
  background-size: auto, auto, 96px 96px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  box-shadow:
    inset 0 0 0 1px rgba(255, 255, 255, 0.03),
    0 10px 24px rgba(2, 8, 23, 0.2);
}

.io-panel::after {
  content: '';
  position: absolute;
  inset: 8px;
  border: 1px solid rgba(255, 255, 255, 0.04);
  border-radius: 10px;
  pointer-events: none;
}

.io-panel-output {
  border-color: rgba(245, 208, 138, 0.26);
  background:
    linear-gradient(180deg, rgba(32, 27, 20, 0.92), rgba(16, 13, 10, 0.98)),
    radial-gradient(circle at top, rgba(245, 208, 138, 0.08), transparent 48%),
    url('/textures/nei/recipebg.png');
  background-repeat: no-repeat, no-repeat, repeat;
  background-size: auto, auto, 96px 96px;
}

.panel-label {
  position: absolute;
  top: -9px;
  left: 12px;
  min-width: 86px;
  padding: 4px 10px 3px 12px;
  background:
    linear-gradient(180deg, rgba(74, 80, 89, 0.98), rgba(54, 59, 67, 0.98)),
    url('/textures/nei/catalyst_tab.png');
  background-repeat: no-repeat;
  background-position: center;
  background-size: cover;
  border: 1px solid rgba(198, 207, 220, 0.24);
  border-radius: 6px 6px 4px 4px;
  color: #eef4fb;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.14em;
  line-height: 1;
  text-transform: uppercase;
  box-shadow: 0 4px 10px rgba(2, 8, 23, 0.22);
  z-index: 1;
}

.panel-label-output {
  border-color: rgba(245, 208, 138, 0.32);
  color: #fff3da;
}

.slot-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
}

.slot {
  position: relative;
  width: 64px;
  height: 64px;
  border-radius: 14px;
  border: 1px solid rgba(148, 163, 184, 0.28);
  background:
    linear-gradient(180deg, rgba(11, 16, 24, 0.88), rgba(6, 10, 16, 0.92)),
    url('/textures/nei/slot.png');
  background-repeat: no-repeat;
  background-position: center;
  background-size: 100% 100%, 18px 18px;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.06),
    0 6px 12px rgba(2, 8, 23, 0.28);
  overflow: hidden;
}

.slot::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: radial-gradient(circle at 30% 25%, rgba(255, 255, 255, 0.14), transparent 48%);
  opacity: 0.55;
  pointer-events: none;
}

.slot.item {
  cursor: pointer;
  transition: transform 160ms ease, box-shadow 160ms ease, border-color 160ms ease;
}

.slot.item:hover {
  transform: translateY(-2px);
  border-color: rgba(103, 232, 249, 0.62);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.12),
    0 14px 24px rgba(0, 0, 0, 0.36),
    0 0 0 1px rgba(103, 232, 249, 0.14);
}

.output-slot {
  border-color: rgba(245, 208, 138, 0.4);
}

.slot.empty {
  opacity: 0.45;
}

.icon {
  width: 100%;
  height: 100%;
  object-fit: contain;
  image-rendering: pixelated;
}

.count {
  position: absolute;
  right: 3px;
  bottom: 2px;
  font-size: 11px;
  color: #fff;
  text-shadow: 0 1px 1px rgba(15, 23, 42, 0.92);
}

.research-core {
  position: relative;
  width: 190px;
  height: 220px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.core-orbit {
  position: absolute;
  border-radius: 50%;
  border: 1px solid rgba(191, 219, 254, 0.22);
}

.orbit-a {
  width: 142px;
  height: 142px;
  animation: orbitSpin 12s linear infinite;
}

.orbit-b {
  width: 108px;
  height: 108px;
  animation: orbitSpinReverse 9s linear infinite;
}

.core-beam {
  position: absolute;
  width: 2px;
  height: 136px;
  background: linear-gradient(180deg, transparent, rgba(152, 203, 255, 0.82), transparent);
  filter: blur(0.4px);
}

.core-node {
  position: relative;
  width: 74px;
  height: 74px;
  border-radius: 18px;
  border: 1px solid rgba(216, 232, 250, 0.48);
  background:
    linear-gradient(145deg, rgba(230, 240, 253, 0.16), rgba(133, 170, 218, 0.08)),
    rgba(12, 22, 36, 0.9);
  box-shadow:
    inset 0 0 18px rgba(213, 231, 252, 0.12),
    0 0 24px rgba(191, 219, 254, 0.18);
  display: flex;
  align-items: center;
  justify-content: center;
}

.core-node-inner {
  width: 28px;
  height: 28px;
  border-radius: 10px;
  border: 1px solid rgba(236, 244, 255, 0.82);
  background: linear-gradient(145deg, rgba(247, 251, 255, 0.9), rgba(186, 216, 248, 0.58));
  box-shadow: 0 0 16px rgba(226, 240, 255, 0.6);
}

.core-arrow-lane {
  position: absolute;
  right: -12px;
  top: 50%;
  width: 30px;
  height: 22px;
  transform: translateY(-50%);
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(210, 218, 230, 0.86);
}

.core-arrow-track {
  position: absolute;
  left: 1px;
  right: 5px;
  top: 50%;
  height: 6px;
  transform: translateY(-50%);
  background: url('/textures/nei/dash.png') center / 100% 2px no-repeat;
  opacity: 0.55;
}

.core-arrow {
  width: 18px;
  height: 18px;
  position: relative;
  z-index: 1;
  fill: currentColor;
}

@keyframes orbitSpin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

@keyframes orbitSpinReverse {
  from { transform: rotate(360deg); }
  to { transform: rotate(0deg); }
}

@media (max-width: 900px) {
  .meta-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 760px) {
  .stage {
    grid-template-columns: 1fr;
    justify-items: center;
    gap: 12px;
  }

  .core-arrow-lane {
    position: static;
    transform: none;
  }
}
</style>
