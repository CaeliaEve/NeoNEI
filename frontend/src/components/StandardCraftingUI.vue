<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, shallowRef, triggerRef, watch } from 'vue';
import { api, getImageUrl, type Recipe } from '../services/api';
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

const props = defineProps<Props>();
const emit = defineEmits<Emits>();
const { playClick } = useSound();

const recipeData = computed(() => props.recipe);
const getImagePath = getImageUrl;

const gridDims = computed(() => ({ width: 3, height: 3 }));
const totalSlots = computed(() => gridDims.value.width * gridDims.value.height);
const craftingGrid = shallowRef<Array<SlotItem | null>>([]);
const hoveredSlot = ref<number | null>(null);

let initToken = 0;
let alternativeCycleTimer: number | null = null;

const stopAlternativeCycle = () => {
  if (alternativeCycleTimer !== null) {
    window.clearInterval(alternativeCycleTimer);
    alternativeCycleTimer = null;
  }
};

const startAlternativeCycle = () => {
  stopAlternativeCycle();
  if (!craftingGrid.value.some((slot) => slot && slot.items.length > 1)) return;

  alternativeCycleTimer = window.setInterval(() => {
    craftingGrid.value = craftingGrid.value.map((slot) => {
      if (!slot || slot.items.length <= 1) return slot;
      return {
        ...slot,
        primaryIndex: (slot.primaryIndex + 1) % slot.items.length,
      };
    });
    triggerRef(craftingGrid);
  }, 1800);
};

const initGrid = async () => {
  const token = ++initToken;
  const gridSize = totalSlots.value;
  const newGrid: Array<SlotItem | null> = Array.from({ length: gridSize }, () => null);
  const gridWidth = gridDims.value.width;
  const itemIds = new Set<string>();

  for (let slotIndex = 0; slotIndex < gridSize; slotIndex++) {
    const row = Math.floor(slotIndex / gridWidth);
    const col = slotIndex % gridWidth;
    if (row >= recipeData.value.inputs.length || col >= recipeData.value.inputs[row].length) continue;

    const itemOrArray = recipeData.value.inputs[row][col];
    if (!itemOrArray) continue;

    const itemsArray = Array.isArray(itemOrArray) ? itemOrArray : [itemOrArray];
    for (const item of itemsArray) {
      if (item?.itemId) itemIds.add(item.itemId);
    }
  }

  const items = await api.getItemsByIds(Array.from(itemIds));
  if (token !== initToken) return;

  const nameById = new Map(items.map((item) => [item.itemId, item.localizedName]));

  for (let slotIndex = 0; slotIndex < gridSize; slotIndex++) {
    const row = Math.floor(slotIndex / gridWidth);
    const col = slotIndex % gridWidth;
    if (row >= recipeData.value.inputs.length || col >= recipeData.value.inputs[row].length) continue;

    const itemOrArray = recipeData.value.inputs[row][col];
    if (!itemOrArray) continue;

    const itemsArray = Array.isArray(itemOrArray) ? itemOrArray : [itemOrArray];
    const slotItems: SlotVariant[] = [];

    for (const item of itemsArray) {
      if (!item?.itemId) continue;
      slotItems.push({
        itemId: item.itemId,
        count: item.count,
        localizedName: nameById.get(item.itemId) || item.itemId,
      });
    }

    if (slotItems.length > 0) {
      newGrid[slotIndex] = {
        items: slotItems,
        primaryIndex: 0,
      };
    }
  }

  craftingGrid.value = newGrid;
  triggerRef(craftingGrid);
  startAlternativeCycle();
};

const outputItem = computed(() => recipeData.value.outputs?.[0] ?? null);
const hasOutput = computed(() => Boolean(outputItem.value?.itemId));

const handleItemClick = (itemId: string) => {
  playClick();
  emit('item-click', itemId);
};

const totalAlternatives = computed(() => {
  let total = 0;
  craftingGrid.value.forEach((slot) => {
    if (slot?.items && slot.items.length > 1) {
      total += slot.items.length;
    }
  });
  return total;
});

watch(
  () => props.recipe,
  async () => {
    await initGrid();
  },
  { deep: true },
);

onMounted(async () => {
  await initGrid();
});

onBeforeUnmount(() => {
  stopAlternativeCycle();
});
</script>

<template>
  <div class="workbench-ui" :style="{ '--grid-w': String(gridDims.width), '--grid-h': String(gridDims.height) }">
    <div class="scene-bg" aria-hidden="true" />

    <div class="matrix-shell">
      <section class="matrix-panel">
        <div class="panel-label">Input Matrix</div>
        <div class="slot-grid">
          <template v-for="(slotItem, index) in craftingGrid" :key="`slot-${index}`">
            <div
              v-if="slotItem"
              class="craft-slot"
              :class="{ 'is-hovered': hoveredSlot === index, 'has-alternatives': slotItem.items.length > 1 }"
              @mouseenter="hoveredSlot = index"
              @mouseleave="hoveredSlot = null"
            >
              <RecipeItemTooltip
                :item-id="slotItem.items[slotItem.primaryIndex].itemId"
                :count="slotItem.items[slotItem.primaryIndex].count"
                @click="handleItemClick(slotItem.items[slotItem.primaryIndex].itemId)"
              >
                <div class="slot-item">
                  <img
                    :src="getImagePath(slotItem.items[slotItem.primaryIndex].itemId)"
                    class="item-icon"
                    :class="{ 'cycling-icon': slotItem.items.length > 1 }"
                    @error="(e) => { (e.target as HTMLImageElement).src = '/placeholder.png'; }"
                  />
                  <span v-if="slotItem.items[slotItem.primaryIndex].count > 1" class="item-count">
                    {{ slotItem.items[slotItem.primaryIndex].count }}
                  </span>
                </div>
              </RecipeItemTooltip>
              <div v-if="slotItem.items.length > 1" class="alternative-indicator">
                {{ slotItem.primaryIndex + 1 }}/{{ slotItem.items.length }}
              </div>
            </div>
            <div v-else class="craft-slot empty" />
          </template>
        </div>
      </section>

      <div class="fusion-lane" aria-hidden="true">
        <div class="lane-arrow">
          <svg viewBox="0 0 24 24" class="lane-arrow-icon">
            <path d="M4 11h12.17l-5.59-5.59L12 4l8 8-8 8-1.41-1.41L16.17 13H4v-2z" />
          </svg>
        </div>
      </div>

      <section class="result-panel">
        <div class="panel-label panel-label-output">Output</div>
        <RecipeItemTooltip
          v-if="hasOutput"
          :item-id="outputItem!.itemId"
          :count="outputItem!.count"
          @click="handleItemClick(outputItem!.itemId)"
        >
          <div class="output-slot" @mouseenter="hoveredSlot = -1" @mouseleave="hoveredSlot = null">
            <img
              :src="getImagePath(outputItem!.itemId)"
              class="item-icon output-icon"
              @error="(e) => { (e.target as HTMLImageElement).src = '/placeholder.png'; }"
            />
            <span v-if="outputItem!.count > 1" class="item-count">{{ outputItem!.count }}</span>
          </div>
        </RecipeItemTooltip>
        <div v-else class="output-slot empty" />
      </section>
    </div>

    <div class="status-row">
      <span class="chip">Workbench 3x3</span>
      <span v-if="totalAlternatives > 0" class="chip">Alternatives {{ totalAlternatives }}</span>
    </div>
  </div>
</template>

<style scoped>
.workbench-ui {
  --wb-accent-rgb: 148, 163, 184;
  --wb-accent-strong-rgb: 225, 232, 241;
  --wb-output-rgb: 245, 208, 138;
  --slot-size: 44px;
  --slot-icon-size: 28px;
  --gap-size: 4px;
  position: relative;
  display: grid;
  justify-items: center;
  gap: 10px;
  width: min(100%, 640px);
  padding: 14px;
  overflow: hidden;
}

.scene-bg {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background:
    radial-gradient(circle at top, rgba(34, 211, 238, 0.06), transparent 42%),
    linear-gradient(180deg, rgba(9, 13, 20, 0.95), rgba(6, 10, 16, 0.98)),
    url('/textures/nei/recipebg.png');
  background-repeat: no-repeat, no-repeat, repeat;
  background-size: auto, auto, 128px 128px;
}

.scene-bg::before {
  content: '';
  position: absolute;
  inset: 0;
  background:
    repeating-linear-gradient(0deg, rgba(255, 255, 255, 0.014) 0 1px, transparent 1px 18px),
    repeating-linear-gradient(90deg, rgba(255, 255, 255, 0.014) 0 1px, transparent 1px 18px);
  opacity: 0.35;
}

.matrix-shell {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  justify-content: center;
  padding: 14px 12px 12px;
  border-radius: 18px;
  border: 1px solid rgba(var(--wb-accent-rgb), 0.22);
  background:
    linear-gradient(180deg, rgba(9, 13, 20, 0.95), rgba(6, 10, 16, 0.98)),
    radial-gradient(circle at top, rgba(34, 211, 238, 0.08), transparent 42%);
  box-shadow:
    0 18px 50px rgba(2, 8, 23, 0.38),
    inset 0 1px 0 rgba(255, 255, 255, 0.06);
}

.matrix-panel,
.result-panel {
  position: relative;
  padding: 18px 12px 12px;
  border-radius: 12px;
  border: 1px solid rgba(var(--wb-accent-rgb), 0.2);
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

.result-panel {
  border-color: rgba(var(--wb-output-rgb), 0.26);
  background:
    linear-gradient(180deg, rgba(32, 27, 20, 0.92), rgba(16, 13, 10, 0.98)),
    radial-gradient(circle at top, rgba(var(--wb-output-rgb), 0.08), transparent 48%),
    url('/textures/nei/recipebg.png');
  background-repeat: no-repeat, no-repeat, repeat;
  background-size: auto, auto, 96px 96px;
}

.matrix-panel::after,
.result-panel::after {
  content: '';
  position: absolute;
  inset: 8px;
  border: 1px solid rgba(255, 255, 255, 0.04);
  border-radius: 8px;
  pointer-events: none;
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
  border-color: rgba(var(--wb-output-rgb), 0.32);
  color: #fff3da;
}

.slot-grid {
  display: grid;
  grid-template-columns: repeat(var(--grid-w), var(--slot-size));
  grid-template-rows: repeat(var(--grid-h), var(--slot-size));
  gap: var(--gap-size);
}

.craft-slot,
.output-slot {
  width: var(--slot-size);
  height: var(--slot-size);
  border-radius: 10px;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(var(--wb-accent-rgb), 0.28);
  background:
    linear-gradient(180deg, rgba(11, 16, 24, 0.88), rgba(6, 10, 16, 0.92)),
    url('/textures/nei/slot.png');
  background-repeat: no-repeat;
  background-position: center;
  background-size: 100% 100%, 18px 18px;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.06),
    0 6px 12px rgba(2, 8, 23, 0.28);
  transition: transform 0.22s ease, border-color 0.22s ease, box-shadow 0.22s ease;
  overflow: hidden;
}

.craft-slot::before,
.output-slot::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: radial-gradient(circle at 30% 25%, rgba(255, 255, 255, 0.14), transparent 48%);
  opacity: 0.55;
  pointer-events: none;
}

.craft-slot.empty,
.output-slot.empty {
  background:
    linear-gradient(180deg, rgba(8, 12, 18, 0.72), rgba(6, 10, 16, 0.8)),
    url('/textures/nei/slot.png');
  background-repeat: no-repeat;
  background-position: center;
  background-size: 100% 100%, 18px 18px;
  border-color: rgba(var(--wb-accent-rgb), 0.12);
  opacity: 0.45;
}

.craft-slot.is-hovered,
.craft-slot:hover,
.output-slot:hover {
  transform: translateY(-1px);
  border-color: rgba(103, 232, 249, 0.7);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.14),
    0 0 0 1px rgba(34, 211, 238, 0.18),
    0 10px 18px rgba(8, 145, 178, 0.2);
}

.craft-slot.has-alternatives {
  border-color: rgba(var(--wb-accent-strong-rgb), 0.3);
}

.slot-item {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.item-icon {
  width: var(--slot-icon-size);
  height: var(--slot-icon-size);
  image-rendering: pixelated;
  filter: drop-shadow(0 1px 2px rgba(15, 23, 42, 0.6));
}

.output-icon {
  width: 30px;
  height: 30px;
}

.result-panel .output-slot {
  border-color: rgba(217, 182, 122, 0.3);
}

.result-panel .output-slot:hover {
  border-color: rgba(var(--wb-output-rgb), 0.78);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.14),
    0 0 0 1px rgba(var(--wb-output-rgb), 0.12),
    0 10px 18px rgba(180, 83, 9, 0.18);
}

.cycling-icon {
  animation: altSwap 0.24s ease;
}

.alternative-indicator {
  position: absolute;
  top: 2px;
  left: 2px;
  min-width: 18px;
  padding: 1px 3px;
  border-radius: 999px;
  font-size: 8px;
  font-weight: 700;
  color: #9a3412;
  background: rgba(255, 244, 214, 0.94);
  border: 1px solid rgba(251, 191, 36, 0.24);
  pointer-events: none;
  z-index: 2;
}

.item-count {
  position: absolute;
  right: 2px;
  bottom: 2px;
  background: rgba(15, 23, 42, 0.82);
  border: 1px solid rgba(var(--wb-accent-rgb), 0.24);
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

.fusion-lane {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 30px;
  align-self: stretch;
}

.lane-arrow {
  width: 30px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  color: rgba(210, 218, 230, 0.86);
}

.lane-arrow::before {
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

.lane-arrow-icon {
  width: 18px;
  height: 18px;
  position: relative;
  z-index: 1;
  fill: currentColor;
}

.status-row {
  position: relative;
  z-index: 1;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.chip {
  border: 1px solid rgba(var(--wb-accent-rgb), 0.24);
  border-radius: 8px;
  padding: 4px 8px;
  background: rgba(8, 16, 25, 0.72);
  color: #eaf8ff;
  font-size: 12px;
  display: inline-flex;
  align-items: baseline;
  gap: 6px;
}

@keyframes altSwap {
  from { opacity: 0; transform: scale(0.9); }
  to { opacity: 1; transform: scale(1); }
}

@media (max-width: 980px) {
  .matrix-shell {
    flex-direction: column;
    gap: 10px;
    width: min(100%, 620px);
  }

  .fusion-lane {
    min-width: 100%;
    min-height: 18px;
  }

  .lane-arrow {
    transform: rotate(90deg);
  }
}
</style>
