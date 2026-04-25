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

const inputSlot = ref<ResolvedSlot | null>(null);
const outputSlot = ref<ResolvedSlot | null>(null);
const bloodCost = ref<number | null>(null);
const tier = ref<number | null>(null);
const consumptionRate = ref<number | null>(null);
const drainRate = ref<number | null>(null);

const bloodCostText = computed(() => (bloodCost.value ? bloodCost.value.toLocaleString() : '--'));
const tierText = computed(() => (tier.value ? `T${tier.value}` : '--'));
const consumptionText = computed(() => (consumptionRate.value ? `${consumptionRate.value}/t` : '--'));
const drainText = computed(() => (drainRate.value ? `${drainRate.value}/t` : '--'));

async function initAltar() {
  const [firstInput] = await buildInputSlots(props.recipe);
  const [firstOutput] = await buildOutputSlots(props.recipe, 1);
  inputSlot.value = firstInput ?? null;
  outputSlot.value = firstOutput ?? null;
  bloodCost.value = readPositiveIntegerMeta(props.recipe, ['bloodCost', 'lpCost', 'requiredLP', 'lifeEssence']);
  tier.value = readPositiveIntegerMeta(props.recipe, ['tier', 'altarTier', 'requiredTier']);
  consumptionRate.value = readPositiveIntegerMeta(props.recipe, ['consumptionRate', 'consumption']);
  drainRate.value = readPositiveIntegerMeta(props.recipe, ['drainRate', 'drain']);
}

function onItemClick(itemId: string) {
  playClick();
  emit('item-click', itemId);
}

function imageError(event: Event) {
  (event.target as HTMLImageElement).src = '/placeholder.png';
}

onMounted(() => {
  void initAltar();
});

watch(() => props.recipe, () => void initAltar(), { deep: true });
</script>

<template>
  <div class="blood-altar-ui">
    <header class="altar-header">
      <div class="title-block">
        <span class="eyebrow">Blood Magic</span>
        <h2>血祭坛</h2>
      </div>

      <div class="metrics">
        <div class="metric">
          <span>祭坛等级</span>
          <strong>{{ tierText }}</strong>
        </div>
        <div class="metric">
          <span>LP 消耗</span>
          <strong>{{ bloodCostText }}</strong>
        </div>
        <div class="metric">
          <span>消耗速率</span>
          <strong>{{ consumptionText }}</strong>
        </div>
        <div class="metric">
          <span>抽取速率</span>
          <strong>{{ drainText }}</strong>
        </div>
      </div>
    </header>

    <section class="altar-stage">
      <aside class="side-panel side-input">
        <span class="panel-label">输入</span>
        <RecipeItemTooltip
          v-if="inputSlot"
          :item-id="inputSlot.itemId"
          :count="inputSlot.count"
          @click="onItemClick(inputSlot.itemId)"
        >
          <button class="item-slot" type="button">
            <AnimatedItemIcon
              :item-id="inputSlot.itemId"
              :render-asset-ref="inputSlot.renderAssetRef || null"
              :image-file-name="inputSlot.imageFileName || null"
              :size="60"
            />
            <span v-if="inputSlot.count > 1">{{ inputSlot.count }}</span>
          </button>
        </RecipeItemTooltip>
        <div v-else class="item-slot is-empty" />
      </aside>

      <div class="altar-center">
        <div class="center-shadow" aria-hidden="true" />
        <div class="field-ring ring-a" aria-hidden="true" />
        <div class="field-ring ring-b" aria-hidden="true" />
        <div class="field-ring ring-c" aria-hidden="true" />

        <div class="rune-band band-top" aria-hidden="true">
          <span>☰</span>
          <span>✦</span>
          <span>⌬</span>
          <span>☵</span>
          <span>⟡</span>
          <span>☷</span>
        </div>
        <div class="rune-band band-bottom" aria-hidden="true">
          <span>⌘</span>
          <span>✶</span>
          <span>☴</span>
          <span>⟁</span>
          <span>☶</span>
          <span>◈</span>
        </div>

        <div class="particle-lane lane-left" aria-hidden="true">
          <span class="particle p1" />
          <span class="particle p2" />
          <span class="particle p3" />
          <span class="particle p4" />
          <span class="particle p5" />
        </div>
        <div class="particle-lane lane-right" aria-hidden="true">
          <span class="particle p1" />
          <span class="particle p2" />
          <span class="particle p3" />
          <span class="particle p4" />
          <span class="particle p5" />
        </div>

        <div class="relic-rig" aria-hidden="true">
          <div class="hanger hanger-left" />
          <div class="hanger hanger-mid" />
          <div class="hanger hanger-right" />

          <div class="crossbar" />
          <div class="crossbar lower" />

          <div class="anchor anchor-left" />
          <div class="anchor anchor-mid" />
          <div class="anchor anchor-right" />

          <div class="relic-frame frame-back" />
          <div class="relic-frame frame-front" />
          <div class="relic-core-body" />
          <div class="relic-window" />
          <div class="relic-seam" />
          <div class="relic-plate plate-top" />
          <div class="relic-plate plate-mid" />
          <div class="relic-plate plate-low" />
          <div class="talisman talisman-left">⌘</div>
          <div class="talisman talisman-right">⟐</div>
          <div class="inner-bloom" />
        </div>
      </div>

      <aside class="side-panel side-output">
        <span class="panel-label">输出</span>
        <RecipeItemTooltip
          v-if="outputSlot"
          :item-id="outputSlot.itemId"
          :count="outputSlot.count"
          @click="onItemClick(outputSlot.itemId)"
        >
          <button class="item-slot is-output" type="button">
            <AnimatedItemIcon
              :item-id="outputSlot.itemId"
              :render-asset-ref="outputSlot.renderAssetRef || null"
              :image-file-name="outputSlot.imageFileName || null"
              :size="60"
            />
            <span v-if="outputSlot.count > 1">{{ outputSlot.count }}</span>
          </button>
        </RecipeItemTooltip>
        <div v-else class="item-slot is-empty is-output" />
      </aside>
    </section>
  </div>
</template>

<style scoped>
.blood-altar-ui {
  --gold-rgb: 184, 151, 104;
  --gold-soft-rgb: 234, 214, 178;
  --blood-rgb: 118, 24, 38;
  --blood-soft-rgb: 165, 46, 58;
  --jade-rgb: 135, 170, 152;
  width: min(1120px, calc(100vw - 64px));
  min-height: 580px;
  height: min(720px, calc(100vh - 220px));
  padding: 18px;
  border-radius: 24px;
  border: 1px solid rgba(var(--gold-rgb), 0.14);
  background:
    radial-gradient(circle at 50% 0%, rgba(var(--gold-soft-rgb), 0.02), transparent 24%),
    linear-gradient(180deg, rgba(18, 20, 27, 0.995), rgba(8, 10, 14, 1));
  box-shadow:
    0 24px 64px rgba(0, 0, 0, 0.48),
    inset 0 1px 0 rgba(255, 255, 255, 0.04);
  overflow: hidden;
}

.altar-header {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 18px;
  align-items: center;
  padding-bottom: 14px;
  border-bottom: 1px solid rgba(var(--gold-rgb), 0.10);
}

.eyebrow {
  display: block;
  color: rgba(var(--gold-soft-rgb), 0.82);
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

.title-block h2 {
  margin: 8px 0 0;
  color: #f4ecdf;
  font-size: 28px;
  line-height: 1;
}

.metrics {
  display: grid;
  grid-template-columns: repeat(4, minmax(110px, 1fr));
  gap: 10px;
}

.metric {
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px solid rgba(var(--gold-rgb), 0.12);
  background: linear-gradient(180deg, rgba(31, 34, 43, 0.96), rgba(15, 17, 23, 0.98));
}

.metric span {
  display: block;
  color: rgba(var(--gold-soft-rgb), 0.62);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.08em;
}

.metric strong {
  display: block;
  margin-top: 6px;
  color: #f5edde;
  font-size: 18px;
  line-height: 1;
}

.altar-stage {
  height: calc(100% - 72px);
  display: grid;
  grid-template-columns: 160px minmax(0, 1fr) 160px;
  align-items: stretch;
  gap: 18px;
  padding-top: 18px;
}

.side-panel {
  display: grid;
  place-items: center;
  align-content: center;
  gap: 16px;
  border-radius: 18px;
  border: 1px solid rgba(var(--gold-rgb), 0.10);
  background: linear-gradient(180deg, rgba(23, 26, 34, 0.96), rgba(11, 12, 17, 0.98));
}

.panel-label {
  color: rgba(var(--gold-soft-rgb), 0.84);
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.item-slot {
  position: relative;
  width: 88px;
  height: 88px;
  display: grid;
  place-items: center;
  border-radius: 16px;
  border: 1px solid rgba(var(--gold-rgb), 0.16);
  background:
    radial-gradient(circle at 50% 28%, rgba(var(--gold-soft-rgb), 0.08), transparent 40%),
    linear-gradient(180deg, rgba(40, 34, 30, 0.98), rgba(17, 16, 16, 1));
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
  cursor: pointer;
  transition: transform 180ms ease, box-shadow 180ms ease, border-color 180ms ease;
}

.item-slot.is-output {
  border-color: rgba(var(--blood-rgb), 0.26);
}

.item-slot:not(.is-empty):hover {
  transform: translateY(-2px);
  box-shadow:
    0 0 16px rgba(var(--gold-soft-rgb), 0.08),
    0 0 18px rgba(var(--blood-rgb), 0.08),
    inset 0 1px 0 rgba(255, 255, 255, 0.05);
}

.item-slot.is-empty {
  opacity: 0.3;
  cursor: default;
}

.item-slot img {
  width: 60px;
  height: 60px;
  image-rendering: pixelated;
}

.item-slot span {
  position: absolute;
  right: 7px;
  bottom: 5px;
  color: #f7f0e2;
  font-size: 11px;
  font-weight: 700;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.84);
}

.altar-center {
  position: relative;
  display: grid;
  place-items: center;
  border-radius: 22px;
  border: 1px solid rgba(var(--gold-rgb), 0.12);
  background:
    linear-gradient(180deg, rgba(21, 24, 31, 0.98), rgba(10, 12, 17, 1)),
    radial-gradient(circle at 50% 50%, rgba(var(--blood-rgb), 0.03), transparent 36%);
  overflow: hidden;
}

.center-shadow {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(circle at center, rgba(var(--gold-rgb), 0.03), transparent 30%),
    radial-gradient(circle at center, transparent 56%, rgba(0, 0, 0, 0.22) 100%);
}

.field-ring {
  position: absolute;
  left: 50%;
  top: 50%;
  border-radius: 50%;
  transform: translate(-50%, -50%);
}

.ring-a {
  width: 360px;
  height: 360px;
  border: 1px solid rgba(var(--gold-rgb), 0.10);
}

.ring-b {
  width: 246px;
  height: 246px;
  border: 1px dashed rgba(var(--gold-rgb), 0.12);
}

.ring-c {
  width: 136px;
  height: 136px;
  border: 1px solid rgba(var(--jade-rgb), 0.08);
}

.rune-band {
  position: absolute;
  left: 50%;
  width: 64%;
  display: flex;
  justify-content: space-between;
  transform: translateX(-50%);
  color: rgba(var(--gold-soft-rgb), 0.36);
  font-size: 14px;
  text-shadow:
    0 0 8px rgba(var(--gold-rgb), 0.08),
    0 0 16px rgba(var(--jade-rgb), 0.03);
}

.band-top {
  top: 18%;
  animation: runeShift 8s ease-in-out infinite;
}

.band-bottom {
  bottom: 18%;
  animation: runeShift 10s ease-in-out infinite reverse;
}

.particle-lane {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 34%;
  pointer-events: none;
  mask-image: linear-gradient(90deg, rgba(0, 0, 0, 0.04), #000 22%, #000 78%, rgba(0, 0, 0, 0.04));
}

.lane-left {
  left: 0;
}

.lane-right {
  right: 0;
  transform: scaleX(-1);
}

.particle {
  position: absolute;
  left: 14%;
  border-radius: 999px;
  background:
    radial-gradient(circle, rgba(255,255,255,0.74) 0%, rgba(var(--jade-rgb), 0.36) 34%, rgba(var(--gold-rgb), 0.10) 64%, rgba(var(--jade-rgb), 0) 100%);
  box-shadow:
    0 0 10px rgba(var(--jade-rgb), 0.12),
    0 0 20px rgba(var(--jade-rgb), 0.08),
    0 0 24px rgba(var(--gold-rgb), 0.05);
  animation: particleDrift 6.8s cubic-bezier(0.22, 0.8, 0.34, 1) infinite;
}

.lane-left .p1,
.lane-right .p1 { top: 24%; width: 4px; height: 10px; animation-delay: 0s; }
.lane-left .p2,
.lane-right .p2 { top: 42%; left: 8%; width: 3px; height: 12px; animation-delay: 1.3s; }
.lane-left .p3,
.lane-right .p3 { top: 58%; left: 20%; width: 5px; height: 14px; animation-delay: 2.5s; }
.lane-left .p4,
.lane-right .p4 { top: 70%; left: 10%; width: 4px; height: 11px; animation-delay: 3.7s; }
.lane-left .p5,
.lane-right .p5 { top: 50%; left: 2%; width: 5px; height: 16px; animation-delay: 4.8s; }

.relic-rig {
  position: relative;
  width: 260px;
  height: 360px;
  display: grid;
  place-items: center;
}

.hanger {
  position: absolute;
  top: 8%;
  width: 1px;
  background: linear-gradient(180deg, rgba(var(--gold-rgb), 0.20), rgba(var(--gold-rgb), 0.02));
}

.hanger-left {
  left: 36%;
  height: 92px;
}

.hanger-mid {
  left: 50%;
  height: 82px;
  transform: translateX(-50%);
}

.hanger-right {
  right: 36%;
  height: 92px;
}

.crossbar {
  position: absolute;
  top: 27%;
  width: 132px;
  height: 2px;
  border-radius: 999px;
  background: linear-gradient(180deg, rgba(var(--gold-rgb), 0.16), rgba(var(--gold-rgb), 0.04));
  box-shadow: 0 0 8px rgba(var(--gold-rgb), 0.04);
}

.crossbar.lower {
  top: 33%;
  width: 96px;
}

.anchor {
  position: absolute;
  top: 24%;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(var(--gold-soft-rgb), 0.7), rgba(var(--jade-rgb), 0.12) 68%, transparent 100%);
  box-shadow: 0 0 12px rgba(var(--gold-rgb), 0.10);
}

.anchor-left {
  left: calc(36% - 5px);
}

.anchor-mid {
  left: calc(50% - 5px);
}

.anchor-right {
  right: calc(36% - 5px);
}

.relic-frame {
  position: absolute;
  inset: 18% 16% 12%;
  clip-path: polygon(50% 5%, 72% 16%, 84% 38%, 84% 68%, 68% 88%, 50% 95%, 32% 88%, 16% 68%, 16% 38%, 28% 16%);
}

.frame-back {
  transform: scale(1.04);
  border: 1px solid rgba(var(--gold-rgb), 0.18);
  background:
    linear-gradient(180deg, rgba(var(--gold-rgb), 0.02), rgba(255,255,255,0) 26%, rgba(var(--gold-rgb), 0.04) 100%);
}

.frame-front {
  transform: scale(0.92) rotate(6deg);
  border: 1px solid rgba(var(--jade-rgb), 0.08);
  opacity: 0.28;
}

.relic-core-body {
  position: absolute;
  inset: 24% 24% 18%;
  clip-path: polygon(50% 6%, 70% 17%, 80% 38%, 80% 68%, 66% 86%, 50% 92%, 34% 86%, 20% 68%, 20% 38%, 30% 17%);
  background:
    linear-gradient(180deg, rgba(88, 82, 74, 0.16), rgba(34, 30, 28, 0.94) 24%, rgba(15, 15, 16, 0.99) 100%),
    linear-gradient(90deg, rgba(255,255,255,0.03), transparent 24%, transparent 76%, rgba(255,255,255,0.02));
  box-shadow:
    inset 0 18px 24px rgba(255,255,255,0.04),
    inset 0 -24px 26px rgba(0,0,0,0.34),
    0 0 26px rgba(var(--gold-rgb), 0.06);
}

.brace {
  position: absolute;
  background: linear-gradient(180deg, transparent, rgba(var(--gold-rgb), 0.20), transparent);
}

.brace-left {
  top: 22%;
  bottom: 18%;
  left: 50%;
  width: 1px;
  transform: translateX(-34px);
}

.brace-right {
  top: 22%;
  bottom: 18%;
  left: 50%;
  width: 1px;
  transform: translateX(33px);
}

.brace-cross {
  left: 30%;
  right: 30%;
  top: 53%;
  height: 1px;
  transform: translateY(-50%);
}

.joint {
  position: absolute;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(var(--gold-soft-rgb), 0.82), rgba(var(--jade-rgb), 0.16) 68%, transparent 100%);
  box-shadow: 0 0 12px rgba(var(--gold-rgb), 0.12);
}

.joint-a { top: 30%; left: calc(50% - 4px); }
.joint-b { top: 53%; right: 30%; transform: translateY(-50%); }
.joint-c { bottom: 20%; left: calc(50% - 4px); }
.joint-d { top: 53%; left: 30%; transform: translateY(-50%); }

.relic-seam {
  position: absolute;
  left: 50%;
  top: 24%;
  bottom: 20%;
  width: 1px;
  transform: translateX(-50%);
  background: linear-gradient(180deg, transparent, rgba(var(--blood-soft-rgb), 0.14), transparent);
  box-shadow: 0 0 8px rgba(var(--blood-soft-rgb), 0.04);
}

.relic-plate {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  border-radius: 999px;
  background: linear-gradient(180deg, rgba(var(--gold-rgb), 0.12), rgba(var(--gold-rgb), 0.03));
  box-shadow: 0 0 8px rgba(var(--gold-rgb), 0.04);
}

.plate-top {
  top: 34%;
  width: 66px;
  height: 2px;
}

.plate-mid {
  top: 52%;
  width: 92px;
  height: 2px;
}

.plate-low {
  bottom: 24%;
  width: 72px;
  height: 2px;
}

.talisman {
  position: absolute;
  top: 38%;
  width: 16px;
  height: 56px;
  display: grid;
  place-items: start center;
  padding-top: 8px;
  border-radius: 2px 2px 8px 8px;
  border: 1px solid rgba(var(--gold-rgb), 0.12);
  background:
    linear-gradient(180deg, rgba(214, 201, 170, 0.16), rgba(112, 97, 74, 0.12) 30%, rgba(41, 34, 28, 0.88) 100%);
  color: rgba(var(--gold-soft-rgb), 0.48);
  font-size: 9px;
  text-shadow: 0 0 8px rgba(var(--gold-rgb), 0.08);
  opacity: 0.54;
}

.talisman-left {
  left: 56px;
  transform: rotate(-8deg);
}

.talisman-right {
  right: 56px;
  transform: rotate(8deg);
}

.inner-bloom {
  position: absolute;
  width: 68px;
  height: 68px;
  border-radius: 50%;
  background:
    radial-gradient(circle, rgba(var(--blood-soft-rgb), 0.18), rgba(var(--blood-soft-rgb), 0.03) 58%, transparent 100%);
  filter: blur(8px);
  animation: pulseGlow 5.8s ease-in-out infinite;
}

@keyframes driftLayer {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

@keyframes driftLayerReverse {
  from { transform: rotate(360deg); }
  to { transform: rotate(0deg); }
}

@keyframes sealBlink {
  0%, 100% {
    opacity: 0.18;
    text-shadow: 0 0 0 rgba(var(--gold-rgb), 0);
  }
  50% {
    opacity: 0.78;
    text-shadow:
      0 0 12px rgba(var(--gold-rgb), 0.12),
      0 0 22px rgba(var(--jade-rgb), 0.06),
      0 0 30px rgba(var(--jade-rgb), 0.03);
  }
}

@keyframes particleDrift {
  0% {
    transform: translate3d(0, 2px, 0) scale(0.7) rotate(-6deg);
    opacity: 0;
  }
  16% {
    opacity: 0.82;
  }
  76% {
    transform: translate3d(180px, -4px, 0) scale(1.05) rotate(4deg);
    opacity: 0.86;
  }
  86% {
    transform: translate3d(198px, -1px, 0) scale(0.52) rotate(10deg);
    opacity: 0.98;
  }
  100% {
    transform: translate3d(224px, 0, 0) scale(0.36) rotate(14deg);
    opacity: 0;
  }
}

@keyframes wireRotate {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

@keyframes wireRotateReverse {
  from { transform: rotate(360deg); }
  to { transform: rotate(0deg); }
}

@keyframes pulseGlow {
  0%, 100% {
    transform: scale(0.92);
    opacity: 0.24;
  }
  50% {
    transform: scale(1.06);
    opacity: 0.40;
  }
}

@media (max-width: 980px) {
  .blood-altar-ui {
    height: auto;
  }

  .altar-header {
    grid-template-columns: 1fr;
  }

  .metrics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .altar-stage {
    height: auto;
    grid-template-columns: 1fr;
    min-height: 720px;
  }

  .side-panel {
    min-height: 180px;
    padding: 14px;
  }

  .relic-rig {
    width: 220px;
    height: 320px;
  }
}
</style>
