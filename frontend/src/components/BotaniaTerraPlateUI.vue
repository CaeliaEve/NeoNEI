<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { getImageUrl, type Recipe } from '../services/api';
import type { UITypeConfig } from '../services/uiTypeMapping';
import { useSound } from '../services/sound.service';
import { buildInputSlots, buildOutputSlots, type ResolvedSlot } from '../composables/useRecipeSlots';
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

const centerSlot = ref<ResolvedSlot | null>(null);
const sideSlots = ref<ResolvedSlot[]>([]);
const outputSlot = ref<ResolvedSlot | null>(null);
const manaCost = ref<number | null>(null);
const manaLabel = computed(() => {
  if (!manaCost.value) return '--';
  return `${manaCost.value.toLocaleString()} MANA`;
});

const orbitRadius = computed(() => (sideSlots.value.length >= 6 ? 120 : 106));

function getPos(index: number, total: number, radius: number) {
  const safeTotal = Math.max(total, 1);
  const angle = (Math.PI * 2 * index) / safeTotal - Math.PI / 2;
  return {
    left: `calc(50% + ${Math.cos(angle) * radius}px)`,
    top: `calc(50% + ${Math.sin(angle) * radius}px)`,
    transform: 'translate(-50%, -50%)',
  };
}

async function initTerraPlate() {
  const allInputs = await buildInputSlots(props.recipe);
  if (allInputs.length > 0) {
    centerSlot.value = allInputs[0];
    sideSlots.value = allInputs.slice(1);
  } else {
    centerSlot.value = null;
    sideSlots.value = [];
  }

  const [firstOutput] = await buildOutputSlots(props.recipe, 1);
  outputSlot.value = firstOutput ?? null;
  manaCost.value = readPositiveIntegerMeta(props.recipe, ['manaCost', 'mana', 'requiredMana', 'cost']);
}

function onItemClick(itemId: string) {
  playClick();
  emit('item-click', itemId);
}

onMounted(() => {
  void initTerraPlate();
});

watch(
  () => props.recipe,
  () => {
    void initTerraPlate();
  },
  { deep: true },
);
</script>

<template>
  <div class="ritual-ui ritual-terra">
    <div class="scene-bg" aria-hidden="true">
      <div class="mist mist-a" />
      <div class="mist mist-b" />
      <div class="scene-grid" />
    </div>

    <section class="panel">
      <div class="panel-title">INPUT</div>
      <RecipeItemTooltip
        v-if="centerSlot"
        :item-id="centerSlot.itemId"
        :count="centerSlot.count"
        @click="onItemClick(centerSlot.itemId)"
      >
        <div class="slot">
          <img :src="getImageUrl(centerSlot.itemId)" class="item-icon" @error="(e) => { (e.target as HTMLImageElement).src = '/placeholder.png'; }" />
          <span v-if="centerSlot.count > 1" class="count">{{ centerSlot.count }}</span>
        </div>
      </RecipeItemTooltip>
      <div v-else class="slot empty" />
    </section>

    <section class="ritual-core terra-core" aria-hidden="true">
      <div class="ring outer" />
      <div class="ring middle" />
      <div class="ring inner" />
      <div class="terra-platform" />
      <div class="terra-platform-glow" />
      <div class="core-label">Terra Plate</div>

      <div v-for="(slot, index) in sideSlots" :key="`terra-${slot.itemId}-${index}`" class="orbit-slot" :style="getPos(index, sideSlots.length, orbitRadius)">
        <RecipeItemTooltip
          :item-id="slot.itemId"
          :count="slot.count"
          @click="onItemClick(slot.itemId)"
        >
          <div class="slot orbit">
            <img :src="getImageUrl(slot.itemId)" class="item-icon" @error="(e) => { (e.target as HTMLImageElement).src = '/placeholder.png'; }" />
            <span v-if="slot.count > 1" class="count">{{ slot.count }}</span>
          </div>
        </RecipeItemTooltip>
      </div>
    </section>

    <section class="panel panel-output">
      <div class="panel-title panel-title-output">OUTPUT</div>
      <RecipeItemTooltip
        v-if="outputSlot"
        :item-id="outputSlot.itemId"
        :count="outputSlot.count"
        @click="onItemClick(outputSlot.itemId)"
      >
        <div class="slot output">
          <img :src="getImageUrl(outputSlot.itemId)" class="item-icon" @error="(e) => { (e.target as HTMLImageElement).src = '/placeholder.png'; }" />
          <span v-if="outputSlot.count > 1" class="count">{{ outputSlot.count }}</span>
        </div>
      </RecipeItemTooltip>
      <div v-else class="slot output empty" />
    </section>

    <section class="resource-rail">
      <span class="resource-label">MANA</span>
      <span class="resource-value">{{ manaLabel }}</span>
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
  opacity: 0.24;
}
.mist-a { width: 260px; height: 180px; left: -30px; top: -30px; background: radial-gradient(circle, rgba(110, 231, 183, 0.34), transparent 72%); }
.mist-b { width: 280px; height: 200px; right: -70px; bottom: -40px; background: radial-gradient(circle, rgba(103, 232, 249, 0.24), transparent 74%); }
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

.panel-output { border-color: rgba(245, 208, 138, 0.24); }

.panel-title {
  position: absolute;
  top: -9px;
  left: 12px;
  min-width: 96px;
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

.ritual-core {
  position: relative;
  z-index: 1;
  height: 286px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.ring {
  position: absolute;
  left: 50%;
  top: 50%;
  border-radius: 50%;
  border: 1px solid rgba(167, 243, 208, 0.26);
  transform: translate(-50%, -50%);
}

.outer { width: 260px; height: 260px; border-style: dashed; animation: spin 16s linear infinite; }
.middle { width: 214px; height: 214px; animation: spinReverse 12s linear infinite; }
.inner { width: 174px; height: 174px; opacity: 0.7; animation: pulse 3.2s ease-in-out infinite; }

.terra-platform {
  width: 84px;
  height: 84px;
  border-radius: 50%;
  background: radial-gradient(circle at 44% 34%, rgba(232, 255, 242, 0.92), rgba(126, 245, 182, 0.46) 45%, rgba(36, 136, 118, 0.26));
  box-shadow: inset 0 0 20px rgba(255, 255, 255, 0.16), 0 0 18px rgba(140, 248, 196, 0.2);
  animation: breathe 2.8s ease-in-out infinite;
}

.terra-platform-glow {
  position: absolute;
  width: 130px;
  height: 130px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(156, 255, 207, 0.14), transparent 70%);
  animation: pulse 3.2s ease-in-out infinite;
}

.core-label {
  position: absolute;
  bottom: 28px;
  padding: 4px 10px;
  border-radius: 999px;
  border: 1px solid rgba(178, 255, 221, 0.24);
  background: rgba(8, 26, 22, 0.72);
  color: #e8fff4;
  font-size: 12px;
}

.orbit-slot { position: absolute; }

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
  transform: scale(1.03);
  border-color: rgba(110, 231, 183, 0.56);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.12),
    0 0 0 1px rgba(110, 231, 183, 0.12),
    0 10px 18px rgba(16, 185, 129, 0.14);
}

.orbit {
  width: 48px;
  height: 48px;
  border-radius: 50%;
}

.output {
  width: 62px;
  height: 62px;
  border-color: rgba(245, 208, 138, 0.42);
}

.output:hover { border-color: rgba(245, 208, 138, 0.72); }
.empty { opacity: 0.35; }
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

@keyframes spin { from { transform: translate(-50%, -50%) rotate(0deg); } to { transform: translate(-50%, -50%) rotate(360deg); } }
@keyframes spinReverse { from { transform: translate(-50%, -50%) rotate(360deg); } to { transform: translate(-50%, -50%) rotate(0deg); } }
@keyframes pulse { 0%,100% { transform: scale(0.98); opacity: 0.56; } 50% { transform: scale(1.05); opacity: 0.92; } }
@keyframes breathe { 0%,100% { transform: scale(1); } 50% { transform: scale(1.07); } }

@media (max-width: 980px) {
  .ritual-ui { grid-template-columns: 1fr; }
  .ritual-core { height: 260px; }
}
</style>
