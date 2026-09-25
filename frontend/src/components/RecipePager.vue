<script setup lang="ts">
import RecipeChromeButton from './RecipeChromeButton.vue';

interface Props {
  progressText: string;
  prevLabel?: string;
  nextLabel?: string;
  prevTitle?: string;
  nextTitle?: string;
  prevDisabled?: boolean;
  nextDisabled?: boolean;
  prevTestId?: string;
  nextTestId?: string;
}

withDefaults(defineProps<Props>(), {
  prevLabel: 'Prev',
  nextLabel: 'Next',
  prevTitle: undefined,
  nextTitle: undefined,
  prevDisabled: false,
  nextDisabled: false,
  prevTestId: undefined,
  nextTestId: undefined,
});

const emit = defineEmits<{
  prev: [];
  next: [];
}>();
</script>

<template>
  <nav class="recipe-pager" aria-label="Recipe pagination">
    <RecipeChromeButton
      tone="quiet"
      compact
      :disabled="prevDisabled"
      :data-testid="prevTestId"
      :title="prevTitle ?? prevLabel"
      :aria-label="prevTitle ?? prevLabel"
      @click="emit('prev')"
    >
      {{ prevLabel }}
    </RecipeChromeButton>

    <p class="page-info" aria-live="polite" aria-atomic="true">{{ progressText }}</p>

    <RecipeChromeButton
      tone="quiet"
      compact
      :disabled="nextDisabled"
      :data-testid="nextTestId"
      :title="nextTitle ?? nextLabel"
      :aria-label="nextTitle ?? nextLabel"
      @click="emit('next')"
    >
      {{ nextLabel }}
    </RecipeChromeButton>
  </nav>
</template>

<style scoped>
.recipe-pager {
  --pager-gap: var(--recipe-pager-gap, 10px);
  --pager-row-gap: var(--recipe-pager-row-gap, 8px);
  --pager-justify: var(--recipe-pager-justify, center);
  --pager-info-min-width: var(--recipe-pager-info-min-width, 88px);
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: var(--pager-justify);
  gap: var(--pager-row-gap) var(--pager-gap);
}

.page-info {
  min-width: var(--pager-info-min-width);
  margin: 0;
  text-align: center;
  font-size: 13px;
  font-weight: 600;
  color: rgba(223, 232, 244, 0.96);
}

@media (max-width: 560px) {
  .page-info {
    flex-basis: 100%;
    order: 3;
  }
}
</style>
