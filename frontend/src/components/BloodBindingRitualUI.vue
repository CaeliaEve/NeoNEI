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

const machineLabel = computed(() => props.recipe.machineInfo?.machineType?.trim() || 'Binding Ritual');
const subtitle = computed(() => machineLabel.value === 'Binding Ritual' ? 'Soul-forged binding' : machineLabel.value);

async function initBindingRitual() {
  const [firstInput] = await buildInputSlots(props.recipe);
  const [firstOutput] = await buildOutputSlots(props.recipe, 1);
  inputSlot.value = firstInput ?? null;
  outputSlot.value = firstOutput ?? null;
}

function handleItemClick(itemId: string) {
  playClick();
  emit('item-click', itemId);
}

onMounted(() => {
  void initBindingRitual();
});

watch(
  () => props.recipe,
  () => {
    void initBindingRitual();
  },
  { deep: true },
);
</script>

<template>
  <div class="blood-ui binding-ui">
    <div class="scene-bg" aria-hidden="true">
      <div class="mist mist-a" />
      <div class="mist mist-b" />
      <div class="scene-grid" />
    </div>

    <header class="ritual-header">
      <div class="ritual-title-shell">
        <div class="ritual-title">BINDING RITUAL</div>
        <div class="ritual-subtitle">{{ subtitle }}</div>
      </div>
      <div class="ritual-badge">Binding</div>
    </header>

    <section class="ritual-stage">
      <section class="panel">
        <div class="panel-title">INPUT</div>
        <div class="slot-wrap">
          <RecipeItemTooltip
            v-if="inputSlot"
            :item-id="inputSlot.itemId"
            :count="inputSlot.count"
            @click="handleItemClick(inputSlot.itemId)"
          >
            <div class="slot">
              <img :src="getImageUrl(inputSlot.itemId)" class="item-icon" @error="(e) => { (e.target as HTMLImageElement).src = '/placeholder.png'; }" />
              <span v-if="inputSlot.count > 1" class="count">{{ inputSlot.count }}</span>
            </div>
          </RecipeItemTooltip>
          <div v-else class="slot empty" />
        </div>
      </section>

      <section class="ritual-core" aria-hidden="true">
        <div class="ring outer" />
        <div class="ring inner" />
        <div class="binding-frame" />
        <div class="binding-sigil" />
        <div class="sigil-chip">BIND</div>
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
    radial-gradient(circle at top, rgba(190, 24, 93, 0.14), transparent 40%);
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

.ritual-title-shell { display: flex; flex-direction: column; gap: 2px; }
.ritual-title {
  font-size: 15px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: #ffd8df;
}
.ritual-subtitle { font-size: 12px; color: #cc9ea6; }
.ritual-badge {
  padding: 6px 10px;
  border-radius: 999px;
  border: 1px solid rgba(244, 114, 182, 0.28);
  background: rgba(73, 12, 22, 0.66);
  color: #ffd8df;
  font-size: 12px;
}

.ritual-stage {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-columns: 1fr auto 1fr;
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
  min-height: 220px;
}

.panel::after {
  content: '';
  position: absolute;
  inset: 8px;
  border: 1px solid rgba(255, 255, 255, 0.04);
  border-radius: 10px;
  pointer-events: none;
}

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

.slot-wrap {
  min-height: 170px;
  display: grid;
  place-items: center;
}

.slot {
  position: relative;
  width: 54px;
  height: 54px;
  display: grid;
  place-items: center;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  background: rgba(0, 0, 0, 0.28);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.04);
}

.slot.output { box-shadow: 0 0 22px rgba(248, 113, 113, 0.16), inset 0 0 0 1px rgba(255, 255, 255, 0.05); }
.slot.empty { opacity: 0.35; }
.item-icon { width: 32px; height: 32px; image-rendering: pixelated; }
.count {
  position: absolute;
  right: 4px;
  bottom: 3px;
  font-size: 11px;
  font-weight: 700;
  color: #fff;
  text-shadow: 0 1px 2px rgba(0,0,0,0.8);
}

.ritual-core {
  position: relative;
  width: 250px;
  height: 250px;
  display: grid;
  place-items: center;
}

.ring {
  position: absolute;
  border-radius: 999px;
  border: 2px solid rgba(59, 130, 246, 0.55);
}
.ring.outer { width: 208px; height: 208px; }
.ring.inner { width: 160px; height: 160px; opacity: 0.7; }
.binding-frame {
  position: absolute;
  width: 110px;
  height: 110px;
  border: 1px solid rgba(244, 114, 182, 0.22);
  background: linear-gradient(135deg, rgba(100, 14, 33, 0.2), rgba(42, 10, 18, 0.72));
  transform: rotate(45deg);
  border-radius: 12px;
  box-shadow: 0 0 30px rgba(190, 24, 93, 0.18);
}
.binding-sigil {
  width: 68px;
  height: 68px;
  transform: rotate(45deg);
  background: linear-gradient(135deg, rgba(190, 24, 93, 0.72), rgba(127, 29, 29, 0.88));
  border: 1px solid rgba(253, 164, 175, 0.42);
  box-shadow: 0 0 20px rgba(248, 113, 113, 0.28);
}
.sigil-chip {
  position: absolute;
  bottom: 14px;
  min-width: 98px;
  text-align: center;
  padding: 10px 14px;
  border-radius: 14px;
  border: 1px solid rgba(190, 24, 93, 0.25);
  background: linear-gradient(180deg, rgba(76, 5, 25, 0.86), rgba(58, 8, 19, 0.96));
  color: #f8cdd6;
  font-size: 12px;
  letter-spacing: 0.14em;
  font-weight: 700;
}

@media (max-width: 860px) {
  .blood-ui { width: min(100%, 96vw); }
  .ritual-stage { grid-template-columns: 1fr; }
  .ritual-core { order: -1; margin: 0 auto; width: 220px; height: 220px; }
  .ring.outer { width: 184px; height: 184px; }
  .ring.inner { width: 142px; height: 142px; }
}
</style>
