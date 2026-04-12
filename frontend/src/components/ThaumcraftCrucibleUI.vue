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
  <div class="crucible-ui">
    <div class="crucible-grid" aria-hidden="true" />

    <section class="research-panel">
      <div class="panel-pill">研究</div>
      <div class="panel-title">CRUCIBLE</div>
      <div v-if="researchLines.length" class="research-lines">
        <span v-for="line in researchLines" :key="line">{{ line }}</span>
      </div>
      <div v-else class="research-lines muted">Alchemy Study</div>
    </section>

    <section class="crucible-stage">
      <div class="cauldron-aura" />
      <div class="cauldron-bowl">
        <div class="liquid" />
        <div class="steam steam-a" />
        <div class="steam steam-b" />
        <div class="steam steam-c" />
      </div>

    </section>

    <section class="input-panel">
      <div class="panel-pill">输入</div>
      <RecipeItemTooltip
        v-if="catalyst"
        :item-id="catalyst.itemId"
        :count="catalyst.count"
        @click="handleItemClick(catalyst.itemId)"
      >
        <div class="slot catalyst-slot">
          <img
            :src="getImageUrl(catalyst.itemId)"
            class="item-icon"
            @error="(e) => { (e.target as HTMLImageElement).src = '/placeholder.png'; }"
          />
          <span v-if="catalyst.count > 1" class="count">{{ catalyst.count }}</span>
        </div>
      </RecipeItemTooltip>
      <div v-else class="slot catalyst-slot empty-slot" />
    </section>

    <section class="output-panel">
      <div class="panel-pill">输出</div>
      <RecipeItemTooltip
        v-if="outputSlot"
        :item-id="outputSlot.itemId"
        :count="outputSlot.count"
        @click="handleItemClick(outputSlot.itemId)"
      >
        <div class="slot output-slot">
          <img
            :src="getImageUrl(outputSlot.itemId)"
            class="item-icon output-icon"
            @error="(e) => { (e.target as HTMLImageElement).src = '/placeholder.png'; }"
          />
          <span v-if="outputSlot.count > 1" class="count">{{ outputSlot.count }}</span>
        </div>
      </RecipeItemTooltip>
      <div v-else class="slot output-slot empty-slot" />
    </section>

    <section class="aspects-panel">
      <div class="aspect-row">
        <div
          v-for="aspect in aspectCosts"
          :key="`${aspect.name}-${aspect.hash || 'plain'}`"
          class="aspect-slot"
          :class="{ 'is-clickable': Boolean(getThaumcraftAspectItemId(aspect)) }"
          :style="{ '--accent': aspect.color || '#8bdcff' }"
          @click="handleAspectClick(aspect)"
        >
          <img
            :src="getThaumcraftAspectImagePath(aspect)"
            class="aspect-icon"
            :alt="aspect.name"
            @error="(e) => { (e.target as HTMLImageElement).src = '/placeholder.png'; }"
          />
          <span class="aspect-amount">{{ aspect.amount }}</span>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.crucible-ui {
  position: relative;
  width: 860px;
  max-width: calc(100vw - 96px);
  height: 540px;
  min-height: 540px;
  flex: 0 0 auto;
  padding: 24px 28px 26px;
  overflow: hidden;
  border-radius: 22px;
  border: 1px solid rgba(96, 165, 250, 0.2);
  background:
    radial-gradient(circle at 52% 42%, rgba(34, 211, 238, 0.12), transparent 28%),
    linear-gradient(180deg, rgba(9, 15, 27, 0.98), rgba(5, 9, 17, 0.99));
  box-shadow:
    0 22px 52px rgba(2, 8, 23, 0.44),
    inset 0 1px 0 rgba(255, 255, 255, 0.05);
}

.crucible-grid {
  position: absolute;
  inset: 18px;
  border-radius: 18px;
  border: 1px solid rgba(148, 163, 184, 0.12);
  background:
    linear-gradient(rgba(255, 255, 255, 0.025) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 255, 255, 0.025) 1px, transparent 1px);
  background-size: 22px 22px;
  pointer-events: none;
}

.research-panel,
.input-panel,
.output-panel {
  position: absolute;
  z-index: 2;
  top: 30px;
  min-width: 180px;
  padding: 16px;
  border-radius: 16px;
  border: 1px solid rgba(148, 163, 184, 0.14);
  background: rgba(8, 14, 25, 0.76);
}

.research-panel { left: 30px; }
.input-panel,
.output-panel {
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
}

.input-panel { left: 30px; }
.output-panel { right: 30px; }

.panel-pill {
  display: inline-flex;
  min-width: 92px;
  justify-content: center;
  padding: 7px 14px;
  border-radius: 999px;
  border: 1px solid rgba(125, 211, 252, 0.2);
  color: rgba(226, 232, 240, 0.86);
  background: rgba(15, 23, 42, 0.72);
  font-size: 13px;
}

.panel-title {
  margin-top: 20px;
  font-size: 12px;
  letter-spacing: 0.22em;
  color: rgba(125, 211, 252, 0.82);
}

.research-lines {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 12px;
  color: rgba(226, 232, 240, 0.9);
  font-size: 14px;
}

.research-lines.muted {
  color: rgba(148, 163, 184, 0.72);
}

.crucible-stage {
  position: absolute;
  z-index: 1;
  left: 50%;
  top: 47%;
  width: 320px;
  height: 320px;
  transform: translate(-50%, -50%);
}

.cauldron-aura {
  position: absolute;
  inset: 24px;
  border-radius: 50%;
  border: 1px dashed rgba(34, 211, 238, 0.28);
  box-shadow: 0 0 42px rgba(34, 211, 238, 0.12);
}

.cauldron-bowl {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 178px;
  height: 118px;
  transform: translate(-50%, -40%);
  border-radius: 34px 34px 76px 76px;
  border: 1px solid rgba(148, 163, 184, 0.26);
  background:
    linear-gradient(180deg, rgba(32, 42, 56, 0.98), rgba(8, 12, 20, 0.98)),
    radial-gradient(circle at 50% 12%, rgba(255, 255, 255, 0.12), transparent 46%);
  box-shadow:
    inset 0 10px 18px rgba(255, 255, 255, 0.04),
    0 18px 34px rgba(2, 8, 23, 0.44);
}

.liquid {
  position: absolute;
  left: 18px;
  right: 18px;
  top: 18px;
  height: 36px;
  border-radius: 50%;
  background: radial-gradient(circle at 40% 36%, rgba(255, 255, 255, 0.8), rgba(125, 211, 252, 0.56), rgba(14, 116, 144, 0.62));
  box-shadow: 0 0 18px rgba(34, 211, 238, 0.22);
}

.steam {
  position: absolute;
  bottom: 92px;
  width: 34px;
  height: 74px;
  border-radius: 999px;
  border-left: 1px solid rgba(125, 211, 252, 0.34);
  opacity: 0.56;
}
.steam-a { left: 44px; transform: rotate(8deg); }
.steam-b { left: 74px; height: 96px; transform: rotate(-3deg); }
.steam-c { left: 108px; transform: rotate(-10deg); }

.slot {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 62px;
  height: 62px;
  border-radius: 16px;
  border: 1px solid rgba(103, 232, 249, 0.28);
  background:
    linear-gradient(180deg, rgba(18, 27, 42, 0.96), rgba(8, 14, 24, 0.98)),
    radial-gradient(circle at top, rgba(255, 255, 255, 0.08), transparent 50%);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.05),
    0 10px 24px rgba(2, 8, 23, 0.28);
}

.catalyst-slot {
  border-color: rgba(192, 132, 252, 0.42);
}

.output-slot {
  border-color: rgba(245, 208, 138, 0.34);
}

.empty-slot {
  border-style: dashed;
  opacity: 0.55;
}

.item-icon {
  width: 38px;
  height: 38px;
  image-rendering: pixelated;
}

.output-icon {
  width: 40px;
  height: 40px;
}

.count {
  position: absolute;
  right: 5px;
  bottom: 4px;
  font-size: 11px;
  font-weight: 800;
  color: #f8fafc;
  text-shadow: 0 1px 2px rgba(2, 8, 23, 0.9);
}

.aspects-panel {
  position: absolute;
  z-index: 3;
  left: 50%;
  bottom: 34px;
  width: min(640px, calc(100% - 72px));
  transform: translateX(-50%);
}

.aspect-row {
  display: flex;
  justify-content: center;
  align-items: flex-start;
  gap: 20px;
}

.aspect-slot {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
  width: 46px;
  color: rgba(226, 232, 240, 0.9);
}

.aspect-slot.is-clickable {
  cursor: pointer;
}

.aspect-slot.is-clickable:hover .aspect-icon {
  transform: translateY(-1px) scale(1.08);
}

.aspect-icon {
  width: 36px;
  height: 36px;
  image-rendering: pixelated;
  filter: drop-shadow(0 0 8px color-mix(in srgb, var(--accent) 42%, transparent));
  transition: transform 160ms ease;
}

.aspect-amount {
  font-size: 14px;
  font-weight: 800;
  color: rgba(226, 232, 240, 0.94);
}
</style>
