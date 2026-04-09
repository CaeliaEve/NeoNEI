<script setup lang="ts">
import { computed, useSlots } from 'vue';
import MachineTypeIcons, { type MachineCategory } from './MachineTypeIcons.vue';
import RecipePager from './RecipePager.vue';

interface RecipeBrowseTab {
  key: string;
  label: string;
  count?: number;
  disabled?: boolean;
  visible?: boolean;
}

interface Props {
  tabs: RecipeBrowseTab[];
  activeTab: string;
  machineCategories: unknown[];
  selectedMachineIndex: number;
  showMachineRail?: boolean;
  progressText: string;
  prevLabel: string;
  nextLabel: string;
  prevTitle: string;
  nextTitle: string;
  prevTestId?: string;
  nextTestId?: string;
  prevDisabled?: boolean;
  nextDisabled?: boolean;
  pagerClass?: string;
}

const props = withDefaults(defineProps<Props>(), {
  showMachineRail: true,
  prevTestId: undefined,
  nextTestId: undefined,
  prevDisabled: false,
  nextDisabled: false,
  pagerClass: '',
});

const emit = defineEmits<{
  (e: 'select-tab', key: string): void;
  (e: 'select-machine', index: number): void;
  (e: 'prev'): void;
  (e: 'next'): void;
}>();

const slots = useSlots();

const hasSummarySlot = computed(() => Boolean(slots.summary));
const hasSearchSlot = computed(() => Boolean(slots.search));
const hasMetaSlot = computed(() => Boolean(slots.meta));

const visibleTabs = computed(() => props.tabs.filter((tab) => tab.visible !== false));
const resolvedMachineCategories = computed(() => props.machineCategories as MachineCategory[]);
const shouldShowMachineRail = computed(
  () => props.showMachineRail && resolvedMachineCategories.value.length > 0,
);
const resolvedPagerClass = computed(() => [
  'recipe-browse-controls__pager',
  props.pagerClass,
]);

const formatTabLabel = (tab: RecipeBrowseTab): string =>
  typeof tab.count === 'number' ? `${tab.label}（${tab.count}）` : tab.label;
</script>

<template>
  <section class="recipe-browse-controls">
    <div v-if="hasSummarySlot" class="recipe-browse-controls__summary">
      <slot name="summary" />
    </div>

    <nav
      v-if="visibleTabs.length > 0"
      class="recipe-browse-controls__tabs"
      aria-label="Recipe browser tabs"
    >
      <button
        v-for="tab in visibleTabs"
        :key="tab.key"
        type="button"
        class="recipe-browse-controls__tab"
        :class="{ 'is-active': activeTab === tab.key }"
        :disabled="tab.disabled"
        :aria-pressed="activeTab === tab.key"
        @click="emit('select-tab', tab.key)"
      >
        {{ formatTabLabel(tab) }}
      </button>
    </nav>

    <div v-if="hasSearchSlot" class="recipe-browse-controls__search">
      <slot name="search" />
    </div>

    <div v-if="shouldShowMachineRail" class="recipe-browse-controls__rail">
      <MachineTypeIcons
        :categories="resolvedMachineCategories"
        :model-value="selectedMachineIndex"
        @update:model-value="emit('select-machine', $event)"
        @select="emit('select-machine', $event)"
      />
    </div>

    <div v-if="hasMetaSlot" class="recipe-browse-controls__meta">
      <slot name="meta" />
    </div>

    <RecipePager
      :class="resolvedPagerClass"
      :progress-text="progressText"
      :prev-label="prevLabel"
      :next-label="nextLabel"
      :prev-title="prevTitle"
      :next-title="nextTitle"
      :prev-test-id="prevTestId"
      :next-test-id="nextTestId"
      :prev-disabled="prevDisabled"
      :next-disabled="nextDisabled"
      @prev="emit('prev')"
      @next="emit('next')"
    />
  </section>
</template>

<style scoped>
.recipe-browse-controls {
  --accent-rgb: var(--recipe-accent-rgb, 164, 181, 204);
  --accent-strong-rgb: var(--recipe-accent-strong-rgb, 195, 210, 228);
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-width: 0;
}

.recipe-browse-controls__summary,
.recipe-browse-controls__search,
.recipe-browse-controls__meta,
.recipe-browse-controls__rail {
  min-width: 0;
}

.recipe-browse-controls__tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
}

.recipe-browse-controls__tab {
  appearance: none;
  border: 1px solid rgba(var(--accent-rgb), 0.18);
  background: linear-gradient(180deg, rgba(19, 24, 31, 0.88), rgba(13, 17, 22, 0.92));
  color: rgba(221, 231, 244, 0.94);
  border-radius: 999px;
  padding: 10px 16px;
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.02em;
  cursor: pointer;
  transition:
    border-color 160ms ease,
    background 160ms ease,
    color 160ms ease,
    transform 160ms ease,
    box-shadow 160ms ease;
}

.recipe-browse-controls__tab:hover:not(:disabled) {
  transform: translateY(-1px);
  border-color: rgba(var(--accent-strong-rgb), 0.32);
  background: linear-gradient(180deg, rgba(26, 32, 41, 0.92), rgba(17, 22, 29, 0.96));
}

.recipe-browse-controls__tab.is-active {
  border-color: rgba(var(--accent-strong-rgb), 0.42);
  background: linear-gradient(180deg, rgba(33, 40, 50, 0.94), rgba(21, 27, 35, 0.98));
  color: rgba(243, 248, 252, 0.98);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.05),
    0 8px 18px rgba(0, 0, 0, 0.22);
}

.recipe-browse-controls__tab:disabled {
  opacity: 0.42;
  cursor: not-allowed;
}

.recipe-browse-controls__pager {
  margin-top: 2px;
}

@media (max-width: 720px) {
  .recipe-browse-controls {
    gap: 12px;
  }

  .recipe-browse-controls__tabs {
    gap: 8px;
  }

  .recipe-browse-controls__tab {
    width: 100%;
    justify-content: center;
    text-align: center;
  }
}
</style>
