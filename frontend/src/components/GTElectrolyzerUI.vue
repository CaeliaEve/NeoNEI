<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { getImageUrl, type Recipe } from '../services/api';
import type { UITypeConfig } from '../services/uiTypeMapping';
import { useSound } from '../services/sound.service';
import {
  buildInputSlots,
  buildOutputSlots,
  parseAdditionalData,
  type ResolvedSlot,
} from '../composables/useRecipeSlots';
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
const outputSlots = ref<ResolvedSlot[]>([]);
const euCost = ref(0);
const voltageTier = ref(0);

const tierNames: Record<number, string> = {
  1: 'ULV',
  2: 'LV',
  3: 'MV',
  4: 'HV',
  5: 'EV',
  6: 'IV',
  7: 'LuV',
  8: 'ZPM',
  9: 'UV',
};

const tierColors: Record<number, string> = {
  1: '#86efac',
  2: '#fde68a',
  3: '#fdba74',
  4: '#fca5a5',
  5: '#fda4af',
  6: '#c4b5fd',
  7: '#7dd3fc',
  8: '#93c5fd',
  9: '#e9d5ff',
};

const tierLabel = computed(() => tierNames[voltageTier.value] ?? '--');
const tierColor = computed(() => tierColors[voltageTier.value] ?? '#dbe8f6');

const initMachine = async () => {
  inputSlots.value = await buildInputSlots(recipeData.value);
  outputSlots.value = await buildOutputSlots(recipeData.value);

  euCost.value = 0;
  voltageTier.value = 0;

  const additionalData = parseAdditionalData(recipeData.value);
  if (additionalData) {
    const nextEuCost = Number(additionalData.euCost);
    const nextVoltageTier = Number(additionalData.voltageTier);
    if (Number.isFinite(nextEuCost)) euCost.value = nextEuCost;
    if (Number.isFinite(nextVoltageTier)) voltageTier.value = nextVoltageTier;
  }
};

const handleItemClick = (itemId: string) => {
  playClick();
  emit('item-click', itemId);
};

watch(
  () => props.recipe,
  () => {
    void initMachine();
  },
  { deep: true, immediate: true },
);
</script>

<template>
  <div class="gt-machine-ui">
    <header class="machine-header">
      <div class="machine-title-shell">
        <div class="machine-title">Electrolyzer</div>
      </div>
      <div class="machine-tier" :style="{ color: tierColor }">{{ tierLabel }}</div>
    </header>

    <div class="recipe-row recipe-row-wide">
      <section class="panel">
        <div class="panel-label">Input</div>
        <div class="slot-grid slot-grid-input">
          <RecipeItemTooltip
            v-for="(slot, index) in inputSlots"
            :key="`input-${index}`"
            :item-id="slot.itemId"
            :count="slot.count"
            @click="handleItemClick(slot.itemId)"
          >
            <div class="gt-slot">
              <img
                :src="getImagePath(slot.itemId)"
                class="item-icon"
                @error="(e) => { (e.target as HTMLImageElement).src = '/placeholder.png'; }"
              />
              <span v-if="slot.count > 1" class="item-count">{{ slot.count }}</span>
            </div>
          </RecipeItemTooltip>
          <div v-if="inputSlots.length === 0" class="gt-slot empty" />
        </div>
      </section>

      <section class="core-panel">
        <div class="meta-chip"><span>EU</span><strong>{{ euCost }}</strong></div>
        <div class="arrow-lane">
          <div class="arrow-track" />
          <svg viewBox="0 0 24 24" class="arrow-icon">
            <path d="M4 11h12.17l-5.59-5.59L12 4l8 8-8 8-1.41-1.41L16.17 13H4v-2z" />
          </svg>
        </div>
      </section>

      <section class="panel panel-output">
        <div class="panel-label panel-label-output">Output</div>
        <div class="slot-grid slot-grid-output">
          <RecipeItemTooltip
            v-for="(slot, index) in outputSlots"
            :key="`output-${index}`"
            :item-id="slot.itemId"
            :count="slot.count"
            @click="handleItemClick(slot.itemId)"
          >
            <div class="gt-slot output-slot">
              <img
                :src="getImagePath(slot.itemId)"
                class="item-icon"
                @error="(e) => { (e.target as HTMLImageElement).src = '/placeholder.png'; }"
              />
              <span v-if="slot.count > 1" class="item-count">{{ slot.count }}</span>
            </div>
          </RecipeItemTooltip>
          <div v-if="outputSlots.length === 0" class="gt-slot empty" />
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.gt-machine-ui {
  width: min(820px, 100%);
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

.machine-title-shell {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
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
  background: rgba(54, 44, 31, 0.9);
  letter-spacing: 0.14em;
  text-transform: uppercase;
  line-height: 1;
}

.recipe-row {
  display: grid;
  grid-template-columns: auto auto auto;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 18px 16px 14px;
  background:
    linear-gradient(180deg, rgba(11, 16, 24, 0.86), rgba(8, 12, 18, 0.92)),
    url('/textures/nei/recipebg.png');
  background-repeat: no-repeat, repeat;
  background-size: auto, 128px 128px;
}

.recipe-row-wide {
  grid-template-columns: minmax(88px, auto) auto minmax(120px, auto);
}

.panel,
.core-panel {
  position: relative;
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

.panel::after,
.core-panel::after {
  content: '';
  position: absolute;
  inset: 8px;
  border: 1px solid rgba(255, 255, 255, 0.04);
  border-radius: 8px;
  pointer-events: none;
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

.slot-grid {
  position: relative;
  z-index: 1;
  display: grid;
  gap: 4px;
}

.slot-grid-input,
.slot-grid-output {
  grid-template-columns: repeat(2, 44px);
}

.core-panel {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  min-width: 96px;
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
  position: relative;
  z-index: 1;
}

.meta-chip span {
  color: #b8c5d6;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.meta-chip strong {
  color: #f3f7fb;
}

.arrow-lane {
  position: relative;
  z-index: 1;
  width: 30px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(210, 218, 230, 0.86);
}

.arrow-track {
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

.gt-slot::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: radial-gradient(circle at 30% 25%, rgba(255, 255, 255, 0.14), transparent 48%);
  opacity: 0.55;
  pointer-events: none;
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

@media (max-width: 768px) {
  .recipe-row {
    grid-template-columns: 1fr;
  }

  .core-panel {
    min-width: 84px;
  }
}
</style>
