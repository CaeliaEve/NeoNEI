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
const machineLabel = computed(() => {
  const machineType = recipeData.value.machineInfo?.machineType;
  if (machineType && machineType.trim()) return machineType.trim();
  return recipeData.value.recipeType || 'Alloy Smelter';
});

const inputSlots = ref<ResolvedSlot[]>([]);
const outputSlot = ref<ResolvedSlot | null>(null);
const mergedMeta = computed<Record<string, unknown>>(() => {
  const a = recipeData.value.additionalData && typeof recipeData.value.additionalData === 'object'
    ? (recipeData.value.additionalData as Record<string, unknown>)
    : {};
  const b = recipeData.value.metadata && typeof recipeData.value.metadata === 'object'
    ? (recipeData.value.metadata as Record<string, unknown>)
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

const voltageTier = computed(() => {
  const tier = mergedMeta.value.voltageTier ?? recipeData.value.machineInfo?.parsedVoltageTier;
  return typeof tier === 'string' && tier.trim() ? tier.trim() : '--';
});

const voltage = computed(() => pickNumber(mergedMeta.value.voltage, recipeData.value.machineInfo?.parsedVoltage));
const amperage = computed(() => pickNumber(mergedMeta.value.amperage) ?? 1);
const durationTicks = computed(() => pickNumber(mergedMeta.value.duration));
const euPerTick = computed(() => {
  const explicit = pickNumber(mergedMeta.value.euPerTick, mergedMeta.value.eut, mergedMeta.value.EUt);
  if (explicit !== null) return explicit;
  return voltage.value !== null ? voltage.value * (amperage.value ?? 1) : null;
});
const totalEU = computed(() => {
  const explicit = pickNumber(mergedMeta.value.totalEU);
  if (explicit !== null) return explicit;
  if (euPerTick.value === null || durationTicks.value === null) return null;
  return euPerTick.value * durationTicks.value;
});

const initMachine = async () => {
  inputSlots.value = await buildInputSlots(recipeData.value);
  const [firstOutput] = await buildOutputSlots(recipeData.value, 1);
  outputSlot.value = firstOutput ?? null;
};

const handleItemClick = (itemId: string) => {
  playClick();
  emit('item-click', itemId);
};

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
        <div class="machine-title">{{ machineLabel }}</div>
      </div>
      <div class="machine-tier">{{ voltageTier }}</div>
    </header>

    <div class="recipe-row">
      <section class="panel">
        <div class="panel-label">Input</div>
        <div class="slot-column">
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
        <div class="meta-chip"><span>Power</span><strong>{{ euPerTick?.toLocaleString?.() ?? '--' }}</strong></div>
        <div class="arrow-lane">
          <div class="arrow-track" />
          <svg viewBox="0 0 24 24" class="arrow-icon">
            <path d="M4 11h12.17l-5.59-5.59L12 4l8 8-8 8-1.41-1.41L16.17 13H4v-2z" />
          </svg>
        </div>
      </section>

      <section class="panel panel-output">
        <div class="panel-label panel-label-output">Output</div>
        <RecipeItemTooltip
          v-if="outputSlot"
          :item-id="outputSlot.itemId"
          :count="outputSlot.count"
          @click="handleItemClick(outputSlot.itemId)"
        >
          <div class="gt-slot output-slot">
            <img
              :src="getImagePath(outputSlot.itemId)"
              class="item-icon"
              @error="(e) => { (e.target as HTMLImageElement).src = '/placeholder.png'; }"
            />
            <span v-if="outputSlot.count > 1" class="item-count">{{ outputSlot.count }}</span>
          </div>
        </RecipeItemTooltip>
        <div v-else class="gt-slot empty" />
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
.gt-machine-ui {
  width: min(700px, 100%);
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

.slot-column {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
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

.meta-bar {
  padding: 0 16px 14px;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  background: linear-gradient(180deg, rgba(10, 14, 20, 0.88), rgba(7, 10, 15, 0.96));
  border-top: 1px solid rgba(148, 163, 184, 0.16);
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
