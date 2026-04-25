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

interface ItemStack {
  itemId: string;
  count: number;
  renderAssetRef?: string | null;
  imageFileName?: string | null;
}

interface FluidStackView {
  fluidId: string;
  localizedName: string;
  amount: number;
  temperature?: number;
  renderAssetRef?: string | null;
}

interface SpecialItemView {
  itemId: string;
  count: number;
  kind: 'circuit' | 'special';
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();
const { playClick } = useSound();

const recipe = computed(() => props.recipe);

const machineLabel = computed(() => {
  const byMachineInfo = recipe.value.machineInfo?.machineType;
  if (byMachineInfo && byMachineInfo.trim()) return byMachineInfo;
  const byRecipeTypeData = typeof recipe.value.recipeTypeData?.type === 'string' ? recipe.value.recipeTypeData.type : '';
  if (byRecipeTypeData.trim()) return byRecipeTypeData;
  const rt = recipe.value.recipeType || '';
  const m = rt.match(/gregtech\s*-\s*(.+?)\s*(\(|$)/i);
  return m ? m[1].trim() : rt;
});

const combinedDescriptor = computed(() => {
  return [
    machineLabel.value,
    typeof recipe.value.recipeTypeData?.type === 'string' ? recipe.value.recipeTypeData.type : '',
    typeof recipe.value.recipeTypeData?.category === 'string' ? recipe.value.recipeTypeData.category : '',
    typeof recipe.value.recipeTypeData?.machineType === 'string' ? recipe.value.recipeTypeData.machineType : '',
  ].join(' ').toLowerCase();
});

const looksLikeWorkbenchCrafting = computed(() => {
  const labels = [
    machineLabel.value,
    typeof recipe.value.recipeTypeData?.machineType === 'string' ? recipe.value.recipeTypeData.machineType : '',
    typeof recipe.value.recipeTypeData?.type === 'string' ? recipe.value.recipeTypeData.type : '',
  ].map((value) => value.trim().toLowerCase()).filter(Boolean);
  return labels.some((text) => (
    text === 'crafting table'
    || text === 'crafting (shaped)'
    || text === 'crafting (shapeless)'
    || text === 'worktable'
    || text === 'workbench'
    || text === '有序合成'
    || text === '无序合成'
  ));
  const text = combinedDescriptor.value;
  return (
    text.includes('crafting')
    || text.includes('shaped')
    || text.includes('shapeless')
    || text.includes('minecraft')
    || text.includes('worktable')
    || text.includes('workbench')
    || text.includes('工作台')
    || text.includes('有序合成')
    || text.includes('无序合成')
  );
});

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

function isCircuitItemId(itemId: string): boolean {
  const normalized = itemId.toLowerCase();
  return normalized.includes('integrated_circuit')
    || normalized.includes('metacircuit')
    || normalized.includes('circuit')
    || normalized.includes('编程电路');
}

const inputDims = computed(() => {
  const explicit = recipe.value.recipeTypeData?.itemInputDimension;
  if (explicit?.width && explicit?.height) {
    return { width: explicit.width, height: explicit.height };
  }
  const rows = Array.isArray(recipe.value.inputs) ? recipe.value.inputs : [];
  const height = Math.max(rows.length, 1);
  const width = Math.max(1, ...rows.map((r) => (Array.isArray(r) ? r.length : 0)));
  return { width, height };
});

const outputDims = computed(() => {
  const explicit = recipe.value.recipeTypeData?.itemOutputDimension;
  if (explicit?.width && explicit?.height) {
    return { width: explicit.width, height: explicit.height };
  }
  const count = Math.max(recipe.value.outputs?.length ?? 0, 1);
  return { width: Math.min(count, 4), height: Math.ceil(count / 4) };
});

const inputSlots = computed(() => {
  const slots: Array<ItemStack | null> = Array.from(
    { length: inputDims.value.width * inputDims.value.height },
    () => null,
  );
  const rows = Array.isArray(recipe.value.inputs) ? recipe.value.inputs : [];
  for (let y = 0; y < inputDims.value.height; y += 1) {
    const row = Array.isArray(rows[y]) ? rows[y] : [];
    for (let x = 0; x < inputDims.value.width; x += 1) {
      slots[y * inputDims.value.width + x] = extractCellStack(row[x]);
    }
  }
  return slots;
});

const outputSlots = computed(() => {
  const slots: Array<ItemStack | null> = Array.from(
    { length: outputDims.value.width * outputDims.value.height },
    () => null,
  );
  const outputs = Array.isArray(recipe.value.outputs) ? recipe.value.outputs : [];
  for (let i = 0; i < slots.length; i += 1) {
    const out = outputs[i];
    slots[i] = out && typeof out.itemId === 'string'
      ? {
          itemId: out.itemId,
          count: normalizeCount(out.count),
          renderAssetRef: typeof out.renderAssetRef === 'string' ? out.renderAssetRef : null,
          imageFileName: typeof (out as { imageFileName?: unknown }).imageFileName === 'string'
            ? ((out as { imageFileName?: string }).imageFileName ?? null)
            : null,
        }
      : null;
  }
  return slots;
});

const specialItems = computed<SpecialItemView[]>(() => {
  const merged: SpecialItemView[] = [];
  const seen = new Set<string>();

  const addUnique = (itemId: string, count: number, kind: 'circuit' | 'special'): void => {
    const key = `${itemId}::${count}`;
    if (seen.has(key)) return;
    seen.add(key);
    merged.push({ itemId, count, kind });
  };

  const fromMeta = [
    recipe.value.additionalData?.specialItems,
    recipe.value.metadata?.specialItems,
  ];
  for (const list of fromMeta) {
    if (!Array.isArray(list)) continue;
    for (const node of list) {
      const extracted = extractItemStack(node);
      if (!extracted) continue;
      addUnique(extracted.itemId, extracted.count, isCircuitItemId(extracted.itemId) ? 'circuit' : 'special');
    }
  }

  const rows = Array.isArray(recipe.value.inputs) ? recipe.value.inputs : [];
  for (const row of rows) {
    if (!Array.isArray(row)) continue;
    for (const cell of row) {
      const extracted = extractCellStack(cell);
      if (!extracted || !isCircuitItemId(extracted.itemId)) continue;
      addUnique(extracted.itemId, extracted.count, 'circuit');
    }
  }

  return merged.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'circuit' ? -1 : 1;
    return a.itemId.localeCompare(b.itemId);
  });
});

const fluidInputs = computed<FluidStackView[]>(() => {
  const list: FluidStackView[] = [];
  const groups = Array.isArray(recipe.value.fluidInputs) ? recipe.value.fluidInputs : [];
  for (const group of groups) {
    const first = group?.fluids?.[0];
    if (!first?.fluid?.fluidId) continue;
    list.push({
      fluidId: first.fluid.fluidId,
      localizedName: first.fluid.localizedName,
      amount: first.amount,
      temperature: first.fluid.temperature,
      renderAssetRef: first.fluid.renderAssetRef ?? null,
    });
  }
  return list;
});

const fluidOutputs = computed<FluidStackView[]>(() => {
  const list: FluidStackView[] = [];
  const groups = Array.isArray(recipe.value.fluidOutputs) ? recipe.value.fluidOutputs : [];
  for (const out of groups) {
    if (!out?.fluid?.fluidId) continue;
    list.push({
      fluidId: out.fluid.fluidId,
      localizedName: out.fluid.localizedName,
      amount: out.amount,
      temperature: out.fluid.temperature,
      renderAssetRef: out.fluid.renderAssetRef ?? null,
    });
  }
  return list;
});

const mergedMeta = computed<Record<string, unknown>>(() => {
  const a = (recipe.value.additionalData && typeof recipe.value.additionalData === 'object')
    ? recipe.value.additionalData as Record<string, unknown>
    : {};
  const b = (recipe.value.metadata && typeof recipe.value.metadata === 'object')
    ? recipe.value.metadata as Record<string, unknown>
    : {};
  return { ...a, ...b };
});

function pickNumber(...values: unknown[]): number | null {
  for (const v of values) {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

const voltageTier = computed(() => {
  const tier = mergedMeta.value.voltageTier ?? recipe.value.machineInfo?.parsedVoltageTier;
  return typeof tier === 'string' && tier.trim() ? tier.trim() : '--';
});

const voltage = computed(() => pickNumber(mergedMeta.value.voltage, recipe.value.machineInfo?.parsedVoltage));
const amperage = computed(() => pickNumber(mergedMeta.value.amperage) ?? 1);
const durationTicks = computed(() => pickNumber(mergedMeta.value.duration));
const euPerTick = computed(() => {
  const explicit = pickNumber(mergedMeta.value.euPerTick, mergedMeta.value.eut, mergedMeta.value.EUt);
  if (explicit !== null) return explicit;
  if (voltage.value === null) return null;
  return voltage.value * (amperage.value ?? 1);
});
const totalEU = computed(() => {
  const explicit = pickNumber(mergedMeta.value.totalEU);
  if (explicit !== null) return explicit;
  if (euPerTick.value === null || durationTicks.value === null) return null;
  return euPerTick.value * durationTicks.value;
});

const needsCleanroom = computed(() => Boolean(mergedMeta.value.requiresCleanroom));
const needsLowGravity = computed(() => Boolean(mergedMeta.value.requiresLowGravity));
const showMachineMetrics = computed(() => {
  if (looksLikeWorkbenchCrafting.value) {
    return false;
  }
  return (
    euPerTick.value !== null
    || voltage.value !== null
    || durationTicks.value !== null
    || totalEU.value !== null
    || needsCleanroom.value
    || needsLowGravity.value
  );
});

function formatDuration(ticks: number | null): string {
  if (ticks === null) return '--';
  const totalSec = ticks / 20;
  if (totalSec >= 60) {
    const min = Math.floor(totalSec / 60);
    const sec = Math.floor(totalSec % 60);
    return `${min}m ${sec}s (${Math.floor(ticks)}t)`;
  }
  return `${totalSec.toFixed(1)}s (${Math.floor(ticks)}t)`;
}

function getFluidImage(fluid: { fluidId?: string | null; renderAssetRef?: string | null }): string {
  return getFluidImageUrlFromFluid(fluid) || '/placeholder.png';
}

function onClickItem(itemId: string): void {
  playClick();
  emit('item-click', itemId);
}
</script>

<template>
  <div class="gt-universal-ui">
    <header class="machine-header">
      <div class="machine-title-shell">
        <div class="machine-title">{{ machineLabel }}</div>
      </div>
      <div class="machine-tier">{{ voltageTier }}</div>
    </header>

    <div class="recipe-row">
      <section class="side">
        <div class="panel-label">Input</div>
        <div class="slots" :style="{ gridTemplateColumns: `repeat(${inputDims.width}, var(--gtu-slot-size))` }">
          <template v-for="(slot, idx) in inputSlots" :key="`in-${idx}`">
            <RecipeItemTooltip v-if="slot" :item-id="slot.itemId" :count="slot.count" @click="onClickItem(slot.itemId)">
              <div class="slot item">
                <AnimatedItemIcon
                  :item-id="slot.itemId"
                  :render-asset-ref="slot.renderAssetRef || null"
                  :image-file-name="slot.imageFileName || null"
                  :size="28"
                  class="icon"
                />
                <span v-if="slot.count > 1" class="count">{{ slot.count }}</span>
              </div>
            </RecipeItemTooltip>
            <div v-else class="slot empty"></div>
          </template>
        </div>

        <div class="special-panel" v-if="specialItems.length">
          <div class="subpanel-label">Circuit / Special Items</div>
          <div class="special-slots">
            <RecipeItemTooltip
              v-for="(slot, idx) in specialItems"
              :key="`special-${idx}-${slot.itemId}`"
              :item-id="slot.itemId"
              :count="slot.count"
              @click="onClickItem(slot.itemId)"
            >
              <div class="slot item special" :class="{ circuit: slot.kind === 'circuit' }">
                <AnimatedItemIcon
                  :item-id="slot.itemId"
                  :size="28"
                  class="icon"
                />
                <span v-if="slot.count > 1" class="count">{{ slot.count }}</span>
              </div>
            </RecipeItemTooltip>
          </div>
        </div>

        <div class="fluid-list" v-if="fluidInputs.length">
          <div class="subpanel-label">Fluid Input</div>
          <div class="fluid" v-for="(fluid, idx) in fluidInputs" :key="`fin-${idx}`">
            <div class="fluid-icon-shell">
              <img :src="getFluidImage(fluid)" class="fluid-icon" @error="(e) => { (e.target as HTMLImageElement).src = '/placeholder.png'; }" />
            </div>
            <div class="fluid-meta">
              <div class="fluid-name">{{ fluid.localizedName }}</div>
              <div class="fluid-amount">{{ fluid.amount.toLocaleString() }} L</div>
            </div>
          </div>
        </div>
      </section>

      <div class="arrow-lane" aria-hidden="true">
        <div class="arrow">
          <svg viewBox="0 0 24 24" class="arrow-icon">
            <path d="M4 11h12.17l-5.59-5.59L12 4l8 8-8 8-1.41-1.41L16.17 13H4v-2z" />
          </svg>
        </div>
      </div>

      <section class="side side-output">
        <div class="panel-label">Output</div>
        <div class="slots" :style="{ gridTemplateColumns: `repeat(${outputDims.width}, var(--gtu-slot-size))` }">
          <template v-for="(slot, idx) in outputSlots" :key="`out-${idx}`">
            <RecipeItemTooltip v-if="slot" :item-id="slot.itemId" :count="slot.count" @click="onClickItem(slot.itemId)">
              <div class="slot item output">
                <AnimatedItemIcon
                  :item-id="slot.itemId"
                  :render-asset-ref="slot.renderAssetRef || null"
                  :image-file-name="slot.imageFileName || null"
                  :size="28"
                  class="icon"
                />
                <span v-if="slot.count > 1" class="count">{{ slot.count }}</span>
              </div>
            </RecipeItemTooltip>
            <div v-else class="slot empty"></div>
          </template>
        </div>

        <div class="fluid-list" v-if="fluidOutputs.length">
          <div class="subpanel-label subpanel-label-output">Fluid Output</div>
          <div class="fluid" v-for="(fluid, idx) in fluidOutputs" :key="`fout-${idx}`">
            <div class="fluid-icon-shell">
              <img :src="getFluidImage(fluid)" class="fluid-icon" @error="(e) => { (e.target as HTMLImageElement).src = '/placeholder.png'; }" />
            </div>
            <div class="fluid-meta">
              <div class="fluid-name">{{ fluid.localizedName }}</div>
              <div class="fluid-amount">{{ fluid.amount.toLocaleString() }} L</div>
            </div>
          </div>
        </div>
      </section>
    </div>

    <footer v-if="showMachineMetrics" class="meta-bar">
      <div class="meta-chip"><span>EU/t</span><strong>{{ euPerTick?.toLocaleString?.() ?? '--' }}</strong></div>
      <div class="meta-chip"><span>Voltage</span><strong>{{ voltage?.toLocaleString?.() ?? '--' }} V</strong></div>
      <div class="meta-chip"><span>Amperage</span><strong>{{ amperage?.toLocaleString?.() ?? '--' }} A</strong></div>
      <div class="meta-chip"><span>Duration</span><strong>{{ formatDuration(durationTicks) }}</strong></div>
      <div class="meta-chip"><span>Total EU</span><strong>{{ totalEU?.toLocaleString?.() ?? '--' }} EU</strong></div>
      <div class="meta-chip warn" v-if="needsCleanroom">Cleanroom Required</div>
      <div class="meta-chip warn" v-if="needsLowGravity">Low Gravity Required</div>
    </footer>
  </div>
</template>

<style scoped>
.gt-universal-ui {
  --gtu-slot-size: 44px;
  --gtu-icon-size: 28px;
  --gtu-fluid-icon-size: 30px;
  --gtu-accent-rgb: 148, 163, 184;
  --gtu-output-rgb: 245, 208, 138;
  width: min(980px, 100%);
  border-radius: 18px;
  border: 1px solid rgba(var(--gtu-accent-rgb), 0.22);
  background:
    linear-gradient(180deg, rgba(9, 13, 20, 0.95), rgba(6, 10, 16, 0.98)),
    radial-gradient(circle at top, rgba(34, 211, 238, 0.08), transparent 42%);
  padding: 0;
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
  border-bottom: 1px solid rgba(var(--gtu-accent-rgb), 0.18);
  position: relative;
}

.machine-header::before {
  content: '';
  position: absolute;
  bottom: 0;
  left: 18px;
  right: 18px;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(var(--gtu-accent-rgb), 0.3), transparent);
}

.machine-title-shell {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.machine-title {
  font-size: 12px;
  font-weight: 700;
  color: #f3f7fb;
  letter-spacing: 1.2px;
  text-transform: uppercase;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.machine-tier {
  font-size: 10px;
  padding: 4px 10px 3px 12px;
  border-radius: 999px;
  border: 1px solid rgba(var(--gtu-output-rgb), 0.32);
  color: #fff3da;
  background: rgba(54, 44, 31, 0.9);
  letter-spacing: 0.14em;
  text-transform: uppercase;
  line-height: 1;
}

.recipe-row {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: start;
  gap: 10px;
  padding: 18px 16px 14px;
  background:
    linear-gradient(180deg, rgba(11, 16, 24, 0.86), rgba(8, 12, 18, 0.92)),
    url('/textures/nei/recipebg.png');
  background-repeat: no-repeat, repeat;
  background-size: auto, 128px 128px;
  position: relative;
  z-index: 1;
}

.side {
  position: relative;
  border: 1px solid rgba(var(--gtu-accent-rgb), 0.2);
  border-radius: 12px;
  background:
    linear-gradient(180deg, rgba(18, 24, 32, 0.94), rgba(10, 14, 20, 0.98)),
    radial-gradient(circle at top, rgba(255, 255, 255, 0.05), transparent 48%),
    url('/textures/nei/recipebg.png');
  background-repeat: no-repeat, no-repeat, repeat;
  background-size: auto, auto, 96px 96px;
  padding: 18px 12px 12px;
  box-shadow:
    inset 0 0 0 1px rgba(255, 255, 255, 0.03),
    0 10px 24px rgba(2, 8, 23, 0.2);
}

.side::after {
  content: '';
  position: absolute;
  inset: 8px;
  border: 1px solid rgba(255, 255, 255, 0.04);
  border-radius: 8px;
  pointer-events: none;
}

.side-output {
  border-color: rgba(var(--gtu-output-rgb), 0.26);
  background:
    linear-gradient(180deg, rgba(32, 27, 20, 0.92), rgba(16, 13, 10, 0.98)),
    radial-gradient(circle at top, rgba(var(--gtu-output-rgb), 0.08), transparent 48%),
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

.side-output .panel-label {
  border-color: rgba(var(--gtu-output-rgb), 0.32);
  color: #fff3da;
}

.subpanel-label {
  color: #dbe8f6;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  margin-bottom: 6px;
}

.subpanel-label-output {
  color: #fff3da;
}

.slots {
  display: grid;
  gap: 4px;
  justify-content: center;
  align-content: center;
}

.slot {
  position: relative;
  width: var(--gtu-slot-size);
  height: var(--gtu-slot-size);
  border-radius: 10px;
  border: 1px solid rgba(var(--gtu-accent-rgb), 0.28);
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
}

.slot.item:hover {
  transform: translateY(-1px);
  border-color: rgba(103, 232, 249, 0.7);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.14),
    0 0 0 1px rgba(34, 211, 238, 0.18),
    0 10px 18px rgba(8, 145, 178, 0.2);
}

.slot.output {
  border-color: rgba(217, 182, 122, 0.3);
}

.side-output .slot.output:hover {
  border-color: rgba(var(--gtu-output-rgb), 0.78);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.14),
    0 0 0 1px rgba(var(--gtu-output-rgb), 0.12),
    0 10px 18px rgba(180, 83, 9, 0.18);
}

.slot.special {
  border-color: rgba(var(--gtu-output-rgb), 0.3);
}

.slot.special.circuit {
  border-color: rgba(163, 230, 53, 0.4);
}

.slot.empty {
  background:
    linear-gradient(180deg, rgba(8, 12, 18, 0.72), rgba(6, 10, 16, 0.8)),
    url('/textures/nei/slot.png');
  background-repeat: no-repeat;
  background-position: center;
  background-size: 100% 100%, 18px 18px;
  border-color: rgba(var(--gtu-accent-rgb), 0.12);
  opacity: 0.45;
}

.icon {
  width: var(--gtu-icon-size);
  height: var(--gtu-icon-size);
  object-fit: contain;
  image-rendering: pixelated;
  filter: drop-shadow(0 1px 2px rgba(15, 23, 42, 0.6));
}

.count {
  position: absolute;
  right: 2px;
  bottom: 2px;
  background: rgba(15, 23, 42, 0.82);
  border: 1px solid rgba(var(--gtu-accent-rgb), 0.24);
  border-radius: 4px;
  padding: 1px 3px;
  font-size: 10px;
  line-height: 1;
  color: #f8fafc;
  font-weight: 700;
  text-shadow: 0 1px 1px rgba(15, 23, 42, 0.92);
  pointer-events: none;
  z-index: 2;
}

.special-panel {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid rgba(var(--gtu-accent-rgb), 0.14);
}

.special-slots {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.fluid-list {
  display: grid;
  gap: 6px;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid rgba(var(--gtu-accent-rgb), 0.14);
}

.fluid {
  display: flex;
  align-items: center;
  gap: 6px;
  border: 1px solid rgba(var(--gtu-accent-rgb), 0.18);
  border-radius: 10px;
  padding: 6px;
  background:
    linear-gradient(180deg, rgba(17, 22, 29, 0.92), rgba(10, 13, 18, 0.98)),
    url('/textures/nei/slot.png');
  background-repeat: no-repeat;
  background-position: center;
  background-size: auto, 16px 16px;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.04),
    0 6px 14px rgba(2, 8, 23, 0.18);
}

.side-output .fluid {
  border-color: rgba(var(--gtu-output-rgb), 0.2);
}

.fluid-icon-shell {
  width: var(--gtu-slot-size);
  height: var(--gtu-slot-size);
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
  border: 1px solid rgba(var(--gtu-accent-rgb), 0.2);
}

.side-output .fluid-icon-shell {
  border-color: rgba(var(--gtu-output-rgb), 0.2);
}

.fluid-icon {
  width: var(--gtu-fluid-icon-size);
  height: var(--gtu-fluid-icon-size);
  object-fit: contain;
  image-rendering: pixelated;
}

.fluid-meta {
  min-width: 0;
}

.fluid-name {
  font-size: 11px;
  color: #dbe8f6;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
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

.meta-bar {
  padding: 0 16px 14px;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  background: linear-gradient(180deg, rgba(10, 14, 20, 0.88), rgba(7, 10, 15, 0.96));
  border-top: 1px solid rgba(var(--gtu-accent-rgb), 0.16);
}

.meta-chip {
  border: 1px solid rgba(var(--gtu-accent-rgb), 0.24);
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
  font-weight: 700;
}

.meta-chip.warn {
  border-color: rgba(var(--gtu-output-rgb), 0.32);
  color: #fff3da;
}

@media (min-width: 1920px) {
  .gt-universal-ui {
    width: min(1120px, 94vw);
  }
}

@media (min-width: 2560px) {
  .gt-universal-ui {
    width: min(1380px, 92vw);
  }
}

@media (min-width: 3200px) {
  .gt-universal-ui {
    width: min(1660px, 90vw);
  }
}

@media (max-width: 768px) {
  .gt-universal-ui {
    width: 100%;
  }

  .recipe-row {
    grid-template-columns: 1fr;
    padding: 16px 12px 12px;
  }

  .arrow-lane {
    min-width: 100%;
    min-height: 18px;
  }

  .arrow {
    transform: rotate(90deg);
  }

  .meta-bar {
    padding: 0 12px 12px;
  }
}
</style>
