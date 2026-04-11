<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { getImageUrl, type Recipe, type RecipeInputCell } from '../services/api';
import type { UITypeConfig } from '../services/uiTypeMapping';
import { useSound } from '../services/sound.service';
import { buildOutputSlots, type ResolvedSlot } from '../composables/useRecipeSlots';
import {
  buildThaumcraftAspectCosts,
  mergeRecipeMetadata,
  type RitualAspectCost,
  type RitualItemStack,
  normalizeCount,
  getThaumcraftAspectImagePath,
  isThaumcraftAspectItem,
} from '../composables/ritualFamilyMetadata';
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

const SCALE = 2.55;
const OFFSET_X = 26;
const OFFSET_Y = 26;
const SLOT_SIZE = 42;
const stageWidth = Math.round(166 * SCALE + OFFSET_X * 2);
const stageHeight = Math.round(152 * SCALE + OFFSET_Y * 2);

const craftingGrid = ref<Array<RitualItemStack | null>>(Array.from({ length: 9 }, () => null));
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

function cellToItemStack(cell: RecipeInputCell): RitualItemStack | null {
  if (!cell) return null;
  if (Array.isArray(cell)) {
    const first = cell[0];
    return first ? { itemId: first.itemId, count: normalizeCount(first.count), localizedName: undefined } : null;
  }
  return {
    itemId: cell.itemId,
    count: normalizeCount(cell.count),
    localizedName: undefined,
  };
}

function rawEntryToItemStack(entry: unknown): RitualItemStack | null {
  if (!entry || typeof entry !== 'object') return null;
  const record = entry as {
    slotIndex?: unknown;
    itemId?: unknown;
    count?: unknown;
    stackSize?: unknown;
    localizedName?: unknown;
    item?: { itemId?: unknown; localizedName?: unknown };
    items?: Array<{
      item?: { itemId?: unknown; localizedName?: unknown };
      itemId?: unknown;
      count?: unknown;
      stackSize?: unknown;
      localizedName?: unknown;
    }>;
  };
  const first = Array.isArray(record.items) ? record.items[0] : null;
  const itemId =
    (typeof record.itemId === 'string' && record.itemId) ||
    (typeof record.item?.itemId === 'string' && record.item.itemId) ||
    (typeof first?.itemId === 'string' && first.itemId) ||
    (typeof first?.item?.itemId === 'string' && first.item.itemId) ||
    '';
  if (!itemId) return null;

  return {
    itemId,
    count: normalizeCount(record.count ?? record.stackSize ?? first?.count ?? first?.stackSize),
    localizedName:
      (typeof record.localizedName === 'string' && record.localizedName) ||
      (typeof record.item?.localizedName === 'string' ? record.item.localizedName : undefined) ||
      (typeof first?.localizedName === 'string' ? first.localizedName : undefined) ||
      (typeof first?.item?.localizedName === 'string' ? first.item.localizedName : undefined),
    slotIndex: typeof record.slotIndex === 'number' ? record.slotIndex : undefined,
  } as RitualItemStack & { slotIndex?: number };
}

function buildCraftingGridFromIndexedRaw(rawInputs: unknown): Array<RitualItemStack | null> | null {
  if (!Array.isArray(rawInputs)) return null;
  const stacks = rawInputs
    .map((entry) => rawEntryToItemStack(entry))
    .filter((entry): entry is RitualItemStack & { slotIndex?: number } => Boolean(entry))
    .filter((entry) => !isThaumcraftAspectItem(entry.itemId, entry.localizedName));

  if (stacks.length === 0) return null;

  const grid = Array.from({ length: 9 }, () => null as RitualItemStack | null);
  const positioned = stacks
    .filter((entry) => typeof entry.slotIndex === 'number' && Number.isFinite(entry.slotIndex))
    .map((entry) => ({
      entry,
      x: Math.floor(Number(entry.slotIndex) / 100),
      y: Number(entry.slotIndex) % 100,
    }));

  const xs = Array.from(new Set(positioned.map((entry) => entry.x))).sort((a, b) => a - b);
  const ys = Array.from(new Set(positioned.map((entry) => entry.y))).sort((a, b) => a - b);
  if (positioned.length === stacks.length && xs.length <= 3 && ys.length <= 3) {
    for (const item of positioned) {
      const col = xs.indexOf(item.x);
      const row = ys.indexOf(item.y);
      if (row >= 0 && row < 3 && col >= 0 && col < 3) {
        grid[row * 3 + col] = item.entry;
      }
    }
    return grid;
  }

  const sorted = [...stacks].sort((a, b) => Number(a.slotIndex ?? 0) - Number(b.slotIndex ?? 0));
  for (let index = 0; index < Math.min(sorted.length, 9); index += 1) {
    grid[index] = sorted[index];
  }
  return grid;
}

function buildCraftingGrid(rawInputs: Recipe['inputs']): Array<RitualItemStack | null> {
  const grid = Array.from({ length: 9 }, () => null as RitualItemStack | null);
  if (!Array.isArray(rawInputs)) return grid;

  for (let row = 0; row < 3; row += 1) {
    const rowCells = Array.isArray(rawInputs[row]) ? rawInputs[row] : [];
    for (let col = 0; col < 3; col += 1) {
      grid[row * 3 + col] = cellToItemStack(rowCells[col] ?? null);
    }
  }

  return grid;
}

function stageStyle(x: number, y: number, width = SLOT_SIZE, height = SLOT_SIZE) {
  return {
    left: `${OFFSET_X + x * SCALE}px`,
    top: `${OFFSET_Y + y * SCALE}px`,
    width: `${width}px`,
    height: `${height}px`,
  };
}

const gridStyles = computed(() => {
  const baseX = [40, 64, 88];
  const baseY = [40, 64, 88];
  return craftingGrid.value.map((_, index) => {
    const row = Math.floor(index / 3);
    const col = index % 3;
    return stageStyle(baseX[col], baseY[row]);
  });
});

const outputStyle = computed(() => stageStyle(74, 12, 46, 46));

const aspectEntries = computed(() => {
  const aspects = aspectCosts.value;
  const columns = aspects.length;
  const xOffset = (100 - columns * 20) / 2;
  return aspects.map((aspect, index) => ({
    aspect,
    style: {
      left: `${OFFSET_X + (36 + index * 18 + xOffset) * SCALE}px`,
      top: '6px',
      width: '34px',
      height: '46px',
    },
  }));
});

function handleItemClick(itemId: string) {
  playClick();
  emit('item-click', itemId);
}

async function initialize() {
  const rawInputs = props.recipe.additionalData?.rawIndexedInputs ?? props.recipe.inputs;
  craftingGrid.value = buildCraftingGridFromIndexedRaw(rawInputs) ?? buildCraftingGrid(props.recipe.inputs);
  aspectCosts.value = buildThaumcraftAspectCosts(props.recipe, rawInputs);
  const [resolvedOutput] = await buildOutputSlots(props.recipe, 1);
  outputSlot.value = resolvedOutput ?? null;
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
  <div class="thaum-page">
    <div class="thaum-stage" :style="{ width: `${stageWidth}px`, height: `${stageHeight}px` }">
      <div class="top-strip">
        <div class="top-pill left-pill">研究</div>
        <div class="top-pill right-pill">查看全部</div>
      </div>

      <div class="research-column">
        <div class="research-title">RESEARCH</div>
        <div v-if="researchLines.length" class="research-lines">
          <span v-for="line in researchLines" :key="line" class="research-line">{{ line }}</span>
        </div>
        <div v-else class="research-lines muted">
          <span class="research-line">Arcane Study</span>
        </div>
      </div>

      <div class="sigil-layer" aria-hidden="true">
        <div class="sigil sigil-a" />
        <div class="sigil sigil-b" />
        <div class="sigil sigil-c" />
      </div>

      <template v-for="(slot, index) in craftingGrid" :key="`arcane-grid-${index}`">
        <RecipeItemTooltip
          v-if="slot"
          :item-id="slot.itemId"
          :count="slot.count"
          @click="handleItemClick(slot.itemId)"
        >
          <div class="slot item-slot" :style="gridStyles[index]">
            <img
              :src="getImageUrl(slot.itemId)"
              class="item-icon"
              @error="(e) => { (e.target as HTMLImageElement).src = '/placeholder.png'; }"
            />
            <span v-if="slot.count > 1" class="count">{{ slot.count }}</span>
          </div>
        </RecipeItemTooltip>
        <div v-else class="slot empty-slot" :style="gridStyles[index]" />
      </template>

      <div class="result-lane" />
      <RecipeItemTooltip
        v-if="outputSlot"
        :item-id="outputSlot.itemId"
        :count="outputSlot.count"
        @click="handleItemClick(outputSlot.itemId)"
      >
        <div class="slot output-slot" :style="outputStyle">
          <img
            :src="getImageUrl(outputSlot.itemId)"
            class="item-icon"
            @error="(e) => { (e.target as HTMLImageElement).src = '/placeholder.png'; }"
          />
          <span v-if="outputSlot.count > 1" class="count">{{ outputSlot.count }}</span>
        </div>
      </RecipeItemTooltip>

      <div class="aspects-band">
        <div class="aspects-title">ASPECTS</div>
        <div class="aspects-row">
          <div
            v-for="entry in aspectEntries"
            :key="`${entry.aspect.name}-${entry.aspect.hash || 'plain'}`"
            class="aspect-slot"
            :style="entry.style"
          >
            <img
              :src="getThaumcraftAspectImagePath(entry.aspect)"
              class="aspect-icon"
              :alt="entry.aspect.name"
              @error="(e) => { (e.target as HTMLImageElement).src = '/placeholder.png'; }"
            />
            <span class="aspect-amount">{{ entry.aspect.amount }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.thaum-page {
  display: flex;
  justify-content: center;
  width: 100%;
  padding: 8px 0;
}

.thaum-stage {
  position: relative;
  overflow: hidden;
  border-radius: 18px;
  border: 1px solid rgba(100, 116, 139, 0.32);
  background:
    linear-gradient(180deg, rgba(15, 23, 36, 0.96), rgba(8, 13, 22, 0.98)),
    radial-gradient(circle at top, rgba(34, 211, 238, 0.08), transparent 38%);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.04),
    0 18px 36px rgba(2, 8, 23, 0.28);
}

.thaum-stage::before {
  content: '';
  position: absolute;
  inset: 14px;
  border-radius: 14px;
  border: 1px solid rgba(71, 85, 105, 0.18);
  background:
    linear-gradient(rgba(255, 255, 255, 0.02) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 255, 255, 0.02) 1px, transparent 1px);
  background-size: 22px 22px;
  pointer-events: none;
}

.top-strip {
  position: absolute;
  inset: 18px 18px auto 18px;
  display: flex;
  justify-content: space-between;
  pointer-events: none;
}

.top-pill {
  min-width: 96px;
  border-radius: 999px;
  border: 1px solid rgba(71, 85, 105, 0.28);
  background: rgba(15, 23, 42, 0.72);
  color: rgba(226, 232, 240, 0.76);
  padding: 6px 12px;
  font-size: 12px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  text-align: center;
}

.research-column {
  position: absolute;
  left: 18px;
  top: 58px;
  width: 120px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.research-title {
  font-size: 11px;
  letter-spacing: 0.18em;
  color: rgba(125, 211, 252, 0.78);
}

.research-lines {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.research-line {
  font-size: 12px;
  line-height: 1.25;
  color: rgba(226, 232, 240, 0.88);
}

.research-lines.muted .research-line {
  color: rgba(148, 163, 184, 0.74);
}

.sigil-layer {
  position: absolute;
  left: calc(26px + 82px);
  top: calc(26px + 86px);
  width: 150px;
  height: 150px;
  transform: translate(-50%, -50%);
  pointer-events: none;
}

.sigil {
  position: absolute;
  inset: 0;
  border-radius: 20px;
  border: 1px solid rgba(71, 85, 105, 0.2);
  transform: rotate(45deg);
}

.sigil-a { inset: 26px; border-color: rgba(34, 211, 238, 0.16); }
.sigil-b { inset: 46px; border-color: rgba(148, 163, 184, 0.18); }
.sigil-c {
  inset: 62px;
  border-color: rgba(192, 132, 252, 0.18);
  box-shadow: 0 0 18px rgba(34, 211, 238, 0.08);
}

.slot {
  position: absolute;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 12px;
  border: 1px solid rgba(71, 85, 105, 0.38);
  background:
    linear-gradient(180deg, rgba(18, 27, 42, 0.96), rgba(8, 14, 24, 0.98)),
    radial-gradient(circle at top, rgba(255, 255, 255, 0.08), transparent 50%);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.05),
    0 8px 18px rgba(2, 8, 23, 0.2);
}

.item-slot {
  border-color: rgba(74, 222, 128, 0.28);
}

.empty-slot {
  position: absolute;
  border-radius: 12px;
  border: 1px dashed rgba(71, 85, 105, 0.22);
  background: rgba(15, 23, 42, 0.2);
}

.output-slot {
  border-color: rgba(125, 211, 252, 0.42);
  box-shadow:
    0 10px 24px rgba(14, 165, 233, 0.14),
    inset 0 1px 0 rgba(255, 255, 255, 0.06);
}

.result-lane {
  position: absolute;
  left: calc(26px + 82px);
  top: calc(26px + 24px);
  width: 2px;
  height: 204px;
  background: linear-gradient(180deg, rgba(125, 211, 252, 0), rgba(125, 211, 252, 0.44), rgba(125, 211, 252, 0));
  transform: translateX(-50%);
  opacity: 0.6;
}

.item-icon {
  width: 28px;
  height: 28px;
  image-rendering: pixelated;
}

.count {
  position: absolute;
  right: 4px;
  bottom: 2px;
  font-size: 11px;
  font-weight: 700;
  color: #f8fafc;
  text-shadow: 0 1px 2px rgba(2, 8, 23, 0.9);
}

.aspects-band {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 18px;
  min-height: 96px;
}

.aspects-title {
  text-align: center;
  font-size: 11px;
  letter-spacing: 0.22em;
  color: rgba(125, 211, 252, 0.74);
}

.aspects-row {
  position: relative;
  height: 86px;
  margin-top: 6px;
}

.aspect-slot {
  position: absolute;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  gap: 4px;
}

.aspect-icon {
  width: 26px;
  height: 26px;
  image-rendering: pixelated;
}

.aspect-amount {
  font-size: 12px;
  font-weight: 700;
  color: rgba(226, 232, 240, 0.88);
}
</style>
