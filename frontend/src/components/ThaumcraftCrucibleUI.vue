<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { api, getImageUrl, type Recipe } from '../services/api';
import type { UITypeConfig } from '../services/uiTypeMapping';
import { buildOutputSlots, parseAdditionalData, type ResolvedSlot } from '../composables/useRecipeSlots';
import {
  buildThaumcraftAspectCosts,
  collectRecipeItemStacks,
  getThaumcraftAspectImagePath,
  getThaumcraftAspectItemId,
  isThaumcraftAspectItem,
  mergeRecipeMetadata,
  type RitualAspectCost,
  type RitualItemStack,
} from '../composables/ritualFamilyMetadata';
import { useSound } from '../services/sound.service';
import RecipeItemTooltip from './RecipeItemTooltip.vue';
import AnimatedItemIcon from './AnimatedItemIcon.vue';

interface Props {
  recipe: Recipe;
  uiConfig?: UITypeConfig;
}

interface Emits {
  (e: 'item-click', itemId: string, options?: { tab?: 'usedIn' | 'producedBy' }): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();
const { playClick } = useSound();

const catalyst = ref<RitualItemStack | null>(null);
const outputSlot = ref<ResolvedSlot | null>(null);
const aspectCosts = ref<RitualAspectCost[]>([]);

const mergedMetadata = computed(() => mergeRecipeMetadata(props.recipe));
const catalystItems = computed(() => (catalyst.value ? [catalyst.value] : []));
const recipeIdLabel = computed(() => {
  const keys = ['research', 'researchKey', 'requiredResearch', 'recipeId', 'id'];
  const value = keys
    .map((key) => mergedMetadata.value[key])
    .find((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0);
  return value?.trim() || props.recipe.recipeId || 'TB.AlchemyRestoration';
});
const researchLines = computed(() => {
  const keys = ['research', 'researchKey', 'requiredResearch', 'research_name'];
  return keys
    .map((key) => mergedMetadata.value[key])
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .slice(0, 2);
});

function getRawInputSource(recipe: Recipe): unknown {
  const additional = parseAdditionalData(recipe);
  return additional?.rawIndexedInputs ?? recipe.inputs;
}

async function resolveItemName(item: RitualItemStack | null): Promise<RitualItemStack | null> {
  if (!item || item.localizedName?.trim()) return item;
  try {
    const detail = await api.getItem(item.itemId);
    return { ...item, localizedName: detail.localizedName };
  } catch {
    return item;
  }
}

async function initialize() {
  const rawInputSource = getRawInputSource(props.recipe);
  const stacks: RitualItemStack[] = [];
  collectRecipeItemStacks(rawInputSource, stacks);
  catalyst.value = await resolveItemName(
    stacks.find((item) => !isThaumcraftAspectItem(item.itemId, item.localizedName)) ?? null,
  );
  aspectCosts.value = buildThaumcraftAspectCosts(props.recipe, rawInputSource);
  const [output] = await buildOutputSlots(props.recipe, 1);
  outputSlot.value = output ?? null;
}

function handleItemClick(itemId: string) {
  playClick();
  emit('item-click', itemId);
}

function handleAspectClick(aspect: RitualAspectCost) {
  const itemId = getThaumcraftAspectItemId(aspect);
  if (itemId) {
    playClick();
    emit('item-click', itemId, { tab: 'producedBy' });
  }
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
</script>

<template>
  <article class="crucible-card" aria-label="Crucible Aggregate recipe card">
    <div class="starfield" aria-hidden="true" />
    <div class="nebula nebula-cyan" aria-hidden="true" />
    <div class="nebula nebula-magenta" aria-hidden="true" />

    <header class="card-header">
      <h2>坩埚炼成 <span>(THAUMIC RITE)</span></h2>
      <code>{{ recipeIdLabel }}</code>
    </header>

    <main class="recipe-core" aria-label="Crucible Aggregate crafting flow">
      <section class="zone catalyst-zone" aria-label="Catalyst inputs">
        <p class="zone-label">CATALYST</p>
        <div class="slot-grid">
          <RecipeItemTooltip
            v-for="item in catalystItems"
            :key="item.itemId"
            :item-id="item.itemId"
            :count="item.count"
            @click="handleItemClick(item.itemId)"
          >
            <button class="item-slot catalyst-slot" type="button">
              <AnimatedItemIcon
                :item-id="item.itemId"
                :size="62"
                class="item-icon"
              />
              <span v-if="item.count > 1" class="slot-count">x{{ item.count }}</span>
            </button>
          </RecipeItemTooltip>
          <div v-if="catalystItems.length === 0" class="item-slot catalyst-slot empty-slot" />
        </div>
      </section>

      <section class="reaction-core" aria-label="Technomagic reaction core">
        <div class="energy-well" aria-hidden="true">
          <span class="ring ring-outer" />
          <span class="ring ring-mid" />
          <span class="ring ring-inner" />
          <span class="sigil sigil-a" />
          <span class="sigil sigil-b" />
          <span class="core-glow" />
          <span class="pulse-dot dot-a" />
          <span class="pulse-dot dot-b" />
          <span class="pulse-dot dot-c" />
          <span class="pulse-dot dot-d" />
        </div>
      </section>

      <section class="zone output-zone" aria-label="Product output">
        <p class="zone-label">PRODUCT</p>
        <RecipeItemTooltip
          v-if="outputSlot"
          :item-id="outputSlot.itemId"
          :count="outputSlot.count"
          @click="handleItemClick(outputSlot.itemId)"
        >
          <button class="item-slot output-slot" type="button">
            <AnimatedItemIcon
              :item-id="outputSlot.itemId"
              :render-asset-ref="outputSlot.renderAssetRef || null"
              :image-file-name="outputSlot.imageFileName || null"
              :size="78"
              class="item-icon output-icon"
            />
            <span v-if="outputSlot.count > 1" class="slot-count">x{{ outputSlot.count }}</span>
          </button>
        </RecipeItemTooltip>
        <div v-else class="item-slot output-slot empty-slot" />
      </section>
    </main>

    <footer class="aspect-footer" aria-label="Aspect and environment costs">
      <button
        v-for="aspect in aspectCosts"
        :key="`${aspect.name}-${aspect.hash || 'plain'}`"
        class="aspect-badge"
        :class="{ 'is-clickable': Boolean(getThaumcraftAspectItemId(aspect)) }"
        :style="{ '--accent': aspect.color || '#8bdcff' }"
        type="button"
        @click="handleAspectClick(aspect)"
      >
        <img
          :src="getThaumcraftAspectImagePath(aspect)"
          class="aspect-icon"
          :alt="aspect.name"
          @error="(e) => { (e.target as HTMLImageElement).src = '/placeholder.png'; }"
        />
        <span>{{ aspect.amount }}</span>
      </button>
      <span v-if="aspectCosts.length === 0" class="aspect-empty">No aspect cost</span>
    </footer>
  </article>
</template>

<style scoped>
.crucible-card {
  --cyan: 34, 211, 238;
  --magenta: 217, 70, 239;
  --violet: 168, 85, 247;
  --gold: 245, 208, 138;
  --glass: rgba(9, 14, 25, 0.66);
  --glass-strong: rgba(12, 18, 32, 0.82);
  --line: rgba(148, 163, 184, 0.14);

  position: relative;
  width: min(100%, 1040px);
  min-height: 500px;
  padding: clamp(22px, 3vw, 34px);
  border-radius: 30px;
  overflow: hidden;
  isolation: isolate;
  color: #f8fafc;
  background:
    radial-gradient(circle at 50% 42%, rgba(var(--violet), 0.13), transparent 30%),
    radial-gradient(circle at 12% 20%, rgba(var(--cyan), 0.11), transparent 28%),
    radial-gradient(circle at 85% 72%, rgba(var(--magenta), 0.11), transparent 30%),
    linear-gradient(180deg, rgba(7, 11, 20, 0.96), rgba(2, 6, 13, 0.98));
  border: 1px solid rgba(226, 232, 240, 0.12);
  box-shadow:
    0 28px 80px rgba(2, 6, 23, 0.54),
    inset 0 1px 0 rgba(255, 255, 255, 0.08),
    inset 0 0 76px rgba(15, 23, 42, 0.55);
  backdrop-filter: blur(18px) saturate(130%);
  -webkit-backdrop-filter: blur(18px) saturate(130%);
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, sans-serif;
}

.starfield,
.nebula {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: -2;
}

.starfield {
  background-image:
    radial-gradient(circle at 12% 22%, rgba(255,255,255,0.50) 0 1px, transparent 1.5px),
    radial-gradient(circle at 36% 18%, rgba(125,211,252,0.44) 0 1px, transparent 1.5px),
    radial-gradient(circle at 72% 30%, rgba(255,255,255,0.34) 0 1px, transparent 1.5px),
    radial-gradient(circle at 88% 70%, rgba(217,70,239,0.38) 0 1px, transparent 1.5px),
    linear-gradient(rgba(148, 163, 184, 0.028) 1px, transparent 1px),
    linear-gradient(90deg, rgba(148, 163, 184, 0.024) 1px, transparent 1px);
  background-size: 100% 100%, 100% 100%, 100% 100%, 100% 100%, 34px 34px, 34px 34px;
  opacity: 0.82;
  mask-image: radial-gradient(ellipse at center, #000 0 62%, transparent 90%);
}

.nebula {
  z-index: -1;
  border-radius: 50%;
  opacity: 0.54;
  will-change: transform, opacity;
  animation: nebula-drift 14s ease-in-out infinite alternate;
}

.nebula-cyan {
  left: -10%;
  top: 12%;
  width: 420px;
  height: 420px;
  background: radial-gradient(circle, rgba(var(--cyan), 0.12) 0%, transparent 62%);
}

.nebula-magenta {
  right: -8%;
  bottom: -12%;
  width: 480px;
  height: 480px;
  background: radial-gradient(circle, rgba(var(--magenta), 0.12) 0%, transparent 64%);
  animation-delay: -5s;
}

.card-header {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
  margin-bottom: clamp(22px, 3vw, 34px);
}

.card-header h2 {
  margin: 0;
  font-size: clamp(24px, 3vw, 38px);
  line-height: 1.08;
  letter-spacing: 0.08em;
  font-weight: 850;
  color: rgba(248, 250, 252, 0.98);
  text-shadow:
    0 0 18px rgba(var(--cyan), 0.24),
    0 0 34px rgba(var(--magenta), 0.16);
}

.card-header h2 span {
  display: inline-block;
  margin-left: 8px;
  font-size: 0.42em;
  letter-spacing: 0.24em;
  color: rgba(var(--cyan), 0.86);
  vertical-align: middle;
}

.card-header code {
  max-width: 38%;
  padding: 8px 11px;
  border-radius: 999px;
  border: 1px solid rgba(148, 163, 184, 0.14);
  background: rgba(2, 6, 13, 0.42);
  color: rgba(203, 213, 225, 0.74);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 12px;
  line-height: 1.2;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.recipe-core {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-columns: minmax(120px, 1fr) minmax(260px, 1.3fr) minmax(130px, 1fr);
  align-items: center;
  gap: clamp(18px, 4vw, 46px);
  min-height: 270px;
  padding: clamp(20px, 3vw, 34px);
  border-radius: 30px;
  border: 1px solid var(--line);
  background:
    radial-gradient(ellipse at center, rgba(30, 41, 59, 0.34), transparent 72%),
    linear-gradient(180deg, rgba(15, 23, 42, 0.54), rgba(2, 6, 13, 0.34));
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,0.055),
    inset 0 -24px 42px rgba(0,0,0,0.18),
    0 20px 44px rgba(2, 6, 23, 0.26);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
}

.recipe-core::before,
.recipe-core::after {
  content: '';
  position: absolute;
  top: 50%;
  height: 1px;
  width: 31%;
  pointer-events: none;
  background: linear-gradient(90deg, transparent, rgba(var(--cyan), 0.32), rgba(var(--magenta), 0.26), transparent);
  box-shadow: 0 0 18px rgba(var(--cyan), 0.14);
}

.recipe-core::before { left: 18%; }
.recipe-core::after { right: 18%; }

.zone {
  position: relative;
  z-index: 2;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
}

.zone-label,
.aspect-footer::before {
  margin: 0;
  font-size: 12px;
  font-weight: 850;
  letter-spacing: 0.2em;
  color: rgba(203, 213, 225, 0.76);
}

.slot-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(74px, 82px));
  grid-auto-rows: minmax(74px, 82px);
  gap: 12px;
  justify-content: center;
}

.item-slot {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 82px;
  height: 82px;
  border-radius: 22px;
  border: 1px solid rgba(226, 232, 240, 0.13);
  background:
    radial-gradient(circle at 50% 18%, rgba(255,255,255,0.10), transparent 46%),
    linear-gradient(180deg, rgba(15, 23, 42, 0.74), rgba(2, 6, 13, 0.72));
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,0.08),
    inset 0 -14px 22px rgba(0,0,0,0.18),
    0 12px 26px rgba(2, 6, 23, 0.28);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  cursor: pointer;
  transition: transform 160ms ease, border-color 160ms ease, box-shadow 160ms ease;
}

.item-slot:hover {
  transform: translateY(-2px) scale(1.025);
  border-color: rgba(var(--cyan), 0.42);
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,0.10),
    inset 0 -14px 22px rgba(0,0,0,0.18),
    0 16px 34px rgba(2, 6, 23, 0.34),
    0 0 26px rgba(var(--cyan), 0.12);
}

.catalyst-slot { border-color: rgba(var(--magenta), 0.32); }
.output-slot {
  width: 110px;
  height: 110px;
  border-radius: 28px;
  border-color: rgba(var(--cyan), 0.46);
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,0.09),
    inset 0 -16px 24px rgba(0,0,0,0.20),
    0 14px 34px rgba(2, 6, 23, 0.34),
    0 0 34px rgba(var(--cyan), 0.16),
    0 0 54px rgba(var(--magenta), 0.08);
}

.empty-slot { opacity: 0.42; border-style: dashed; }

.item-icon {
  image-rendering: pixelated;
  object-fit: contain;
  filter: drop-shadow(0 7px 12px rgba(0,0,0,0.38));
}

.output-icon { filter: drop-shadow(0 10px 18px rgba(0,0,0,0.42)); }

.slot-count {
  position: absolute;
  right: 6px;
  bottom: 6px;
  padding: 2px 7px;
  border-radius: 999px;
  border: 1px solid rgba(148, 163, 184, 0.15);
  background: rgba(2, 6, 13, 0.78);
  color: #f8fafc;
  font-size: 11px;
  font-weight: 850;
  text-shadow: 0 1px 3px rgba(0,0,0,0.92);
}

.reaction-core {
  position: relative;
  z-index: 2;
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 230px;
}

.energy-well {
  position: relative;
  width: min(240px, 45vw);
  height: min(240px, 45vw);
  min-width: 190px;
  min-height: 190px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.ring,
.sigil,
.core-glow,
.pulse-dot {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
}

.ring {
  border-radius: 50%;
  border: 1px solid rgba(var(--cyan), 0.22);
  box-shadow:
    inset 0 0 30px rgba(var(--magenta), 0.055),
    0 0 34px rgba(var(--cyan), 0.08);
}

.ring-outer {
  width: 100%;
  height: 100%;
  border-style: dashed;
  animation: core-spin 48s linear infinite;
}
.ring-mid {
  width: 72%;
  height: 72%;
  border-color: rgba(var(--magenta), 0.26);
  animation: core-spin-reverse 36s linear infinite;
}
.ring-inner {
  width: 44%;
  height: 44%;
  border-color: rgba(var(--gold), 0.18);
}

.sigil {
  width: 72%;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(226, 232, 240, 0.25), transparent);
  box-shadow: 0 0 14px rgba(var(--cyan), 0.16);
}
.sigil-a { transform: translate(-50%, -50%) rotate(30deg); }
.sigil-b { transform: translate(-50%, -50%) rotate(-30deg); }

.core-glow {
  width: 68px;
  height: 68px;
  border-radius: 24px 8px 24px 8px;
  border: 1px solid rgba(226, 232, 240, 0.18);
  background:
    radial-gradient(circle at 50% 40%, rgba(255,255,255,0.14), transparent 26%),
    linear-gradient(135deg, rgba(var(--cyan), 0.12), rgba(var(--magenta), 0.16), rgba(2, 6, 13, 0.32));
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,0.08),
    0 0 32px rgba(var(--cyan), 0.15),
    0 0 56px rgba(var(--magenta), 0.12);
  animation: prism-float 5.6s ease-in-out infinite;
}

.pulse-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: rgba(241, 245, 249, 0.9);
  box-shadow: 0 0 12px rgba(var(--cyan), 0.7), 0 0 25px rgba(var(--magenta), 0.34);
  opacity: 0;
  will-change: transform, opacity;
}
.dot-a { animation: dot-orbit-a 5.2s ease-in-out infinite; }
.dot-b { animation: dot-orbit-b 6.4s ease-in-out infinite -1.1s; }
.dot-c { animation: dot-orbit-c 7.3s ease-in-out infinite -2.2s; }
.dot-d { animation: dot-orbit-d 8.1s ease-in-out infinite -3.3s; }

.aspect-footer {
  position: relative;
  z-index: 1;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 12px;
  margin-top: 22px;
  padding: 16px 18px;
  border-radius: 24px;
  border: 1px solid rgba(148, 163, 184, 0.10);
  background:
    radial-gradient(ellipse at 50% 0%, rgba(var(--magenta), 0.08), transparent 58%),
    rgba(2, 6, 13, 0.30);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
}

.aspect-footer::before {
  content: 'ASPECT / ESSENCE';
  flex: 0 0 100%;
  text-align: center;
}

.aspect-badge {
  --accent: #8bdcff;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  min-width: 58px;
  height: 42px;
  padding: 0 11px;
  border: 1px solid rgba(148, 163, 184, 0.10);
  border-radius: 999px;
  color: rgba(241, 245, 249, 0.94);
  background:
    radial-gradient(circle at 34% 36%, color-mix(in srgb, var(--accent) 24%, transparent), transparent 62%),
    linear-gradient(180deg, rgba(15, 23, 42, 0.72), rgba(2, 6, 13, 0.62));
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,0.045),
    0 0 18px color-mix(in srgb, var(--accent) 13%, transparent);
}

.aspect-badge.is-clickable { cursor: pointer; }
.aspect-badge.is-clickable:hover .aspect-icon { transform: translateY(-1px) scale(1.1); }

.aspect-icon {
  width: 30px;
  height: 30px;
  image-rendering: pixelated;
  filter: drop-shadow(0 0 8px color-mix(in srgb, var(--accent) 48%, transparent));
  transition: transform 160ms ease;
}

.aspect-badge span {
  font-size: 13px;
  font-weight: 850;
  text-shadow: 0 2px 6px rgba(0,0,0,0.78);
}

.aspect-empty {
  color: rgba(148, 163, 184, 0.68);
  font-size: 13px;
  letter-spacing: 0.08em;
}

@keyframes core-spin { from { transform: translate(-50%, -50%) rotate(0deg); } to { transform: translate(-50%, -50%) rotate(360deg); } }
@keyframes core-spin-reverse { from { transform: translate(-50%, -50%) rotate(360deg); } to { transform: translate(-50%, -50%) rotate(0deg); } }
@keyframes prism-float {
  0%, 100% { transform: translate(-50%, -50%) rotate(0deg) scale(0.96); }
  50% { transform: translate(-50%, -54%) rotate(45deg) scale(1.04); }
}
@keyframes nebula-drift {
  from { transform: translate3d(0, 0, 0) scale(0.96); opacity: 0.34; }
  to { transform: translate3d(10px, -10px, 0) scale(1.06); opacity: 0.56; }
}
@keyframes dot-orbit-a {
  0% { opacity: 0; transform: translate(-118px, -50%) scale(0.56); }
  24% { opacity: 0.86; }
  62% { transform: translate(-50%, -105px) scale(1); }
  100% { opacity: 0; transform: translate(118px, -50%) scale(0.56); }
}
@keyframes dot-orbit-b {
  0% { opacity: 0; transform: translate(-50%, 112px) scale(0.52); }
  24% { opacity: 0.82; }
  64% { transform: translate(102px, -50%) scale(0.94); }
  100% { opacity: 0; transform: translate(-50%, -112px) scale(0.52); }
}
@keyframes dot-orbit-c {
  0% { opacity: 0; transform: translate(108px, -50%) scale(0.48); }
  26% { opacity: 0.74; }
  66% { transform: translate(-50%, 96px) scale(0.9); }
  100% { opacity: 0; transform: translate(-108px, -50%) scale(0.48); }
}
@keyframes dot-orbit-d {
  0% { opacity: 0; transform: translate(-86px, 86px) scale(0.44); }
  30% { opacity: 0.72; }
  68% { transform: translate(88px, -88px) scale(0.86); }
  100% { opacity: 0; transform: translate(106px, 86px) scale(0.44); }
}

@media (max-width: 820px) {
  .card-header,
  .recipe-core {
    grid-template-columns: 1fr;
  }
  .card-header {
    flex-direction: column;
  }
  .card-header code {
    max-width: 100%;
  }
  .recipe-core {
    display: flex;
    flex-direction: column;
  }
  .recipe-core::before,
  .recipe-core::after {
    display: none;
  }
}
</style>
