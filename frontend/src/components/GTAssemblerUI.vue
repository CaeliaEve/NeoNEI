<script setup lang="ts">
import { computed } from 'vue';
import { getFluidImageUrlFromFluid, type Recipe } from '../services/api';
import type { UITypeConfig } from '../services/uiTypeMapping';
import { useSound } from '../services/sound.service';
import RecipeItemTooltip from './RecipeItemTooltip.vue';
import AnimatedItemIcon from './AnimatedItemIcon.vue';

interface Props {
  recipe: Recipe;
  uiConfig?: UITypeConfig;
}

interface Emits {
  (e: 'item-click', itemId: string): void;
}

interface ItemSlot {
  itemId: string;
  count: number;
  renderAssetRef?: string | null;
  imageFileName?: string | null;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();
const { playClick } = useSound();

const recipe = computed(() => props.recipe);

function normalizeCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 1;
}

function extractItem(node: unknown): ItemSlot | null {
  if (!node || typeof node !== 'object') return null;
  const obj = node as {
    itemId?: unknown;
    count?: unknown;
    stackSize?: unknown;
    renderAssetRef?: unknown;
    imageFileName?: unknown;
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
    for (const child of obj.items) {
      const extracted = extractItem(child);
      if (extracted) return extracted;
    }
  }

  return null;
}

function extractCell(cell: unknown): ItemSlot | null {
  if (Array.isArray(cell)) {
    for (const candidate of cell) {
      const extracted = extractItem(candidate);
      if (extracted) return extracted;
    }
    return null;
  }
  return extractItem(cell);
}

const inputGrid = computed<Array<ItemSlot | null>>(() => {
  const grid = Array.from({ length: 9 }, () => null as ItemSlot | null);
  const rows = Array.isArray(recipe.value.inputs) ? recipe.value.inputs : [];
  for (let row = 0; row < 3; row += 1) {
    const sourceRow = Array.isArray(rows[row]) ? rows[row] : [];
    for (let col = 0; col < 3; col += 1) {
      grid[row * 3 + col] = extractCell(sourceRow[col]);
    }
  }
  return grid;
});

const outputs = computed<ItemSlot[]>(() => {
  const list: ItemSlot[] = [];
  for (const output of Array.isArray(recipe.value.outputs) ? recipe.value.outputs : []) {
    const extracted = extractItem(output);
    if (extracted) list.push(extracted);
  }
  return list.slice(0, 2);
});

const fluidInputs = computed(() => {
  const fluids = [];
  for (const group of Array.isArray(recipe.value.fluidInputs) ? recipe.value.fluidInputs : []) {
    const first = group?.fluids?.[0];
    if (!first?.fluid?.fluidId) continue;
    fluids.push({
      fluidId: first.fluid.fluidId,
      localizedName: first.fluid.localizedName,
      amount: first.amount,
      renderAssetRef: first.fluid.renderAssetRef ?? null,
      temperature: first.fluid.temperature ?? null,
    });
  }
  return fluids;
});

const mergedMeta = computed<Record<string, unknown>>(() => {
  const a =
    recipe.value.additionalData && typeof recipe.value.additionalData === 'object'
      ? (recipe.value.additionalData as Record<string, unknown>)
      : {};
  const b =
    recipe.value.metadata && typeof recipe.value.metadata === 'object'
      ? (recipe.value.metadata as Record<string, unknown>)
      : {};
  return { ...a, ...b };
});

function pickNumber(...values: unknown[]): number | null {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return null;
}

const machineLabel = computed(() => {
  const source =
    recipe.value.machineInfo?.machineType
    || (typeof recipe.value.recipeTypeData?.machineType === 'string' ? recipe.value.recipeTypeData.machineType : '')
    || recipe.value.recipeType;
  return source && source.trim() ? source.trim() : 'Assembler';
});

const voltageTier = computed(() => {
  const tier = mergedMeta.value.voltageTier ?? recipe.value.machineInfo?.parsedVoltageTier;
  return typeof tier === 'string' && tier.trim() ? tier.trim() : '--';
});

const euPerTick = computed(() => {
  const explicit = pickNumber(mergedMeta.value.euPerTick, mergedMeta.value.eut, mergedMeta.value.EUt);
  if (explicit !== null) return explicit;
  const voltage = pickNumber(mergedMeta.value.voltage, recipe.value.machineInfo?.parsedVoltage);
  const amperage = pickNumber(mergedMeta.value.amperage) ?? 1;
  return voltage !== null ? voltage * amperage : null;
});

const durationTicks = computed(() => pickNumber(mergedMeta.value.duration));
const totalEU = computed(() => {
  const explicit = pickNumber(mergedMeta.value.totalEU);
  if (explicit !== null) return explicit;
  if (euPerTick.value === null || durationTicks.value === null) return null;
  return euPerTick.value * durationTicks.value;
});

const amperage = computed(() => pickNumber(mergedMeta.value.amperage) ?? 1);
const voltage = computed(() => pickNumber(mergedMeta.value.voltage, recipe.value.machineInfo?.parsedVoltage));

function formatDuration(ticks: number | null): string {
  if (ticks === null) return '--';
  const seconds = ticks / 20;
  if (seconds >= 60) {
    const minutes = Math.floor(seconds / 60);
    const remainSeconds = Math.floor(seconds % 60);
    return `${minutes}m ${remainSeconds}s`;
  }
  return `${seconds.toFixed(1)}s`;
}

function getFluidImage(fluid: { fluidId?: string | null; renderAssetRef?: string | null }) {
  return getFluidImageUrlFromFluid(fluid) || '/placeholder.png';
}

function handleItemClick(itemId: string): void {
  playClick();
  emit('item-click', itemId);
}
</script>

<template>
  <div class="gt-assembler-ui">
    <header class="machine-header">
      <div class="machine-title">{{ machineLabel }}</div>
      <div class="machine-tier">{{ voltageTier }}</div>
    </header>

    <div class="assembler-stage">
      <section class="panel panel-input">
        <div class="panel-label">Input Grid</div>
        <div class="input-grid">
          <template v-for="(slot, index) in inputGrid" :key="`input-${index}`">
            <RecipeItemTooltip
              v-if="slot"
              :item-id="slot.itemId"
              :count="slot.count"
              @click="handleItemClick(slot.itemId)"
            >
              <div class="gt-slot">
                <AnimatedItemIcon
                  :item-id="slot.itemId"
                  :render-asset-ref="slot.renderAssetRef || null"
                  :image-file-name="slot.imageFileName || null"
                  :size="28"
                  class="item-icon"
                />
                <span v-if="slot.count > 1" class="item-count">{{ slot.count }}</span>
              </div>
            </RecipeItemTooltip>
            <div v-else class="gt-slot empty" />
          </template>
        </div>
      </section>

      <section class="panel panel-fluids">
        <div class="panel-label">Fluid Input</div>
        <div class="fluid-list">
          <template v-if="fluidInputs.length">
            <div class="fluid-entry" v-for="(fluid, idx) in fluidInputs" :key="`fluid-${idx}`">
              <div class="fluid-icon-shell">
                <img
                  :src="getFluidImage(fluid)"
                  class="fluid-icon"
                  @error="(e) => { (e.target as HTMLImageElement).src = '/placeholder.png'; }"
                />
              </div>
              <div class="fluid-meta">
                <div class="fluid-name">{{ fluid.localizedName }}</div>
                <div class="fluid-amount">{{ fluid.amount.toLocaleString() }} L</div>
              </div>
            </div>
          </template>
          <div v-else class="fluid-empty">No fluid input</div>
        </div>
      </section>

      <div class="arrow-lane" aria-hidden="true">
        <div class="arrow">
          <svg viewBox="0 0 24 24" class="arrow-icon">
            <path d="M4 11h12.17l-5.59-5.59L12 4l8 8-8 8-1.41-1.41L16.17 13H4v-2z" />
          </svg>
        </div>
      </div>

      <section class="panel panel-output">
        <div class="panel-label panel-label-output">Output</div>
        <div class="output-grid">
          <template v-for="(slot, index) in outputs" :key="`output-${index}`">
            <RecipeItemTooltip :item-id="slot.itemId" :count="slot.count" @click="handleItemClick(slot.itemId)">
              <div class="gt-slot output-slot">
                <AnimatedItemIcon
                  :item-id="slot.itemId"
                  :render-asset-ref="slot.renderAssetRef || null"
                  :image-file-name="slot.imageFileName || null"
                  :size="28"
                  class="item-icon"
                />
                <span v-if="slot.count > 1" class="item-count">{{ slot.count }}</span>
              </div>
            </RecipeItemTooltip>
          </template>
          <div v-if="outputs.length === 0" class="gt-slot empty" />
        </div>
      </section>
    </div>

    <footer class="meta-bar">
      <div class="meta-chip"><span>EU/t</span><strong>{{ euPerTick?.toLocaleString?.() ?? '--' }}</strong></div>
      <div class="meta-chip"><span>Voltage</span><strong>{{ voltage?.toLocaleString?.() ?? '--' }} V</strong></div>
      <div class="meta-chip"><span>Amperage</span><strong>{{ amperage?.toLocaleString?.() ?? '--' }} A</strong></div>
      <div class="meta-chip"><span>Duration</span><strong>{{ formatDuration(durationTicks) }}</strong></div>
      <div class="meta-chip"><span>Total EU</span><strong>{{ totalEU?.toLocaleString?.() ?? '--' }} EU</strong></div>
    </footer>
  </div>
</template>

<style scoped>
.gt-assembler-ui {
  width: min(920px, 100%);
  border-radius: 18px;
  border: 1px solid rgba(148, 163, 184, 0.22);
  background:
    linear-gradient(180deg, rgba(9, 13, 20, 0.95), rgba(6, 10, 16, 0.98)),
    radial-gradient(circle at top, rgba(34, 211, 238, 0.08), transparent 42%);
  color: #d9ecff;
  box-shadow:
    0 18px 50px rgba(2, 8, 23, 0.38),
    inset 0 1px 0 rgba(255, 255, 255, 0.06);
  overflow: hidden;
}

.machine-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 18px 9px;
  background:
    linear-gradient(180deg, rgba(29, 36, 47, 0.94), rgba(18, 23, 30, 0.98)),
    linear-gradient(90deg, rgba(255, 255, 255, 0.06), transparent 58%);
  border-bottom: 1px solid rgba(148, 163, 184, 0.18);
}

.machine-title {
  color: #f3f7fb;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 1.2px;
  text-transform: uppercase;
}

.machine-tier {
  font-size: 10px;
  padding: 4px 10px 3px 12px;
  border-radius: 999px;
  border: 1px solid rgba(245, 208, 138, 0.28);
  color: #fff3da;
  background: rgba(54, 44, 31, 0.9);
  letter-spacing: 0.14em;
  text-transform: uppercase;
  line-height: 1;
}

.assembler-stage {
  display: grid;
  grid-template-columns: auto auto auto auto;
  align-items: start;
  gap: 10px;
  padding: 18px 16px 14px;
  background:
    linear-gradient(180deg, rgba(11, 16, 24, 0.86), rgba(8, 12, 18, 0.92)),
    url('/textures/nei/recipebg.png');
  background-repeat: no-repeat, repeat;
  background-size: auto, 128px 128px;
}

.panel {
  position: relative;
  min-height: 120px;
  padding: 18px 12px 12px;
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 12px;
  background:
    linear-gradient(180deg, rgba(18, 24, 32, 0.94), rgba(10, 14, 20, 0.98)),
    radial-gradient(circle at top, rgba(255, 255, 255, 0.05), transparent 48%),
    url('/textures/nei/recipebg.png');
  background-repeat: no-repeat, no-repeat, repeat;
  background-size: auto, auto, 96px 96px;
  box-shadow:
    inset 0 0 0 1px rgba(255, 255, 255, 0.03),
    0 10px 24px rgba(2, 8, 23, 0.2);
}

.panel-output {
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

.input-grid {
  display: grid;
  grid-template-columns: repeat(3, 44px);
  grid-template-rows: repeat(3, 44px);
  gap: 4px;
  position: relative;
  z-index: 1;
}

.output-grid {
  display: grid;
  grid-template-columns: repeat(2, 44px);
  gap: 4px;
  position: relative;
  z-index: 1;
}

.fluid-list {
  position: relative;
  z-index: 1;
  display: grid;
  gap: 6px;
  min-width: 180px;
}

.fluid-entry {
  display: flex;
  align-items: center;
  gap: 8px;
  border: 1px solid rgba(148, 163, 184, 0.18);
  border-radius: 10px;
  padding: 6px;
  background:
    linear-gradient(180deg, rgba(17, 22, 29, 0.92), rgba(10, 13, 18, 0.98)),
    url('/textures/nei/slot.png');
  background-repeat: no-repeat;
  background-position: center;
  background-size: auto, 16px 16px;
}

.fluid-empty {
  min-height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px dashed rgba(148, 163, 184, 0.2);
  border-radius: 10px;
  color: #a9bed6;
  font-size: 12px;
}

.fluid-icon-shell {
  width: 44px;
  height: 44px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  background:
    linear-gradient(180deg, rgba(11, 16, 24, 0.88), rgba(6, 10, 16, 0.92)),
    url('/textures/nei/slot.png');
  background-repeat: no-repeat;
  background-position: center;
  background-size: 100% 100%, 18px 18px;
  border: 1px solid rgba(148, 163, 184, 0.2);
}

.fluid-icon {
  width: 30px;
  height: 30px;
  object-fit: contain;
  image-rendering: pixelated;
}

.fluid-name {
  font-size: 11px;
  color: #dbe8f6;
}

.fluid-amount {
  font-size: 11px;
  color: #a9bed6;
}

.arrow-lane {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 30px;
  align-self: stretch;
}

.arrow {
  width: 30px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  color: rgba(210, 218, 230, 0.86);
}

.arrow::before {
  content: '';
  position: absolute;
  left: 1px;
  right: 5px;
  top: 50%;
  height: 6px;
  transform: translateY(-50%);
  background: url('/textures/nei/dash.png') center / 100% 2px no-repeat;
  opacity: 0.55;
}

.arrow-icon {
  width: 18px;
  height: 18px;
  position: relative;
  z-index: 1;
  fill: currentColor;
}

.gt-slot {
  position: relative;
  width: 44px;
  height: 44px;
  border-radius: 10px;
  border: 1px solid rgba(148, 163, 184, 0.28);
  background:
    linear-gradient(180deg, rgba(11, 16, 24, 0.88), rgba(6, 10, 16, 0.92)),
    url('/textures/nei/slot.png');
  background-repeat: no-repeat;
  background-position: center;
  background-size: 100% 100%, 18px 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.06),
    0 6px 12px rgba(2, 8, 23, 0.28);
  overflow: hidden;
  transition: transform 0.22s ease, border-color 0.22s ease, box-shadow 0.22s ease;
}

.gt-slot:hover {
  transform: translateY(-1px);
  border-color: rgba(103, 232, 249, 0.7);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.14),
    0 0 0 1px rgba(34, 211, 238, 0.18),
    0 10px 18px rgba(8, 145, 178, 0.2);
}

.output-slot {
  border-color: rgba(217, 182, 122, 0.3);
}

.output-slot:hover {
  border-color: rgba(245, 208, 138, 0.78);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.14),
    0 0 0 1px rgba(245, 208, 138, 0.12),
    0 10px 18px rgba(180, 83, 9, 0.18);
}

.empty {
  opacity: 0.45;
}

.item-icon {
  width: 28px;
  height: 28px;
  object-fit: contain;
  image-rendering: pixelated;
  filter: drop-shadow(0 1px 2px rgba(15, 23, 42, 0.6));
}

.item-count {
  position: absolute;
  right: 2px;
  bottom: 2px;
  background: rgba(15, 23, 42, 0.82);
  border: 1px solid rgba(148, 163, 184, 0.24);
  border-radius: 4px;
  padding: 1px 3px;
  font-size: 10px;
  line-height: 1;
  color: #f8fafc;
  font-weight: 700;
  text-shadow: 0 1px 1px rgba(15, 23, 42, 0.92);
  z-index: 2;
}

.meta-bar {
  padding: 0 16px 14px;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  background: linear-gradient(180deg, rgba(10, 14, 20, 0.88), rgba(7, 10, 15, 0.96));
  border-top: 1px solid rgba(148, 163, 184, 0.16);
}

.meta-chip {
  border: 1px solid rgba(148, 163, 184, 0.24);
  border-radius: 8px;
  padding: 4px 8px;
  background: rgba(8, 16, 25, 0.72);
  font-size: 11px;
  display: inline-flex;
  gap: 6px;
  align-items: baseline;
}

.meta-chip span {
  color: #b8c5d6;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.meta-chip strong {
  color: #f3f7fb;
}

@media (max-width: 900px) {
  .assembler-stage {
    grid-template-columns: 1fr;
  }

  .arrow-lane {
    min-width: 100%;
    min-height: 20px;
  }

  .arrow {
    transform: rotate(90deg);
  }
}
</style>
