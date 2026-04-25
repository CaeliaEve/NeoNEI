<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { getImageUrl, type Recipe } from '../services/api';
import type { UITypeConfig } from '../services/uiTypeMapping';
import { useSound } from '../services/sound.service';
import { buildInputSlots, buildOutputSlots, type ResolvedSlot } from '../composables/useRecipeSlots';
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

const inputSlot = ref<ResolvedSlot | null>(null);
const outputSlot = ref<ResolvedSlot | null>(null);

async function initBinding() {
  const [firstInput] = await buildInputSlots(props.recipe);
  const [firstOutput] = await buildOutputSlots(props.recipe, 1);
  inputSlot.value = firstInput ?? null;
  outputSlot.value = firstOutput ?? null;
}

function onItemClick(itemId: string) {
  playClick();
  emit('item-click', itemId);
}

function imageError(event: Event) {
  (event.target as HTMLImageElement).src = '/placeholder.png';
}

onMounted(() => void initBinding());
watch(() => props.recipe, () => void initBinding(), { deep: true });
</script>

<template>
  <div class="binding-ritual-ui">
    <div class="ambient ambient-a" />
    <div class="ambient ambient-b" />

    <header class="binding-header">
      <span class="eyebrow">Blood Magic</span>
      <h2>绑定仪式</h2>
    </header>

    <section class="binding-stage">
      <div class="ritual-side side-left">
        <span class="side-label">输入</span>
        <RecipeItemTooltip
          v-if="inputSlot"
          :item-id="inputSlot.itemId"
          :count="inputSlot.count"
          @click="onItemClick(inputSlot.itemId)"
        >
          <button class="artifact-slot" type="button">
            <AnimatedItemIcon
              :item-id="inputSlot.itemId"
              :render-asset-ref="inputSlot.renderAssetRef || null"
              :image-file-name="inputSlot.imageFileName || null"
              :size="60"
            />
            <span v-if="inputSlot.count > 1">{{ inputSlot.count }}</span>
          </button>
        </RecipeItemTooltip>
        <div v-else class="artifact-slot is-empty" />
      </div>

      <div class="seal-sanctum">
        <div class="field-ring ring-a" />
        <div class="field-ring ring-b" />
        <div class="field-ring ring-c" />

        <div class="seal-thread thread-left" />
        <div class="seal-thread thread-right" />
        <div class="seal-thread thread-center" />

        <div class="ritual-stone">
          <div class="stone-shadow" />
          <div class="stone-shell outer" />
          <div class="stone-shell inner" />
          <div class="stone-crack" />
          <div class="stone-rune rune-a" />
          <div class="stone-rune rune-b" />
          <div class="stone-rune rune-c" />
          <div class="stone-pulse" />
          <div class="stone-flare flare-a" />
          <div class="stone-flare flare-b" />
          <div class="stone-flare flare-c" />
        </div>
      </div>

      <div class="ritual-side side-right">
        <span class="side-label">输出</span>
        <RecipeItemTooltip
          v-if="outputSlot"
          :item-id="outputSlot.itemId"
          :count="outputSlot.count"
          @click="onItemClick(outputSlot.itemId)"
        >
          <button class="artifact-slot is-output" type="button">
            <AnimatedItemIcon
              :item-id="outputSlot.itemId"
              :render-asset-ref="outputSlot.renderAssetRef || null"
              :image-file-name="outputSlot.imageFileName || null"
              :size="60"
            />
            <span v-if="outputSlot.count > 1">{{ outputSlot.count }}</span>
          </button>
        </RecipeItemTooltip>
        <div v-else class="artifact-slot is-empty is-output" />
      </div>
    </section>
  </div>
</template>

<style scoped>
.binding-ritual-ui {
  --gold-rgb: 181, 149, 103;
  --gold-soft-rgb: 234, 212, 173;
  --blood-rgb: 137, 27, 43;
  --blood-bright-rgb: 216, 78, 96;
  --jade-rgb: 122, 150, 139;
  position: relative;
  width: min(1120px, calc(100vw - 56px));
  min-height: 620px;
  height: min(760px, calc(100vh - 210px));
  padding: 22px;
  border-radius: 28px;
  border: 1px solid rgba(var(--gold-rgb), 0.16);
  background:
    linear-gradient(180deg, rgba(15, 12, 16, 0.97), rgba(8, 7, 10, 0.995)),
    radial-gradient(circle at 50% 50%, rgba(var(--blood-rgb), 0.08), transparent 34%);
  box-shadow:
    0 28px 72px rgba(0, 0, 0, 0.5),
    inset 0 1px 0 rgba(255, 255, 255, 0.04);
  overflow: hidden;
}

.ambient {
  position: absolute;
  border-radius: 50%;
  filter: blur(52px);
  opacity: 0.18;
  pointer-events: none;
}

.ambient-a {
  width: 260px;
  height: 180px;
  left: -40px;
  top: 42px;
  background: rgba(var(--blood-bright-rgb), 0.16);
}

.ambient-b {
  width: 300px;
  height: 220px;
  right: -70px;
  bottom: 30px;
  background: rgba(var(--jade-rgb), 0.10);
}

.binding-header {
  position: relative;
  z-index: 1;
  margin-bottom: 18px;
}

.eyebrow {
  display: block;
  color: rgba(var(--gold-soft-rgb), 0.84);
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.18em;
  text-transform: uppercase;
}

.binding-header h2 {
  margin: 10px 0 0;
  color: #f7ece2;
  font-size: 30px;
}

.binding-stage {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-columns: 220px minmax(0, 1fr) 220px;
  gap: 22px;
  align-items: center;
  min-height: 540px;
}

.ritual-side {
  min-height: 320px;
  display: grid;
  place-items: center;
  align-content: center;
  gap: 18px;
  border-radius: 22px;
  border: 1px solid rgba(var(--gold-rgb), 0.12);
  background:
    linear-gradient(180deg, rgba(24, 18, 22, 0.94), rgba(10, 9, 12, 0.98));
}

.side-label {
  color: rgba(var(--gold-soft-rgb), 0.84);
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

.artifact-slot {
  position: relative;
  width: 88px;
  height: 88px;
  display: grid;
  place-items: center;
  border-radius: 18px;
  border: 1px solid rgba(var(--gold-rgb), 0.18);
  background:
    radial-gradient(circle at 50% 28%, rgba(var(--gold-soft-rgb), 0.08), transparent 40%),
    linear-gradient(180deg, rgba(51, 20, 28, 0.96), rgba(18, 11, 14, 1));
  box-shadow:
    0 0 20px rgba(var(--blood-rgb), 0.14),
    inset 0 1px 0 rgba(255, 255, 255, 0.05);
  cursor: pointer;
}

.artifact-slot.is-output {
  border-color: rgba(var(--blood-bright-rgb), 0.24);
}

.artifact-slot.is-empty {
  opacity: 0.3;
  cursor: default;
}

.artifact-slot img {
  width: 60px;
  height: 60px;
  image-rendering: pixelated;
}

.artifact-slot span {
  position: absolute;
  right: 7px;
  bottom: 5px;
  color: #fff;
  font-size: 11px;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.8);
}

.seal-sanctum {
  position: relative;
  min-height: 560px;
  border-radius: 24px;
  border: 1px solid rgba(var(--gold-rgb), 0.12);
  background:
    linear-gradient(180deg, rgba(18, 15, 19, 0.96), rgba(9, 9, 12, 0.99)),
    radial-gradient(circle at 50% 50%, rgba(var(--blood-rgb), 0.08), transparent 30%);
  overflow: hidden;
}

.field-ring {
  position: absolute;
  left: 50%;
  top: 50%;
  border-radius: 50%;
  transform: translate(-50%, -50%);
  pointer-events: none;
}

.ring-a {
  width: 420px;
  height: 420px;
  border: 1px solid rgba(var(--gold-rgb), 0.12);
}

.ring-b {
  width: 270px;
  height: 270px;
  border: 1px dashed rgba(var(--blood-bright-rgb), 0.18);
}

.ring-c {
  width: 156px;
  height: 156px;
  border: 1px solid rgba(var(--gold-rgb), 0.14);
}

.seal-thread {
  position: absolute;
  left: 50%;
  top: 50%;
  background: linear-gradient(180deg, transparent, rgba(var(--blood-bright-rgb), 0.30), transparent);
  pointer-events: none;
}

.thread-left {
  width: 2px;
  height: 320px;
  transform: translate(-80px, -50%) rotate(14deg);
}

.thread-right {
  width: 2px;
  height: 320px;
  transform: translate(78px, -50%) rotate(-14deg);
}

.thread-center {
  width: 1px;
  height: 360px;
  transform: translate(-50%, -50%);
}

.ritual-stone {
  position: absolute;
  left: 50%;
  top: 48%;
  width: 180px;
  height: 220px;
  transform: translate(-50%, -50%);
}

.stone-shadow {
  position: absolute;
  inset: 26% 18% 10%;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(0, 0, 0, 0.34), transparent 72%);
  filter: blur(18px);
}

.stone-shell {
  position: absolute;
  inset: 0;
  clip-path: polygon(50% 4%, 72% 16%, 84% 40%, 82% 74%, 66% 90%, 50% 96%, 34% 90%, 18% 74%, 16% 40%, 28% 16%);
}

.stone-shell.outer {
  transform: scale(1.04);
  border: 1px solid rgba(var(--gold-rgb), 0.18);
  background:
    linear-gradient(180deg, rgba(var(--gold-rgb), 0.05), rgba(255,255,255,0) 24%, rgba(var(--gold-rgb), 0.05) 100%);
}

.stone-shell.inner {
  inset: 12%;
  border: 1px solid rgba(var(--jade-rgb), 0.10);
  background:
    linear-gradient(180deg, rgba(92, 84, 74, 0.18), rgba(34, 30, 28, 0.92) 28%, rgba(14, 13, 14, 0.98) 100%);
  box-shadow:
    inset 0 16px 22px rgba(255,255,255,0.04),
    inset 0 -18px 24px rgba(0,0,0,0.34);
}

.stone-crack {
  position: absolute;
  left: 50%;
  top: 18%;
  bottom: 18%;
  width: 1px;
  transform: translateX(-50%);
  background: linear-gradient(180deg, transparent, rgba(var(--blood-bright-rgb), 0.24), transparent);
  box-shadow: 0 0 14px rgba(var(--blood-soft-rgb), 0.10);
}

.stone-rune {
  position: absolute;
  width: 44px;
  height: 2px;
  border-radius: 999px;
  background: linear-gradient(180deg, rgba(var(--gold-rgb), 0.16), rgba(var(--gold-rgb), 0.04));
  box-shadow: 0 0 10px rgba(var(--gold-rgb), 0.06);
}

.rune-a {
  top: 40%;
  left: 50%;
  transform: translateX(-50%);
}

.rune-b {
  top: 58%;
  left: 50%;
  width: 72px;
  transform: translateX(-50%);
}

.rune-c {
  bottom: 18%;
  left: 50%;
  width: 52px;
  transform: translateX(-50%);
}

.stone-pulse {
  position: absolute;
  inset: 30% 22%;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(var(--blood-soft-rgb), 0.22), rgba(var(--blood-soft-rgb), 0.04) 58%, transparent 100%);
  filter: blur(10px);
  animation: stonePulse 5.4s ease-in-out infinite;
}

.stone-flare {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 2px;
  border-radius: 999px;
  background: linear-gradient(180deg, transparent, rgba(var(--blood-bright-rgb), 0.34), transparent);
  transform-origin: center center;
  pointer-events: none;
  filter: blur(0.3px);
}

.flare-a {
  height: 182px;
  transform: translate(-50%, -50%) rotate(0deg);
  animation: flarePulse 4.8s ease-in-out infinite;
}

.flare-b {
  height: 150px;
  transform: translate(-50%, -50%) rotate(58deg);
  animation: flarePulse 5.8s ease-in-out infinite reverse;
}

.flare-c {
  height: 150px;
  transform: translate(-50%, -50%) rotate(-58deg);
  animation: flarePulse 6.2s ease-in-out infinite;
}

@keyframes stonePulse {
  0%, 100% {
    transform: scale(0.92);
    opacity: 0.22;
  }
  50% {
    transform: scale(1.06);
    opacity: 0.40;
  }
}

@keyframes flarePulse {
  0%, 100% {
    opacity: 0.16;
    filter: blur(0.3px);
  }
  50% {
    opacity: 0.52;
    filter: blur(1px);
  }
}

@media (max-width: 980px) {
  .binding-ritual-ui {
    height: auto;
  }

  .binding-stage {
    grid-template-columns: 1fr;
  }
}
</style>
