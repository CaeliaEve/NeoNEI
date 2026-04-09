<script setup lang="ts">
import { computed, useSlots } from 'vue';
import RecipeStatePanel from './RecipeStatePanel.vue';

interface Props {
  stageKey: string;
  transitionName?: string;
  stageShellClass?: string;
  statusClass?: string;
  statePanelClass?: string;
  loading?: boolean;
  loadingTitle?: string;
  loadingSubtitle?: string;
  errorTitle?: string;
  errorSubtitle?: string;
  empty?: boolean;
  emptyTitle?: string;
  emptySubtitle?: string;
}

const props = withDefaults(defineProps<Props>(), {
  transitionName: 'recipe-stage-morph',
  stageShellClass: '',
  statusClass: '',
  statePanelClass: '',
  loading: false,
  loadingTitle: 'Loading...',
  loadingSubtitle: '',
  errorTitle: '',
  errorSubtitle: '',
  empty: false,
  emptyTitle: '',
  emptySubtitle: '',
});

const slots = useSlots();

const hasStatusSlot = computed(() => Boolean(slots.status));
const hasErrorActions = computed(() => Boolean(slots['error-actions']));
const hasEmptyActions = computed(() => Boolean(slots['empty-actions']));
const resolvedStageShellClass = computed(() => props.stageShellClass || 'recipe-browser-stage__shell');
const resolvedStatusClass = computed(() => props.statusClass || 'recipe-browser-stage__status');
const resolvedStatePanelClass = computed(() => props.statePanelClass || 'recipe-browser-stage__panel');
</script>

<template>
  <div class="recipe-browser-stage">
    <div v-if="hasStatusSlot" :class="resolvedStatusClass">
      <slot name="status" />
    </div>

    <Transition :name="transitionName" mode="out-in">
      <div :key="stageKey" :class="resolvedStageShellClass">
        <RecipeStatePanel
          v-if="loading"
          :class="resolvedStatePanelClass"
          variant="loading"
          :title="loadingTitle"
          :subtitle="loadingSubtitle"
        />

        <RecipeStatePanel
          v-else-if="errorTitle"
          :class="resolvedStatePanelClass"
          variant="error"
          :title="errorTitle"
          :subtitle="errorSubtitle"
        >
          <template v-if="hasErrorActions" #actions>
            <slot name="error-actions" />
          </template>
        </RecipeStatePanel>

        <RecipeStatePanel
          v-else-if="empty"
          :class="resolvedStatePanelClass"
          :title="emptyTitle"
          :subtitle="emptySubtitle"
        >
          <template v-if="hasEmptyActions" #actions>
            <slot name="empty-actions" />
          </template>
        </RecipeStatePanel>

        <template v-else>
          <slot name="content" />
        </template>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.recipe-browser-stage {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
}

.recipe-browser-stage__status {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}

.recipe-browser-stage__shell {
  min-width: 0;
}

.recipe-browser-stage__panel {
  width: 100%;
}
</style>
