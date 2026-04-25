<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { getImageUrl, type Recipe } from '../services/api';
import type { UITypeConfig } from '../services/uiTypeMapping';
import { useSound } from '../services/sound.service';
import { buildInputSlots, buildOutputSlots, type ResolvedSlot } from '../composables/useRecipeSlots';
import { readPositiveIntegerMeta } from '../composables/ritualFamilyMetadata';
import RecipeItemTooltip from './RecipeItemTooltip.vue';
import AnimatedItemIcon from './AnimatedItemIcon.vue';

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
const lpCost = ref<number | null>(null);

const lpText = computed(() => (lpCost.value ? lpCost.value.toLocaleString() : '--'));
const arrayNodes = computed(() => {
  const total = inputSlots.value.length;
  if (!total) return [] as Array<{ left: string; top: string }>;

  const outerCount = Math.min(total, 8);
  const positions: Array<{ left: string; top: string }> = [];
  const outerRadiusX = 210;
  const outerRadiusY = 172;

  for (let i = 0; i < outerCount; i += 1) {
    const angle = (Math.PI * 2 * i) / outerCount - Math.PI / 2;
    positions.push({
      left: `calc(50% + ${Math.cos(angle) * outerRadiusX}px)`,
      top: `calc(50% + ${Math.sin(angle) * outerRadiusY}px)`,
    });
  }

  const innerCount = total - outerCount;
  if (innerCount > 0) {
    const innerRadiusX = 114;
    const innerRadiusY = 92;
    for (let i = 0; i < innerCount; i += 1) {
      const angle = (Math.PI * 2 * i) / innerCount - Math.PI / 2 + Math.PI / innerCount;
      positions.push({
        left: `calc(50% + ${Math.cos(angle) * innerRadiusX}px)`,
        top: `calc(50% + ${Math.sin(angle) * innerRadiusY}px)`,
      });
    }
  }

  return positions;
});

async function initAlchemy() {
  inputSlots.value = await buildInputSlots(props.recipe);
  const [firstOutput] = await buildOutputSlots(props.recipe, 1);
  outputSlot.value = firstOutput ?? null;
  lpCost.value = readPositiveIntegerMeta(props.recipe, ['lpCost', 'bloodCost', 'requiredLP', 'lifeEssence']);
}

function onItemClick(itemId: string) {
  playClick();
  emit('item-click', itemId);
}

function imageError(event: Event) {
  (event.target as HTMLImageElement).src = '/placeholder.png';
}

onMounted(() => {
  void initAlchemy();
});

watch(() => props.recipe, () => void initAlchemy(), { deep: true });
</script>

<template>
  <div class="blood-array-ui">
    <div class="ambient ambient-a" aria-hidden="true" />
    <div class="ambient ambient-b" aria-hidden="true" />

    <header class="array-header">
      <div class="title-block">
        <span class="eyebrow">Blood Magic</span>
        <h2>炼成阵列</h2>
      </div>

      <div class="cost-panel">
        <span>阵列消耗</span>
        <strong>{{ lpText }} LP</strong>
      </div>
    </header>

    <section class="array-stage">
      <div class="array-board">
        <div class="board-circle circle-a" />
        <div class="board-circle circle-b" />
        <div class="board-circle circle-c" />
        <div class="board-circle circle-d" />
        <div class="board-diamond diamond-a" />
        <div class="board-diamond diamond-b" />
        <div class="board-diamond diamond-c" />
        <div class="axis axis-h" />
        <div class="axis axis-v" />
        <div class="axis axis-h axis-h-soft" />
        <div class="axis axis-v axis-v-soft" />
        <div class="blood-thread blood-thread-a" />
        <div class="blood-thread blood-thread-b" />
        <div class="blood-thread blood-thread-c" />
        <div class="blood-thread blood-thread-d" />
        <div class="ritual-mist mist-a" />
        <div class="ritual-mist mist-b" />

        <div class="array-core">
          <div class="core-shadow" />
          <div class="core-ring" />
          <div class="core-ring inner" />
          <div class="core-pulse" />
          <div class="core-pulse secondary" />
          <RecipeItemTooltip
            v-if="outputSlot"
            :item-id="outputSlot.itemId"
            :count="outputSlot.count"
            @click="onItemClick(outputSlot.itemId)"
          >
            <button class="core-slot" type="button">
              <AnimatedItemIcon
                :item-id="outputSlot.itemId"
                :render-asset-ref="outputSlot.renderAssetRef || null"
                :image-file-name="outputSlot.imageFileName || null"
                :size="52"
              />
              <span v-if="outputSlot.count > 1">{{ outputSlot.count }}</span>
            </button>
          </RecipeItemTooltip>
          <div v-else class="core-slot is-empty" />
        </div>

        <div
          v-for="(slot, index) in inputSlots"
          :key="`${slot.itemId}-${index}`"
          class="array-node"
          :style="arrayNodes[index]"
        >
          <div class="node-link" aria-hidden="true" />
          <RecipeItemTooltip :item-id="slot.itemId" :count="slot.count" @click="onItemClick(slot.itemId)">
            <button class="node-slot" type="button">
              <AnimatedItemIcon
                :item-id="slot.itemId"
                :render-asset-ref="slot.renderAssetRef || null"
                :image-file-name="slot.imageFileName || null"
                :size="40"
              />
              <span v-if="slot.count > 1">{{ slot.count }}</span>
            </button>
          </RecipeItemTooltip>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.blood-array-ui {
  --gold-rgb: 183, 149, 99;
  --gold-soft-rgb: 238, 214, 168;
  --blood-rgb: 150, 28, 42;
  --blood-bright-rgb: 228, 84, 106;
  position: relative;
  width: min(1200px, calc(100vw - 56px));
  min-height: 640px;
  height: min(780px, calc(100vh - 200px));
  padding: 22px;
  border-radius: 28px;
  border: 1px solid rgba(var(--gold-rgb), 0.16);
  background:
    linear-gradient(180deg, rgba(18, 13, 18, 0.97), rgba(8, 7, 10, 1)),
    radial-gradient(circle at 50% 50%, rgba(var(--blood-rgb), 0.09), transparent 34%);
  box-shadow:
    0 28px 72px rgba(0, 0, 0, 0.5),
    inset 0 1px 0 rgba(255, 255, 255, 0.04);
  overflow: hidden;
}

.ambient {
  position: absolute;
  border-radius: 50%;
  filter: blur(48px);
  opacity: 0.18;
  pointer-events: none;
}

.ambient-a {
  width: 280px;
  height: 180px;
  left: -60px;
  top: 42px;
  background: rgba(var(--blood-rgb), 0.24);
}

.ambient-b {
  width: 360px;
  height: 240px;
  right: -100px;
  bottom: 36px;
  background: rgba(147, 51, 234, 0.12);
}

.array-header {
  position: relative;
  z-index: 1;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 18px;
  margin-bottom: 18px;
}

.eyebrow {
  display: block;
  color: rgba(var(--gold-soft-rgb), 0.86);
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.18em;
  text-transform: uppercase;
}

.title-block h2 {
  margin: 8px 0 10px;
  color: #f7ece2;
  font-size: 30px;
  line-height: 1;
}

.title-block p {
  margin: 0;
  max-width: 520px;
  color: rgba(255, 228, 231, 0.74);
  line-height: 1.65;
}

.cost-panel {
  min-width: 206px;
  padding: 12px 16px;
  border-radius: 16px;
  border: 1px solid rgba(var(--gold-rgb), 0.18);
  background:
    linear-gradient(180deg, rgba(58, 23, 30, 0.88), rgba(25, 14, 17, 0.96));
  box-shadow:
    0 0 20px rgba(var(--blood-rgb), 0.12),
    inset 0 1px 0 rgba(255, 255, 255, 0.04);
}

.cost-panel span {
  display: block;
  color: rgba(var(--gold-soft-rgb), 0.68);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

.cost-panel strong {
  display: block;
  margin-top: 8px;
  color: #fff1d7;
  font-size: 22px;
  line-height: 1;
}

.array-stage {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-columns: 1fr;
  gap: 0;
  align-items: stretch;
}

.array-board {
  position: relative;
  min-height: 580px;
  border-radius: 24px;
  border: 1px solid rgba(var(--gold-rgb), 0.14);
  background:
    linear-gradient(180deg, rgba(19, 15, 19, 0.95), rgba(10, 9, 12, 0.98)),
    radial-gradient(circle at center, rgba(var(--blood-rgb), 0.08), transparent 32%);
  overflow: hidden;
}

.board-circle,
.board-diamond {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  pointer-events: none;
}

.board-circle {
  border-radius: 50%;
  border: 1px dashed rgba(var(--gold-rgb), 0.18);
}

.circle-a {
  width: 470px;
  height: 470px;
}

.circle-b {
  width: 304px;
  height: 304px;
  border-color: rgba(var(--blood-bright-rgb), 0.20);
}

.circle-c {
  width: 164px;
  height: 164px;
  border-style: solid;
  border-color: rgba(var(--gold-rgb), 0.16);
}

.circle-d {
  width: 540px;
  height: 540px;
  border-color: rgba(var(--blood-bright-rgb), 0.08);
}

.board-diamond {
  width: 396px;
  height: 396px;
  border: 1px solid rgba(var(--gold-rgb), 0.10);
  transform: translate(-50%, -50%) rotate(45deg);
}

.diamond-b {
  width: 214px;
  height: 214px;
  border-color: rgba(var(--blood-bright-rgb), 0.12);
}

.diamond-c {
  width: 548px;
  height: 548px;
  border-color: rgba(var(--gold-rgb), 0.06);
}

.axis {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  pointer-events: none;
}

.axis-h {
  width: 520px;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(var(--gold-rgb), 0.16), transparent);
}

.axis-v {
  width: 1px;
  height: 520px;
  background: linear-gradient(180deg, transparent, rgba(var(--gold-rgb), 0.14), transparent);
}

.axis-h-soft {
  width: 360px;
  background: linear-gradient(90deg, transparent, rgba(var(--blood-bright-rgb), 0.16), transparent);
}

.axis-v-soft {
  height: 360px;
  background: linear-gradient(180deg, transparent, rgba(var(--blood-bright-rgb), 0.14), transparent);
}

.blood-thread {
  position: absolute;
  left: 50%;
  top: 50%;
  height: 1px;
  transform-origin: left center;
  background: linear-gradient(90deg, rgba(var(--blood-bright-rgb), 0.28), transparent 78%);
  pointer-events: none;
  filter: blur(0.2px);
}

.blood-thread-a {
  width: 228px;
  transform: translate(0, 0) rotate(-45deg);
}

.blood-thread-b {
  width: 228px;
  transform: translate(0, 0) rotate(45deg);
}

.blood-thread-c {
  width: 228px;
  transform: translate(0, 0) rotate(135deg);
}

.blood-thread-d {
  width: 228px;
  transform: translate(0, 0) rotate(-135deg);
}

.ritual-mist {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.mist-a {
  background: radial-gradient(circle at 50% 50%, rgba(var(--blood-rgb), 0.06), transparent 28%);
}

.mist-b {
  background: radial-gradient(circle at 50% 50%, rgba(var(--gold-rgb), 0.04), transparent 42%);
}

.rune-track {
  position: absolute;
  left: 50%;
  width: 54%;
  display: flex;
  justify-content: space-between;
  transform: translateX(-50%);
  color: rgba(var(--gold-soft-rgb), 0.64);
  font-size: 15px;
  text-shadow: 0 0 16px rgba(var(--gold-rgb), 0.12);
}

.rune-track.top { top: 18%; }
.rune-track.bottom { bottom: 18%; }

.array-core {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  z-index: 2;
}

.core-shadow {
  position: absolute;
  inset: -32px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(var(--blood-rgb), 0.18), transparent 72%);
  filter: blur(18px);
  pointer-events: none;
}

.core-ring {
  position: absolute;
  inset: -18px;
  border-radius: 50%;
  border: 1px solid rgba(var(--gold-rgb), 0.16);
  pointer-events: none;
}

.core-ring.inner {
  inset: -8px;
  border-color: rgba(var(--blood-bright-rgb), 0.18);
}

.core-pulse {
  position: absolute;
  inset: -28px;
  border-radius: 50%;
  border: 1px solid rgba(var(--blood-bright-rgb), 0.12);
  opacity: 0.34;
  animation: corePulse 4.8s ease-in-out infinite;
  pointer-events: none;
}

.core-pulse.secondary {
  inset: -46px;
  border-color: rgba(var(--gold-rgb), 0.08);
  animation-duration: 6.4s;
}

.core-slot {
  position: relative;
  width: 88px;
  height: 88px;
  display: grid;
  place-items: center;
  border-radius: 18px;
  border: 1px solid rgba(var(--gold-rgb), 0.22);
  background:
    radial-gradient(circle at 50% 28%, rgba(var(--gold-soft-rgb), 0.10), transparent 42%),
    linear-gradient(180deg, rgba(66, 22, 31, 0.96), rgba(18, 10, 14, 1));
  box-shadow:
    0 0 26px rgba(var(--blood-rgb), 0.16),
    inset 0 1px 0 rgba(255, 255, 255, 0.05);
  cursor: pointer;
  transition: transform 180ms ease, box-shadow 180ms ease;
}

.core-slot:hover {
  transform: translateY(-2px);
}

.core-slot.is-empty { opacity: 0.3; }

.core-slot img,
.node-slot img {
  width: 52px;
  height: 52px;
  image-rendering: pixelated;
}

.node-slot img {
  width: 40px;
  height: 40px;
}

.core-slot span,
.node-slot span {
  position: absolute;
  right: 6px;
  bottom: 4px;
  color: #fff;
  font-size: 11px;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.8);
}

.array-node {
  position: absolute;
  transform: translate(-50%, -50%);
  z-index: 2;
}

.node-link {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 2px;
  height: 176px;
  transform-origin: top center;
  transform: translate(-50%, -50%) rotate(90deg);
  background: linear-gradient(180deg, rgba(var(--blood-bright-rgb), 0.34), rgba(var(--gold-rgb), 0.08) 52%, transparent);
  pointer-events: none;
  filter: blur(0.2px);
}

.node-slot {
  position: relative;
  width: 68px;
  height: 68px;
  display: grid;
  place-items: center;
  border-radius: 16px;
  border: 1px solid rgba(var(--gold-rgb), 0.18);
  background:
    radial-gradient(circle at 50% 28%, rgba(var(--gold-soft-rgb), 0.08), transparent 40%),
    linear-gradient(180deg, rgba(54, 21, 28, 0.94), rgba(18, 10, 13, 0.98));
  box-shadow:
    0 0 18px rgba(var(--blood-rgb), 0.12),
    inset 0 1px 0 rgba(255, 255, 255, 0.04);
  cursor: pointer;
  transition: transform 180ms ease, box-shadow 180ms ease;
}

.node-slot:hover {
  transform: translateY(-2px);
}

@keyframes corePulse {
  0%, 100% {
    transform: scale(0.94);
    opacity: 0.18;
  }
  50% {
    transform: scale(1.06);
    opacity: 0.42;
  }
}

@media (max-width: 980px) {
  .blood-alchemy-ui {
    height: auto;
  }

  .ritual-board {
    min-height: 500px;
  }
}
</style>
