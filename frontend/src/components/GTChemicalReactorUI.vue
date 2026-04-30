<script setup lang="ts">
import { computed } from 'vue';
import type { Recipe, FluidGroup, FluidStack } from '../services/api';
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

interface FluidView {
  fluidId: string;
  localizedName: string;
  amount: number;
  temperature: number | null;
  renderAssetRef?: string | null;
}

const MIN_ITEM_SLOT_COUNT = 6;
const MIN_FLUID_SLOT_COUNT = 6;

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
    item?: {
      itemId?: unknown;
      renderAssetRef?: unknown;
      imageFileName?: unknown;
    };
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
    return {
      itemId: obj.item.itemId,
      count: normalizeCount(obj.count ?? obj.stackSize),
      renderAssetRef:
        typeof obj.renderAssetRef === 'string'
          ? obj.renderAssetRef
          : (typeof obj.item.renderAssetRef === 'string' ? obj.item.renderAssetRef : null),
      imageFileName:
        typeof obj.imageFileName === 'string'
          ? obj.imageFileName
          : (typeof obj.item.imageFileName === 'string' ? obj.item.imageFileName : null),
    };
  }

  if (Array.isArray(obj.items)) {
    for (const child of obj.items) {
      const nested = extractItem(child);
      if (nested) return nested;
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

function fillFixedSlots<T>(entries: T[], size: number): Array<T | null> {
  const normalized = entries.slice(0, size);
  while (normalized.length < size) normalized.push(null);
  return normalized;
}

const flatItemInputs = computed<ItemSlot[]>(() => {
  const rows = Array.isArray(recipe.value.inputs) ? recipe.value.inputs : [];
  const flattened: ItemSlot[] = [];
  for (const row of rows) {
    if (!Array.isArray(row)) continue;
    for (const cell of row) {
      const extracted = extractCell(cell);
      if (extracted) flattened.push(extracted);
    }
  }
  return flattened;
});

const flatItemOutputs = computed<ItemSlot[]>(() => {
  const outputs = Array.isArray(recipe.value.outputs) ? recipe.value.outputs : [];
  return outputs
    .map((entry) => extractItem(entry))
    .filter((entry): entry is ItemSlot => entry !== null);
});

function toFluidView(entry: FluidStack | null | undefined): FluidView | null {
  if (!entry?.fluid?.fluidId) return null;
  return {
    fluidId: entry.fluid.fluidId,
    localizedName: entry.fluid.localizedName,
    amount: Number(entry.amount ?? 0),
    temperature:
      typeof entry.fluid.temperature === 'number' && Number.isFinite(entry.fluid.temperature)
        ? entry.fluid.temperature
        : null,
    renderAssetRef: entry.fluid.renderAssetRef ?? null,
  };
}

const resolvedFluidInputs = computed<FluidView[]>(() => {
  const groups = Array.isArray(recipe.value.fluidInputs) ? recipe.value.fluidInputs as FluidGroup[] : [];
  const result: FluidView[] = [];
  for (const group of groups) {
    const first = Array.isArray(group?.fluids) ? group.fluids[0] : null;
    const resolved = toFluidView(first);
    if (resolved) result.push(resolved);
  }
  return result;
});

const resolvedFluidOutputs = computed<FluidView[]>(() => {
  const outputs = Array.isArray(recipe.value.fluidOutputs) ? recipe.value.fluidOutputs as FluidStack[] : [];
  return outputs
    .map((entry) => toFluidView(entry))
    .filter((entry): entry is FluidView => entry !== null);
});

const itemInputSlotCount = computed(() => Math.max(MIN_ITEM_SLOT_COUNT, flatItemInputs.value.length));
const itemOutputSlotCount = computed(() => Math.max(MIN_ITEM_SLOT_COUNT, flatItemOutputs.value.length));
const fluidInputSlotCount = computed(() => Math.max(MIN_FLUID_SLOT_COUNT, resolvedFluidInputs.value.length));
const fluidOutputSlotCount = computed(() => Math.max(MIN_FLUID_SLOT_COUNT, resolvedFluidOutputs.value.length));

const itemInputs = computed<Array<ItemSlot | null>>(() => fillFixedSlots(flatItemInputs.value, itemInputSlotCount.value));
const itemOutputs = computed<Array<ItemSlot | null>>(() => fillFixedSlots(flatItemOutputs.value, itemOutputSlotCount.value));
const fluidInputs = computed<Array<FluidView | null>>(() => fillFixedSlots(resolvedFluidInputs.value, fluidInputSlotCount.value));
const fluidOutputs = computed<Array<FluidView | null>>(() => fillFixedSlots(resolvedFluidOutputs.value, fluidOutputSlotCount.value));

const machineIcon = computed(() => (
  recipe.value.machineInfo?.machineIcon
  || recipe.value.recipeTypeData?.machineIcon
  || null
));

const machineLabel = computed(() => {
  const source =
    recipe.value.machineInfo?.machineType
    || (typeof recipe.value.recipeTypeData?.machineType === 'string' ? recipe.value.recipeTypeData.machineType : '')
    || recipe.value.recipeType;
  return source && source.trim() ? source.trim() : '化学反应釜';
});

const isLargeReactor = computed(() => {
  const label = machineLabel.value.toLowerCase();
  return label.includes('large') || machineLabel.value.includes('大型');
});

const mergedMeta = computed<Record<string, unknown>>(() => {
  const additional =
    recipe.value.additionalData && typeof recipe.value.additionalData === 'object'
      ? recipe.value.additionalData as Record<string, unknown>
      : {};
  const metadata =
    recipe.value.metadata && typeof recipe.value.metadata === 'object'
      ? recipe.value.metadata as Record<string, unknown>
      : {};
  return { ...additional, ...metadata };
});

function pickNumber(...values: unknown[]): number | null {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return null;
}

const voltageTier = computed(() => {
  const tier = mergedMeta.value.voltageTier ?? recipe.value.machineInfo?.parsedVoltageTier;
  return typeof tier === 'string' && tier.trim() ? tier.trim() : '--';
});

const voltage = computed(() => pickNumber(mergedMeta.value.voltage, recipe.value.machineInfo?.parsedVoltage));
const amperage = computed(() => pickNumber(mergedMeta.value.amperage) ?? 1);
const euPerTick = computed(() => {
  const explicit = pickNumber(mergedMeta.value.euPerTick, mergedMeta.value.eut, mergedMeta.value.EUt);
  if (explicit !== null) return explicit;
  return voltage.value !== null ? voltage.value * amperage.value : null;
});
const durationTicks = computed(() => pickNumber(mergedMeta.value.duration));
const totalEU = computed(() => {
  const explicit = pickNumber(mergedMeta.value.totalEU);
  if (explicit !== null) return explicit;
  if (euPerTick.value === null || durationTicks.value === null) return null;
  return euPerTick.value * durationTicks.value;
});

const needsCleanroom = computed(() => Boolean(mergedMeta.value.requiresCleanroom));
const needsLowGravity = computed(() => Boolean(mergedMeta.value.requiresLowGravity));
const additionalInfo = computed(() => {
  const value = mergedMeta.value.additionalInfo;
  return typeof value === 'string' && value.trim() ? value.trim() : '';
});

const summaryRows = computed(() => [
  { label: '总计', value: `${totalEU.value?.toLocaleString?.() ?? '--'} EU` },
  { label: '使用', value: `${euPerTick.value?.toLocaleString?.() ?? '--'} EU/t (${voltageTier.value})` },
  { label: '时间', value: formatDuration(durationTicks.value) },
]);

const environmentNotes = computed(() => {
  const notes: string[] = [];
  if (needsCleanroom.value) notes.push('需要洁净室');
  if (needsLowGravity.value) notes.push('需要低重力');
  if (additionalInfo.value) notes.push(additionalInfo.value);
  return notes;
});

const reactorSubtitle = computed(() => (
  isLargeReactor.value ? '大型连续反应' : '精密化学合成'
));

function formatDuration(ticks: number | null): string {
  if (ticks === null) return '--';
  const seconds = ticks / 20;
  const rounded = Number.isInteger(seconds) ? `${seconds}` : seconds.toFixed(1);
  return `${rounded} 秒`;
}

function formatFluidAmount(fluid: FluidView): string {
  return `${Math.max(0, fluid.amount).toLocaleString()}L`;
}

function formatFluidTemperature(fluid: FluidView): string {
  if (fluid.temperature === null) return '';
  return `${Math.round(fluid.temperature)}K`;
}

function handleEntityClick(itemId: string): void {
  playClick();
  emit('item-click', itemId);
}
</script>

<template>
  <div class="gt-chemical-ui">
    <header class="machine-header">
      <div class="machine-heading">
        <div v-if="machineIcon" class="machine-icon">
          <AnimatedItemIcon
            :item-id="machineIcon.itemId"
            :render-asset-ref="machineIcon.renderAssetRef || null"
            :image-file-name="machineIcon.imageFileName || null"
            :size="22"
          />
        </div>
        <div class="machine-copy">
          <div class="machine-title">{{ machineLabel }}</div>
          <div class="machine-subtitle">{{ reactorSubtitle }}</div>
        </div>
      </div>
      <div class="machine-meta">
        <span v-if="isLargeReactor" class="tier-chip tier-chip--large">大型</span>
        <span class="tier-chip">{{ voltageTier }}</span>
      </div>
    </header>

    <div class="reactor-layout">
      <section class="reactor-block reactor-block--input">
        <div class="block-label">输入</div>
        <div class="item-grid">
          <template v-for="(slot, index) in itemInputs" :key="`input-item-${index}`">
            <RecipeItemTooltip
              v-if="slot"
              :item-id="slot.itemId"
              :count="slot.count"
              @click="handleEntityClick(slot.itemId)"
            >
              <div class="item-slot item-slot--input">
                <AnimatedItemIcon
                  :item-id="slot.itemId"
                  :render-asset-ref="slot.renderAssetRef || null"
                  :image-file-name="slot.imageFileName || null"
                  :size="28"
                />
                <span v-if="slot.count > 1" class="slot-count">{{ slot.count }}</span>
              </div>
            </RecipeItemTooltip>
            <div v-else class="item-slot item-slot--empty"></div>
          </template>
        </div>

        <div class="fluid-grid">
          <template v-for="(fluid, index) in fluidInputs" :key="`input-fluid-${index}`">
            <RecipeItemTooltip
              v-if="fluid"
              :item-id="fluid.fluidId"
              :count="1"
              @click="handleEntityClick(fluid.fluidId)"
            >
              <div class="fluid-slot fluid-slot--input">
                <AnimatedItemIcon
                  :item-id="fluid.fluidId"
                  :render-asset-ref="fluid.renderAssetRef || null"
                  :size="32"
                />
                <span v-if="formatFluidTemperature(fluid)" class="fluid-slot__temp">{{ formatFluidTemperature(fluid) }}</span>
                <span class="fluid-slot__amount">{{ formatFluidAmount(fluid) }}</span>
              </div>
            </RecipeItemTooltip>
            <div v-else class="fluid-slot fluid-slot--empty"></div>
          </template>
        </div>
      </section>

      <section class="process-column" aria-label="反应流程">
        <div class="process-arrow" aria-hidden="true">
          <div class="process-arrow__shaft"></div>
          <div class="process-arrow__head"></div>
        </div>
        <div class="process-glyph" aria-hidden="true">
          <span class="process-glyph__arc process-glyph__arc--left"></span>
          <span class="process-glyph__arc process-glyph__arc--right"></span>
          <span class="process-glyph__core"></span>
          <span class="process-glyph__spark process-glyph__spark--top"></span>
          <span class="process-glyph__spark process-glyph__spark--right"></span>
          <span class="process-glyph__spark process-glyph__spark--bottom"></span>
          <span class="process-glyph__spark process-glyph__spark--left"></span>
        </div>
      </section>

      <section class="reactor-block reactor-block--output">
        <div class="block-label block-label--output">输出</div>
        <div class="item-grid">
          <template v-for="(slot, index) in itemOutputs" :key="`output-item-${index}`">
            <RecipeItemTooltip
              v-if="slot"
              :item-id="slot.itemId"
              :count="slot.count"
              @click="handleEntityClick(slot.itemId)"
            >
              <div class="item-slot item-slot--output">
                <AnimatedItemIcon
                  :item-id="slot.itemId"
                  :render-asset-ref="slot.renderAssetRef || null"
                  :image-file-name="slot.imageFileName || null"
                  :size="28"
                />
                <span v-if="slot.count > 1" class="slot-count">{{ slot.count }}</span>
              </div>
            </RecipeItemTooltip>
            <div v-else class="item-slot item-slot--empty item-slot--output-empty"></div>
          </template>
        </div>

        <div class="fluid-grid">
          <template v-for="(fluid, index) in fluidOutputs" :key="`output-fluid-${index}`">
            <RecipeItemTooltip
              v-if="fluid"
              :item-id="fluid.fluidId"
              :count="1"
              @click="handleEntityClick(fluid.fluidId)"
            >
              <div class="fluid-slot fluid-slot--output">
                <AnimatedItemIcon
                  :item-id="fluid.fluidId"
                  :render-asset-ref="fluid.renderAssetRef || null"
                  :size="32"
                />
                <span v-if="formatFluidTemperature(fluid)" class="fluid-slot__temp">{{ formatFluidTemperature(fluid) }}</span>
                <span class="fluid-slot__amount">{{ formatFluidAmount(fluid) }}</span>
              </div>
            </RecipeItemTooltip>
            <div v-else class="fluid-slot fluid-slot--empty fluid-slot--output-empty"></div>
          </template>
        </div>
      </section>
    </div>

    <footer class="stats-panel">
      <div class="stats-list">
        <div v-for="row in summaryRows" :key="row.label" class="stats-line">
          <span class="stats-line__label">{{ row.label }}:</span>
          <strong class="stats-line__value">{{ row.value }}</strong>
        </div>
      </div>
      <div v-if="environmentNotes.length" class="notes-list">
        <span v-for="note in environmentNotes" :key="note" class="note-chip">{{ note }}</span>
      </div>
    </footer>
  </div>
</template>

<style scoped>
.gt-chemical-ui {
  --board-stroke: rgba(107, 133, 155, 0.24);
  --item-slot-size: 56px;
  --fluid-slot-size: 56px;
  width: min(820px, 100%);
  border-radius: 20px;
  border: 1px solid var(--board-stroke);
  background:
    linear-gradient(180deg, rgba(11, 16, 22, 0.985), rgba(7, 10, 14, 0.995)),
    radial-gradient(circle at 50% 0%, rgba(143, 170, 197, 0.06), transparent 46%);
  box-shadow:
    0 24px 60px rgba(0, 0, 0, 0.36),
    inset 0 1px 0 rgba(255, 255, 255, 0.04);
  color: #eef4fa;
  position: relative;
  overflow: hidden;
}

.gt-chemical-ui::before {
  content: '';
  position: absolute;
  inset: 0;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.015), transparent 20%),
    repeating-linear-gradient(90deg, rgba(120, 140, 165, 0.03) 0 1px, transparent 1px 36px),
    repeating-linear-gradient(0deg, rgba(120, 140, 165, 0.02) 0 1px, transparent 1px 36px);
  pointer-events: none;
  opacity: 0.48;
}

.gt-chemical-ui::after {
  content: '';
  position: absolute;
  inset: 0;
  background:
    radial-gradient(circle at 24% 62%, rgba(90, 149, 214, 0.08), transparent 26%),
    radial-gradient(circle at 76% 42%, rgba(223, 181, 93, 0.08), transparent 24%);
  pointer-events: none;
}

.machine-header,
.reactor-layout,
.stats-panel {
  position: relative;
  z-index: 1;
}

.machine-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 16px 18px 14px;
  border-bottom: 1px solid rgba(132, 153, 176, 0.14);
  background: linear-gradient(180deg, rgba(18, 25, 32, 0.94), rgba(11, 16, 22, 0.88));
}

.machine-heading {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.machine-icon {
  width: 38px;
  height: 38px;
  border-radius: 10px;
  border: 1px solid rgba(137, 160, 182, 0.22);
  background: linear-gradient(180deg, rgba(13, 19, 25, 0.98), rgba(8, 12, 17, 0.98));
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
}

.machine-copy {
  min-width: 0;
}

.machine-title {
  font-size: 16px;
  font-weight: 700;
  letter-spacing: 0.06em;
}

.machine-subtitle {
  margin-top: 4px;
  font-size: 11px;
  color: rgba(191, 208, 223, 0.76);
  letter-spacing: 0.12em;
}

.machine-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.tier-chip {
  border-radius: 999px;
  padding: 5px 10px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.12em;
  border: 1px solid rgba(141, 164, 188, 0.18);
  background: rgba(18, 26, 34, 0.92);
  color: #e7f1f8;
}

.tier-chip--large {
  border-color: rgba(227, 183, 97, 0.28);
  background: rgba(58, 42, 17, 0.78);
  color: #f2d995;
}

.reactor-layout {
  display: grid;
  grid-template-columns: auto 78px auto;
  justify-content: center;
  gap: 12px;
  align-items: center;
  padding: 18px 18px 10px;
}

.reactor-block {
  position: relative;
  width: fit-content;
  padding: 12px;
  border-radius: 16px;
  border: 1px solid rgba(118, 143, 167, 0.18);
  background:
    linear-gradient(180deg, rgba(19, 26, 34, 0.96), rgba(10, 14, 19, 0.98)),
    radial-gradient(circle at 50% 0%, rgba(140, 178, 214, 0.06), transparent 50%);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.04),
    inset 0 0 0 1px rgba(255, 255, 255, 0.015);
}

.reactor-block::before,
.reactor-block::after {
  content: '';
  position: absolute;
  pointer-events: none;
}

.reactor-block::before {
  inset: 7px;
  border: 1px solid rgba(255, 255, 255, 0.035);
  border-radius: 12px;
}

.reactor-block::after {
  top: 10px;
  left: 10px;
  width: 46px;
  height: 2px;
  border-radius: 999px;
  background: linear-gradient(90deg, rgba(148, 193, 235, 0.55), transparent);
}

.reactor-block--output {
  border-color: rgba(178, 144, 83, 0.22);
  background:
    linear-gradient(180deg, rgba(31, 25, 17, 0.96), rgba(14, 11, 8, 0.985)),
    radial-gradient(circle at 50% 0%, rgba(224, 184, 109, 0.07), transparent 52%);
}

.reactor-block--output::after {
  background: linear-gradient(90deg, rgba(233, 190, 100, 0.58), transparent);
}

.block-label {
  margin-bottom: 8px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.16em;
  color: rgba(214, 228, 239, 0.92);
}

.block-label--output {
  color: rgba(241, 214, 158, 0.92);
}

.item-grid,
.fluid-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
  padding: 6px;
  border-radius: 12px;
  border: 1px solid rgba(126, 152, 177, 0.12);
  background: linear-gradient(180deg, rgba(8, 13, 18, 0.82), rgba(6, 9, 13, 0.9));
}

.item-grid {
  margin-bottom: 6px;
}

.reactor-block--output .item-grid,
.reactor-block--output .fluid-grid {
  border-color: rgba(196, 160, 96, 0.12);
  background: linear-gradient(180deg, rgba(19, 14, 10, 0.82), rgba(10, 7, 5, 0.9));
}

.item-slot,
.fluid-slot {
  position: relative;
  overflow: hidden;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.04),
    inset 0 -10px 18px rgba(0, 0, 0, 0.24);
}

.item-slot {
  width: var(--item-slot-size);
  height: var(--item-slot-size);
  border-radius: 12px;
  border: 1px solid rgba(123, 148, 173, 0.2);
  background:
    linear-gradient(180deg, rgba(8, 12, 17, 0.98), rgba(5, 8, 12, 0.995)),
    radial-gradient(circle at 50% 28%, rgba(135, 180, 217, 0.12), transparent 52%);
  display: flex;
  align-items: center;
  justify-content: center;
}

.item-slot::before,
.fluid-slot::before {
  content: '';
  position: absolute;
  inset: 4px;
  border: 1px solid rgba(255, 255, 255, 0.04);
  pointer-events: none;
}

.item-slot::before {
  border-radius: 8px;
}

.fluid-slot::before {
  inset: 3px;
}

.item-slot--output {
  border-color: rgba(196, 160, 96, 0.24);
  background:
    linear-gradient(180deg, rgba(18, 14, 10, 0.985), rgba(8, 6, 4, 0.995)),
    radial-gradient(circle at 50% 28%, rgba(229, 194, 121, 0.14), transparent 56%);
}

.item-slot--empty,
.fluid-slot--empty {
  opacity: 0.34;
}

.item-slot--output-empty {
  opacity: 0.26;
}

.slot-count {
  position: absolute;
  right: 5px;
  bottom: 4px;
  font-size: 10px;
  font-weight: 700;
  color: #f3fbff;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.9);
}

.fluid-slot {
  width: var(--fluid-slot-size);
  height: var(--fluid-slot-size);
  border-radius: 0;
  border: 1px solid rgba(122, 146, 171, 0.18);
  background:
    linear-gradient(180deg, rgba(7, 10, 14, 0.98), rgba(4, 6, 9, 0.995)),
    radial-gradient(circle at 50% 0%, rgba(140, 187, 227, 0.08), transparent 54%);
  display: flex;
  align-items: center;
  justify-content: center;
}

.fluid-slot--output {
  border-color: rgba(193, 159, 95, 0.2);
  background:
    linear-gradient(180deg, rgba(17, 13, 9, 0.985), rgba(8, 6, 4, 0.995)),
    radial-gradient(circle at 50% 0%, rgba(230, 192, 118, 0.08), transparent 54%);
}

.fluid-slot__amount,
.fluid-slot__temp {
  position: absolute;
  left: 4px;
  right: 4px;
  text-align: center;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.9);
  pointer-events: none;
}

.fluid-slot__amount {
  bottom: 4px;
  font-size: 10px;
  font-weight: 800;
  color: #f2fbff;
}

.fluid-slot__temp {
  top: 4px;
  font-size: 9px;
  color: rgba(206, 226, 240, 0.84);
}

.process-column {
  position: relative;
  min-height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: 18px;
}

.process-column::before {
  content: '';
  position: absolute;
  top: 12px;
  bottom: 12px;
  left: 50%;
  width: 1px;
  transform: translateX(-50%);
  background: linear-gradient(180deg, transparent, rgba(255, 255, 255, 0.08), transparent);
  pointer-events: none;
}

.process-arrow {
  width: 78px;
  display: flex;
  align-items: center;
  justify-content: center;
  filter: drop-shadow(0 0 12px rgba(255, 255, 255, 0.08));
}

.process-arrow__shaft {
  width: 48px;
  height: 10px;
  border-radius: 999px;
  background:
    linear-gradient(180deg, rgba(244, 247, 250, 0.98), rgba(185, 194, 201, 0.95)),
    linear-gradient(90deg, rgba(255, 255, 255, 0.4), transparent);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.48);
}

.process-arrow__head {
  margin-left: -2px;
  width: 0;
  height: 0;
  border-top: 16px solid transparent;
  border-bottom: 16px solid transparent;
  border-left: 24px solid rgba(241, 245, 248, 0.98);
}

.process-glyph {
  position: relative;
  width: 44px;
  height: 44px;
}

.process-glyph__arc {
  position: absolute;
  top: 8px;
  bottom: 8px;
  width: 12px;
  border: 3px solid rgba(230, 183, 77, 0.92);
  filter: drop-shadow(0 0 8px rgba(230, 183, 77, 0.16));
}

.process-glyph__arc--left {
  left: 2px;
  border-right: none;
  border-radius: 14px 0 0 14px;
}

.process-glyph__arc--right {
  right: 2px;
  border-left: none;
  border-radius: 0 14px 14px 0;
}

.process-glyph__core {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: rgba(244, 201, 99, 0.95);
  transform: translate(-50%, -50%);
  box-shadow: 0 0 12px rgba(230, 183, 77, 0.26);
}

.process-glyph__spark {
  position: absolute;
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: rgba(241, 201, 109, 0.95);
  box-shadow: 0 0 10px rgba(241, 201, 109, 0.55);
}

.process-glyph__spark--top {
  top: 2px;
  left: 50%;
  transform: translateX(-50%);
}

.process-glyph__spark--right {
  top: 50%;
  right: 1px;
  transform: translateY(-50%);
}

.process-glyph__spark--bottom {
  bottom: 2px;
  left: 50%;
  transform: translateX(-50%);
}

.process-glyph__spark--left {
  top: 50%;
  left: 1px;
  transform: translateY(-50%);
}

.stats-panel {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  padding: 4px 18px 18px;
}

.stats-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.stats-line {
  font-size: 15px;
  line-height: 1.2;
  color: #edf4fa;
}

.stats-line__label {
  margin-right: 4px;
  color: rgba(191, 207, 219, 0.82);
}

.stats-line__value {
  font-weight: 700;
}

.notes-list {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}

.note-chip {
  padding: 6px 10px;
  border-radius: 999px;
  border: 1px solid rgba(135, 158, 179, 0.18);
  background: rgba(17, 25, 33, 0.88);
  font-size: 11px;
  font-weight: 600;
  color: #d9eaf4;
}

@media (max-width: 960px) {
  .reactor-layout {
    grid-template-columns: 1fr;
    gap: 12px;
  }

  .reactor-block {
    width: 100%;
  }

  .process-column {
    min-height: 84px;
    flex-direction: row;
  }

  .stats-panel {
    flex-direction: column;
  }

  .notes-list {
    justify-content: flex-start;
  }
}

@media (max-width: 640px) {
  .gt-chemical-ui {
    --item-slot-size: 52px;
    --fluid-slot-size: 52px;
  }

  .machine-header {
    flex-direction: column;
    align-items: flex-start;
  }

  .reactor-layout,
  .stats-panel {
    padding-inline: 14px;
  }
}
</style>
