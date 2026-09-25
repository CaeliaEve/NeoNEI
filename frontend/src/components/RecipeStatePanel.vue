<script setup lang="ts">
import { computed, useSlots } from 'vue';

interface Props {
  title: string;
  subtitle?: string;
  variant?: 'default' | 'error' | 'loading';
}

withDefaults(defineProps<Props>(), {
  subtitle: '',
  variant: 'default',
});

const slots = useSlots();
const hasActions = computed(() => Boolean(slots.actions));
</script>

<template>
  <div class="recipe-state-panel" :class="`variant-${variant}`">
    <div class="state-text-wrap">
      <p class="state-title">{{ title }}</p>
      <p v-if="subtitle" class="state-subtitle">{{ subtitle }}</p>
    </div>

    <div v-if="hasActions" class="state-actions">
      <slot name="actions" />
    </div>
  </div>
</template>

<style scoped>
.recipe-state-panel {
  --accent-rgb: var(--recipe-accent-rgb, 164, 181, 204);
  --recipe-state-border-style-default: dashed;
  --recipe-state-border-color-default: rgba(var(--accent-rgb), 0.34);
  --recipe-state-title-size-default: 22px;
  --recipe-state-title-color-default: rgba(238, 244, 252, 0.98);
  --recipe-state-subtitle-size-default: 14px;
  --recipe-state-subtitle-color-default: rgba(191, 203, 221, 0.92);
  --recipe-state-actions-gap-default: 10px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--recipe-state-gap, 14px);
  width: var(--recipe-state-width, auto);
  max-width: var(--recipe-state-max-width, none);
  padding: var(--recipe-state-padding, 24px);
  box-sizing: border-box;
  border-radius: var(--recipe-state-radius, 12px);
  border: var(
    --recipe-state-border,
    1px var(--recipe-state-border-style, var(--recipe-state-border-style-default)) var(--recipe-state-border-color, var(--recipe-state-border-color-default))
  );
  background: var(--recipe-state-bg, linear-gradient(180deg, rgba(11, 15, 20, 0.76), rgba(9, 13, 18, 0.84)));
  text-align: center;
  color: var(--recipe-state-text-color, rgba(222, 231, 244, 0.94));
}

.state-text-wrap {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-width: min(100%, 720px);
}

.state-title {
  margin: 0;
  font-size: var(--recipe-state-title-size, var(--recipe-state-title-size-default));
  font-weight: 700;
  color: var(--recipe-state-title-color, var(--recipe-state-title-color-default));
}

.state-subtitle {
  margin: 0;
  font-size: var(--recipe-state-subtitle-size, var(--recipe-state-subtitle-size-default));
  line-height: 1.65;
  color: var(--recipe-state-subtitle-color, var(--recipe-state-subtitle-color-default));
}

.state-actions {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--recipe-state-actions-gap, var(--recipe-state-actions-gap-default));
  flex-wrap: wrap;
}

.variant-loading {
  --recipe-state-border-style-default: solid;
}

.variant-error {
  --recipe-state-border-color-default: var(--recipe-state-error-border-color, rgba(237, 152, 157, 0.66));
  --recipe-state-bg: var(--recipe-state-bg, linear-gradient(180deg, rgba(36, 16, 20, 0.42), rgba(23, 10, 13, 0.54)));
  --recipe-state-title-color-default: var(--recipe-state-error-title-color, rgba(255, 223, 226, 0.98));
  --recipe-state-subtitle-color-default: var(--recipe-state-error-subtitle-color, rgba(255, 199, 205, 0.9));
}

@media (max-width: 720px) {
  .recipe-state-panel {
    padding: var(--recipe-state-padding-mobile, 18px);
  }

  .state-title {
    font-size: min(var(--recipe-state-title-size, var(--recipe-state-title-size-default)), var(--recipe-state-title-size-mobile, 18px));
  }

  .state-subtitle {
    font-size: min(var(--recipe-state-subtitle-size, var(--recipe-state-subtitle-size-default)), var(--recipe-state-subtitle-size-mobile, 13px));
  }
}
</style>
