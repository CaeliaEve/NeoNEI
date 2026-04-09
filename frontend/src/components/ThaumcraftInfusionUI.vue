<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { api, getImageUrl, type Recipe } from '../services/api';
import type { UITypeConfig } from '../services/uiTypeMapping';
import { useSound } from '../services/sound.service';
import { buildOutputSlots, parseAdditionalData, type ResolvedSlot } from '../composables/useRecipeSlots';
import {
  buildThaumcraftAspectCosts,
  collectRecipeItemStacks,
  getThaumcraftAspectImagePath,
  type RitualAspectCost,
  type RitualItemStack,
  isThaumcraftAspectItem,
  normalizeCount,
} from '../composables/ritualFamilyMetadata';
import RecipeItemTooltip from './RecipeItemTooltip.vue';

interface Props {
  recipe: Recipe;
  uiConfig?: UITypeConfig;
}

interface Emits {
  (e: 'item-click', itemId: string): void;
}

interface RingLayoutEntry {
  item: RitualItemStack;
  ringIndex: number;
  style: { transform: string };
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();
const { playClick } = useSound();

const centerItem = ref<RitualItemStack | null>(null);
const ringItems = ref<RitualItemStack[]>([]);
const outputSlot = ref<ResolvedSlot | null>(null);
const aspectCosts = ref<RitualAspectCost[]>([]);
const instability = ref<number | null>(null);

async function resolveItemNames(items: RitualItemStack[]): Promise<RitualItemStack[]> {
  return Promise.all(
    items.map(async (item) => {
      try {
        const detail = await api.getItem(item.itemId);
        return { ...item, localizedName: detail.localizedName };
      } catch {
        return item;
      }
    }),
  );
}

function getRingPosition(index: number, total: number, radius: number) {
  const safeTotal = Math.max(total, 1);
  const angle = ((index / safeTotal) * 360 - 90) * (Math.PI / 180);
  return {
    transform: `translate(calc(-50% + ${Math.cos(angle) * radius}px), calc(-50% + ${Math.sin(angle) * radius}px))`,
  };
}

function handleItemClick(itemId: string) {
  playClick();
  emit('item-click', itemId);
}

async function initialize() {
  const additional = parseAdditionalData(props.recipe);
  const rawInputs: RitualItemStack[] = [];
  collectRecipeItemStacks((additional?.rawIndexedInputs as unknown) ?? props.recipe.inputs, rawInputs);

  const nonAspectInputs = rawInputs.filter((item) => !isThaumcraftAspectItem(item.itemId, item.localizedName));
  const resolved = await resolveItemNames(nonAspectInputs);

  centerItem.value = resolved[0] ?? null;
  ringItems.value = resolved.slice(1);
  aspectCosts.value = buildThaumcraftAspectCosts(
    props.recipe,
    (additional?.rawIndexedInputs as unknown) ?? props.recipe.inputs,
  );

  const [output] = await buildOutputSlots(props.recipe, 1);
  outputSlot.value = output ?? null;

  const rawInstability = Number(additional?.stability ?? additional?.instability);
  instability.value = Number.isFinite(rawInstability) ? Math.floor(rawInstability) : null;
}

onMounted(() => {
  void initialize();
});

watch(
  () => props.recipe,
  () => {
    void initialize();
  },
  { deep: true },
);

const ringCount = computed(() => {
  const count = ringItems.value.length;
  if (count <= 8) return 1;
  if (count <= 18) return 2;
  return 3;
});

const coreSize = computed(() => {
  switch (ringCount.value) {
    case 1: return 360;
    case 2: return 420;
    default: return 500;
  }
});

const ringRadii = computed(() => {
  switch (ringCount.value) {
    case 1: return [110];
    case 2: return [96, 156];
    default: return [88, 146, 204];
  }
});

const ingredientLayout = computed<RingLayoutEntry[]>(() => {
  const items = ringItems.value;
  if (items.length === 0) return [];

  const radii = ringRadii.value;
  const perRing = Math.ceil(items.length / radii.length);
  const entries: RingLayoutEntry[] = [];

  items.forEach((item, index) => {
    const ringIndex = Math.min(radii.length - 1, Math.floor(index / perRing));
    const indexInRing = index % perRing;
    const ringItemCount =
      ringIndex === radii.length - 1
        ? items.length - ringIndex * perRing
        : Math.min(perRing, items.length - ringIndex * perRing);

    entries.push({
      item,
      ringIndex,
      style: getRingPosition(indexInRing, Math.max(ringItemCount, 1), radii[ringIndex]),
    });
  });

  return entries;
});

const infusionCoreStyle = computed(() => ({
  width: `${coreSize.value}px`,
  height: `${coreSize.value}px`,
  maxWidth: '100%',
}));

const showAspectPanel = computed(() => aspectCosts.value.length > 0);
const compactCore = computed(() => ringCount.value >= 3);
</script>

<template>
  <div class="thaum-ui thaum-infusion">
    <div class="scene-bg" aria-hidden="true">
      <div class="mist mist-a" />
      <div class="mist mist-b" />
      <div class="scene-grid" />
    </div>

    <section class="infusion-shell" :class="{ 'is-compact': compactCore }">
      <div class="infusion-core" :style="infusionCoreStyle">
        <div class="ring outer" />
        <div class="ring middle" />
        <div class="ring inner" />

        <div
          v-for="entry in ingredientLayout"
          :key="`ring-item-${entry.item.itemId}-${entry.ringIndex}-${entry.style.transform}`"
          class="ingredient-node"
          :style="entry.style"
        >
          <RecipeItemTooltip :item-id="entry.item.itemId" :count="entry.item.count" @click="handleItemClick(entry.item.itemId)">
            <div class="slot pedestal">
              <img :src="getImageUrl(entry.item.itemId)" class="item-icon" @error="(e) => { (e.target as HTMLImageElement).src = '/placeholder.png'; }" />
              <span v-if="entry.item.count > 1" class="count">{{ entry.item.count }}</span>
            </div>
          </RecipeItemTooltip>
        </div>

        <div class="center-node">
          <RecipeItemTooltip
            v-if="centerItem"
            :item-id="centerItem.itemId"
            :count="centerItem.count"
            @click="handleItemClick(centerItem.itemId)"
          >
            <div class="slot center">
              <img :src="getImageUrl(centerItem.itemId)" class="item-icon center-icon" @error="(e) => { (e.target as HTMLImageElement).src = '/placeholder.png'; }" />
              <span v-if="centerItem.count > 1" class="count">{{ centerItem.count }}</span>
            </div>
          </RecipeItemTooltip>
          <div v-else class="slot center empty" />
        </div>
      </div>

      <div class="side-column">
        <div class="arrow-lane">
          <div class="arrow-track" />
          <svg viewBox="0 0 24 24" class="arrow-icon">
            <path d="M4 11h12.17l-5.59-5.59L12 4l8 8-8 8-1.41-1.41L16.17 13H4v-2z" />
          </svg>
        </div>

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
                <img :src="getImageUrl(outputSlot.itemId)" class="item-icon output-icon" @error="(e) => { (e.target as HTMLImageElement).src = '/placeholder.png'; }" />
                <span v-if="outputSlot.count > 1" class="count">{{ outputSlot.count }}</span>
              </div>
            </RecipeItemTooltip>
            <div v-else class="slot output empty" />
          </div>
          <div v-if="instability !== null" class="status-chip">INSTABILITY {{ instability }}</div>
        </section>

        <section v-if="showAspectPanel" class="panel panel-aspects">
          <div class="panel-title">ASPECTS</div>
          <div class="aspect-list">
            <div
              v-for="aspect in aspectCosts"
              :key="`${aspect.name}-${aspect.hash || 'plain'}`"
              class="aspect-row"
            >
              <img :src="getThaumcraftAspectImagePath(aspect)" class="aspect-icon" :alt="aspect.name" @error="(e) => { (e.target as HTMLImageElement).src = '/placeholder.png'; }" />
              <span class="aspect-name">{{ aspect.name }}</span>
              <span class="aspect-amount">{{ aspect.amount }}</span>
            </div>
          </div>
        </section>
      </div>
    </section>
  </div>
</template>

<style scoped>
.thaum-ui {
  position: relative;
  overflow: visible;
  border-radius: 18px;
  border: 1px solid rgba(148, 163, 184, 0.22);
  background:
    linear-gradient(180deg, rgba(10, 14, 24, 0.96), rgba(7, 10, 18, 0.98)),
    radial-gradient(circle at top, rgba(103, 232, 249, 0.08), transparent 40%);
  box-shadow:
    0 18px 50px rgba(2, 8, 23, 0.38),
    inset 0 1px 0 rgba(255, 255, 255, 0.06);
  padding: 16px;
}

.scene-bg { position: absolute; inset: 0; pointer-events: none; }
.mist {
  position: absolute;
  border-radius: 999px;
  filter: blur(28px);
  opacity: 0.22;
}
.mist-a { width: 260px; height: 180px; left: -30px; top: -30px; background: radial-gradient(circle, rgba(103, 232, 249, 0.34), transparent 72%); }
.mist-b { width: 280px; height: 220px; right: -70px; bottom: -40px; background: radial-gradient(circle, rgba(192, 132, 252, 0.18), transparent 74%); }
.scene-grid {
  position: absolute;
  inset: 0;
  background:
    linear-gradient(rgba(255, 255, 255, 0.014) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 255, 255, 0.014) 1px, transparent 1px);
  background-size: 18px 18px;
  opacity: 0.16;
}

.infusion-shell {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(240px, 300px);
  gap: 18px;
  align-items: center;
}

.infusion-shell.is-compact {
  grid-template-columns: minmax(0, 1fr) minmax(220px, 280px);
}

.infusion-core {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto;
}

.ring {
  position: absolute;
  border-radius: 50%;
  border: 1px solid rgba(103, 232, 249, 0.22);
}
.outer {
  width: calc(100% - 24px);
  height: calc(100% - 24px);
  border-style: dashed;
  animation: spin 22s linear infinite;
}
.middle {
  width: calc(100% - 110px);
  height: calc(100% - 110px);
  animation: spinReverse 18s linear infinite;
}
.inner {
  width: calc(100% - 190px);
  height: calc(100% - 190px);
  border-style: dashed;
  animation: spin 12s linear infinite;
}

.ingredient-node {
  position: absolute;
  top: 50%;
  left: 50%;
}

.center-node {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
}

.side-column {
  display: flex;
  flex-direction: column;
  gap: 12px;
  align-items: stretch;
}

.panel {
  position: relative;
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

.panel-output { border-color: rgba(245, 208, 138, 0.24); min-width: 132px; }

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

.panel-title-output { border-color: rgba(245, 208, 138, 0.32); color: #fff3da; }

.slot-wrap {
  min-height: 120px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.slot {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border-radius: 10px;
  border: 1px solid rgba(148, 163, 184, 0.28);
  background:
    linear-gradient(180deg, rgba(11, 16, 24, 0.88), rgba(6, 10, 16, 0.92)),
    url('/textures/nei/slot.png');
  background-repeat: no-repeat;
  background-position: center;
  background-size: 100% 100%, 18px 18px;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.06),
    0 6px 12px rgba(2, 8, 23, 0.28);
}

.slot.pedestal { width: 44px; height: 44px; }
.slot.center { width: 60px; height: 60px; border-color: rgba(103, 232, 249, 0.5); }
.slot.output { width: 72px; height: 72px; border-color: rgba(245, 208, 138, 0.42); }
.slot.empty { opacity: 0.3; }

.item-icon { width: 34px; height: 34px; object-fit: contain; image-rendering: pixelated; }
.center-icon { width: 46px; height: 46px; }
.output-icon { width: 54px; height: 54px; }

.count {
  position: absolute;
  right: 2px;
  bottom: 1px;
  padding: 1px 3px;
  border-radius: 4px;
  background: rgba(15, 23, 42, 0.82);
  border: 1px solid rgba(148, 163, 184, 0.24);
  font-size: 10px;
  color: #fff;
}

.arrow-lane {
  position: relative;
  width: 30px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(210, 218, 230, 0.86);
  align-self: center;
}

.arrow-track {
  position: absolute;
  left: 1px;
  right: 5px;
  top: 50%;
  height: 6px;
  transform: translateY(-50%);
  background: url('/textures/nei/dash.png') center / 100% 2px no-repeat;
  opacity: 0.55;
}

.arrow-icon {
  width: 18px;
  height: 18px;
  position: relative;
  z-index: 1;
  fill: currentColor;
}

.status-chip {
  margin-top: 8px;
  padding: 4px 10px;
  border-radius: 999px;
  border: 1px solid rgba(192, 132, 252, 0.24);
  background: rgba(40, 20, 58, 0.68);
  color: #ede9fe;
  font-size: 11px;
  text-align: center;
}

.aspect-list {
  display: grid;
  gap: 10px;
  padding-top: 8px;
  max-height: 320px;
  overflow: auto;
}

.aspect-row {
  display: grid;
  grid-template-columns: 32px 1fr auto;
  gap: 10px;
  align-items: center;
  min-height: 40px;
  padding: 6px 8px;
  border-radius: 10px;
  border: 1px solid rgba(148, 163, 184, 0.16);
  background: rgba(9, 14, 22, 0.72);
}

.aspect-icon {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  border: 1px solid rgba(111, 220, 250, 0.22);
  padding: 2px;
  background: rgba(8, 20, 36, 0.72);
}

.aspect-name {
  font-size: 12px;
  color: #e2e8f0;
}

.aspect-amount {
  min-width: 28px;
  text-align: right;
  font-size: 12px;
  font-weight: 700;
  color: #111827;
  background: linear-gradient(145deg, #ffe48b, #ffbe62);
  border-radius: 999px;
  padding: 2px 8px;
}

@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
@keyframes spinReverse { from { transform: rotate(360deg); } to { transform: rotate(0deg); } }

@media (max-width: 1180px) {
  .infusion-shell {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 720px) {
  .thaum-ui {
    padding: 14px;
  }
}
</style>
