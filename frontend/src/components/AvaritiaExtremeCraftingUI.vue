<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, shallowRef, triggerRef, watch } from 'vue';
import { getImageUrl, type Recipe, type RecipeItem } from '../services/api';
import type { UITypeConfig } from '../services/uiTypeMapping';
import RecipeItemTooltip from './RecipeItemTooltip.vue';
import { useSound } from '../services/sound.service';

interface Props {
  recipe: Recipe;
  uiConfig?: UITypeConfig;
}

interface Emits {
  (e: 'item-click', itemId: string): void;
}

interface SlotVariant {
  itemId: string;
  count: number;
}

interface SlotCell {
  variants: SlotVariant[];
  activeIndex: number;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();
const { playClick } = useSound();

const gridWidth = 9;
const maxGridHeight = 9;
const slotCells = shallowRef<Array<SlotCell | null>>([]);
const hoveredIndex = ref<number | null>(null);
let cycleTimer: number | null = null;

const parseVariants = (entry: RecipeItem | RecipeItem[] | null | undefined): SlotVariant[] => {
  if (!entry) return [];
  const list = Array.isArray(entry) ? entry : [entry];
  return list
    .filter((it): it is RecipeItem => Boolean(it?.itemId))
    .map((it) => ({
      itemId: String(it.itemId),
      count: typeof it.count === 'number' && Number.isFinite(it.count) ? Math.max(1, it.count) : 1,
    }));
};

const rebuildGrid = () => {
  const next = Array.from({ length: gridWidth * maxGridHeight }, () => null as SlotCell | null);
  const rows = Array.isArray(props.recipe.inputs) ? props.recipe.inputs : [];

  for (let r = 0; r < Math.min(rows.length, maxGridHeight); r++) {
    const row = Array.isArray(rows[r]) ? rows[r] : [];
    for (let c = 0; c < Math.min(row.length, gridWidth); c++) {
      const variants = parseVariants(row[c]);
      if (variants.length > 0) {
        next[r * gridWidth + c] = { variants, activeIndex: 0 };
      }
    }
  }

  slotCells.value = next;
  triggerRef(slotCells);
};

const cycleAlternatives = () => {
  for (const cell of slotCells.value) {
    if (cell && cell.variants.length > 1) {
      cell.activeIndex = (cell.activeIndex + 1) % cell.variants.length;
    }
  }
  triggerRef(slotCells);
};

const outputItem = computed(() => props.recipe.outputs?.[0] ?? null);

const onItemClick = (itemId: string) => {
  playClick();
  emit('item-click', itemId);
};

watch(
  () => props.recipe,
  () => {
    rebuildGrid();
  },
  { deep: true, immediate: true },
);

onMounted(() => {
  cycleTimer = window.setInterval(cycleAlternatives, 1700);
});

onUnmounted(() => {
  if (cycleTimer !== null) {
    clearInterval(cycleTimer);
  }
});
</script>

<template>
  <div class="extreme-ui">
    <div class="cosmos-bg" aria-hidden="true">
      <div class="nebula nebula-a" />
      <div class="nebula nebula-b" />
      <div class="starfield" />
      <div class="vortex-ring ring-a" />
      <div class="vortex-ring ring-b" />
    </div>

    <div class="frame">
      <section class="input-panel">
        <div class="panel-title">Input Matrix</div>
        <div class="grid-shell">
          <div class="grid-9x9">
          <template v-for="(cell, idx) in slotCells" :key="`xslot-${idx}`">
            <div
              class="slot"
              :class="{ empty: !cell, hovered: hoveredIndex === idx }"
              @mouseenter="hoveredIndex = idx"
              @mouseleave="hoveredIndex = null"
            >
              <template v-if="cell">
                <RecipeItemTooltip
                  :item-id="cell.variants[cell.activeIndex].itemId"
                  :count="cell.variants[cell.activeIndex].count"
                  @click="onItemClick(cell.variants[cell.activeIndex].itemId)"
                >
                  <div class="slot-inner">
                    <img
                      :src="getImageUrl(cell.variants[cell.activeIndex].itemId)"
                      class="item-icon"
                      @error="(e) => { (e.target as HTMLImageElement).src = '/placeholder.png'; }"
                    />
                    <span v-if="cell.variants[cell.activeIndex].count > 1" class="item-count">
                      {{ cell.variants[cell.activeIndex].count }}
                    </span>
                  </div>
                </RecipeItemTooltip>
                <span v-if="cell.variants.length > 1" class="alt-badge">
                  {{ cell.activeIndex + 1 }}/{{ cell.variants.length }}
                </span>
              </template>
            </div>
          </template>
          </div>
        </div>
      </section>

      <section class="arrow-panel" aria-hidden="true">
        <div class="arrow-lane">
          <div class="beam" />
          <svg class="arrow" viewBox="0 0 24 24">
            <path d="M4 11h12.17l-5.59-5.59L12 4l8 8-8 8-1.41-1.41L16.17 13H4v-2z" />
          </svg>
        </div>
      </section>

      <section class="output-panel">
        <div class="panel-title panel-title-output">Output</div>
        <div class="output-stage">
          <div class="singularity" aria-hidden="true" />
          <RecipeItemTooltip
            v-if="outputItem?.itemId"
            :item-id="outputItem.itemId"
            :count="outputItem.count"
            @click="onItemClick(outputItem.itemId)"
          >
            <div class="slot output-slot">
              <div class="slot-inner">
                <img
                  :src="getImageUrl(outputItem.itemId)"
                  class="item-icon output-icon"
                  @error="(e) => { (e.target as HTMLImageElement).src = '/placeholder.png'; }"
                />
                <span v-if="outputItem.count > 1" class="item-count">{{ outputItem.count }}</span>
              </div>
            </div>
          </RecipeItemTooltip>
          <div v-else class="slot output-slot empty" />
        </div>
      </section>
    </div>

    <div class="label">Extreme 9x9</div>
  </div>
</template>

<style scoped>
.extreme-ui {
  --slot: clamp(30px, 1.62vw, 36px);
  --gap: 4px;
  position: relative;
  display: grid;
  gap: 10px;
  justify-items: center;
  padding: 14px 16px;
  overflow: hidden;
  border-radius: 18px;
}

.cosmos-bg {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background:
    radial-gradient(circle at top, rgba(245, 208, 138, 0.08), transparent 38%),
    radial-gradient(150% 150% at 50% 55%, #0f1221 0%, #080b14 42%, #05070e 100%);
}

.nebula {
  position: absolute;
  border-radius: 999px;
  filter: blur(22px);
  mix-blend-mode: screen;
  opacity: 0.42;
}

.nebula-a {
  width: 52%;
  height: 48%;
  left: -6%;
  top: -10%;
  background: radial-gradient(circle, rgba(102, 227, 255, 0.42), rgba(102, 227, 255, 0));
  animation: driftA 16s ease-in-out infinite;
}

.nebula-b {
  width: 54%;
  height: 54%;
  right: -8%;
  bottom: -16%;
  background: radial-gradient(circle, rgba(133, 103, 255, 0.38), rgba(133, 103, 255, 0));
  animation: driftB 19s ease-in-out infinite;
}

.starfield {
  position: absolute;
  inset: -10%;
  background-image:
    radial-gradient(circle at 8% 14%, rgba(255, 255, 255, 0.85) 0 1px, transparent 1.4px),
    radial-gradient(circle at 21% 72%, rgba(140, 236, 255, 0.9) 0 1px, transparent 1.4px),
    radial-gradient(circle at 38% 33%, rgba(255, 242, 201, 0.85) 0 1px, transparent 1.4px),
    radial-gradient(circle at 58% 20%, rgba(255, 255, 255, 0.75) 0 1px, transparent 1.4px),
    radial-gradient(circle at 64% 77%, rgba(172, 224, 255, 0.82) 0 1px, transparent 1.4px),
    radial-gradient(circle at 81% 46%, rgba(255, 255, 255, 0.76) 0 1px, transparent 1.4px),
    radial-gradient(circle at 92% 18%, rgba(255, 241, 204, 0.84) 0 1px, transparent 1.4px);
  opacity: 0.36;
  animation: starPulse 5.2s ease-in-out infinite;
}

.vortex-ring {
  position: absolute;
  left: 50%;
  top: 56%;
  width: 74%;
  height: 74%;
  border-radius: 999px;
  transform: translate(-50%, -50%);
  border: 1px solid rgba(167, 228, 255, 0.18);
  box-shadow: inset 0 0 44px rgba(107, 206, 255, 0.09);
}

.ring-a {
  animation: rotateRing 18s linear infinite;
}

.ring-b {
  width: 56%;
  height: 56%;
  border-color: rgba(243, 207, 140, 0.2);
  animation: rotateRingReverse 13s linear infinite;
}

.frame {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-columns: auto auto auto;
  gap: 10px;
  align-items: center;
  width: 100%;
  padding: 14px 12px 12px;
  border-radius: 18px;
  border: 1px solid rgba(148, 163, 184, 0.22);
  background:
    linear-gradient(180deg, rgba(9, 13, 20, 0.95), rgba(6, 10, 16, 0.98)),
    radial-gradient(circle at top, rgba(245, 208, 138, 0.08), transparent 42%);
  box-shadow:
    0 18px 50px rgba(2, 8, 23, 0.38),
    inset 0 1px 0 rgba(255, 255, 255, 0.06);
}

.input-panel,
.output-panel {
  position: relative;
  padding: 18px 12px 12px;
  border-radius: 12px;
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

.input-panel::after,
.output-panel::after {
  content: '';
  position: absolute;
  inset: 8px;
  border: 1px solid rgba(255, 255, 255, 0.04);
  border-radius: 8px;
  pointer-events: none;
}

.output-panel {
  border-color: rgba(245, 208, 138, 0.26);
  background:
    linear-gradient(180deg, rgba(32, 27, 20, 0.92), rgba(16, 13, 10, 0.98)),
    radial-gradient(circle at top, rgba(245, 208, 138, 0.08), transparent 48%),
    url('/textures/nei/recipebg.png');
  background-repeat: no-repeat, no-repeat, repeat;
  background-size: auto, auto, 96px 96px;
}

.panel-title {
  position: absolute;
  top: -9px;
  left: 12px;
  min-width: 104px;
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

.grid-shell,
.output-stage {
  position: relative;
  z-index: 1;
}

.grid-9x9 {
  display: grid;
  grid-template-columns: repeat(9, var(--slot));
  grid-template-rows: repeat(9, var(--slot));
  gap: var(--gap);
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
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.06),
    0 6px 12px rgba(2, 8, 23, 0.28);
  transition: border-color 0.22s ease, box-shadow 0.22s ease, transform 0.22s ease;
}

.slot::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: radial-gradient(circle at 30% 25%, rgba(255, 255, 255, 0.14), transparent 48%);
  opacity: 0.55;
  pointer-events: none;
}

.slot.empty {
  opacity: 0.45;
}

.slot.hovered,
.slot:hover {
  transform: translateY(-1px);
  border-color: rgba(103, 232, 249, 0.7);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.14),
    0 0 0 1px rgba(34, 211, 238, 0.18),
    0 10px 18px rgba(8, 145, 178, 0.2);
}

.slot-inner {
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.item-icon {
  width: 82%;
  height: 82%;
  object-fit: contain;
  image-rendering: pixelated;
  image-rendering: crisp-edges;
  filter: drop-shadow(0 1px 2px rgba(15, 23, 42, 0.6));
}

.output-slot {
  width: clamp(56px, 3.2vw, 72px);
  height: clamp(56px, 3.2vw, 72px);
  border-radius: 10px;
  border-color: rgba(217, 182, 122, 0.3);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.06),
    0 6px 12px rgba(2, 8, 23, 0.28);
}

.output-slot:hover {
  border-color: rgba(245, 208, 138, 0.78);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.14),
    0 0 0 1px rgba(245, 208, 138, 0.12),
    0 10px 18px rgba(180, 83, 9, 0.18);
}

.output-icon {
  width: 82%;
  height: 82%;
  filter: drop-shadow(0 1px 2px rgba(15, 23, 42, 0.6));
}

.singularity {
  position: absolute;
  left: 50%;
  top: 53%;
  width: 92px;
  height: 92px;
  transform: translate(-50%, -50%);
  pointer-events: none;
  border-radius: 999px;
  background: radial-gradient(circle at 50% 50%, rgba(255, 235, 187, 0.42) 0 16%, rgba(123, 203, 255, 0.14) 42%, rgba(123, 203, 255, 0) 72%);
  filter: blur(0.2px);
  animation: singularityPulse 3.4s ease-in-out infinite;
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
  font-weight: 700;
  line-height: 1;
  color: #f8fafc;
  text-shadow: 0 1px 1px rgba(15, 23, 42, 0.92);
}

.alt-badge {
  position: absolute;
  left: 2px;
  top: 2px;
  padding: 1px 3px;
  border-radius: 999px;
  background: rgba(255, 244, 214, 0.94);
  border: 1px solid rgba(251, 191, 36, 0.24);
  color: #9a3412;
  font-size: 8px;
  font-weight: 700;
  line-height: 1;
}

.arrow-panel {
  position: relative;
  width: 40px;
  align-self: stretch;
  display: flex;
  align-items: center;
  justify-content: center;
}

.arrow-lane {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.beam {
  position: absolute;
  left: 3px;
  right: 7px;
  top: 50%;
  height: 6px;
  transform: translateY(-50%);
  background: url('/textures/nei/dash.png') center / 100% 2px no-repeat;
  opacity: 0.55;
}

.arrow {
  position: relative;
  z-index: 1;
  width: 18px;
  height: 18px;
  color: rgba(210, 218, 230, 0.86);
}

.arrow path {
  fill: currentColor;
}

.label {
  position: relative;
  z-index: 1;
  border: 1px solid rgba(148, 163, 184, 0.24);
  border-radius: 8px;
  padding: 4px 8px;
  background: rgba(8, 16, 25, 0.72);
  color: #eaf8ff;
  font-size: 12px;
  letter-spacing: 0.08em;
}

@keyframes starPulse {
  0%, 100% { opacity: 0.3; transform: scale(1); }
  50% { opacity: 0.48; transform: scale(1.02); }
}

@keyframes rotateRing {
  from { transform: translate(-50%, -50%) rotate(0deg); }
  to { transform: translate(-50%, -50%) rotate(360deg); }
}

@keyframes rotateRingReverse {
  from { transform: translate(-50%, -50%) rotate(360deg); }
  to { transform: translate(-50%, -50%) rotate(0deg); }
}

@keyframes driftA {
  0%, 100% { transform: translate(0, 0) scale(1); }
  50% { transform: translate(14px, 9px) scale(1.06); }
}

@keyframes driftB {
  0%, 100% { transform: translate(0, 0) scale(1); }
  50% { transform: translate(-12px, -8px) scale(1.07); }
}

@keyframes singularityPulse {
  0%, 100% { opacity: 0.66; transform: translate(-50%, -50%) scale(0.96); }
  50% { opacity: 1; transform: translate(-50%, -50%) scale(1.06); }
}

@media (max-width: 1280px) {
  .frame {
    grid-template-columns: 1fr;
    justify-items: center;
  }

  .arrow-panel {
    width: 100%;
    min-height: 18px;
  }

  .arrow-lane {
    transform: rotate(90deg);
  }
}
</style>
