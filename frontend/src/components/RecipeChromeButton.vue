<script setup lang="ts">
interface Props {
  type?: 'button' | 'submit' | 'reset';
  tone?: 'default' | 'quiet';
  compact?: boolean;
  disabled?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  type: 'button',
  tone: 'default',
  compact: false,
  disabled: false,
});

const emit = defineEmits<{
  click: [event: MouseEvent];
}>();

const handleClick = (event: MouseEvent) => {
  if (props.disabled) {
    return;
  }
  emit('click', event);
};
</script>

<template>
  <button
    :type="type"
    class="recipe-chrome-button"
    :class="[`tone-${tone}`, { 'is-compact': compact }]"
    :disabled="disabled"
    @click="handleClick"
  >
    <slot />
  </button>
</template>

<style scoped>
.recipe-chrome-button {
  --accent-rgb: var(--recipe-accent-rgb, 164, 181, 204);
  --accent-strong-rgb: var(--recipe-accent-strong-rgb, 195, 210, 228);
  appearance: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border: 1px solid rgba(var(--accent-rgb), 0.18);
  background: linear-gradient(180deg, rgba(20, 26, 34, 0.88), rgba(13, 18, 24, 0.92));
  color: rgba(230, 238, 247, 0.96);
  border-radius: 10px;
  padding: 9px 14px;
  min-height: 38px;
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.16px;
  cursor: pointer;
  transition:
    border-color 180ms ease,
    background 180ms ease,
    transform 180ms ease,
    box-shadow 180ms ease;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.03),
    0 6px 16px rgba(0, 0, 0, 0.22);
}

.recipe-chrome-button:hover:not(:disabled) {
  border-color: rgba(var(--accent-strong-rgb), 0.28);
  background: linear-gradient(180deg, rgba(27, 35, 45, 0.92), rgba(16, 22, 30, 0.96));
  transform: translateY(-1px);
}

.recipe-chrome-button:focus-visible {
  outline: none;
  border-color: rgba(var(--accent-strong-rgb), 0.34);
  box-shadow:
    0 0 0 3px rgba(var(--accent-strong-rgb), 0.18),
    inset 0 1px 0 rgba(255, 255, 255, 0.03),
    0 6px 16px rgba(0, 0, 0, 0.22);
}

.recipe-chrome-button:active:not(:disabled) {
  transform: translateY(0);
}

.recipe-chrome-button:disabled {
  opacity: 0.42;
  cursor: not-allowed;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.02);
}

.recipe-chrome-button.tone-quiet {
  background: linear-gradient(180deg, rgba(16, 21, 28, 0.76), rgba(11, 15, 20, 0.84));
}

.recipe-chrome-button.is-compact {
  min-height: 34px;
  padding: 7px 12px;
}

@media (prefers-reduced-motion: reduce) {
  .recipe-chrome-button {
    transition: border-color 140ms ease, background 140ms ease, box-shadow 140ms ease;
  }

  .recipe-chrome-button:hover:not(:disabled),
  .recipe-chrome-button:active:not(:disabled) {
    transform: none;
  }
}
</style>
