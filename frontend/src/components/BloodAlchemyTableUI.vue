<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { getImageUrl, type Recipe } from '../services/api';
import type { UITypeConfig } from '../services/uiTypeMapping';
import { useSound } from '../services/sound.service';
import {
  buildInputSlots,
  buildOutputSlots,
  type ResolvedSlot,
} from '../composables/useRecipeSlots';
import { readPositiveIntegerMeta } from '../composables/ritualFamilyMetadata';
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

const inputSlots = ref<ResolvedSlot[]>([]);
const outputSlot = ref<ResolvedSlot | null>(null);
const bloodCost = ref<number | null>(null);

const shownInputs = computed(() => inputSlots.value);
const inputGridColumns = computed(() => {
  const count = shownInputs.value.length;
  if (count <= 4) return 2;
  if (count <= 9) return 3;
  return 4;
});

const bloodCostDisplay = computed(() => (
  typeof bloodCost.value === 'number' && bloodCost.value > 0
    ? bloodCost.value.toLocaleString()
    : '--'
));

async function initAlchemyTable() {
  inputSlots.value = await buildInputSlots(props.recipe);
  const [firstOutput] = await buildOutputSlots(props.recipe, 1);
  outputSlot.value = firstOutput ?? null;
  bloodCost.value = readPositiveIntegerMeta(props.recipe, ['bloodCost', 'lpCost', 'requiredLP', 'lifeEssence']);
}

function handleItemClick(itemId: string) {
  playClick();
  emit('item-click', itemId);
}

onMounted(() => {
  void initAlchemyTable();
});

watch(
  () => props.recipe,
  () => {
    void initAlchemyTable();
  },
  { deep: true },
);
</script>

<template>
  <div class="blood-ui blood-lab-ui">
    <div class="scene-bg" aria-hidden="true">
      <div class="mist mist-a" />
      <div class="mist mist-b" />
      <div class="scene-grid" />
    </div>

    <header class="ritual-header">
      <div class="ritual-title-shell">
        <div class="ritual-title">ALCHEMY TABLE</div>
        <div class="ritual-subtitle">Sanguine transmutation</div>
      </div>
      <div class="ritual-meta-rail">
        <div class="ritual-pill">BLOOD ALCHEMY</div>
        <div class="ritual-pill ritual-pill-accent">LP {{ bloodCostDisplay }}</div>
      </div>
    </header>

    <section class="ritual-stage">
      <section class="panel">
        <div class="panel-title">INPUT</div>
        <div class="input-grid" :style="{ gridTemplateColumns: `repeat(${inputGridColumns}, 50px)` }">
          <template v-for="(slot, index) in shownInputs" :key="`input-${index}`">
            <RecipeItemTooltip :item-id="slot.itemId" :count="slot.count" @click="handleItemClick(slot.itemId)">
              <div class="slot">
                <img :src="getImageUrl(slot.itemId)" class="item-icon" @error="(e) => { (e.target as HTMLImageElement).src = '/placeholder.png'; }" />
                <span v-if="slot.count > 1" class="count">{{ slot.count }}</span>
              </div>
            </RecipeItemTooltip>
          </template>
          <div v-if="shownInputs.length === 0" class="slot empty" />
        </div>
      </section>

      <section class="ritual-core" aria-hidden="true">
        <div class="ring outer" />
        <div class="ring inner" />
        <div class="lab-node" />
        <div class="lab-sigil" />
      </section>

      <section class="panel panel-output">
        <div class="panel-title panel-title-output">OUTPUT</div>
        <div class="slot-wrap">
          <RecipeItemTooltip
            v-if="outputSlot"
            :item-id="outputSlot.itemId"
            :count="outputSlot.count"
            @click="handleItemClick(outputSlot.itemId)"
          >
            <div class="slot output">
              <img :src="getImageUrl(outputSlot.itemId)" class="item-icon" @error="(e) => { (e.target as HTMLImageElement).src = '/placeholder.png'; }" />
              <span v-if="outputSlot.count > 1" class="count">{{ outputSlot.count }}</span>
            </div>
          </RecipeItemTooltip>
          <div v-else class="slot output empty" />
        </div>
      </section>
    </section>
  </div>
</template>

<style scoped>
.blood-ui {
  position: relative;
  overflow: visible;
  width: min(960px, 100%);
  padding: 16px;
  border-radius: 18px;
  border: 1px solid rgba(148, 163, 184, 0.22);
  background:
    linear-gradient(180deg, rgba(22, 9, 13, 0.96), rgba(12, 7, 9, 0.98)),
    radial-gradient(circle at top, rgba(225, 29, 72, 0.1), transparent 40%);
  color: #f9d7de;
  box-shadow:
    0 24px 52px rgba(0, 0, 0, 0.48),
    inset 0 1px 0 rgba(255, 255, 255, 0.06);
}

.scene-bg { position: absolute; inset: 0; pointer-events: none; }
.mist {
  position: absolute;
  border-radius: 999px;
  filter: blur(28px);
  opacity: 0.24;
}
.mist-a { width: 280px; height: 200px; left: -40px; top: -40px; background: radial-gradient(circle, rgba(244, 114, 182, 0.28), transparent 72%); }
.mist-b { width: 300px; height: 220px; right: -70px; bottom: -60px; background: radial-gradient(circle, rgba(225, 29, 72, 0.24), transparent 74%); }
.scene-grid {
  position: absolute;
  inset: 0;
  background:
    linear-gradient(rgba(255, 255, 255, 0.014) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 255, 255, 0.014) 1px, transparent 1px);
  background-size: 18px 18px;
  opacity: 0.14;
}

.ritual-header {
  position: relative;
  z-index: 1;
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  padding: 10px 18px 9px;
  background:
    linear-gradient(180deg, rgba(55, 19, 25, 0.94), rgba(30, 12, 16, 0.98)),
    linear-gradient(90deg, rgba(255, 255, 255, 0.05), transparent 58%);
  border: 1px solid rgba(148, 163, 184, 0.18);
  border-radius: 14px;
}

.ritual-title-shell {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.ritual-title {
  font-size: 15px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: #ffd8df;
}

.ritual-subtitle {
  font-size: 12px;
  color: #cc9ea6;
}

.ritual-meta-rail {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.ritual-pill {
  padding: 6px 10px;
  border-radius: 999px;
  border: 1px solid rgba(248, 113, 113, 0.28);
  background: rgba(73, 12, 22, 0.66);
  color: #ffd8df;
  font-size: 12px;
}

.ritual-pill-accent {
  border-color: rgba(253, 186, 116, 0.3);
  background: rgba(87, 33, 18, 0.62);
  color: #fff0d6;
}

.ritual-stage {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-columns: minmax(220px, 1fr) auto minmax(220px, 1fr);
  gap: 14px;
  align-items: center;
  margin-top: 14px;
}

.panel {
  position: relative;
  padding: 18px 12px 12px;
  border-radius: 16px;
  border: 1px solid rgba(148, 163, 184, 0.2);
  background:
    linear-gradient(180deg, rgba(43, 10, 18, 0.74), rgba(26, 7, 12, 0.78)),
    radial-gradient(circle at top, rgba(255, 255, 255, 0.04), transparent 48%),
    url('/textures/nei/recipebg.png');
  background-repeat: no-repeat, no-repeat, repeat;
  background-size: auto, auto, 96px 96px;
  box-shadow:
    inset 0 0 0 1px rgba(255, 255, 255, 0.03),
    0 10px 24px rgba(2, 8, 23, 0.24);
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
  min-width: 86px;
  padding: 4px 10px 3px 12px;
  background:
    linear-gradient(180deg, rgba(104, 71, 49, 0.98), rgba(76, 49, 33, 0.98)),
    url('/textures/nei/catalyst_tab.png');
  background-repeat: no-repeat;
  background-position: center;
  background-size: cover;
  border: 1px solid rgba(251, 191, 36, 0.22);
  border-radius: 6px 6px 4px 4px;
  color: #fff1df;
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

.input-grid {
  min-height: 178px;
  display: grid;
  grid-auto-rows: 50px;
  justify-content: center;
  align-content: center;
  gap: 8px;
}

.slot-wrap {
  min-height: 178px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.slot {
  width: 50px;
  height: 50px;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border-radius: 10px;
  border: 1px solid rgba(177, 63, 83, 0.5);
  background:
    linear-gradient(180deg, rgba(62, 14, 24, 0.9), rgba(36, 8, 14, 0.92)),
    url('/textures/nei/slot.png');
  background-repeat: no-repeat;
  background-position: center;
  background-size: 100% 100%, 18px 18px;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.05),
    0 6px 12px rgba(2, 8, 23, 0.28);
}

.slot.output { border-color: rgba(245, 208, 138, 0.42); }
.slot.empty { opacity: 0.34; }

.item-icon {
  width: 40px;
  height: 40px;
  max-width: 42px;
  max-height: 42px;
  object-fit: contain;
  image-rendering: pixelated;
}

.count {
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

.ritual-core {
  width: 214px;
  height: 214px;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
}

.ring {
  position: absolute;
  border-radius: 50%;
  border: 1px solid rgba(212, 84, 108, 0.28);
}

.outer {
  width: 214px;
  height: 214px;
  border-style: dashed;
  animation: spinSlow 22s linear infinite;
}

.inner {
  width: 166px;
  height: 166px;
  border-style: dashed;
  animation: spinReverse 16s linear infinite;
}

.lab-node {
  width: 122px;
  height: 122px;
  transform: rotate(45deg);
  border: 1px solid rgba(233, 121, 141, 0.34);
  box-shadow: 0 0 24px rgba(182, 44, 69, 0.22);
  animation: pulseRune 3.4s ease-in-out infinite;
}

.lab-sigil {
  position: absolute;
  width: 54px;
  height: 92px;
  transform: rotate(45deg);
  border: 1px solid rgba(236, 132, 161, 0.52);
  background: linear-gradient(165deg, rgba(112, 20, 41, 0.92), rgba(58, 10, 21, 0.96));
  box-shadow:
    0 0 24px rgba(194, 58, 92, 0.32),
    inset 0 0 18px rgba(255, 171, 196, 0.12);
}

@keyframes spinSlow { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
@keyframes spinReverse { from { transform: rotate(360deg); } to { transform: rotate(0deg); } }
@keyframes pulseRune {
  0%, 100% { opacity: 0.34; transform: rotate(45deg) scale(0.97); }
  50% { opacity: 0.72; transform: rotate(45deg) scale(1.02); }
}

@media (max-width: 900px) {
  .ritual-stage {
    grid-template-columns: 1fr;
    justify-items: center;
    gap: 12px;
  }

  .ritual-core {
    order: -1;
  }
}
</style>
