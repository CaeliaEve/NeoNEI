<script setup lang="ts">
import { computed } from 'vue';
import type { Recipe, RecipeItem, RecipeUiPayload } from '../services/api';
import AnimatedItemIcon from './AnimatedItemIcon.vue';
import RecipeItemTooltip from './RecipeItemTooltip.vue';

interface NativeSlotFact {
  role?: string;
  startIndex?: number;
  columns?: number;
  rows?: number;
  x?: number;
  y?: number;
}

interface Props {
  recipe: Recipe;
  uiPayload?: RecipeUiPayload | null;
}

interface Emits {
  (e: 'item-click', itemId: string): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const SLOT = 32;

const nativeLayout = computed(() => {
  const layout = props.uiPayload?.nativeLayout;
  return layout && typeof layout === 'object' ? layout as Record<string, unknown> : null;
});

const slots = computed<NativeSlotFact[]>(() => {
  const raw = nativeLayout.value?.slots;
  return Array.isArray(raw) ? raw as NativeSlotFact[] : [];
});

const title = computed(() => (
  String(props.uiPayload?.machineType ?? props.recipe.machineInfo?.machineType ?? props.recipe.recipeType ?? 'NEI Recipe')
));

const subtitle = computed(() => (
  String((props.uiPayload?.handler as Record<string, unknown> | undefined)?.canonicalMachineFamily ?? props.uiPayload?.familyKey ?? 'native-nei')
));

const inputItems = computed<RecipeItem[]>(() => {
  const out: RecipeItem[] = [];
  for (const row of props.recipe.inputs ?? []) {
    if (!Array.isArray(row)) continue;
    for (const cell of row) {
      const item = Array.isArray(cell) ? cell[0] : cell;
      if (item?.itemId) out.push(item as RecipeItem);
    }
  }
  return out;
});

const outputItems = computed<RecipeItem[]>(() => (props.recipe.outputs ?? []).filter((item): item is RecipeItem => Boolean(item?.itemId)));

function itemsForRole(role?: string): RecipeItem[] {
  const normalized = String(role ?? '').toLowerCase();
  if (normalized.includes('output')) return outputItems.value;
  return inputItems.value;
}

function itemAt(slot: NativeSlotFact, index: number): RecipeItem | null {
  const items = itemsForRole(slot.role);
  const start = Number(slot.startIndex ?? 0);
  return items[start + index] ?? null;
}

function slotStyle(slot: NativeSlotFact) {
  const columns = Math.max(1, Number(slot.columns ?? 1));
  const rows = Math.max(1, Number(slot.rows ?? 1));
  return {
    gridTemplateColumns: `repeat(${columns}, ${SLOT}px)`,
    gridTemplateRows: `repeat(${rows}, ${SLOT}px)`,
  };
}

function slotCount(slot: NativeSlotFact): number {
  return Math.max(1, Number(slot.columns ?? 1)) * Math.max(1, Number(slot.rows ?? 1));
}
</script>

<template>
  <section class="native-nei-card" aria-label="Native NEI recipe layout">
    <header class="native-nei-header">
      <div>
        <div class="native-eyebrow">NATIVE NEI LAYOUT</div>
        <h3>{{ title }}</h3>
      </div>
      <code>{{ subtitle }}</code>
    </header>

    <div class="native-nei-body">
      <div
        v-for="(slot, groupIndex) in slots"
        :key="`${slot.role}-${groupIndex}`"
        class="slot-bank"
        :class="[`role-${slot.role || 'item'}`]"
        :style="slotStyle(slot)"
      >
        <div
          v-for="index in slotCount(slot)"
          :key="index"
          class="native-slot"
          :class="{ output: String(slot.role || '').includes('output') }"
        >
          <RecipeItemTooltip
            v-if="itemAt(slot, index - 1)"
            :item-id="itemAt(slot, index - 1)!.itemId"
            :count="itemAt(slot, index - 1)!.count"
            @click="emit('item-click', itemAt(slot, index - 1)!.itemId)"
          >
            <AnimatedItemIcon
              :item-id="itemAt(slot, index - 1)!.itemId"
              :render-asset-ref="itemAt(slot, index - 1)!.renderAssetRef"
              :image-file-name="itemAt(slot, index - 1)!.imageFileName"
              :size="26"
            />
          </RecipeItemTooltip>
        </div>
      </div>
      <div v-if="slots.length === 0" class="empty-layout">NEI layout facts unavailable</div>
    </div>
  </section>
</template>

<style scoped>
.native-nei-card {
  width: min(760px, 100%);
  min-height: 360px;
  padding: 22px;
  border-radius: 22px;
  border: 1px solid rgba(142, 166, 190, 0.2);
  background:
    radial-gradient(circle at 50% 42%, rgba(74, 136, 160, 0.18), transparent 38%),
    linear-gradient(145deg, rgba(12, 17, 24, 0.94), rgba(20, 25, 33, 0.9));
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.05), 0 24px 70px rgba(0, 0, 0, 0.42);
}

.native-nei-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
  margin-bottom: 22px;
}

.native-eyebrow {
  font-size: 10px;
  letter-spacing: 0.22em;
  color: rgba(128, 213, 226, 0.74);
}

h3 {
  margin: 4px 0 0;
  color: rgba(237, 245, 252, 0.96);
  font-size: 19px;
  font-weight: 700;
}

code {
  color: rgba(177, 190, 205, 0.76);
  font-size: 11px;
}

.native-nei-body {
  min-height: 260px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 28px;
  flex-wrap: wrap;
}

.slot-bank {
  display: grid;
  gap: 7px;
  padding: 12px;
  border-radius: 17px;
  border: 1px solid rgba(124, 148, 172, 0.18);
  background: rgba(6, 10, 15, 0.38);
  box-shadow: inset 0 1px 16px rgba(126, 210, 230, 0.05);
}

.native-slot {
  width: 32px;
  height: 32px;
  display: grid;
  place-items: center;
  border-radius: 9px;
  border: 1px solid rgba(160, 178, 198, 0.24);
  background: linear-gradient(145deg, rgba(24, 30, 38, 0.88), rgba(8, 12, 18, 0.9));
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.05), inset 0 -8px 18px rgba(0, 0, 0, 0.22);
}

.native-slot.output {
  border-color: rgba(248, 181, 92, 0.42);
  box-shadow: 0 0 18px rgba(248, 181, 92, 0.12), inset 0 1px 0 rgba(255, 255, 255, 0.06);
}

.empty-layout {
  color: rgba(180, 194, 210, 0.64);
  font-size: 13px;
}
</style>
