<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
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

const inputSlots = ref<ResolvedSlot[]>([]);
const outputSlot = ref<ResolvedSlot | null>(null);
const machineLabel = computed(() => props.recipe.machineInfo?.machineType?.trim() || 'Blood Orb Synthesis');

async function initOrb() {
  inputSlots.value = (await buildInputSlots(props.recipe)).filter(Boolean);
  const [firstOutput] = await buildOutputSlots(props.recipe, 1);
  outputSlot.value = firstOutput ?? null;
}

function onItemClick(itemId: string) {
  playClick();
  emit('item-click', itemId);
}

function imageError(event: Event) {
  (event.target as HTMLImageElement).src = '/placeholder.png';
}

onMounted(() => void initOrb());
watch(() => props.recipe, () => void initOrb(), { deep: true });
</script>

<template>
  <div class="blood-orb-ui">
    <div class="orb-ambient">
      <div class="halo halo-a" />
      <div class="halo halo-b" />
    </div>

    <header class="orb-header">
      <span class="eyebrow">Orb Craft</span>
      <h2>{{ machineLabel }}</h2>
    </header>

    <section class="orb-stage">
      <div class="matrix-panel">
        <span class="panel-kicker">Catalysts</span>
        <div class="matrix-grid">
          <template v-for="(slot, index) in inputSlots" :key="`${slot.itemId}-${index}`">
            <RecipeItemTooltip :item-id="slot.itemId" :count="slot.count" @click="onItemClick(slot.itemId)">
              <button class="small-slot" type="button">
                <img :src="getImageUrl(slot.itemId)" :alt="slot.itemId" @error="imageError" />
                <span v-if="slot.count > 1">{{ slot.count }}</span>
              </button>
            </RecipeItemTooltip>
          </template>
        </div>
      </div>

      <div class="orb-core">
        <div class="core-ring outer" />
        <div class="core-ring inner" />
        <div class="orb-heart" />
        <div class="orb-caption">ORB FOCUS</div>
      </div>

      <div class="result-panel">
        <span class="panel-kicker">Result</span>
        <RecipeItemTooltip
          v-if="outputSlot"
          :item-id="outputSlot.itemId"
          :count="outputSlot.count"
          @click="onItemClick(outputSlot.itemId)"
        >
          <button class="result-slot" type="button">
            <img :src="getImageUrl(outputSlot.itemId)" :alt="outputSlot.itemId" @error="imageError" />
            <span v-if="outputSlot.count > 1">{{ outputSlot.count }}</span>
          </button>
        </RecipeItemTooltip>
        <div v-else class="result-slot is-empty" />
      </div>
    </section>
  </div>
</template>

<style scoped>
.blood-orb-ui {
  position: relative;
  width: min(1180px, calc(100vw - 56px));
  min-height: 620px;
  height: min(760px, calc(100vh - 210px));
  padding: 24px;
  border-radius: 28px;
  border: 1px solid rgba(148, 163, 184, 0.18);
  background:
    linear-gradient(180deg, rgba(14, 10, 14, 0.96), rgba(6, 5, 9, 0.99)),
    radial-gradient(circle at 50% 50%, rgba(239, 68, 68, 0.08), transparent 34%);
  box-shadow: 0 28px 70px rgba(0,0,0,0.44);
  overflow: hidden;
}
.orb-ambient { position: absolute; inset: 0; pointer-events: none; }
.halo {
  position: absolute;
  border-radius: 50%;
  filter: blur(46px);
  opacity: 0.22;
}
.halo-a { width: 360px; height: 220px; left: 10%; top: 8%; background: rgba(244, 114, 182, 0.2); }
.halo-b { width: 380px; height: 240px; right: 8%; bottom: 10%; background: rgba(190, 24, 93, 0.18); }
.orb-header {
  position: relative;
  z-index: 1;
  margin-bottom: 18px;
}
.eyebrow {
  display: block;
  color: #f8d084;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.2em;
  text-transform: uppercase;
}
.orb-header h2 {
  margin: 10px 0 0;
  color: #ffe4e7;
  font-size: 30px;
}
.orb-stage {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-columns: 280px minmax(280px, 1fr) 220px;
  gap: 24px;
  align-items: center;
  height: calc(100% - 90px);
}
.matrix-panel,
.result-panel {
  min-height: 260px;
  padding: 18px;
  border-radius: 20px;
  border: 1px solid rgba(148, 163, 184, 0.14);
  background: linear-gradient(180deg, rgba(24, 14, 20, 0.92), rgba(9, 8, 12, 0.96));
}
.panel-kicker {
  display: block;
  margin-bottom: 14px;
  color: rgba(255, 232, 176, 0.84);
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}
.matrix-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}
.small-slot,
.result-slot {
  position: relative;
  width: 72px;
  height: 72px;
  display: grid;
  place-items: center;
  border-radius: 16px;
  border: 1px solid rgba(236, 72, 153, 0.26);
  background: linear-gradient(180deg, rgba(54, 16, 28, 0.9), rgba(18, 10, 14, 0.96));
  cursor: pointer;
}
.result-slot {
  width: 84px;
  height: 84px;
  border-color: rgba(244, 194, 118, 0.28);
}
.small-slot.is-empty,
.result-slot.is-empty {
  opacity: 0.3;
  cursor: default;
}
.small-slot img,
.result-slot img {
  width: 46px;
  height: 46px;
  image-rendering: pixelated;
}
.result-slot img { width: 56px; height: 56px; }
.small-slot span,
.result-slot span {
  position: absolute;
  right: 6px;
  bottom: 5px;
  color: #fff;
  font-size: 11px;
}
.result-panel {
  display: grid;
  place-items: center;
}
.orb-core {
  position: relative;
  min-height: 420px;
  display: grid;
  place-items: center;
}
.core-ring {
  position: absolute;
  border-radius: 50%;
  border: 1px dashed rgba(236, 72, 153, 0.3);
}
.core-ring.outer { width: 300px; height: 300px; }
.core-ring.inner { width: 196px; height: 196px; border-color: rgba(244, 194, 118, 0.28); }
.orb-heart {
  width: 110px;
  height: 110px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(255, 215, 223, 0.92), rgba(220, 38, 38, 0.86) 28%, rgba(127, 29, 29, 0.94) 62%);
  box-shadow: 0 0 38px rgba(236, 72, 153, 0.26);
}
.orb-caption {
  position: absolute;
  bottom: 62px;
  padding: 10px 18px;
  border-radius: 999px;
  border: 1px solid rgba(236, 72, 153, 0.24);
  background: rgba(55, 19, 25, 0.82);
  color: #ffd8df;
  font-weight: 800;
  letter-spacing: 0.18em;
}
@media (max-width: 980px) {
  .blood-orb-ui {
    height: auto;
  }
  .orb-stage {
    grid-template-columns: 1fr;
  }
}
</style>
