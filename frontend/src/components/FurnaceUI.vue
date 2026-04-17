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
  compact?: boolean;
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
  <div class="furnace-ui" :class="{ 'is-compact': compact }">
    <div class="scene-bg" aria-hidden="true" />

    <div class="furnace-shell">
      <section class="furnace-panel input-panel">
        <div class="panel-kicker">INPUT</div>
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

      <div class="heat-core" aria-hidden="true">
        <div class="thermal-track">
          <span class="thermal-line line-a" />
          <span class="thermal-line line-b" />
          <span class="thermal-line line-c" />
          <span class="thermal-node node-a" />
          <span class="thermal-node node-b" />
        </div>
        <div class="thermal-core">
          <span class="thermal-core-ring" />
          <span class="thermal-core-glow" />
        </div>
      </div>

      <section class="furnace-panel furnace-panel-output">
        <div class="panel-kicker panel-kicker-output">OUTPUT</div>
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

    <div class="thermal-caption">Thermal smelting chamber</div>
  </div>
</template>

<style scoped>
.furnace-ui {
  --furnace-cold-rgb: 126, 176, 230;
  --furnace-heat-rgb: 249, 115, 22;
  --furnace-gold-rgb: 251, 191, 36;
  --furnace-slot-size: 84px;
  --furnace-icon-size: 58px;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: min(1180px, calc(100vw - 56px));
  min-height: 560px;
  height: min(680px, calc(100vh - 220px));
  padding: 24px;
  overflow: hidden;
}

.scene-bg {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background:
    radial-gradient(circle at 50% 52%, rgba(var(--furnace-heat-rgb), 0.18), transparent 34%),
    radial-gradient(circle at 18% 40%, rgba(var(--furnace-cold-rgb), 0.10), transparent 30%),
    radial-gradient(circle at 82% 48%, rgba(var(--furnace-gold-rgb), 0.10), transparent 28%),
    linear-gradient(180deg, rgba(8, 12, 18, 0.97), rgba(4, 8, 14, 0.99));
}

.scene-bg::before {
  content: '';
  position: absolute;
  inset: 0;
  background:
    linear-gradient(rgba(180, 205, 235, 0.024) 1px, transparent 1px),
    linear-gradient(90deg, rgba(180, 205, 235, 0.024) 1px, transparent 1px);
  background-size: 24px 24px;
  opacity: 0.72;
  mask-image: radial-gradient(circle at center, #000 0 66%, transparent 96%);
}

.scene-bg::after {
  content: '';
  position: absolute;
  inset: -30%;
  background:
    radial-gradient(circle at 50% 50%, rgba(var(--furnace-heat-rgb), 0.09), transparent 34%),
    radial-gradient(circle at 50% 62%, rgba(var(--furnace-gold-rgb), 0.05), transparent 26%);
  opacity: 0.72;
}

.furnace-shell {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-columns: 220px minmax(360px, 430px) 220px;
  align-items: center;
  justify-content: center;
  gap: 50px;
  width: min(960px, 100%);
  min-height: 500px;
  padding: 54px 64px 52px;
  border-radius: 30px;
  border: 1px solid rgba(148, 163, 184, 0.20);
  background:
    radial-gradient(circle at 50% 50%, rgba(var(--furnace-heat-rgb), 0.12), transparent 38%),
    linear-gradient(180deg, rgba(12, 18, 28, 0.95), rgba(5, 9, 16, 0.99));
  box-shadow:
    0 24px 64px rgba(2, 8, 23, 0.52),
    0 0 0 1px rgba(var(--furnace-heat-rgb), 0.05),
    inset 0 1px 0 rgba(255, 255, 255, 0.06);
}

.furnace-shell::before {
  content: '';
  position: absolute;
  inset: 28px;
  border-radius: 24px;
  border: 1px solid rgba(148, 163, 184, 0.08);
  background:
    linear-gradient(90deg, transparent 0 27%, rgba(var(--furnace-cold-rgb), 0.04) 36%, transparent 43%, rgba(var(--furnace-heat-rgb), 0.06) 50%, transparent 57%, rgba(var(--furnace-gold-rgb), 0.04) 66%, transparent 74%),
    radial-gradient(circle at 50% 50%, rgba(var(--furnace-heat-rgb), 0.08), transparent 32%);
  pointer-events: none;
}

.furnace-panel {
  position: relative;
  z-index: 1;
  display: grid;
  place-items: center;
  min-height: 248px;
  padding: 34px 28px 28px;
  border: 1px solid rgba(var(--furnace-cold-rgb), 0.36);
  border-radius: 24px;
  background:
    radial-gradient(circle at 50% 0%, rgba(var(--furnace-cold-rgb), 0.18), transparent 50%),
    linear-gradient(180deg, rgba(15, 24, 38, 0.97), rgba(5, 10, 18, 0.99));
  box-shadow:
    inset 0 0 0 1px rgba(255, 255, 255, 0.04),
    0 14px 28px rgba(2, 8, 23, 0.32),
    0 0 20px rgba(var(--furnace-cold-rgb), 0.08);
}

.furnace-panel::after {
  content: '';
  position: absolute;
  inset: 8px;
  border: 1px solid rgba(255, 255, 255, 0.045);
  border-radius: 18px;
  pointer-events: none;
}

.furnace-panel-output {
  border-color: rgba(var(--furnace-gold-rgb), 0.48);
  background:
    radial-gradient(circle at 50% 0%, rgba(var(--furnace-gold-rgb), 0.22), transparent 52%),
    linear-gradient(180deg, rgba(41, 29, 15, 0.98), rgba(12, 8, 5, 0.99));
  box-shadow:
    inset 0 0 0 1px rgba(255, 255, 255, 0.04),
    0 14px 28px rgba(2, 8, 23, 0.32),
    0 0 24px rgba(var(--furnace-gold-rgb), 0.10);
}

.panel-kicker {
  position: absolute;
  top: 16px;
  left: 18px;
  color: #8fc7e8;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.26em;
  text-transform: uppercase;
}

.panel-kicker-output {
  color: #f8d084;
}

.slot-row {
  display: flex;
  gap: 4px;
  justify-content: center;
  align-items: center;
  min-height: var(--furnace-slot-size);
}

.furnace-slot {
  position: relative;
  width: var(--furnace-slot-size);
  height: var(--furnace-slot-size);
  border-radius: 18px;
  border: 1px solid rgba(var(--furnace-cold-rgb), 0.48);
  background:
    radial-gradient(circle at 34% 28%, rgba(210, 230, 255, 0.16), transparent 42%),
    linear-gradient(180deg, rgba(14, 24, 40, 0.98), rgba(4, 9, 18, 0.99));
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.06),
    0 8px 16px rgba(2, 8, 23, 0.34),
    0 0 16px rgba(var(--furnace-cold-rgb), 0.12);
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
  border-color: rgba(var(--furnace-gold-rgb), 0.72);
  background:
    radial-gradient(circle at 34% 28%, rgba(255, 232, 176, 0.22), transparent 42%),
    linear-gradient(180deg, rgba(43, 30, 14, 0.98), rgba(11, 7, 4, 0.99));
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.08),
    0 0 24px rgba(var(--furnace-gold-rgb), 0.24),
    0 8px 16px rgba(2, 8, 23, 0.34);
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
    linear-gradient(180deg, rgba(8, 12, 18, 0.72), rgba(6, 10, 16, 0.82));
  border-color: rgba(148, 163, 184, 0.16);
  opacity: 0.5;
}

.item-icon {
  width: var(--furnace-icon-size);
  height: var(--furnace-icon-size);
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

.heat-core {
  position: relative;
  z-index: 1;
  display: grid;
  place-items: center;
  min-height: 390px;
}

.thermal-track {
  position: absolute;
  left: 18px;
  right: 18px;
  top: 50%;
  height: 118px;
  transform: translateY(-50%);
  pointer-events: none;
}

.thermal-line {
  position: absolute;
  left: 0;
  right: 0;
  height: 1px;
  border-radius: 999px;
  background:
    linear-gradient(90deg, transparent, rgba(var(--furnace-cold-rgb), 0.18) 30%, rgba(var(--furnace-heat-rgb), 0.30) 50%, rgba(var(--furnace-gold-rgb), 0.18) 70%, transparent);
  box-shadow:
    0 0 12px rgba(var(--furnace-heat-rgb), 0.12),
    0 0 28px rgba(var(--furnace-gold-rgb), 0.04);
  opacity: 0.78;
}

.line-a { top: 20px; opacity: 0.44; }
.line-b { top: 58px; height: 2px; opacity: 0.86; }
.line-c { bottom: 20px; opacity: 0.44; }

.thermal-line::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg, transparent 0 18%, rgba(255, 238, 190, 0.72) 42%, transparent 62%);
  transform: translateX(-72%);
  animation: thermalDrift 3.8s cubic-bezier(0.42, 0, 0.18, 1) infinite;
}

.line-a::after { animation-delay: 0.55s; opacity: 0.44; }
.line-c::after { animation-delay: 1.05s; opacity: 0.38; }

.thermal-node {
  content: '';
  position: absolute;
  top: 50%;
  width: 11px;
  height: 11px;
  border-radius: 999px;
  transform: translate(-50%, -50%);
  background: radial-gradient(circle, rgba(255, 239, 205, 0.82), rgba(var(--furnace-heat-rgb), 0.34) 45%, transparent 72%);
  box-shadow: 0 0 18px rgba(var(--furnace-heat-rgb), 0.22);
  animation: nodeBreathe 4.2s ease-in-out infinite;
}

.node-a { left: 28%; opacity: 0.48; }
.node-b { left: 72%; opacity: 0.62; animation-delay: 0.8s; }

.thermal-core {
  position: relative;
  width: 132px;
  height: 132px;
  border-radius: 32px;
  border: 1px solid rgba(var(--furnace-heat-rgb), 0.20);
  background:
    radial-gradient(circle at 50% 50%, rgba(255, 219, 153, 0.18), transparent 34%),
    linear-gradient(135deg, rgba(24, 34, 48, 0.92), rgba(7, 12, 19, 0.98));
  box-shadow:
    inset 0 0 24px rgba(var(--furnace-heat-rgb), 0.07),
    0 12px 28px rgba(2, 8, 23, 0.34),
    0 0 34px rgba(var(--furnace-heat-rgb), 0.08);
}

.thermal-core-ring,
.thermal-core-glow {
  position: absolute;
  inset: 18px;
  border-radius: 50%;
  pointer-events: none;
}

.thermal-core-ring {
  border: 1px solid rgba(var(--furnace-gold-rgb), 0.20);
}

.thermal-core-glow {
  background: radial-gradient(circle, rgba(255, 230, 174, 0.48), rgba(var(--furnace-heat-rgb), 0.14) 38%, transparent 70%);
  filter: blur(4px);
  animation: heatGlow 4.2s ease-in-out infinite;
}

.thermal-caption {
  position: absolute;
  z-index: 2;
  left: 50%;
  bottom: 34px;
  transform: translateX(-50%);
  color: rgba(238, 242, 255, 0.48);
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.24em;
  text-transform: uppercase;
}

@keyframes thermalDrift {
  0% { opacity: 0; transform: translateX(-72%); }
  18% { opacity: 0.72; }
  70% { opacity: 0.44; }
  100% { opacity: 0; transform: translateX(74%); }
}

@keyframes nodeBreathe {
  0%, 100% { transform: translate(-50%, -50%) scale(0.86); opacity: 0.32; }
  50% { transform: translate(-50%, -50%) scale(1.08); opacity: 0.68; }
}

@keyframes heatGlow {
  0%, 100% { opacity: 0.36; }
  50% { opacity: 0.58; }
}

@media (max-width: 640px) {
  .furnace-ui {
    width: min(100%, 520px);
    min-height: 720px;
  }

  .furnace-shell {
    grid-template-columns: 1fr;
    gap: 20px;
    width: 100%;
    padding: 30px 24px 56px;
  }

  .heat-core {
    min-height: 260px;
  }

  .thermal-core {
    width: 112px;
    height: 112px;
  }
}
</style>
