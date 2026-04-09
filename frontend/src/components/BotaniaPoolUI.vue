<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { getImageUrl, type Recipe } from '../services/api';
import type { UITypeConfig } from '../services/uiTypeMapping';
import { useSound } from '../services/sound.service';
import { buildPrimaryInputSlots, buildOutputSlots, type ResolvedSlot } from '../composables/useRecipeSlots';
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
const outputSlots = ref<ResolvedSlot[]>([]);
const manaCost = ref<number | null>(null);

const inputColumns = computed(() => {
  if (inputSlots.value.length >= 7) return 4;
  if (inputSlots.value.length >= 4) return 3;
  return 2;
});

const manaText = computed(() => (
  typeof manaCost.value === 'number' && manaCost.value > 0
    ? `${manaCost.value.toLocaleString()} MANA`
    : '--'
));

async function initPool() {
  inputSlots.value = await buildPrimaryInputSlots(props.recipe);
  outputSlots.value = await buildOutputSlots(props.recipe, 2);
  manaCost.value = readPositiveIntegerMeta(props.recipe, ['manaCost', 'mana', 'requiredMana', 'manaUsage', 'cost']);
}

function onItemClick(itemId: string) {
  playClick();
  emit('item-click', itemId);
}

onMounted(() => {
  void initPool();
});

watch(
  () => props.recipe,
  () => {
    void initPool();
  },
  { deep: true },
);
</script>

<template>
  <div class="ritual-ui">
    <div class="scene-bg" aria-hidden="true">
      <div class="mist mist-a" />
      <div class="mist mist-b" />
      <div class="scene-grid" />
    </div>

    <section class="panel inputs">
      <div class="panel-title">INPUT</div>
      <div class="slot-grid" :style="{ gridTemplateColumns: `repeat(${inputColumns}, var(--slot))` }">
        <RecipeItemTooltip
          v-for="slot in inputSlots"
          :key="`pool-in-${slot.itemId}`"
          :item-id="slot.itemId"
          :count="slot.count"
          @click="onItemClick(slot.itemId)"
        >
          <div class="slot">
            <img :src="getImageUrl(slot.itemId)" class="item-icon" @error="(e) => { (e.target as HTMLImageElement).src = '/placeholder.png'; }" />
            <span v-if="slot.count > 1" class="count">{{ slot.count }}</span>
          </div>
        </RecipeItemTooltip>
      </div>
    </section>

    <section class="ritual-core" aria-hidden="true">
      <div class="ring outer" />
      <div class="ring middle" />
      <div class="ring inner" />
      <div class="pool-liquid" />
      <div class="sigil">✦</div>
    </section>

    <section class="panel outputs">
      <div class="panel-title panel-title-output">OUTPUT</div>
      <div class="output-stack">
        <RecipeItemTooltip
          v-for="slot in outputSlots"
          :key="`pool-out-${slot.itemId}`"
          :item-id="slot.itemId"
          :count="slot.count"
          @click="onItemClick(slot.itemId)"
        >
          <div class="slot output">
            <img :src="getImageUrl(slot.itemId)" class="item-icon" @error="(e) => { (e.target as HTMLImageElement).src = '/placeholder.png'; }" />
            <span v-if="slot.count > 1" class="count">{{ slot.count }}</span>
          </div>
        </RecipeItemTooltip>
        <div v-if="outputSlots.length === 0" class="slot output empty" />
      </div>
    </section>

    <section class="resource-rail">
      <span class="resource-label">MANA</span>
      <span class="resource-value">{{ manaText }}</span>
    </section>
  </div>
</template>

<style scoped>
.ritual-ui {
  --slot: 54px;
  position: relative;
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 14px;
  align-items: center;
  width: min(980px, 100%);
  padding: 16px;
  border-radius: 18px;
  border: 1px solid rgba(148, 163, 184, 0.22);
  background:
    linear-gradient(180deg, rgba(11, 16, 24, 0.96), rgba(7, 12, 18, 0.98)),
    radial-gradient(circle at top, rgba(110, 231, 183, 0.1), transparent 40%);
  overflow: visible;
  box-shadow:
    0 18px 50px rgba(2, 8, 23, 0.38),
    inset 0 1px 0 rgba(255, 255, 255, 0.06);
}

.scene-bg { position: absolute; inset: 0; pointer-events: none; }
.mist {
  position: absolute;
  border-radius: 999px;
  filter: blur(28px);
  opacity: 0.3;
}
.mist-a { width: 260px; height: 180px; left: -30px; top: -30px; background: radial-gradient(circle, rgba(110, 231, 183, 0.34), transparent 72%); }
.mist-b { width: 280px; height: 200px; right: -70px; bottom: -40px; background: radial-gradient(circle, rgba(103, 232, 249, 0.28), transparent 74%); }
.scene-grid {
  position: absolute;
  inset: 0;
  background:
    linear-gradient(rgba(255, 255, 255, 0.014) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 255, 255, 0.014) 1px, transparent 1px);
  background-size: 18px 18px;
  opacity: 0.18;
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

.outputs {
  border-color: rgba(245, 208, 138, 0.24);
}

.panel-title {
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

.panel-title-output {
  border-color: rgba(245, 208, 138, 0.32);
  color: #fff3da;
}

.slot-grid {
  display: grid;
  gap: 8px;
}

.output-stack {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.ritual-core {
  position: relative;
  z-index: 1;
  height: 186px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.ring {
  position: absolute;
  border-radius: 50%;
  border: 1px solid rgba(167, 243, 208, 0.26);
  box-shadow: 0 0 12px rgba(110, 231, 183, 0.12);
}

.ring.outer { width: 196px; height: 196px; border-style: dashed; animation: spin 14s linear infinite; }
.ring.middle { width: 168px; height: 168px; animation: spinReverse 11s linear infinite; }
.ring.inner { width: 138px; height: 138px; opacity: 0.7; animation: pulse 2.8s ease-in-out infinite; }

.pool-liquid {
  width: 120px;
  height: 120px;
  border-radius: 50%;
  background: radial-gradient(circle at 40% 28%, rgba(238, 255, 248, 0.92), rgba(124, 243, 230, 0.46) 44%, rgba(36, 164, 198, 0.26) 72%, rgba(8, 58, 95, 0.42));
  box-shadow: inset 0 0 30px rgba(255, 255, 255, 0.16), 0 0 24px rgba(102, 235, 222, 0.2);
  animation: liquid 2.7s ease-in-out infinite;
}

.sigil {
  position: absolute;
  color: #f2fffd;
  font-size: 24px;
  text-shadow: 0 0 8px rgba(167, 255, 246, 0.22);
  animation: bob 2.1s ease-in-out infinite;
}

.slot {
  width: var(--slot);
  height: var(--slot);
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
  position: relative;
  transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.06),
    0 6px 12px rgba(2, 8, 23, 0.28);
}

.slot:hover {
  transform: translateY(-1px);
  border-color: rgba(110, 231, 183, 0.56);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.12),
    0 0 0 1px rgba(110, 231, 183, 0.12),
    0 10px 18px rgba(16, 185, 129, 0.14);
}

.slot.output {
  width: 62px;
  height: 62px;
  border-color: rgba(245, 208, 138, 0.42);
}

.slot.output:hover {
  border-color: rgba(245, 208, 138, 0.72);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.14),
    0 0 0 1px rgba(245, 208, 138, 0.12),
    0 10px 18px rgba(180, 83, 9, 0.16);
}

.slot.empty { opacity: 0.38; }
.item-icon { width: 82%; height: 82%; object-fit: contain; image-rendering: pixelated; }
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

.resource-rail {
  grid-column: 1 / -1;
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 10px;
  border: 1px solid rgba(148, 163, 184, 0.2);
  background: rgba(6, 25, 19, 0.62);
}

.resource-label {
  font-size: 12px;
  color: #dcfff0;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.resource-value {
  font-size: 12px;
  color: #ecfff6;
}

@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
@keyframes spinReverse { from { transform: rotate(360deg); } to { transform: rotate(0deg); } }
@keyframes pulse { 0%,100% { transform: scale(0.98); opacity: 0.56; } 50% { transform: scale(1.04); opacity: 0.9; } }
@keyframes liquid { 0%,100% { transform: scale(1); } 50% { transform: scale(1.05); } }
@keyframes bob { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-4px); } }

@media (max-width: 980px) {
  .ritual-ui { grid-template-columns: 1fr; }
  .ritual-core { height: 170px; }
}
</style>
