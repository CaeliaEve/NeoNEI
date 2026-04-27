<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, shallowRef, triggerRef, watch } from 'vue';
import { type Item, type Recipe } from '../services/api';
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
  renderHint?: Item['renderHint'];
}

interface SlotItem {
  items: SlotVariant[];
  primaryIndex: number;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();
const { playClick } = useSound();

const recipeData = computed(() => props.recipe);
const gridDims = computed(() => ({ width: 3, height: 3 }));
const totalSlots = computed(() => gridDims.value.width * gridDims.value.height);
const craftingGrid = shallowRef<Array<SlotItem | null>>([]);
const hoveredSlot = ref<number | null>(null);

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
  const gridSize = totalSlots.value;
  const newGrid: Array<SlotItem | null> = Array.from({ length: gridSize }, () => null);
  const gridWidth = gridDims.value.width;

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
        renderAssetRef: typeof item.renderAssetRef === 'string' ? item.renderAssetRef : null,
        imageFileName: typeof item.imageFileName === 'string' ? item.imageFileName : null,
        renderHint: item.renderHint ?? null,
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
                  <AnimatedItemIcon
                    :item-id="slotItem.items[slotItem.primaryIndex].itemId"
                    :render-asset-ref="slotItem.items[slotItem.primaryIndex].renderAssetRef || null"
                    :image-file-name="slotItem.items[slotItem.primaryIndex].imageFileName || null"
                    :size="58"
                    class="item-icon"
                    :class="{ 'cycling-icon': slotItem.items.length > 1 }"
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
          <span class="fusion-rail rail-top" />
          <span class="fusion-rail rail-bottom" />
          <span class="fusion-pulse pulse-a" />
          <span class="fusion-pulse pulse-b" />
          <span class="fusion-pulse pulse-c" />
        </div>
      </div>

      <section class="result-panel">
        <RecipeItemTooltip
          v-if="hasOutput"
          :item-id="outputItem!.itemId"
          :count="outputItem!.count"
          @click="handleItemClick(outputItem!.itemId)"
        >
          <div class="output-slot" @mouseenter="hoveredSlot = -1" @mouseleave="hoveredSlot = null">
            <AnimatedItemIcon
              :item-id="outputItem!.itemId"
              :render-asset-ref="outputItem!.renderAssetRef || null"
              :image-file-name="outputItem!.imageFileName || null"
              :size="74"
              class="item-icon output-icon"
            />
            <span v-if="outputItem!.count > 1" class="item-count">{{ outputItem!.count }}</span>
          </div>
        </RecipeItemTooltip>
        <div v-else class="output-slot empty" />
      </section>
    </div>

  </div>
</template>

<style scoped>
.workbench-ui {
  --wb-accent-rgb: 148, 163, 184;
  --wb-accent-strong-rgb: 225, 232, 241;
  --wb-output-rgb: 245, 208, 138;
  --slot-size: 82px;
  --slot-icon-size: 58px;
  --gap-size: 14px;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: min(1180px, calc(100vw - 56px));
  min-height: 560px;
  height: min(680px, calc(100vh - 220px));
  padding: 24px;
  overflow: hidden;
}

.scene-bg {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background:
    radial-gradient(circle at 28% 28%, rgba(132, 180, 255, 0.10), transparent 34%),
    radial-gradient(circle at 78% 64%, rgba(245, 208, 138, 0.08), transparent 30%),
    linear-gradient(180deg, rgba(9, 13, 20, 0.96), rgba(5, 9, 15, 0.99));
}

.scene-bg::before {
  content: '';
  position: absolute;
  inset: 0;
  background:
    linear-gradient(rgba(170, 195, 225, 0.026) 1px, transparent 1px),
    linear-gradient(90deg, rgba(170, 195, 225, 0.026) 1px, transparent 1px);
  background-size: 24px 24px;
  opacity: 0.72;
  mask-image: radial-gradient(circle at center, #000 0 62%, transparent 96%);
}

.scene-bg::after {
  content: '';
  position: absolute;
  inset: -20%;
  pointer-events: none;
  background: linear-gradient(110deg, transparent 28%, rgba(128, 168, 220, 0.11) 46%, rgba(245, 208, 138, 0.08) 52%, transparent 68%);
  transform: translateX(-26%);
  animation: workbenchSweep 9s ease-in-out infinite;
}

.matrix-shell {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-columns: 360px 118px 248px;
  align-items: center;
  gap: 34px;
  width: min(960px, 100%);
  justify-content: center;
  min-height: 500px;
  padding: 54px 64px 52px;
  border-radius: 28px;
  border: 1px solid rgba(var(--wb-accent-rgb), 0.22);
  background:
    radial-gradient(circle at 31% 36%, rgba(96, 165, 250, 0.12), transparent 44%),
    radial-gradient(circle at 72% 50%, rgba(var(--wb-output-rgb), 0.12), transparent 30%),
    linear-gradient(180deg, rgba(9, 13, 20, 0.95), rgba(6, 10, 16, 0.98));
  box-shadow:
    0 22px 58px rgba(2, 8, 23, 0.48),
    0 0 0 1px rgba(96, 165, 250, 0.08),
    inset 0 1px 0 rgba(255, 255, 255, 0.06);
}

.matrix-shell::before {
  content: '';
  position: absolute;
  inset: 28px;
  border-radius: 22px;
  pointer-events: none;
  background:
    linear-gradient(90deg, transparent 0 39%, rgba(148, 163, 184, 0.04) 50%, transparent 61%),
    radial-gradient(circle at 38% 50%, rgba(96, 165, 250, 0.08), transparent 36%),
    radial-gradient(circle at 68% 50%, rgba(var(--wb-output-rgb), 0.08), transparent 26%);
  opacity: 0.9;
}

.matrix-panel,
.result-panel {
  position: relative;
  z-index: 1;
  min-height: 0;
  padding: 32px;
  border-radius: 24px;
  border: 1px solid rgba(var(--wb-accent-rgb), 0.2);
  background:
    radial-gradient(circle at 50% 0%, rgba(148, 163, 184, 0.10), transparent 48%),
    linear-gradient(180deg, rgba(22, 31, 45, 0.96), rgba(7, 13, 22, 0.99));
  box-shadow:
    inset 0 0 0 1px rgba(255, 255, 255, 0.04),
    0 12px 28px rgba(2, 8, 23, 0.28),
    0 0 22px rgba(96, 165, 250, 0.08);
}

.matrix-panel {
  justify-self: end;
  width: 360px;
  height: 360px;
  display: grid;
  place-items: center;
  border-color: rgba(128, 168, 220, 0.62);
  background:
    radial-gradient(circle at 50% 0%, rgba(128, 168, 220, 0.18), transparent 50%),
    linear-gradient(180deg, rgba(23, 34, 50, 0.98), rgba(6, 12, 22, 0.99));
}

.result-panel {
  width: 248px;
  height: 248px;
  display: grid;
  place-items: center;
  justify-self: start;
  border-color: rgba(var(--wb-output-rgb), 0.62);
  background:
    radial-gradient(circle at 50% 0%, rgba(var(--wb-output-rgb), 0.24), transparent 50%),
    linear-gradient(180deg, rgba(44, 34, 19, 0.98), rgba(13, 10, 7, 0.99));
  box-shadow:
    inset 0 0 0 1px rgba(255, 255, 255, 0.04),
    0 12px 28px rgba(2, 8, 23, 0.28),
    0 0 26px rgba(var(--wb-output-rgb), 0.10);
}

.matrix-panel::after,
.result-panel::after {
  content: '';
  position: absolute;
  inset: 8px;
  border: 1px solid rgba(255, 255, 255, 0.04);
  border-radius: 18px;
  pointer-events: none;
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
  border-radius: 16px;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(150, 190, 245, 0.42);
  background:
    radial-gradient(circle at 34% 28%, rgba(210, 230, 255, 0.16), transparent 42%),
    linear-gradient(180deg, rgba(15, 26, 42, 0.98), rgba(4, 9, 18, 0.99));
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.06),
    0 6px 12px rgba(2, 8, 23, 0.32),
    0 0 14px rgba(96, 165, 250, 0.12);
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
    linear-gradient(180deg, rgba(9, 15, 24, 0.82), rgba(4, 8, 15, 0.88));
  border-color: rgba(150, 190, 245, 0.16);
  opacity: 0.52;
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
  border-color: rgba(var(--wb-accent-strong-rgb), 0.48);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.08),
    0 0 14px rgba(96, 165, 250, 0.12),
    0 6px 12px rgba(2, 8, 23, 0.32);
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
  width: 74px;
  height: 74px;
}

.result-panel .output-slot {
  border-color: rgba(245, 208, 138, 0.78);
  background:
    radial-gradient(circle at 34% 28%, rgba(255, 236, 178, 0.22), transparent 42%),
    linear-gradient(180deg, rgba(42, 32, 18, 0.98), rgba(9, 7, 4, 0.99));
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.08),
    0 0 24px rgba(var(--wb-output-rgb), 0.28),
    0 6px 12px rgba(2, 8, 23, 0.32);
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
  min-width: 130px;
  justify-self: center;
  align-self: stretch;
}

.lane-arrow {
  width: 120px;
  height: 72px;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  color: rgba(245, 208, 138, 0.82);
  filter: drop-shadow(0 0 18px rgba(96, 165, 250, 0.12));
}

.lane-arrow::before {
  content: '';
  position: absolute;
  left: 2px;
  right: 2px;
  top: 50%;
  height: 34px;
  transform: translateY(-50%);
  border-radius: 999px;
  border: 1px solid rgba(148, 163, 184, 0.14);
  background:
    radial-gradient(circle at 78% 50%, rgba(var(--wb-output-rgb), 0.24), transparent 30%),
    linear-gradient(90deg, rgba(96, 165, 250, 0.02), rgba(96, 165, 250, 0.10) 44%, rgba(var(--wb-output-rgb), 0.14) 70%, transparent);
  box-shadow:
    inset 0 0 18px rgba(96, 165, 250, 0.08),
    0 0 22px rgba(var(--wb-output-rgb), 0.08);
  opacity: 0.92;
}

.lane-arrow::after {
  content: '';
  position: absolute;
  right: 9px;
  top: 50%;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  transform: translateY(-50%);
  background:
    radial-gradient(circle, rgba(255, 247, 214, 0.86), rgba(var(--wb-output-rgb), 0.38) 38%, transparent 68%);
  box-shadow:
    0 0 18px rgba(var(--wb-output-rgb), 0.38),
    0 0 38px rgba(var(--wb-output-rgb), 0.16);
  animation: outputFocus 3.8s ease-in-out infinite;
}

.fusion-rail {
  position: absolute;
  left: 10px;
  right: 17px;
  height: 1px;
  border-radius: 999px;
  overflow: hidden;
  background: linear-gradient(90deg, transparent, rgba(148, 190, 255, 0.30), rgba(var(--wb-output-rgb), 0.34), transparent);
}

.fusion-rail::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg, transparent 0 18%, rgba(232, 240, 255, 0.86) 32%, transparent 48%);
  transform: translateX(-70%);
  animation: railCharge 2.9s cubic-bezier(0.42, 0, 0.18, 1) infinite;
}

.rail-top {
  top: 24px;
}

.rail-bottom {
  bottom: 24px;
}

.rail-bottom::after {
  animation-delay: 0.52s;
  opacity: 0.7;
}

.fusion-pulse {
  position: absolute;
  left: 14px;
  top: 50%;
  width: 4px;
  height: 4px;
  border-radius: 50%;
  transform: translate(-8px, -50%);
  background: rgba(229, 238, 255, 0.86);
  box-shadow:
    0 0 8px rgba(148, 190, 255, 0.62),
    0 0 18px rgba(var(--wb-output-rgb), 0.18);
  opacity: 0;
  animation: fusionPulse 3.1s cubic-bezier(0.45, 0, 0.2, 1) infinite;
}

.pulse-b {
  animation-delay: 0.62s;
  width: 3px;
  height: 3px;
  top: calc(50% - 10px);
}

.pulse-c {
  animation-delay: 1.16s;
  width: 5px;
  height: 5px;
  top: calc(50% + 10px);
}

@keyframes altSwap {
  from { opacity: 0; transform: scale(0.9); }
  to { opacity: 1; transform: scale(1); }
}

@keyframes workbenchSweep {
  0%, 100% { opacity: 0.12; transform: translateX(-28%); }
  48%, 60% { opacity: 0.46; transform: translateX(18%); }
}

@keyframes outputFocus {
  0%, 100% { opacity: 0.58; transform: translateY(-50%) scale(0.9); }
  50% { opacity: 0.96; transform: translateY(-50%) scale(1.08); }
}

@keyframes railCharge {
  0% { transform: translateX(-78%); opacity: 0; }
  18% { opacity: 0.88; }
  72% { opacity: 0.72; }
  100% { transform: translateX(92%); opacity: 0; }
}

@keyframes fusionPulse {
  0% { opacity: 0; transform: translate(-8px, -50%) scale(0.65); }
  18% { opacity: 0.9; }
  72% { opacity: 0.72; }
  100% { opacity: 0; transform: translate(82px, -50%) scale(1.08); }
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
