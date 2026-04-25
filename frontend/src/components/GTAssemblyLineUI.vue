<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { api, getFluidImageUrlFromFluid, type Recipe } from '../services/api';
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

interface SlotVariant {
  itemId: string;
  count: number;
  renderAssetRef?: string | null;
  imageFileName?: string | null;
}

interface SlotItem {
  items: SlotVariant[];
  primaryIndex: number;
}

interface FluidEntry {
  fluidId: string;
  localizedName: string;
  amount: number;
  temperature?: number;
  renderAssetRef?: string | null;
}

interface SpecialItem {
  itemId: string;
  count: number;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();
const { playClick } = useSound();

const recipeData = computed(() => props.recipe);

const craftingSlots = ref<Array<SlotItem | null>>([]);
const fluidInputsData = ref<FluidEntry[]>([]);
const cycleInterval = ref<number | null>(null);

const machineLabel = computed(() => {
  const machineType = recipeData.value.machineInfo?.machineType;
  if (machineType && machineType.trim()) return machineType.trim();
  return recipeData.value.recipeType || '装配线';
});

const voltageTier = computed(() => {
  return recipeData.value.metadata?.voltageTier || recipeData.value.machineInfo?.parsedVoltageTier || '--';
});

const voltage = computed(() => {
  return recipeData.value.metadata?.voltage || recipeData.value.machineInfo?.parsedVoltage || 0;
});

const amperage = computed(() => {
  return recipeData.value.metadata?.amperage || 1;
});

const duration = computed(() => {
  return recipeData.value.metadata?.duration || 0;
});

const totalEU = computed(() => {
  if (recipeData.value.metadata?.totalEU) {
    return recipeData.value.metadata.totalEU;
  }
  if (voltage.value && amperage.value && duration.value) {
    return voltage.value * amperage.value * (duration.value / 20);
  }
  return 0;
});

const outputItem = computed(() => recipeData.value.outputs?.[0] || null);

const mergedMeta = computed<Record<string, unknown>>(() => {
  const a = recipeData.value.additionalData && typeof recipeData.value.additionalData === 'object'
    ? recipeData.value.additionalData as Record<string, unknown>
    : {};
  const b = recipeData.value.metadata && typeof recipeData.value.metadata === 'object'
    ? recipeData.value.metadata as Record<string, unknown>
    : {};
  return { ...a, ...b };
});

const specialItems = computed<SpecialItem[]>(() => {
  const src = mergedMeta.value.specialItems;
  if (!Array.isArray(src)) return [];
  return src.flatMap((node) => {
    if (!node || typeof node !== 'object') return [];
    const obj = node as { itemId?: unknown; count?: unknown; stackSize?: unknown };
    if (typeof obj.itemId !== 'string' || obj.itemId.length === 0) return [];
    const rawCount = typeof obj.count === 'number'
      ? obj.count
      : (typeof obj.stackSize === 'number' ? obj.stackSize : 1);
    return [{ itemId: obj.itemId, count: Math.max(1, Math.floor(rawCount)) }];
  });
});

const getFluidImagePath = (fluid: { fluidId?: string | null; renderAssetRef?: string | null }) => {
  const resolved = getFluidImageUrlFromFluid(fluid);
  if (resolved) return resolved;
  return `data:image/svg+xml;base64,${btoa(
    '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><rect width="32" height="32" fill="#2dd4bf" rx="6"/><path d="M16 5c4 5 6 8 6 12a6 6 0 1 1-12 0c0-4 2-7 6-12z" fill="#e6fffb"/></svg>',
  )}`;
};

const handleItemClick = (itemId: string) => {
  playClick();
  emit('item-click', itemId);
};

const formatAmount = (amount: number): string => {
  if (amount >= 1_000_000_000) return `${(amount / 1_000_000_000).toFixed(1)}B`;
  if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1_000) return `${(amount / 1_000).toFixed(1)}k`;
  return amount.toString();
};

const formatDuration = (ticks: number): string => {
  const seconds = Math.floor(ticks / 20);
  if (seconds >= 3600) {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${mins}m`;
  }
  if (seconds >= 60) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  }
  return `${seconds}s`;
};

const cycleAlternatives = () => {
  craftingSlots.value = craftingSlots.value.map((slot) => {
    if (!slot || slot.items.length <= 1) return slot;
    return {
      ...slot,
      primaryIndex: (slot.primaryIndex + 1) % slot.items.length,
    };
  });
};

const initGrid = async () => {
  const flatInputs = recipeData.value.inputs.flatMap((row) => row);
  const itemIds = new Set<string>();

  for (const cell of flatInputs) {
    if (!cell) continue;
    const variants = Array.isArray(cell) ? cell : [cell];
    for (const variant of variants) {
      if (variant?.itemId) {
        itemIds.add(variant.itemId);
      }
    }
  }

  if (itemIds.size > 0) {
    const items = await api.getItemsByIds(Array.from(itemIds));
    const itemById = new Map(items.map((item) => [item.itemId, item]));

    const nextSlots: Array<SlotItem | null> = [];
    for (let slotIndex = 0; slotIndex < 16; slotIndex++) {
      const cell = flatInputs[slotIndex];
      if (!cell) {
        nextSlots.push(null);
        continue;
      }

      const variants = (Array.isArray(cell) ? cell : [cell])
        .filter((variant): variant is { itemId: string; count?: number; renderAssetRef?: string | null; imageFileName?: string | null } => Boolean(variant?.itemId))
        .map((variant) => ({
          itemId: variant.itemId,
          count: typeof variant.count === 'number' && variant.count > 0 ? variant.count : 1,
          renderAssetRef: itemById.get(variant.itemId)?.renderAssetRef ?? variant.renderAssetRef ?? null,
          imageFileName: itemById.get(variant.itemId)?.imageFileName ?? variant.imageFileName ?? null,
        }));

      nextSlots.push(variants.length > 0 ? { items: variants, primaryIndex: 0 } : null);
    }

    craftingSlots.value = nextSlots;
    return;
  }

  const nextSlots: Array<SlotItem | null> = [];
  for (let slotIndex = 0; slotIndex < 16; slotIndex++) {
    const cell = flatInputs[slotIndex];
    if (!cell) {
      nextSlots.push(null);
      continue;
    }

    const variants = (Array.isArray(cell) ? cell : [cell])
      .filter((variant): variant is { itemId: string; count?: number; renderAssetRef?: string | null; imageFileName?: string | null } => Boolean(variant?.itemId))
      .map((variant) => ({
        itemId: variant.itemId,
        count: typeof variant.count === 'number' && variant.count > 0 ? variant.count : 1,
        renderAssetRef: variant.renderAssetRef ?? null,
        imageFileName: variant.imageFileName ?? null,
      }));

    nextSlots.push(variants.length > 0 ? { items: variants, primaryIndex: 0 } : null);
  }

  craftingSlots.value = nextSlots;
};

const initFluidSlots = async () => {
  const fluids: FluidEntry[] = [];
  for (const fluidInput of recipeData.value.fluidInputs || []) {
    if (!fluidInput?.fluids?.length) continue;
    const fluid = fluidInput.fluids[0];
    fluids.push({
      fluidId: fluid.fluid.fluidId,
      localizedName: fluid.fluid.localizedName,
      amount: fluid.amount,
      temperature: fluid.fluid.temperature,
      renderAssetRef: fluid.fluid.renderAssetRef ?? null,
    });
  }
  fluidInputsData.value = fluids.slice(0, 4);
};

onMounted(async () => {
  await initGrid();
  await initFluidSlots();
  cycleInterval.value = window.setInterval(cycleAlternatives, 1500);
});

onUnmounted(() => {
  if (cycleInterval.value !== null) {
    clearInterval(cycleInterval.value);
  }
});

watch(() => props.recipe, async () => {
  await initGrid();
  await initFluidSlots();
}, { deep: true });
</script>

<template>
  <div class="gt-assembly-line-ui">
    <header class="al-topbar">
      <div class="al-brand">
        <span class="al-overline">GT 装配线平台</span>
        <h2 class="al-title">{{ machineLabel }}</h2>
      </div>
      <div class="al-nav">
        <div class="al-search-pill">
          <span class="al-search-icon">⌕</span>
        </div>
        <div class="al-tier-card">
          <span class="al-tier-label">电压</span>
          <span class="al-tier-value">{{ voltageTier }}</span>
        </div>
      </div>
    </header>

    <div class="al-stage">
      <section class="input-matrix">
        <div class="section-label">输入总线</div>
        <div class="input-grid">
          <template v-for="slotIndex in 16" :key="`input-${slotIndex - 1}`">
            <div
              v-if="craftingSlots[slotIndex - 1]"
              class="slot-shell input-slot"
              :class="{ 'has-alternatives': craftingSlots[slotIndex - 1]!.items.length > 1 }"
            >
              <RecipeItemTooltip
                :item-id="craftingSlots[slotIndex - 1]!.items[craftingSlots[slotIndex - 1]!.primaryIndex].itemId"
                :count="craftingSlots[slotIndex - 1]!.items[craftingSlots[slotIndex - 1]!.primaryIndex].count"
                @click="handleItemClick(craftingSlots[slotIndex - 1]!.items[craftingSlots[slotIndex - 1]!.primaryIndex].itemId)"
              >
                <div class="slot-inner">
                  <AnimatedItemIcon
                    :item-id="craftingSlots[slotIndex - 1]!.items[craftingSlots[slotIndex - 1]!.primaryIndex].itemId"
                    :render-asset-ref="craftingSlots[slotIndex - 1]!.items[craftingSlots[slotIndex - 1]!.primaryIndex].renderAssetRef || null"
                    :image-file-name="craftingSlots[slotIndex - 1]!.items[craftingSlots[slotIndex - 1]!.primaryIndex].imageFileName || null"
                    :size="44"
                    class="item-icon"
                  />
                  <span
                    v-if="craftingSlots[slotIndex - 1]!.items[craftingSlots[slotIndex - 1]!.primaryIndex].count > 1"
                    class="item-count"
                  >
                    {{ craftingSlots[slotIndex - 1]!.items[craftingSlots[slotIndex - 1]!.primaryIndex].count }}
                  </span>
                </div>
              </RecipeItemTooltip>
            </div>
            <div v-else class="slot-shell input-slot input-slot-empty" />
          </template>
        </div>
      </section>

      <section class="transfer-core">
        <div class="section-label section-label-center">装配导轨</div>
        <div class="transfer-canvas">
          <div class="rift-spindle">
            <div class="rift-backplane" />
            <div class="rift-rail rift-rail-left" />
            <div class="rift-rail rift-rail-right" />
            <div class="rift-shard rift-shard-left-a" />
            <div class="rift-shard rift-shard-left-b" />
            <div class="rift-shard rift-shard-right-a" />
            <div class="rift-shard rift-shard-right-b" />
            <div class="rift-aura" />
            <div class="rift-core">
              <div class="rift-haze" />
              <div class="rift-core-inner" />
              <div class="rift-edge rift-edge-left" />
              <div class="rift-edge rift-edge-right" />
              <div class="rift-arc rift-arc-a" />
              <div class="rift-arc rift-arc-b" />
              <div class="rift-particle rift-particle-a" />
              <div class="rift-particle rift-particle-b" />
              <div class="rift-particle rift-particle-c" />
            </div>
          </div>
        </div>
      </section>

      <section class="fluid-column">
        <div class="section-label section-label-center">流体输入</div>
        <div class="tank-column">
          <template v-for="tankIndex in 4" :key="`tank-${tankIndex - 1}`">
            <div class="tank-shell">
              <RecipeItemTooltip
                v-if="fluidInputsData[tankIndex - 1]"
                :item-id="fluidInputsData[tankIndex - 1].fluidId"
                :count="1"
                @click="handleItemClick(fluidInputsData[tankIndex - 1].fluidId)"
              >
                <div class="tank-fill-shell">
                  <img
                    :src="getFluidImagePath(fluidInputsData[tankIndex - 1])"
                    class="fluid-icon"
                    @error="(e) => { (e.target as HTMLImageElement).style.display = 'none'; }"
                  />
                  <div class="fluid-glow" />
                  <div class="tank-amount">{{ formatAmount(fluidInputsData[tankIndex - 1].amount) }}</div>
                </div>
              </RecipeItemTooltip>
              <div v-else class="tank-empty">
                <span>-</span>
              </div>
            </div>
          </template>
        </div>
      </section>

      <section class="output-chamber">
        <div class="section-label section-label-center">输出槽</div>
        <div class="output-shell">
          <RecipeItemTooltip
            v-if="outputItem"
            :item-id="outputItem.itemId"
            :count="outputItem.count"
            @click="handleItemClick(outputItem.itemId)"
          >
            <div class="output-slot-main">
              <AnimatedItemIcon
                :item-id="outputItem.itemId"
                :render-asset-ref="outputItem.renderAssetRef || null"
                :size="72"
                class="output-icon"
              />
              <span v-if="outputItem.count > 1" class="item-count">{{ outputItem.count }}</span>
            </div>
          </RecipeItemTooltip>
        </div>
        <div v-if="specialItems.length" class="special-bus special-bus-output">
          <div class="section-subtitle section-subtitle-output">特殊物品</div>
          <div class="special-row special-row-output">
            <RecipeItemTooltip
              v-for="(item, index) in specialItems"
              :key="`special-${index}-${item.itemId}`"
              :item-id="item.itemId"
              :count="item.count"
              @click="handleItemClick(item.itemId)"
            >
              <div class="slot-shell special-slot special-slot-output">
                <div class="slot-inner">
                  <AnimatedItemIcon
                    :item-id="item.itemId"
                    :size="44"
                    class="item-icon"
                  />
                  <span v-if="item.count > 1" class="item-count">{{ item.count }}</span>
                </div>
              </div>
            </RecipeItemTooltip>
          </div>
        </div>
      </section>
    </div>

    <footer class="bottom-bar">
      <div class="metric-card">
        <span class="metric-label">总耗能</span>
        <strong class="metric-value">{{ totalEU.toLocaleString() }}</strong>
        <span class="metric-unit">EU</span>
      </div>
      <div class="metric-card">
        <span class="metric-label">功率</span>
        <strong class="metric-value">{{ (voltage * amperage).toLocaleString() }}</strong>
        <span class="metric-unit">EU/t · {{ voltage.toLocaleString() }}V × {{ amperage }}A</span>
      </div>
      <div class="metric-card">
        <span class="metric-label">时长</span>
        <strong class="metric-value">{{ formatDuration(duration) }}</strong>
        <span class="metric-unit">{{ duration }} ticks</span>
      </div>
    </footer>
  </div>
</template>

<style scoped>
.gt-assembly-line-ui {
  --al-slot-size: 62px;
  --al-gap: 12px;
  --al-radius: 18px;
  --al-input-cyan: #39d6ff;
  --al-cyan-soft: rgba(57, 214, 255, 0.18);
  --al-amber: #ffb347;
  --al-amber-soft: rgba(255, 179, 71, 0.18);
  position: relative;
  overflow: hidden;
  padding: 22px;
  border-radius: 24px;
  border: 1px solid rgba(112, 136, 166, 0.16);
  background:
    radial-gradient(circle at 16% 0%, rgba(57, 214, 255, 0.12), transparent 30%),
    radial-gradient(circle at 86% 90%, rgba(255, 179, 71, 0.12), transparent 28%),
    linear-gradient(180deg, rgba(11, 15, 22, 0.98), rgba(7, 10, 15, 0.99));
  box-shadow:
    0 24px 56px rgba(0, 0, 0, 0.34),
    inset 0 1px 0 rgba(255, 255, 255, 0.035),
    inset 0 0 0 1px rgba(255, 255, 255, 0.02);
  color: #eef7ff;
}

.gt-assembly-line-ui::before {
  content: '';
  position: absolute;
  inset: 0;
  background:
    linear-gradient(90deg, transparent 0%, rgba(57, 214, 255, 0.02) 38%, rgba(255, 179, 71, 0.02) 72%, transparent 100%);
  pointer-events: none;
}

.al-topbar,
.al-stage,
.bottom-bar {
  position: relative;
  z-index: 1;
}

.al-topbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 18px;
  margin-bottom: 18px;
}

.al-brand {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.al-overline {
  font-size: 10px;
  color: #7fe4ff;
  letter-spacing: 0.24em;
  text-transform: uppercase;
}

.al-title {
  margin: 0;
  font-size: 24px;
  line-height: 1.08;
  font-weight: 700;
  letter-spacing: 0.04em;
}

.al-nav {
  display: flex;
  align-items: center;
  gap: 10px;
}

.al-search-pill {
  width: 42px;
  height: 42px;
  border-radius: 14px;
  border: 1px solid rgba(131, 226, 255, 0.14);
  background: rgba(255, 255, 255, 0.03);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: inset 0 0 0 1px rgba(255,255,255,0.02);
}

.al-search-icon {
  font-size: 18px;
  color: #b7efff;
}

.al-tier-card {
  min-width: 124px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 14px;
  border-radius: 16px;
  border: 1px solid rgba(255, 179, 71, 0.16);
  background: linear-gradient(180deg, rgba(30, 23, 15, 0.9), rgba(17, 13, 9, 0.94));
  box-shadow: inset 0 0 0 1px rgba(255,255,255,0.02);
}

.al-tier-label {
  font-size: 9px;
  color: #d6b27b;
  letter-spacing: 0.18em;
  text-transform: uppercase;
}

.al-tier-value {
  font-size: 16px;
  font-weight: 700;
  color: #fff2da;
  letter-spacing: 0.04em;
}

.al-stage {
  display: grid;
  grid-template-columns: 1fr 1.1fr 132px 180px;
  gap: 16px;
  align-items: stretch;
}

.input-matrix,
.transfer-core,
.fluid-column,
.output-chamber {
  min-height: 420px;
  border-radius: 20px;
  border: 1px solid rgba(115, 139, 170, 0.14);
  background: linear-gradient(180deg, rgba(12, 18, 27, 0.92), rgba(8, 12, 18, 0.96));
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.03),
    inset 0 0 0 1px rgba(255, 255, 255, 0.015);
}

.input-matrix,
.fluid-column,
.output-chamber {
  padding: 16px;
}

.transfer-core {
  padding: 16px 18px;
  position: relative;
  overflow: hidden;
}

.section-label,
.section-subtitle {
  display: block;
  font-size: 10px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: #d4e8f8;
}

.section-label {
  margin-bottom: 14px;
}

.section-label-center {
  text-align: center;
}

.section-subtitle {
  margin-bottom: 10px;
  color: #ffedc8;
}

.input-grid {
  display: grid;
  grid-template-columns: repeat(4, var(--al-slot-size));
  gap: var(--al-gap);
}

.slot-shell,
.output-slot-main,
.tank-shell {
  border-radius: 16px;
  background:
    linear-gradient(180deg, rgba(16, 23, 33, 0.88), rgba(9, 13, 20, 0.94));
  border: 1px solid rgba(122, 145, 177, 0.18);
  box-shadow:
    inset 3px 3px 10px rgba(255, 255, 255, 0.03),
    inset -4px -4px 12px rgba(0, 0, 0, 0.3),
    0 10px 20px rgba(0, 0, 0, 0.18);
}

.gt-assembly-line-ui :deep(.recipe-item-tooltip-container) {
  display: flex;
  width: 100%;
  height: 100%;
}

.slot-shell {
  width: var(--al-slot-size);
  height: var(--al-slot-size);
  transition: border-color 180ms ease, box-shadow 180ms ease, transform 180ms ease;
}

.slot-shell:hover {
  transform: translateY(-1px);
  border-color: rgba(57, 214, 255, 0.52);
  box-shadow:
    inset 3px 3px 10px rgba(255,255,255,0.04),
    inset -4px -4px 12px rgba(0,0,0,0.34),
    0 0 0 1px rgba(57, 214, 255, 0.16),
    0 12px 24px rgba(0, 0, 0, 0.22),
    0 0 18px rgba(57, 214, 255, 0.16);
}

.input-slot-empty {
  opacity: 0.3;
}

.slot-inner {
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.slot-item-tooltip {
  display: flex;
  width: 100%;
  height: 100%;
}

.item-icon {
  width: calc(var(--al-slot-size) * 0.72);
  height: calc(var(--al-slot-size) * 0.72);
  image-rendering: pixelated;
  object-fit: contain;
  object-position: center 56%;
  display: block;
  transform: translateY(2px) scale(1.04);
  transform-origin: center center;
}

.item-count {
  position: absolute;
  right: 4px;
  bottom: 3px;
  font-size: 10px;
  font-weight: 700;
  color: #f4fbff;
  text-shadow: 0 1px 2px rgba(0,0,0,0.86);
}

.special-bus {
  margin-top: 18px;
}

.special-bus-output {
  width: 100%;
  padding-top: 14px;
  border-top: 1px solid rgba(122, 145, 177, 0.12);
}

.special-row {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.special-row-output {
  justify-content: center;
}

.special-slot {
  width: 54px;
  height: 54px;
}

.special-slot-output {
  width: var(--al-slot-size);
  height: var(--al-slot-size);
}

.transfer-canvas {
  position: relative;
  height: calc(100% - 30px);
  min-height: 340px;
  border-radius: 18px;
  background:
    radial-gradient(circle at 50% 50%, rgba(57, 214, 255, 0.05), transparent 36%),
    linear-gradient(180deg, rgba(10, 15, 23, 0.9), rgba(7, 11, 17, 0.97));
  overflow: hidden;
}

.rift-spindle {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.rift-backplane {
  position: absolute;
  background:
    linear-gradient(180deg, rgba(255,255,255,0.008), rgba(255,255,255,0.002)),
    radial-gradient(circle at center, rgba(57, 214, 255, 0.035), transparent 54%),
    linear-gradient(90deg, rgba(57,214,255,0.012), transparent 28%, transparent 72%, rgba(255,179,71,0.008));
  inset: 18% 22%;
  border-radius: 28px;
  border: 1px solid rgba(122, 148, 177, 0.08);
  box-shadow:
    inset 0 0 0 1px rgba(255,255,255,0.01),
    inset 0 18px 34px rgba(255,255,255,0.01),
    inset 0 -22px 38px rgba(0,0,0,0.16);
}

.rift-spindle::before,
.rift-spindle::after {
  content: '';
  position: absolute;
  top: 18%;
  bottom: 18%;
  width: 1px;
  background: linear-gradient(180deg, transparent, rgba(88, 118, 156, 0.18), transparent);
  opacity: 0.45;
}

.rift-spindle::before {
  left: 24%;
}

.rift-spindle::after {
  right: 24%;
}

.rift-rail {
  position: absolute;
  top: 50%;
  height: 1px;
  margin-top: -0.5px;
  border-radius: 999px;
}

.rift-rail-left {
  left: 10%;
  right: 50%;
  background: linear-gradient(90deg, transparent, rgba(57, 214, 255, 0.2));
}

.rift-rail-right {
  left: 50%;
  right: 10%;
  background: linear-gradient(90deg, rgba(255, 179, 71, 0.12), transparent);
}

.rift-shard {
  position: absolute;
  top: 50%;
  width: 14px;
  border-radius: 12px;
  border: 1px solid rgba(121, 185, 236, 0.14);
  background:
    linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0.01)),
    linear-gradient(135deg, rgba(57,214,255,0.06), transparent 74%),
    linear-gradient(315deg, rgba(255,255,255,0.02), transparent 80%);
  box-shadow:
    inset 0 0 0 1px rgba(255,255,255,0.01),
    0 0 18px rgba(57, 214, 255, 0.04),
    0 0 12px rgba(0,0,0,0.18);
  transform-origin: center center;
}

.rift-shard-left-a,
.rift-shard-right-a {
  height: 124px;
  margin-top: -62px;
}

.rift-shard-left-b,
.rift-shard-right-b {
  width: 10px;
  height: 92px;
  margin-top: -46px;
  opacity: 0.7;
}

.rift-shard-left-a {
  left: calc(50% - 68px);
  transform: rotate(-7deg);
}

.rift-shard-left-b {
  left: calc(50% - 94px);
  transform: rotate(-12deg);
}

.rift-shard-right-a {
  right: calc(50% - 68px);
  transform: rotate(7deg);
}

.rift-shard-right-b {
  right: calc(50% - 94px);
  transform: rotate(12deg);
}

.rift-aura {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 160px;
  height: 226px;
  margin-left: -80px;
  margin-top: -113px;
  border-radius: 999px;
  background: radial-gradient(circle, rgba(57, 214, 255, 0.16), rgba(255, 179, 71, 0.04) 58%, transparent 78%);
  filter: blur(16px);
  opacity: 0.72;
}

.rift-core {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 28px;
  height: 214px;
  margin-left: -14px;
  margin-top: -107px;
  border-radius: 999px;
  background:
    linear-gradient(180deg, rgba(2, 8, 16, 0.98), rgba(4, 10, 18, 0.9) 50%, rgba(2, 8, 16, 0.98));
  border: 1px solid rgba(118, 188, 240, 0.16);
  box-shadow:
    inset 0 0 0 1px rgba(255,255,255,0.02),
    0 0 28px rgba(57, 214, 255, 0.08),
    0 0 18px rgba(255, 179, 71, 0.04);
  overflow: hidden;
}

.rift-haze {
  position: absolute;
  inset: 6px;
  border-radius: 999px;
  background:
    radial-gradient(circle at 50% 30%, rgba(215,247,255,0.05), transparent 46%),
    radial-gradient(circle at 50% 72%, rgba(255,179,71,0.04), transparent 40%);
  filter: blur(4px);
  opacity: 0.72;
}

.rift-core-inner {
  position: absolute;
  inset: 12px 7px;
  border-radius: 999px;
  background:
    linear-gradient(180deg, rgba(215,247,255,0.04), rgba(57,214,255,0.22) 24%, rgba(10,18,28,0.12) 54%, rgba(255,179,71,0.09) 74%, rgba(10,18,28,0.04));
}

.rift-edge {
  position: absolute;
  top: 10px;
  bottom: 10px;
  width: 1px;
  background: linear-gradient(180deg, transparent, rgba(209, 241, 255, 0.72), rgba(255, 203, 126, 0.26), transparent);
}

.rift-edge-left {
  left: 5px;
}

.rift-edge-right {
  right: 5px;
}

.rift-arc {
  position: absolute;
  left: 50%;
  width: 2px;
  border-radius: 999px;
  background: linear-gradient(180deg, rgba(215,247,255,0), rgba(215,247,255,0.92), rgba(57,214,255,0));
  filter: blur(0.15px);
  box-shadow: 0 0 10px rgba(57, 214, 255, 0.24);
}

.rift-arc-a {
  top: 58px;
  height: 34px;
  margin-left: -3px;
  transform: rotate(-8deg);
  opacity: 0.58;
}

.rift-arc-b {
  top: 116px;
  height: 28px;
  margin-left: 2px;
  transform: rotate(7deg);
  opacity: 0.42;
}

.rift-particle {
  position: absolute;
  left: 50%;
  width: 3px;
  margin-left: -1.5px;
  border-radius: 999px;
  background: linear-gradient(180deg, rgba(215,247,255,0), rgba(215,247,255,0.9), rgba(57,214,255,0));
  box-shadow:
    0 0 8px rgba(57, 214, 255, 0.34);
}

.rift-particle-a {
  top: 26px;
  height: 16px;
  animation: riftDriftA 4.8s ease-in-out infinite;
}

.rift-particle-b {
  top: 96px;
  height: 10px;
  background: linear-gradient(180deg, rgba(255,229,191,0), rgba(255,229,191,0.82), rgba(255,179,71,0));
  box-shadow: 0 0 7px rgba(255, 179, 71, 0.24);
  animation: riftDriftB 5.6s ease-in-out infinite;
}

.rift-particle-c {
  top: 160px;
  height: 12px;
  animation: riftDriftC 5.1s ease-in-out infinite;
}

@keyframes riftDriftA {
  0%, 100% { transform: translateX(0) translateY(0); opacity: 0.2; }
  40% { transform: translateX(-2px) translateY(18px); opacity: 0.86; }
  70% { transform: translateX(2px) translateY(34px); opacity: 0.24; }
}

@keyframes riftDriftB {
  0%, 100% { transform: translateX(0) translateY(0); opacity: 0.1; }
  35% { transform: translateX(2px) translateY(-16px); opacity: 0.72; }
  80% { transform: translateX(-2px) translateY(10px); opacity: 0.18; }
}

@keyframes riftDriftC {
  0%, 100% { transform: translateX(0) translateY(0); opacity: 0.18; }
  45% { transform: translateX(1px) translateY(-20px); opacity: 0.88; }
  72% { transform: translateX(-1px) translateY(-34px); opacity: 0.18; }
}

.fluid-column {
  display: flex;
  flex-direction: column;
}

.tank-column {
  display: grid;
  grid-template-rows: repeat(4, 1fr);
  gap: 12px;
  flex: 1;
}

.tank-shell {
  min-height: var(--al-slot-size);
  padding: 6px;
}

.tank-fill-shell,
.tank-empty {
  position: relative;
  height: 100%;
  width: 100%;
  border-radius: 12px;
  background:
    linear-gradient(180deg, rgba(255,255,255,0.12), rgba(255,255,255,0.03)),
    rgba(12, 20, 30, 0.62);
  border: 1px solid rgba(133, 219, 255, 0.16);
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}

.tank-empty {
  color: rgba(205, 220, 236, 0.4);
}

.fluid-icon {
  width: 62%;
  height: 62%;
  object-fit: contain;
  image-rendering: pixelated;
  position: relative;
  z-index: 2;
}

.fluid-glow {
  position: absolute;
  inset: 10%;
  border-radius: 10px;
  background: radial-gradient(circle, rgba(57, 214, 255, 0.24), rgba(255, 179, 71, 0.08) 70%, transparent 100%);
}

.tank-amount {
  position: absolute;
  right: 6px;
  bottom: 5px;
  font-size: 10px;
  font-weight: 700;
  color: #f3fbff;
  text-shadow: 0 1px 2px rgba(0,0,0,0.8);
  z-index: 3;
}

.output-chamber {
  display: flex;
  flex-direction: column;
}

.output-shell {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.section-subtitle-output {
  text-align: center;
}

.output-slot-main {
  width: 126px;
  height: 126px;
  border-radius: 22px;
  border: 1px solid rgba(255, 179, 71, 0.28);
  background:
    linear-gradient(180deg, rgba(38, 28, 18, 0.9), rgba(17, 12, 8, 0.96));
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  box-shadow:
    inset 0 0 0 1px rgba(255, 237, 197, 0.08),
    0 0 0 1px rgba(255, 179, 71, 0.08),
    0 12px 28px rgba(0,0,0,0.22),
    0 0 22px rgba(255, 179, 71, 0.1);
}

.output-icon {
  width: 72px;
  height: 72px;
  object-fit: contain;
  image-rendering: pixelated;
  object-position: center 56%;
  transform: translateY(2px) scale(1.04);
  transform-origin: center center;
}

.bottom-bar {
  margin-top: 18px;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.metric-card {
  padding: 14px 16px;
  border-radius: 16px;
  border: 1px solid rgba(114, 139, 170, 0.14);
  background: rgba(12, 18, 27, 0.84);
  box-shadow: inset 0 0 0 1px rgba(255,255,255,0.02);
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.metric-label {
  font-size: 10px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: #98b5d1;
}

.metric-value {
  font-size: 18px;
  line-height: 1.15;
  font-weight: 700;
  color: #f0f8ff;
  font-family: 'Consolas', 'Courier New', monospace;
}

.metric-unit {
  font-size: 10px;
  color: #7fa1c2;
  font-family: 'Consolas', 'Courier New', monospace;
}

@media (max-width: 1100px) {
  .al-stage {
    grid-template-columns: 1fr;
  }

  .input-matrix,
  .transfer-core,
  .fluid-column,
  .output-chamber {
    min-height: auto;
  }

  .tank-column {
    grid-template-columns: repeat(4, 1fr);
    grid-template-rows: none;
  }

  .output-shell {
    justify-content: flex-start;
  }

  .bottom-bar {
    grid-template-columns: 1fr;
  }
}
</style>
