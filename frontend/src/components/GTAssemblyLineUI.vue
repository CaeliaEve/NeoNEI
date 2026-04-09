<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, shallowRef, triggerRef, watch } from 'vue';
import { api, getFluidImageUrlFromFluid, getImageUrl, type Recipe } from '../services/api';
import type { UITypeConfig } from '../services/uiTypeMapping';
import { useSound } from '../services/sound.service';
import RecipeItemTooltip from './RecipeItemTooltip.vue';

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
  localizedName: string;
}

interface SlotItem {
  items: SlotVariant[];
  primaryIndex: number;
}

interface SpecialItem {
  itemId: string;
  count: number;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();
const { playClick } = useSound();

const recipeData = computed(() => props.recipe);
const machineLabel = computed(() => {
  const machineType = recipeData.value.machineInfo?.machineType;
  if (machineType && machineType.trim()) return machineType.trim();
  return recipeData.value.recipeType || 'Assembly Line';
});

const getImagePath = getImageUrl;

// Resolve fluid texture path for rendering.
const getFluidImagePath = (fluid: { fluidId?: string | null; renderAssetRef?: string | null }) => {
  const resolved = getFluidImageUrlFromFluid(fluid);
  if (resolved) return resolved;
  return `data:image/svg+xml;base64,${btoa('<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><rect width="32" height="32" fill=\"#0066cc\" rx=\"4\"/><text x=\"16\" y=\"22\" text-anchor=\"middle\" font-size=\"20\" fill=\"white\">流</text></svg>')}`;
};

const gridDims = computed(() => {
  if (recipeData.value.recipeTypeData?.itemInputDimension) {
    const dim = recipeData.value.recipeTypeData.itemInputDimension;
    // Assembly line input bus must stay 4x4 unless it is the component variant.
    if (dim.width >= 4 && dim.height >= 4) {
      return dim;
    }
  }
  return { width: 4, height: 4 };
});

const totalSlots = computed(() => {
  return gridDims.value.width * gridDims.value.height;
});

const craftingGrid = shallowRef<Array<SlotItem | null>>([]);

const initGrid = async () => {
  // Build item input grid.
  const gridSize = totalSlots.value;
  const newGrid: Array<SlotItem | null> = [];
  for (let i = 0; i < gridSize; i++) {
    newGrid.push(null);
  }
  const gridWidth = gridDims.value.width;

  const itemIds = new Set<string>();
  for (let slotIndex = 0; slotIndex < gridSize; slotIndex++) {
    const row = Math.floor(slotIndex / gridWidth);
    const col = slotIndex % gridWidth;

    if (row >= recipeData.value.inputs.length || col >= recipeData.value.inputs[row].length) {
      continue;
    }

    const itemOrArray = recipeData.value.inputs[row][col];
    if (!itemOrArray) continue;

    const itemsArray = Array.isArray(itemOrArray) ? itemOrArray : [itemOrArray];
    for (const item of itemsArray) {
      if (item?.itemId) {
        itemIds.add(item.itemId);
      }
    }
  }

  const items = await api.getItemsByIds(Array.from(itemIds));
  const nameById = new Map(items.map((item) => [item.itemId, item.localizedName]));

  for (let slotIndex = 0; slotIndex < gridSize; slotIndex++) {
    const row = Math.floor(slotIndex / gridWidth);
    const col = slotIndex % gridWidth;

    if (row >= recipeData.value.inputs.length) {
      continue;
    }
    if (col >= recipeData.value.inputs[row].length) {
      continue;
    }

    const itemOrArray = recipeData.value.inputs[row][col];
    if (!itemOrArray) continue;

    const itemsArray = Array.isArray(itemOrArray) ? itemOrArray : [itemOrArray];
    const slotItems: SlotVariant[] = [];

    for (const item of itemsArray) {
      if (!item || !item.itemId) continue;
      slotItems.push({
        itemId: item.itemId,
        count: item.count,
        localizedName: nameById.get(item.itemId) || item.itemId
      });
    }

    if (slotItems.length > 0) {
      newGrid[slotIndex] = { items: slotItems, primaryIndex: 0 };
    }
  }
  craftingGrid.value = newGrid;
  triggerRef(craftingGrid);

  // TODO: Add explicit circuit and fluid slot extraction when indexed export data exposes full layout metadata.
};

const outputItems = computed(() => recipeData.value.outputs || []);

const mergedMeta = computed<Record<string, unknown>>(() => {
  const a = (recipeData.value.additionalData && typeof recipeData.value.additionalData === 'object')
    ? recipeData.value.additionalData as Record<string, unknown>
    : {};
  const b = (recipeData.value.metadata && typeof recipeData.value.metadata === 'object')
    ? recipeData.value.metadata as Record<string, unknown>
    : {};
  return { ...a, ...b };
});

const specialItems = computed<SpecialItem[]>(() => {
  const src = mergedMeta.value.specialItems;
  if (!Array.isArray(src)) return [];
  const list: SpecialItem[] = [];
  for (const node of src) {
    if (!node || typeof node !== 'object') continue;
    const obj = node as { itemId?: unknown; count?: unknown; stackSize?: unknown };
    if (typeof obj.itemId !== 'string' || obj.itemId.length === 0) continue;
    const count = typeof obj.count === 'number'
      ? obj.count
      : (typeof obj.stackSize === 'number' ? obj.stackSize : 1);
    list.push({ itemId: obj.itemId, count: Math.max(1, Math.floor(count)) });
  }
  return list;
});

// Metadata fields used by bottom status bar.
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
  // Prefer explicit totalEU if present.
  if (recipeData.value.metadata?.totalEU) {
    return recipeData.value.metadata.totalEU;
  }
  // Fallback estimate: voltage * amperage * duration / 20 (duration in ticks).
  if (voltage.value && amperage.value && duration.value) {
    return voltage.value * amperage.value * (duration.value / 20);
  }
  return 0;
});

// Fluid input data for UI rendering.
const fluidInputsData = ref<Array<{
  fluidId: string;
  localizedName: string;
  amount: number;
  temperature?: number;
  renderAssetRef?: string | null;
}>>([]);

const isComponentAssemblyLine = computed(() => {
  const machineType = (recipeData.value.machineInfo?.machineType || '').toLowerCase();
  const recipeType = (recipeData.value.recipeType || '').toLowerCase();
  return machineType.includes('component assembly line') ||
    machineType.includes('component assembly') ||
    machineType.includes('component assembler') ||
    machineType.includes('部件装配线') ||
    machineType.includes('部件装配') ||
    recipeType.includes('component assembly line') ||
    recipeType.includes('component assembly') ||
    recipeType.includes('component assembler') ||
    recipeType.includes('部件装配线');
});

const componentInputSlots = computed<Array<SlotItem | null>>(() => {
  if (!isComponentAssemblyLine.value) return [];
  const compact = craftingGrid.value.filter((slot): slot is SlotItem => slot !== null).slice(0, 8);
  const padded: Array<SlotItem | null> = [...compact];
  while (padded.length < 8) {
    padded.push(null);
  }
  return padded;
});

const fluidSlotCount = computed(() => {
  if (isComponentAssemblyLine.value) {
    return 8;
  }
  return 4;
});

const initFluidSlots = async () => {
  const fluids = [];
  if (recipeData.value.fluidInputs && recipeData.value.fluidInputs.length > 0) {
    // Expected shape: [{ slotIndex, fluids: [...] }, ...]
    for (const fluidInput of recipeData.value.fluidInputs) {
      if (fluidInput && fluidInput.fluids && fluidInput.fluids.length > 0) {
        const fluid = fluidInput.fluids[0];
        fluids.push({
          fluidId: fluid.fluid.fluidId,
          localizedName: fluid.fluid.localizedName,
          amount: fluid.amount,
          temperature: fluid.fluid.temperature,
          renderAssetRef: fluid.fluid.renderAssetRef ?? null,
        });
      }
    }
  }
  fluidInputsData.value = fluids;
};

const handleItemClick = (itemId: string) => {
  playClick();
  emit('item-click', itemId);
};

const hoveredSlot = ref<number | null>(null);

const cycleInterval = ref<number | null>(null);

const cycleAlternatives = () => {
  craftingGrid.value.forEach((slotItem, index) => {
    if (slotItem && slotItem.items.length > 1) {
      slotItem.primaryIndex = (slotItem.primaryIndex + 1) % slotItem.items.length;
    }
  });
  triggerRef(craftingGrid);
};

// Compact number format helper (k/M/B).
const formatAmount = (amount: number): string => {
  if (amount >= 1000000000) {
    return (amount / 1000000000).toFixed(1) + 'B';
  } else if (amount >= 1000000) {
    return (amount / 1000000).toFixed(1) + 'M';
  } else if (amount >= 1000) {
    return (amount / 1000).toFixed(1) + 'k';
  }
  return amount.toString();
};

// Convert ticks to human-readable duration.
const formatDuration = (ticks: number): string => {
  const seconds = Math.floor(ticks / 20);
  if (seconds >= 3600) {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${mins}m`;
  } else if (seconds >= 60) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  }
  return `${seconds}s`;
};

onMounted(async () => {
  await initGrid();
  await initFluidSlots();

  cycleInterval.value = window.setInterval(() => {
    cycleAlternatives();
  }, 1500);
});

onUnmounted(() => {
  if (cycleInterval.value !== null) {
    clearInterval(cycleInterval.value);
  }
});

// Watch for recipe changes
watch(() => props.recipe, async () => {
  await initGrid();
  await initFluidSlots();
}, { deep: true });
</script>

<template>
  <div class="gt-assembly-line-ui">
    <header class="al-header">
      <div class="al-title">{{ machineLabel }}</div>
      <div class="al-tier">{{ voltageTier }}</div>
    </header>

    <div class="al-stage" :class="{ 'component-layout': isComponentAssemblyLine }">
      <section class="al-panel al-input">
        <div class="panel-title">Input Bus</div>
        <div
          v-if="!isComponentAssemblyLine"
          class="crafting-grid"
          :style="{
            gridTemplateColumns: `repeat(${gridDims.width}, var(--al-slot-size))`,
            gridTemplateRows: `repeat(${gridDims.height}, var(--al-slot-size))`
          }"
        >
          <template v-for="(slotItem, index) in craftingGrid" :key="`slot-${index}`">
            <div
              v-if="slotItem"
              class="grid-slot gt-slot"
              :class="{ 'has-alternatives': slotItem.items.length > 1 }"
              @mouseenter="hoveredSlot = index"
              @mouseleave="hoveredSlot = null"
            >
              <RecipeItemTooltip
                :item-id="slotItem.items[slotItem.primaryIndex].itemId"
                :count="slotItem.items[slotItem.primaryIndex].count"
                @click="handleItemClick(slotItem.items[slotItem.primaryIndex].itemId)"
                class="slot-item-tooltip"
              >
                <div class="slot-item">
                  <img
                    :src="getImagePath(slotItem.items[slotItem.primaryIndex].itemId)"
                    class="item-icon"
                    :class="{ 'cycling-icon': slotItem.items.length > 1 }"
                    @error="(e) => { (e.target as HTMLImageElement).src = '/placeholder.png' }"
                  />
                  <span v-if="slotItem.items[slotItem.primaryIndex].count > 1 && slotItem.items.length === 1" class="item-count">
                    {{ slotItem.items[slotItem.primaryIndex].count }}
                  </span>
                </div>
              </RecipeItemTooltip>
              <div v-if="slotItem.items.length > 1" class="cycle-indicator">
                {{ slotItem.primaryIndex + 1 }}/{{ slotItem.items.length }}
              </div>
            </div>
            <div v-else class="grid-slot grid-slot-empty gt-slot" />
          </template>
        </div>
        <div
          v-else
          class="crafting-grid component-bus-grid"
          :style="{ gridTemplateColumns: 'repeat(4, var(--al-slot-size))', gridTemplateRows: 'repeat(2, var(--al-slot-size))' }"
        >
          <template v-for="idx in 8" :key="`component-in-${idx - 1}`">
            <div
              v-if="componentInputSlots[idx - 1]"
              class="grid-slot gt-slot"
              :class="{ 'has-alternatives': componentInputSlots[idx - 1]!.items.length > 1 }"
              @mouseenter="hoveredSlot = idx - 1"
              @mouseleave="hoveredSlot = null"
            >
              <RecipeItemTooltip
                :item-id="componentInputSlots[idx - 1]!.items[componentInputSlots[idx - 1]!.primaryIndex].itemId"
                :count="componentInputSlots[idx - 1]!.items[componentInputSlots[idx - 1]!.primaryIndex].count"
                @click="handleItemClick(componentInputSlots[idx - 1]!.items[componentInputSlots[idx - 1]!.primaryIndex].itemId)"
                class="slot-item-tooltip"
              >
                <div class="slot-item">
                  <img
                    :src="getImagePath(componentInputSlots[idx - 1]!.items[componentInputSlots[idx - 1]!.primaryIndex].itemId)"
                    class="item-icon"
                    :class="{ 'cycling-icon': componentInputSlots[idx - 1]!.items.length > 1 }"
                    @error="(e) => { (e.target as HTMLImageElement).src = '/placeholder.png' }"
                  />
                  <span
                    v-if="componentInputSlots[idx - 1]!.items[componentInputSlots[idx - 1]!.primaryIndex].count > 1 && componentInputSlots[idx - 1]!.items.length === 1"
                    class="item-count"
                  >
                    {{ componentInputSlots[idx - 1]!.items[componentInputSlots[idx - 1]!.primaryIndex].count }}
                  </span>
                </div>
              </RecipeItemTooltip>
              <div v-if="componentInputSlots[idx - 1]!.items.length > 1" class="cycle-indicator">
                {{ componentInputSlots[idx - 1]!.primaryIndex + 1 }}/{{ componentInputSlots[idx - 1]!.items.length }}
              </div>
            </div>
            <div v-else class="grid-slot grid-slot-empty gt-slot" />
          </template>
        </div>
        <div v-if="specialItems.length" class="special-strip">
          <div class="special-label">Special Items</div>
          <div class="special-row">
            <RecipeItemTooltip
              v-for="(item, idx) in specialItems"
              :key="`special-${idx}-${item.itemId}`"
              :item-id="item.itemId"
              :count="item.count"
              @click="handleItemClick(item.itemId)"
            >
              <div class="special-slot gt-slot">
                <img :src="getImagePath(item.itemId)" class="item-icon" @error="(e) => { (e.target as HTMLImageElement).src = '/placeholder.png' }" />
                <span v-if="item.count > 1" class="item-count">{{ item.count }}</span>
              </div>
            </RecipeItemTooltip>
          </div>
        </div>
      </section>

      <section class="al-panel al-flow" :class="{ 'component-flow': isComponentAssemblyLine }">
        <div class="panel-title panel-title-center">Fluid Bus</div>
        <div v-if="!isComponentAssemblyLine" class="flow-track" />
        <div v-if="!isComponentAssemblyLine" class="flow-arrow">→</div>
        <div class="fluid-stack" :class="{ 'component-fluid-grid': isComponentAssemblyLine }">
          <div
            class="fluid-slot"
            v-for="idx in fluidSlotCount"
            :key="`fluid-${idx - 1}`"
          >
            <RecipeItemTooltip
              v-if="fluidInputsData[idx - 1]"
              :item-id="fluidInputsData[idx - 1].fluidId"
              :count="1"
              @click="handleItemClick(fluidInputsData[idx - 1].fluidId)"
            >
              <div class="fluid-content" :title="`${fluidInputsData[idx - 1].localizedName}\n${fluidInputsData[idx - 1].amount.toLocaleString()} L\nTemp: ${fluidInputsData[idx - 1].temperature || 0} K`">
                <img
                  :src="getFluidImagePath(fluidInputsData[idx - 1])"
                  class="fluid-icon-img"
                  @error="(e) => { (e.target as HTMLImageElement).style.display = 'none'; (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden'); }"
                />
                <div class="fluid-fallback hidden">?</div>
                <div class="fluid-info">{{ formatAmount(fluidInputsData[idx - 1].amount) }}</div>
              </div>
            </RecipeItemTooltip>
            <div v-else class="fluid-content empty">
              <span class="slot-placeholder">-</span>
            </div>
          </div>
        </div>
      </section>

      <section class="al-panel al-output" :class="{ 'component-output': isComponentAssemblyLine }">
        <div class="panel-title">Output</div>
        <RecipeItemTooltip
          v-if="outputItems[0]"
          :item-id="outputItems[0].itemId"
          :count="outputItems[0].count"
          @click="handleItemClick(outputItems[0].itemId)"
        >
          <div class="output-slot gt-slot" :class="{ 'component-output-slot': isComponentAssemblyLine }">
            <img
              :src="getImagePath(outputItems[0].itemId)"
              class="item-icon"
              @error="(e) => { (e.target as HTMLImageElement).src = '/placeholder.png' }"
            />
            <span v-if="outputItems[0].count > 1" class="item-count">{{ outputItems[0].count }}</span>
          </div>
        </RecipeItemTooltip>
      </section>
    </div>

    <footer class="bottom-bar">
      <div class="info-card">
        <span class="info-label">Total EU</span>
        <span class="info-value">{{ totalEU.toLocaleString() }}</span>
        <span class="info-unit">EU</span>
      </div>
      <div class="info-card" v-if="voltage && amperage">
        <span class="info-label">EU/t</span>
        <span class="info-value">{{ (voltage * amperage).toLocaleString() }}</span>
        <span class="info-unit">EU/t · {{ voltage.toLocaleString() }}V × {{ amperage }}A</span>
      </div>
      <div class="info-card">
        <span class="info-label">Duration</span>
        <span class="info-value">{{ formatDuration(duration) }}</span>
        <span class="info-unit">{{ duration }} ticks</span>
      </div>
    </footer>
  </div>
</template>

<style scoped>
.gt-assembly-line-ui {
  --al-slot-size: 50px;
  --al-item-icon-size: calc(var(--al-slot-size) * 0.8);
  --al-fluid-icon-size: calc(var(--al-slot-size) * 0.8);
  --al-output-size: calc(var(--al-slot-size) * 1.44);
  --al-output-icon-size: calc(var(--al-output-size) * 0.56);
  --al-output-size-compact: calc(var(--al-slot-size) * 1.2);
  --al-output-icon-size-compact: calc(var(--al-output-size-compact) * 0.6);
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  background:
    radial-gradient(130% 90% at 8% -10%, rgba(74, 196, 255, 0.12), transparent 54%),
    radial-gradient(120% 86% at 100% 0%, rgba(94, 128, 255, 0.1), transparent 56%),
    radial-gradient(120% 80% at 60% 120%, rgba(46, 212, 255, 0.08), transparent 62%),
    linear-gradient(155deg, rgba(7, 13, 26, 0.96), rgba(6, 12, 23, 0.95) 54%, rgba(8, 18, 34, 0.95));
  border-radius: 18px;
  border: 1px solid rgba(148, 163, 184, 0.22);
  color: #eaf6ff;
  position: relative;
  overflow: hidden;
  isolation: isolate;
}

.gt-assembly-line-ui::before {
  content: '';
  position: absolute;
  inset: -26% -16%;
  background:
    conic-gradient(
      from 210deg at 20% 30%,
      transparent 0deg,
      rgba(130, 224, 255, 0.16) 18deg,
      transparent 52deg,
      rgba(101, 165, 255, 0.14) 84deg,
      transparent 132deg,
      rgba(86, 245, 255, 0.12) 176deg,
      transparent 240deg,
      rgba(146, 192, 255, 0.12) 280deg,
      transparent 360deg
    );
  filter: blur(38px) saturate(118%);
  opacity: 0.62;
  animation: phaseRibbon 28s ease-in-out infinite alternate;
  pointer-events: none;
  z-index: 0;
}

.gt-assembly-line-ui::after {
  content: '';
  position: absolute;
  inset: -18% -10%;
  background:
    linear-gradient(
      118deg,
      transparent 0%,
      rgba(120, 215, 255, 0.1) 18%,
      transparent 36%,
      rgba(108, 176, 255, 0.09) 52%,
      transparent 70%,
      rgba(140, 234, 255, 0.08) 86%,
      transparent 100%
    );
  filter: blur(2px);
  opacity: 0.6;
  animation: filmSweep 16s cubic-bezier(0.33, 0, 0.67, 1) infinite;
  pointer-events: none;
  z-index: 0;
}

.al-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  position: relative;
  z-index: 1;
  padding: 10px 18px 9px;
  margin: -16px -16px 0;
  background:
    linear-gradient(180deg, rgba(29, 36, 47, 0.94), rgba(18, 23, 30, 0.98)),
    linear-gradient(90deg, rgba(255, 255, 255, 0.06), transparent 58%);
  border-bottom: 1px solid rgba(148, 163, 184, 0.18);
}

.al-title {
  font-size: 12px;
  font-weight: 700;
  color: #f3f7fb;
  letter-spacing: 1.2px;
  text-transform: uppercase;
}

.al-tier {
  font-size: 10px;
  border: 1px solid rgba(245, 208, 138, 0.28);
  color: #fff3da;
  border-radius: 999px;
  padding: 4px 10px 3px 12px;
  background: rgba(54, 44, 31, 0.9);
  letter-spacing: 0.14em;
  text-transform: uppercase;
  line-height: 1;
}

.al-stage {
  display: grid;
  grid-template-columns: 1fr auto auto;
  gap: 6px;
  align-items: start;
  position: relative;
  z-index: 1;
}

.al-stage.component-layout {
  grid-template-columns: auto auto;
  grid-template-rows: auto auto;
  gap: 6px;
  width: max-content;
  max-width: 100%;
  margin-inline: auto;
}

.al-stage.component-layout .al-input {
  grid-column: 1;
  grid-row: 1;
  justify-self: start;
}

.al-stage.component-layout .al-flow {
  grid-column: 1;
  grid-row: 2;
  justify-self: start;
}

.al-stage.component-layout .al-output {
  grid-column: 2;
  grid-row: 1 / span 2;
  align-self: center;
  justify-self: center;
}

.al-panel {
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 12px;
  background:
    linear-gradient(180deg, rgba(18, 24, 32, 0.88), rgba(10, 14, 20, 0.92)),
    radial-gradient(circle at top, rgba(255, 255, 255, 0.04), transparent 46%),
    url('/textures/nei/recipebg.png');
  background-repeat: no-repeat, no-repeat, repeat;
  background-size: auto, auto, 96px 96px;
  padding: 10px;
  backdrop-filter: blur(3px);
  box-shadow:
    inset 0 0 0 1px rgba(255, 255, 255, 0.03),
    0 8px 22px rgba(4, 10, 20, 0.36);
  transition: border-color 0.28s ease, box-shadow 0.28s ease, background 0.28s ease;
}

.al-panel:hover {
  border-color: rgba(125, 211, 252, 0.3);
  box-shadow:
    inset 0 0 0 1px rgba(255, 255, 255, 0.04),
    0 10px 28px rgba(4, 12, 24, 0.44);
}

.panel-title {
  font-size: 10px;
  color: #dbe8f6;
  margin-bottom: 8px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  opacity: 0.96;
}

.panel-title-center {
  text-align: center;
}

.crafting-grid {
  display: grid;
  gap: 5px;
  background: rgba(8, 16, 25, 0.52);
  padding: 7px;
  border-radius: 10px;
  border: 1px solid rgba(148, 163, 184, 0.22);
}

.component-bus-grid {
  justify-content: center;
}

.gt-slot {
  background:
    linear-gradient(180deg, rgba(11, 16, 24, 0.88), rgba(6, 10, 16, 0.92)),
    url('/textures/nei/slot.png');
  background-repeat: no-repeat;
  background-position: center;
  background-size: 100% 100%, 18px 18px;
  border: 1px solid rgba(148, 163, 184, 0.28);
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s ease;
  position: relative;
  overflow: visible;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.06),
    0 6px 12px rgba(2, 8, 23, 0.28);
}

.gt-slot:hover {
  background:
    linear-gradient(180deg, rgba(11, 16, 24, 0.92), rgba(6, 10, 16, 0.96)),
    url('/textures/nei/slot.png');
  background-repeat: no-repeat;
  background-position: center;
  background-size: 100% 100%, 18px 18px;
  border-color: rgba(103, 232, 249, 0.62);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.12),
    0 0 0 1px rgba(34, 211, 238, 0.14),
    0 10px 18px rgba(8, 145, 178, 0.18);
}

.grid-slot-empty {
  cursor: default;
  pointer-events: none;
  opacity: 0.3;
}

.slot-item {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.cycling-icon {
  opacity: 1;
  transform: scale(1);
}

.cycle-indicator {
  position: absolute;
  bottom: -6px;
  right: -6px;
  background: rgba(140, 213, 255, 0.96);
  color: #032132;
  font-size: 9px;
  font-weight: bold;
  padding: 2px 4px;
  border-radius: 6px;
  pointer-events: none;
  z-index: 10;
  min-width: 24px;
}

.has-alternatives {
  border-color: rgba(225, 232, 241, 0.34);
}

.item-icon {
  width: var(--al-item-icon-size);
  height: var(--al-item-icon-size);
  image-rendering: pixelated;
  image-rendering: crisp-edges;
  filter: drop-shadow(0 1px 2px rgba(15, 23, 42, 0.6));
  transition: all 0.3s ease;
}

.gt-slot:hover .item-icon {
  filter: drop-shadow(0 2px 4px rgba(8, 145, 178, 0.28)) brightness(1.04);
}

.item-count {
  position: absolute;
  bottom: 2px;
  right: 4px;
  background: rgba(15, 23, 42, 0.82);
  border: 1px solid rgba(148, 163, 184, 0.24);
  border-radius: 4px;
  padding: 1px 3px;
  color: #ffffff;
  font-size: 10px;
  font-weight: bold;
  text-shadow: 0 1px 1px rgba(15, 23, 42, 0.92);
  pointer-events: none;
}

.special-strip {
  margin-top: 8px;
}

.special-label {
  font-size: 10px;
  color: #fff3da;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  margin-bottom: 6px;
}

.special-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.special-slot {
  width: calc(var(--al-slot-size) * 0.88);
  height: calc(var(--al-slot-size) * 0.88);
  border-color: rgba(245, 208, 138, 0.32);
}

.al-flow {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0;
  align-self: stretch;
  justify-content: flex-start;
  min-width: 92px;
  position: relative;
}

.al-flow.component-flow {
  min-width: 0;
}

.al-flow .panel-title {
  width: 100%;
  margin-bottom: 8px;
}

.flow-arrow {
  font-size: 18px;
  color: #dbe8f6;
  text-shadow: none;
  width: calc(var(--al-slot-size) * 0.6);
  height: calc(var(--al-slot-size) * 0.52);
  display: flex;
  align-items: center;
  justify-content: center;
  position: absolute;
  top: 52%;
  left: -14px;
  transform: translateY(-50%);
  border-radius: 8px;
  border: 1px solid rgba(148, 163, 184, 0.24);
  background: linear-gradient(180deg, rgba(30, 41, 59, 0.88), rgba(15, 23, 42, 0.94));
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.04), 0 6px 14px rgba(2, 8, 23, 0.24);
  animation: flowPulse 4.2s ease-in-out infinite;
  z-index: 2;
}

.flow-track {
  position: absolute;
  top: 44px;
  bottom: 12px;
  left: 50%;
  transform: translateX(-50%);
  width: 2px;
  border-radius: 999px;
  background: linear-gradient(
    180deg,
    rgba(138, 218, 255, 0.15),
    rgba(108, 191, 255, 0.5) 50%,
    rgba(138, 218, 255, 0.15)
  );
  box-shadow: 0 0 14px rgba(109, 188, 255, 0.3);
  overflow: hidden;
}

.flow-track::after {
  content: '';
  position: absolute;
  left: -2px;
  width: 6px;
  height: calc(var(--al-slot-size) * 0.28);
  border-radius: 999px;
  background: radial-gradient(circle at center, rgba(200, 240, 255, 0.9), rgba(118, 208, 255, 0.24));
  filter: blur(0.3px);
  animation: flowTravel 3.6s ease-in-out infinite;
}

.fluid-stack {
  display: grid;
  grid-template-columns: var(--al-slot-size);
  grid-auto-rows: var(--al-slot-size);
  gap: 6px;
  padding: 6px;
  border-radius: 10px;
  border: 1px solid rgba(148, 163, 184, 0.22);
  background:
    linear-gradient(180deg, rgba(18, 24, 32, 0.28), rgba(10, 14, 20, 0.24)),
    linear-gradient(180deg, rgba(10, 18, 29, 0.45), rgba(8, 15, 24, 0.45));
  position: relative;
  overflow: hidden;
  box-shadow:
    inset 0 0 0 1px rgba(176, 231, 255, 0.06),
    0 0 16px rgba(76, 150, 225, 0.12);
}

.fluid-stack.component-fluid-grid {
  grid-template-columns: repeat(4, var(--al-slot-size));
  grid-template-rows: repeat(2, var(--al-slot-size));
  grid-auto-rows: auto;
  justify-content: center;
}

.al-stage.component-layout .al-input .crafting-grid,
.al-stage.component-layout .al-flow .fluid-stack {
  width: max-content;
}

.fluid-stack::after {
  content: '';
  position: absolute;
  inset: -40% -20%;
  background: linear-gradient(
    120deg,
    transparent 25%,
    rgba(156, 217, 255, 0.14) 45%,
    transparent 65%
  );
  animation: fluidSweep 4.2s linear infinite;
  pointer-events: none;
}

.fluid-slots-vertical {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.fluid-slot {
  width: var(--al-slot-size);
  height: var(--al-slot-size);
  background: rgba(16, 27, 42, 0.7);
  border: 1px solid rgba(148, 163, 184, 0.28);
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  padding: 0;
  cursor: pointer;
  transition: all 0.2s ease;
  box-shadow: inset 0 0 10px rgba(148, 163, 184, 0.08);
  z-index: 1;
}

.fluid-slot:hover {
  background: rgba(20, 36, 55, 0.86);
  border-color: rgba(125, 211, 252, 0.4);
  box-shadow: 0 0 14px rgba(122, 196, 255, 0.18), inset 0 0 10px rgba(189, 230, 255, 0.12);
  transform: translateY(-1px);
}

.fluid-content {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  position: relative;
}

.fluid-content.empty {
  opacity: 0.3;
  cursor: default;
  pointer-events: none;
}

.fluid-content .fluid-icon {
  font-size: 18px;
  line-height: 1;
}

.fluid-icon-img {
  width: var(--al-fluid-icon-size);
  height: var(--al-fluid-icon-size);
  image-rendering: pixelated;
  image-rendering: crisp-edges;
  object-fit: contain;
  filter: drop-shadow(0 0 5px rgba(154, 221, 255, 0.35));
}

.fluid-fallback {
  font-size: 24px;
  line-height: 1;
}

.fluid-fallback.hidden {
  display: none;
}

.fluid-content .fluid-info {
  position: absolute;
  bottom: 2px;
  right: 4px;
  font-size: 10px;
  color: rgba(188, 228, 255, 0.94);
  font-weight: bold;
  line-height: 1;
  text-shadow: 1px 1px 2px #000000;
  pointer-events: none;
}

@keyframes fluidSweep {
  from { transform: translateX(-28%) translateY(-12%) rotate(0deg); opacity: 0.3; }
  50% { opacity: 0.55; }
  to { transform: translateX(28%) translateY(12%) rotate(0deg); opacity: 0.3; }
}

.al-output {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-width: 92px;
}

.al-output.component-output {
  min-width: 96px;
  padding: 8px 8px 10px;
}

.al-output.component-output .panel-title {
  margin-bottom: 10px;
  text-align: center;
}

.output-slot {
  width: var(--al-output-size);
  height: var(--al-output-size);
  background:
    linear-gradient(180deg, rgba(32, 27, 20, 0.92), rgba(16, 13, 10, 0.98)),
    url('/textures/nei/slot.png');
  background-repeat: no-repeat;
  background-position: center;
  background-size: 100% 100%, 18px 18px;
  border: 1px solid rgba(245, 208, 138, 0.42);
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s ease;
  position: relative;
}

.component-output-slot {
  width: var(--al-output-size-compact);
  height: var(--al-output-size-compact);
  border-radius: 10px;
  box-shadow:
    inset 0 0 0 1px rgba(255, 237, 197, 0.12),
    0 8px 18px rgba(180, 83, 9, 0.14);
}

.output-slot .item-icon {
  width: var(--al-output-icon-size);
  height: var(--al-output-icon-size);
}

.output-slot.component-output-slot .item-icon {
  width: var(--al-output-icon-size-compact);
  height: var(--al-output-icon-size-compact);
}

.output-slot:hover {
  border-color: rgba(245, 208, 138, 0.72);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.14),
    0 0 0 1px rgba(245, 208, 138, 0.12),
    0 10px 18px rgba(180, 83, 9, 0.18);
}

.bottom-bar {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  padding: 10px;
  background:
    linear-gradient(180deg, rgba(16, 30, 48, 0.35), rgba(8, 16, 28, 0.35)),
    rgba(7, 14, 22, 0.62);
  border-radius: 12px;
  border: 1px solid rgba(148, 163, 184, 0.2);
  position: relative;
  z-index: 1;
  box-shadow: inset 0 0 0 1px rgba(166, 222, 255, 0.05);
}

.info-card {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 10px;
  padding: 8px 10px;
  background: rgba(12, 21, 33, 0.68);
}

.info-label {
  font-size: 11px;
  color: #b8c5d6;
  font-weight: 500;
}

.info-value {
  font-size: 14px;
  font-weight: bold;
  color: #eaf8ff;
  font-family: 'Consolas', 'Courier New', monospace;
}

.info-unit {
  font-size: 10px;
  color: #8fb6cc;
  font-family: 'Consolas', 'Courier New', monospace;
}

@media (min-width: 1920px) {
  .gt-assembly-line-ui {
    --al-slot-size: 52px;
  }
}

@media (min-width: 2560px) {
  .gt-assembly-line-ui {
    --al-slot-size: 58px;
  }
}

@media (min-width: 3200px) {
  .gt-assembly-line-ui {
    --al-slot-size: 64px;
  }
}

@media (max-width: 768px) {
  .gt-assembly-line-ui {
    --al-slot-size: 42px;
  }

  .al-stage {
    grid-template-columns: 1fr;
  }

  .al-stage.component-layout {
    grid-template-columns: 1fr;
    grid-template-rows: auto auto auto;
    width: auto;
    margin-inline: 0;
  }

  .al-stage.component-layout .al-input,
  .al-stage.component-layout .al-flow,
  .al-stage.component-layout .al-output {
    grid-column: 1;
    grid-row: auto;
    justify-self: stretch;
    align-self: stretch;
  }

  .al-flow {
    flex-direction: row;
    justify-content: flex-start;
    align-self: stretch;
    gap: 8px;
    min-width: 0;
  }

  .flow-track {
    display: none;
  }

  .flow-arrow {
    position: static;
    transform: none;
    left: auto;
    top: auto;
  }

  .bottom-bar {
    grid-template-columns: 1fr;
  }

  .fluid-stack.component-fluid-grid {
    grid-template-columns: repeat(4, var(--al-slot-size));
  }

  .al-output.component-output {
    min-width: 0;
    justify-self: stretch;
  }
}

@keyframes phaseRibbon {
  0% {
    transform: translate3d(-2%, -1%, 0) rotate(-1.2deg) scale(1);
    opacity: 0.5;
  }
  50% {
    transform: translate3d(1.2%, 0.8%, 0) rotate(0.8deg) scale(1.02);
    opacity: 0.66;
  }
  100% {
    transform: translate3d(2.6%, -0.8%, 0) rotate(1.8deg) scale(1.03);
    opacity: 0.54;
  }
}

@keyframes filmSweep {
  0% {
    transform: translateX(-14%) translateY(0);
    opacity: 0;
  }
  20% {
    opacity: 0.5;
  }
  55% {
    opacity: 0.36;
  }
  100% {
    transform: translateX(14%) translateY(0);
    opacity: 0;
  }
}

@keyframes flowPulse {
  0%, 100% {
    box-shadow: inset 0 0 0 1px rgba(181, 229, 255, 0.07), 0 0 12px rgba(117, 194, 255, 0.18);
    opacity: 0.92;
  }
  50% {
    box-shadow: inset 0 0 0 1px rgba(190, 235, 255, 0.12), 0 0 18px rgba(131, 211, 255, 0.36);
    opacity: 1;
  }
}

@keyframes flowTravel {
  0% { top: 4%; opacity: 0.2; }
  35% { opacity: 0.75; }
  100% { top: 84%; opacity: 0.2; }
}
</style>
