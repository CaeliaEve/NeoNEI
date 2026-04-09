<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { getImageUrl, type Recipe } from '../services/api';
import type { UITypeConfig } from '../services/uiTypeMapping';
import { useSound } from '../services/sound.service';
import {
  buildFirstInputSlotsPerRow,
  buildOutputSlots,
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
const outputItem = ref<ResolvedSlot | null>(null);

const initResearch = async () => {
  inputSlots.value = await buildFirstInputSlotsPerRow(recipeData.value);
  const [firstOutput] = await buildOutputSlots(recipeData.value, 1);
  outputItem.value = firstOutput ?? null;
};

const handleItemClick = (itemId: string) => {
  playClick();
  emit('item-click', itemId);
};

onMounted(() => {
  void initResearch();
});

watch(
  () => props.recipe,
  () => {
    void initResearch();
  },
  { deep: true },
);
</script>

<template>
  <div class="thaum-research-ui">
    <div class="scene-bg" aria-hidden="true">
      <div class="mist mist-a" />
      <div class="mist mist-b" />
      <div class="scene-grid" />
    </div>

    <section class="panel panel-input">
      <div class="panel-title">INPUT</div>
      <div class="slot-column">
        <template v-for="(slot, index) in inputSlots" :key="`input-${index}`">
          <RecipeItemTooltip :item-id="slot.itemId" :count="slot.count" @click="handleItemClick(slot.itemId)">
            <div class="slot">
              <img :src="getImagePath(slot.itemId)" class="slot-icon" @error="(e) => { (e.target as HTMLImageElement).src = '/placeholder.png'; }" />
              <span v-if="slot.count > 1" class="slot-count">{{ slot.count }}</span>
            </div>
          </RecipeItemTooltip>
        </template>
        <template v-for="i in Math.max(0, 8 - inputSlots.length)" :key="`empty-${i}`">
          <div class="slot empty" />
        </template>
      </div>
    </section>

    <section class="research-core" aria-hidden="true">
      <div class="ring outer" />
      <div class="ring inner" />
      <div class="research-node" />
      <div class="research-node-inner" />
      <div class="arrow-lane">
        <div class="arrow-track" />
        <svg viewBox="0 0 24 24" class="arrow-icon">
          <path d="M4 11h12.17l-5.59-5.59L12 4l8 8-8 8-1.41-1.41L16.17 13H4v-2z" />
        </svg>
      </div>
    </section>

    <section class="panel panel-output">
      <div class="panel-title panel-title-output">OUTPUT</div>
      <div class="slot-wrap">
        <RecipeItemTooltip
          v-if="outputItem"
          :item-id="outputItem.itemId"
          :count="outputItem.count"
          @click="handleItemClick(outputItem.itemId)"
        >
          <div class="slot output">
            <img :src="getImagePath(outputItem.itemId)" class="slot-icon output-icon" @error="(e) => { (e.target as HTMLImageElement).src = '/placeholder.png'; }" />
            <span v-if="outputItem.count > 1" class="slot-count">{{ outputItem.count }}</span>
          </div>
        </RecipeItemTooltip>
        <div v-else class="slot output empty" />
      </div>
    </section>
  </div>
</template>

<style scoped>
.thaum-research-ui {
  position: relative;
  display: grid;
  grid-template-columns: auto auto auto;
  gap: 16px;
  align-items: center;
  padding: 16px;
  border-radius: 18px;
  border: 1px solid rgba(148, 163, 184, 0.22);
  background:
    linear-gradient(180deg, rgba(10, 14, 24, 0.96), rgba(7, 10, 18, 0.98)),
    radial-gradient(circle at top, rgba(103, 232, 249, 0.08), transparent 40%);
  overflow: hidden;
  box-shadow:
    0 18px 50px rgba(2, 8, 23, 0.38),
    inset 0 1px 0 rgba(255, 255, 255, 0.06);
}

.scene-bg { position: absolute; inset: 0; pointer-events: none; }
.mist {
  position: absolute;
  border-radius: 999px;
  filter: blur(28px);
  opacity: 0.22;
}
.mist-a { width: 260px; height: 180px; left: -30px; top: -30px; background: radial-gradient(circle, rgba(103, 232, 249, 0.34), transparent 72%); }
.mist-b { width: 280px; height: 200px; right: -70px; bottom: -40px; background: radial-gradient(circle, rgba(192, 132, 252, 0.18), transparent 74%); }
.scene-grid {
  position: absolute;
  inset: 0;
  background:
    linear-gradient(rgba(255, 255, 255, 0.014) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 255, 255, 0.014) 1px, transparent 1px);
  background-size: 18px 18px;
  opacity: 0.16;
}

.panel {
  position: relative;
  z-index: 1;
  padding: 18px 12px 12px;
  border-radius: 16px;
  border: 1px solid rgba(148, 163, 184, 0.2);
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

.panel::after {
  content: '';
  position: absolute;
  inset: 8px;
  border: 1px solid rgba(255, 255, 255, 0.04);
  border-radius: 10px;
  pointer-events: none;
}

.panel-output { border-color: rgba(245, 208, 138, 0.24); }

.panel-title {
  position: absolute;
  top: -9px;
  left: 12px;
  min-width: 112px;
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

.panel-title-output {
  border-color: rgba(245, 208, 138, 0.32);
  color: #fff3da;
}

.slot-column {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.slot-wrap {
  min-height: 200px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.slot {
  width: 40px;
  height: 40px;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border-radius: 10px;
  border: 1px solid rgba(148, 163, 184, 0.28);
  background:
    linear-gradient(180deg, rgba(11, 16, 24, 0.88), rgba(6, 10, 16, 0.92)),
    url('/textures/nei/slot.png');
  background-repeat: no-repeat;
  background-position: center;
  background-size: 100% 100%, 18px 18px;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.06),
    0 6px 12px rgba(2, 8, 23, 0.28);
  transition: transform 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease;
}

.slot:hover {
  transform: translateY(-1px);
  border-color: rgba(103, 232, 249, 0.56);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.12),
    0 0 0 1px rgba(103, 232, 249, 0.12),
    0 10px 18px rgba(14, 116, 144, 0.14);
}

.slot.output {
  width: 50px;
  height: 50px;
  border-color: rgba(245, 208, 138, 0.42);
}

.slot.output:hover { border-color: rgba(245, 208, 138, 0.72); }
.slot.empty { opacity: 0.3; }

.slot-icon {
  width: 32px;
  height: 32px;
  object-fit: contain;
  image-rendering: pixelated;
}

.output-icon {
  width: 40px;
  height: 40px;
}

.slot-count {
  position: absolute;
  right: 3px;
  bottom: 2px;
  padding: 1px 3px;
  border-radius: 4px;
  background: rgba(15, 23, 42, 0.82);
  border: 1px solid rgba(148, 163, 184, 0.24);
  font-size: 10px;
  color: #fff;
  text-shadow: 0 1px 1px rgba(15, 23, 42, 0.92);
}

.research-core {
  position: relative;
  width: 220px;
  height: 220px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.ring {
  position: absolute;
  border-radius: 50%;
  border: 1px solid rgba(103, 232, 249, 0.22);
}

.outer {
  width: 180px;
  height: 180px;
  border-style: dashed;
  animation: spin 16s linear infinite;
}

.inner {
  width: 132px;
  height: 132px;
  animation: spinReverse 11s linear infinite;
}

.research-node {
  width: 84px;
  height: 84px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(224, 242, 254, 0.88), rgba(103, 232, 249, 0.32) 46%, rgba(59, 130, 246, 0.18));
  box-shadow: 0 0 20px rgba(103, 232, 249, 0.18);
}

.research-node-inner {
  position: absolute;
  width: 28px;
  height: 28px;
  border-radius: 8px;
  border: 1px solid rgba(224, 242, 254, 0.8);
  background: linear-gradient(145deg, rgba(224, 242, 254, 0.9), rgba(191, 219, 254, 0.52));
}

.arrow-lane {
  position: absolute;
  right: -4px;
  top: 50%;
  width: 30px;
  height: 22px;
  transform: translateY(-50%);
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

@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
@keyframes spinReverse { from { transform: rotate(360deg); } to { transform: rotate(0deg); } }

@media (max-width: 900px) {
  .thaum-research-ui {
    grid-template-columns: 1fr;
    justify-items: center;
  }

  .arrow-lane {
    position: static;
    transform: none;
  }
}
</style>
