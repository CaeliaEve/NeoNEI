<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { api, getImageUrl, type Recipe } from '../services/api';
import type { UITypeConfig } from '../services/uiTypeMapping';
import { collectRecipeItemStacks, isThaumcraftAspectItem, type RitualItemStack } from '../composables/ritualFamilyMetadata';
import { buildOutputSlots, parseAdditionalData, type ResolvedSlot } from '../composables/useRecipeSlots';
import { useSound } from '../services/sound.service';
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

const inputItems = ref<RitualItemStack[]>([]);
const outputSlot = ref<ResolvedSlot | null>(null);

const machineType = computed(() => props.recipe.machineInfo?.machineType || props.recipe.recipeType || '');
const isCombination = computed(() => machineType.value.includes('要素组合'));
const inputAspects = computed(() =>
  inputItems.value.filter((item) => isThaumcraftAspectItem(item.itemId, item.localizedName)),
);
const sourceItems = computed(() =>
  inputItems.value
    .map((item, index) => ({ item, index }))
    .filter((entry) => !isThaumcraftAspectItem(entry.item.itemId, entry.item.localizedName))
    .sort((a, b) => (b.item.count - a.item.count) || (a.index - b.index))
    .map((entry) => entry.item),
);
const sourceColumns = computed(() => {
  const count = sourceItems.value.length;
  if (count >= 96) return 16;
  if (count >= 72) return 14;
  if (count >= 36) return 12;
  if (count >= 16) return 10;
  return Math.max(4, Math.min(8, count));
});
const aspectTitle = computed(() =>
  outputSlot.value?.localizedName?.replace(/^要素:\s*/i, '') || outputSlot.value?.itemId || 'Unknown',
);

function getRawInputSource(recipe: Recipe): unknown {
  const additional = parseAdditionalData(recipe);
  return additional?.rawIndexedInputs ?? recipe.inputs;
}

async function resolveName(item: RitualItemStack): Promise<RitualItemStack> {
  if (item.localizedName?.trim()) return item;
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
  inputItems.value = await Promise.all(stacks.map((item) => resolveName(item)));
  const [output] = await buildOutputSlots(props.recipe, 1);
  outputSlot.value = output ?? null;
}

function handleItemClick(itemId: string) {
  playClick();
  emit('item-click', itemId);
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
  <div class="aspect-ui" :class="{ 'is-combination': isCombination }">
    <div class="aspect-grid" aria-hidden="true" />

    <section class="aspect-summary">
      <div class="summary-pill">{{ isCombination ? '要素组合' : '物品中的要素' }}</div>
      <div class="summary-title">{{ aspectTitle }}</div>
      <div class="summary-subtitle">
        {{ isCombination ? 'Aspect synthesis matrix' : `${sourceItems.length} item sources` }}
      </div>
    </section>

    <section class="aspect-core">
      <div class="core-ring core-ring-outer" />
      <div class="core-ring core-ring-inner" />
      <RecipeItemTooltip
        v-if="outputSlot"
        :item-id="outputSlot.itemId"
        :count="outputSlot.count"
        @click="handleItemClick(outputSlot.itemId)"
      >
        <div class="aspect-focus">
          <AnimatedItemIcon
            :item-id="outputSlot.itemId"
            :render-asset-ref="outputSlot.renderAssetRef || null"
            :image-file-name="outputSlot.imageFileName || null"
            :size="54"
            class="aspect-focus-icon"
          />
          <span v-if="outputSlot.count > 1" class="count">{{ outputSlot.count }}</span>
        </div>
      </RecipeItemTooltip>
    </section>

    <section v-if="isCombination" class="combination-panel">
      <template
        v-for="(aspect, index) in inputAspects"
        :key="aspect.itemId"
      >
        <RecipeItemTooltip
          :item-id="aspect.itemId"
          :count="aspect.count"
          @click="handleItemClick(aspect.itemId)"
        >
          <div class="aspect-input-slot">
            <AnimatedItemIcon
              :item-id="aspect.itemId"
              :size="38"
              class="aspect-icon"
            />
            <span v-if="aspect.count > 1" class="count">{{ aspect.count }}</span>
          </div>
        </RecipeItemTooltip>
        <div v-if="index === 0 && inputAspects.length > 1" class="combine-arrow">+</div>
      </template>
    </section>

    <section v-else class="source-panel">
      <div class="panel-label">ITEM SOURCES</div>
      <div class="source-grid" :style="{ gridTemplateColumns: `repeat(${sourceColumns}, 44px)` }">
        <RecipeItemTooltip
          v-for="item in sourceItems"
          :key="item.itemId"
          :item-id="item.itemId"
          :count="item.count"
          @click="handleItemClick(item.itemId)"
        >
          <div class="source-slot">
            <AnimatedItemIcon
              :item-id="item.itemId"
              :size="38"
              class="source-icon"
            />
            <span class="count aspect-source-count">{{ item.count }}</span>
          </div>
        </RecipeItemTooltip>
      </div>
    </section>
  </div>
</template>

<style scoped>
.aspect-ui {
  position: relative;
  width: 880px;
  max-width: calc(100vw - 96px);
  height: 560px;
  flex: 0 0 auto;
  overflow: hidden;
  padding: 24px;
  border-radius: 22px;
  border: 1px solid rgba(96, 165, 250, 0.2);
  background:
    radial-gradient(circle at 50% 42%, rgba(168, 85, 247, 0.13), transparent 28%),
    linear-gradient(180deg, rgba(8, 14, 26, 0.98), rgba(5, 9, 17, 0.99));
  box-shadow:
    0 22px 52px rgba(2, 8, 23, 0.44),
    inset 0 1px 0 rgba(255, 255, 255, 0.05);
}

.aspect-grid {
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

.aspect-summary {
  position: absolute;
  z-index: 2;
  left: 30px;
  top: 30px;
  width: 230px;
  padding: 16px;
  border-radius: 16px;
  border: 1px solid rgba(148, 163, 184, 0.14);
  background: rgba(8, 14, 25, 0.76);
}

.summary-pill {
  display: inline-flex;
  min-width: 112px;
  justify-content: center;
  padding: 7px 14px;
  border-radius: 999px;
  border: 1px solid rgba(125, 211, 252, 0.2);
  color: rgba(226, 232, 240, 0.86);
  background: rgba(15, 23, 42, 0.72);
  font-size: 13px;
}

.summary-title {
  margin-top: 20px;
  font-size: 13px;
  letter-spacing: 0.22em;
  color: rgba(125, 211, 252, 0.82);
  text-transform: uppercase;
}

.summary-subtitle {
  margin-top: 12px;
  color: rgba(226, 232, 240, 0.84);
  font-size: 14px;
}

.aspect-core {
  position: absolute;
  z-index: 2;
  left: 50%;
  top: 44%;
  width: 260px;
  height: 260px;
  transform: translate(-50%, -50%);
  display: flex;
  align-items: center;
  justify-content: center;
}

.core-ring {
  position: absolute;
  border-radius: 50%;
  border: 1px solid rgba(168, 85, 247, 0.28);
}

.core-ring-outer {
  inset: 0;
  border-style: dashed;
  box-shadow: 0 0 36px rgba(168, 85, 247, 0.12);
}

.core-ring-inner {
  inset: 54px;
  border-color: rgba(34, 211, 238, 0.22);
}

.aspect-focus,
.aspect-input-slot,
.source-slot {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 16px;
  border: 1px solid rgba(192, 132, 252, 0.34);
  background:
    linear-gradient(180deg, rgba(18, 27, 42, 0.96), rgba(8, 14, 24, 0.98)),
    radial-gradient(circle at top, rgba(255, 255, 255, 0.08), transparent 50%);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.05),
    0 10px 24px rgba(2, 8, 23, 0.28);
}

.aspect-focus {
  width: 76px;
  height: 76px;
  border-color: rgba(245, 208, 138, 0.42);
}

.aspect-focus-icon {
  width: 48px;
  height: 48px;
  image-rendering: pixelated;
}

.combination-panel {
  position: absolute;
  z-index: 3;
  left: 50%;
  bottom: 72px;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 22px;
}

.aspect-input-slot {
  width: 64px;
  height: 64px;
}

.aspect-icon {
  width: 42px;
  height: 42px;
  image-rendering: pixelated;
}

.combine-arrow {
  color: rgba(226, 232, 240, 0.68);
  font-size: 28px;
  font-weight: 800;
}

.source-panel {
  position: absolute;
  z-index: 3;
  left: 30px;
  right: 30px;
  bottom: 24px;
  padding: 14px 16px 16px;
  border-radius: 16px;
  border: 1px solid rgba(148, 163, 184, 0.14);
  background: rgba(8, 14, 25, 0.64);
}

.panel-label {
  margin-bottom: 10px;
  color: rgba(125, 211, 252, 0.8);
  font-size: 11px;
  letter-spacing: 0.22em;
}

.source-grid {
  display: grid;
  gap: 8px 10px;
  justify-content: center;
  max-height: 186px;
  overflow: hidden auto;
  padding-right: 4px;
}

.source-slot {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  border-color: rgba(103, 232, 249, 0.2);
}

.source-icon {
  width: 30px;
  height: 30px;
  image-rendering: pixelated;
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

.aspect-source-count {
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.86);
  border: 1px solid rgba(125, 211, 252, 0.24);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
}
</style>
