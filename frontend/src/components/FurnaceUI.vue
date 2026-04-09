<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { getImageUrl, type Recipe } from '../services/api';
import type { UITypeConfig } from '../services/uiTypeMapping';
import { useSound } from '../services/sound.service';
import { buildInputSlots, buildOutputSlots, type ResolvedSlot } from '../composables/useRecipeSlots';
import RecipeItemTooltip from './RecipeItemTooltip.vue';

interface Props {
  recipe: Recipe;
  uiConfig?: UITypeConfig;
}

interface Emits {
  (e: 'item-click', itemId: string): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();
const { playClick } = useSound();

const recipeData = computed(() => props.recipe);
const getImagePath = getImageUrl;

const inputSlots = ref<ResolvedSlot[]>([]);
const outputSlot = ref<ResolvedSlot | null>(null);

const initFurnace = async () => {
  inputSlots.value = await buildInputSlots(recipeData.value);
  const [firstOutput] = await buildOutputSlots(recipeData.value, 1);
  outputSlot.value = firstOutput ?? null;
};

const handleItemClick = (itemId: string) => {
  playClick();
  emit('item-click', itemId);
};

watch(
  () => props.recipe,
  () => {
    void initFurnace();
  },
  { deep: true, immediate: true },
);
</script>

<template>
  <div class="furnace-ui">
    <div class="scene-bg" aria-hidden="true" />

    <div class="furnace-shell">
      <section class="furnace-panel">
        <div class="panel-label">Input</div>
        <div class="slot-row">
          <template v-if="inputSlots.length > 0">
            <RecipeItemTooltip
              v-for="(slot, index) in inputSlots"
              :key="`input-${index}`"
              :item-id="slot.itemId"
              :count="slot.count"
              @click="handleItemClick(slot.itemId)"
            >
              <div class="furnace-slot input-slot">
                <img
                  :src="getImagePath(slot.itemId)"
                  class="item-icon"
                  @error="(e) => { (e.target as HTMLImageElement).src = '/placeholder.png'; }"
                />
                <span v-if="slot.count > 1" class="item-count">{{ slot.count }}</span>
              </div>
            </RecipeItemTooltip>
          </template>
          <div v-else class="furnace-slot empty-slot"></div>
        </div>
      </section>

      <div class="heat-lane" aria-hidden="true">
        <div class="furnace-arrow">
          <div class="heat-glyph">
            <svg viewBox="0 0 24 24" class="heat-icon">
              <path
                d="M12 2C8 2 5 5.5 5 9c0 2.5 1.3 4 1.3 6.3 0 2.7 2.2 4.7 5.7 4.7s5.7-2 5.7-4.7C17.7 13 19 11.5 19 9c0-3.5-3-7-7-7zm0 15.8c-1.8 0-3-.9-3-2.3 0-1.4 1.1-2.2 1.1-4 0-1.4-.7-2.1-.7-3 0-1 .8-2.1 2-2.1s2 .9 2 2.1c0 .9-.7 1.6-.7 3 0 1.8 1.1 2.6 1.1 4 0 1.4-1.2 2.3-3 2.3z"
                fill="currentColor"
              />
            </svg>
          </div>
          <svg viewBox="0 0 24 24" class="arrow-icon">
            <path d="M4 11h12.17l-5.59-5.59L12 4l8 8-8 8-1.41-1.41L16.17 13H4v-2z" />
          </svg>
        </div>
      </div>

      <section class="furnace-panel furnace-panel-output">
        <div class="panel-label panel-label-output">Output</div>
        <div class="slot-row">
          <RecipeItemTooltip
            v-if="outputSlot"
            :item-id="outputSlot.itemId"
            :count="outputSlot.count"
            @click="handleItemClick(outputSlot.itemId)"
          >
            <div class="furnace-slot output-slot">
              <img
                :src="getImagePath(outputSlot.itemId)"
                class="item-icon"
                @error="(e) => { (e.target as HTMLImageElement).src = '/placeholder.png'; }"
              />
              <span v-if="outputSlot.count > 1" class="item-count">{{ outputSlot.count }}</span>
            </div>
          </RecipeItemTooltip>
          <div v-else class="furnace-slot empty-slot"></div>
        </div>
      </section>
    </div>

    <div class="status-row">
      <span class="chip">Furnace</span>
      <span class="chip chip-heat">Smelting</span>
    </div>
  </div>
</template>

<style scoped>
.furnace-ui {
  position: relative;
  display: grid;
  justify-items: center;
  gap: 10px;
  width: min(100%, 420px);
  padding: 14px;
  overflow: hidden;
}

.scene-bg {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background:
    radial-gradient(circle at top, rgba(251, 191, 36, 0.08), transparent 42%),
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

.furnace-shell {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  width: 100%;
  padding: 14px 12px 12px;
  border-radius: 18px;
  border: 1px solid rgba(148, 163, 184, 0.22);
  background:
    linear-gradient(180deg, rgba(9, 13, 20, 0.95), rgba(6, 10, 16, 0.98)),
    radial-gradient(circle at top, rgba(251, 191, 36, 0.08), transparent 42%);
  box-shadow:
    0 18px 50px rgba(2, 8, 23, 0.38),
    inset 0 1px 0 rgba(255, 255, 255, 0.06);
}

.furnace-panel {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 84px;
  min-height: 88px;
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

.furnace-panel::after {
  content: '';
  position: absolute;
  inset: 8px;
  border: 1px solid rgba(255, 255, 255, 0.04);
  border-radius: 8px;
  pointer-events: none;
}

.furnace-panel-output {
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

.slot-row {
  display: flex;
  gap: 4px;
  justify-content: center;
  align-items: center;
  min-height: 44px;
}

.furnace-slot {
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

.furnace-slot::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: radial-gradient(circle at 30% 25%, rgba(255, 255, 255, 0.14), transparent 48%);
  opacity: 0.55;
  pointer-events: none;
}

.input-slot:hover {
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
  transform: translateY(-1px);
  border-color: rgba(245, 208, 138, 0.78);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.14),
    0 0 0 1px rgba(245, 208, 138, 0.12),
    0 10px 18px rgba(180, 83, 9, 0.18);
}

.empty-slot {
  background:
    linear-gradient(180deg, rgba(8, 12, 18, 0.72), rgba(6, 10, 16, 0.8)),
    url('/textures/nei/slot.png');
  background-repeat: no-repeat;
  background-position: center;
  background-size: 100% 100%, 18px 18px;
  border-color: rgba(148, 163, 184, 0.12);
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
  pointer-events: none;
  z-index: 2;
}

.heat-lane {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 34px;
  align-self: stretch;
}

.furnace-arrow {
  width: 34px;
  min-height: 82px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  position: relative;
  color: rgba(245, 208, 138, 0.88);
}

.furnace-arrow::before {
  content: '';
  position: absolute;
  top: 18px;
  bottom: 18px;
  left: 50%;
  width: 2px;
  transform: translateX(-50%);
  background: url('/textures/nei/dash.png') center / 2px 100% no-repeat;
  opacity: 0.5;
}

.heat-glyph,
.arrow-icon {
  position: relative;
  z-index: 1;
}

.heat-icon {
  width: 18px;
  height: 18px;
}

.arrow-icon {
  width: 18px;
  height: 18px;
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
  border: 1px solid rgba(148, 163, 184, 0.24);
  border-radius: 8px;
  padding: 4px 8px;
  background: rgba(8, 16, 25, 0.72);
  color: #eaf8ff;
  font-size: 12px;
  display: inline-flex;
  align-items: baseline;
  gap: 6px;
}

.chip-heat {
  border-color: rgba(245, 208, 138, 0.32);
  color: #fff3da;
}

@media (max-width: 640px) {
  .furnace-shell {
    flex-direction: column;
    gap: 10px;
    width: 100%;
  }

  .heat-lane {
    min-width: 100%;
    min-height: 24px;
  }

  .furnace-arrow {
    min-height: 24px;
    width: 100%;
    flex-direction: row;
  }

  .furnace-arrow::before {
    top: 50%;
    bottom: auto;
    left: 18px;
    right: 18px;
    width: auto;
    height: 2px;
    transform: translateY(-50%);
    background: url('/textures/nei/dash.png') center / 100% 2px no-repeat;
  }
}
</style>
