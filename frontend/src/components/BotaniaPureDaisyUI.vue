<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
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

const inputSlot = ref<ResolvedSlot | null>(null);
const outputSlot = ref<ResolvedSlot | null>(null);

async function initPureDaisy() {
  const inputs = await buildInputSlots(props.recipe);
  inputSlot.value = inputs.length > 0 ? inputs[0] : null;
  const outputs = await buildOutputSlots(props.recipe, 1);
  outputSlot.value = outputs.length > 0 ? outputs[0] : null;
}

function onItemClick(itemId: string) {
  playClick();
  emit('item-click', itemId);
}

onMounted(() => {
  void initPureDaisy();
});

watch(
  () => props.recipe,
  () => {
    void initPureDaisy();
  },
  { deep: true },
);
</script>

<template>
  <div class="ritual-ui ritual-daisy">
    <div class="scene-bg" aria-hidden="true">
      <div class="mist mist-a" />
      <div class="mist mist-b" />
      <div class="scene-grid" />
    </div>

    <section class="panel">
      <div class="panel-title">INPUT</div>
      <RecipeItemTooltip
        v-if="inputSlot"
        :item-id="inputSlot.itemId"
        :count="inputSlot.count"
        @click="onItemClick(inputSlot.itemId)"
      >
        <div class="slot">
          <img :src="getImageUrl(inputSlot.itemId)" class="item-icon" @error="(e) => { (e.target as HTMLImageElement).src = '/placeholder.png'; }" />
          <span v-if="inputSlot.count > 1" class="count">{{ inputSlot.count }}</span>
        </div>
      </RecipeItemTooltip>
      <div v-else class="slot empty" />
    </section>

    <section class="ritual-core daisy-core" aria-hidden="true">
      <div class="ring outer" />
      <div class="ring inner" />
      <div class="daisy-flower" />
      <div class="daisy-seed" />
      <div class="core-label">Pure Daisy</div>
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
  </div>
</template>

<style scoped>
.ritual-ui {
  --slot: 56px;
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
    radial-gradient(circle at top, rgba(244, 114, 182, 0.08), transparent 40%);
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
.mist-a { width: 260px; height: 180px; left: -30px; top: -30px; background: radial-gradient(circle, rgba(244, 114, 182, 0.4), transparent 72%); }
.mist-b { width: 280px; height: 200px; right: -70px; bottom: -40px; background: radial-gradient(circle, rgba(125, 211, 252, 0.24), transparent 74%); }
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

.ritual-core {
  position: relative;
  z-index: 1;
  height: 206px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.ring {
  position: absolute;
  border-radius: 50%;
  border: 1px solid rgba(244, 114, 182, 0.2);
}
.outer { width: 188px; height: 188px; border-style: dashed; animation: spin 14s linear infinite; }
.inner { width: 150px; height: 150px; animation: spinReverse 10s linear infinite; }

.daisy-flower {
  width: 104px;
  height: 104px;
  border-radius: 50%;
  background:
    radial-gradient(circle at 50% 0%, rgba(255, 255, 255, 0.94), rgba(255, 207, 230, 0.72) 58%, transparent 70%),
    radial-gradient(circle at 0% 50%, rgba(255, 255, 255, 0.92), rgba(255, 207, 230, 0.7) 58%, transparent 70%),
    radial-gradient(circle at 100% 50%, rgba(255, 255, 255, 0.92), rgba(255, 207, 230, 0.7) 58%, transparent 70%),
    radial-gradient(circle at 50% 100%, rgba(255, 255, 255, 0.94), rgba(255, 207, 230, 0.72) 58%, transparent 70%);
  filter: drop-shadow(0 0 18px rgba(255, 194, 227, 0.24));
  animation: pulse 2.8s ease-in-out infinite;
}

.daisy-seed {
  position: absolute;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(255, 239, 170, 0.95), rgba(255, 197, 105, 0.72));
  box-shadow: 0 0 12px rgba(255, 211, 146, 0.28);
}

.core-label {
  position: absolute;
  bottom: 14px;
  padding: 4px 10px;
  border-radius: 999px;
  border: 1px solid rgba(244, 114, 182, 0.24);
  background: rgba(34, 25, 47, 0.72);
  color: #ffeef9;
  font-size: 12px;
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
  border-color: rgba(244, 114, 182, 0.56);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.12),
    0 0 0 1px rgba(244, 114, 182, 0.12),
    0 10px 18px rgba(190, 24, 93, 0.12);
}

.slot.output {
  width: 62px;
  height: 62px;
  border-color: rgba(245, 208, 138, 0.42);
}

.slot.output:hover {
  border-color: rgba(245, 208, 138, 0.72);
}

.empty { opacity: 0.38; }
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

@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
@keyframes spinReverse { from { transform: rotate(360deg); } to { transform: rotate(0deg); } }
@keyframes pulse { 0%,100% { transform: scale(0.98); } 50% { transform: scale(1.06); } }

@media (max-width: 980px) {
  .ritual-ui { grid-template-columns: 1fr; }
  .ritual-core { height: 190px; }
}
</style>
