<script setup lang="ts">
import { ref } from 'vue';
import type { Recipe } from '../services/api';

export interface MachineCategory {
  type: 'crafting' | 'machine';
  name: string;
  recipeType: string;
  machineIcon: string | null;
  recipes: Recipe[];
}

interface Props {
  categories: MachineCategory[];
  modelValue: number;
}

interface Emits {
  (e: 'update:modelValue', value: number): void;
  (e: 'select', index: number): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const optionRefs = ref<Array<HTMLButtonElement | null>>([]);

const getMachineIconPath = (icon: string | null): string => {
  if (!icon) return '/placeholder.png';
  if (icon.startsWith('http') || icon.startsWith('/')) return icon;
  return `${__BACKEND_BASE_URL__}/images/item/${icon}`;
};

const handleSelect = (index: number) => {
  emit('update:modelValue', index);
  emit('select', index);
};

const setOptionRef = (element: unknown, index: number) => {
  optionRefs.value[index] = element instanceof HTMLButtonElement ? element : null;
};

const focusOption = (index: number) => {
  optionRefs.value[index]?.focus();
};

const handleOptionKeydown = (event: KeyboardEvent, index: number) => {
  const maxIndex = props.categories.length - 1;
  if (maxIndex < 0) return;

  if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
    event.preventDefault();
    focusOption(index >= maxIndex ? 0 : index + 1);
    return;
  }

  if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
    event.preventDefault();
    focusOption(index <= 0 ? maxIndex : index - 1);
    return;
  }

  if (event.key === 'Home') {
    event.preventDefault();
    focusOption(0);
    return;
  }

  if (event.key === 'End') {
    event.preventDefault();
    focusOption(maxIndex);
  }
};
</script>

<template>
  <div class="machine-type-icons">
    <div class="icons-container" role="listbox" aria-label="配方类别" aria-orientation="horizontal">
      <button
        v-for="(category, index) in categories"
        :data-testid="`recipe-machine-option-${index}`"
        :key="`${category.recipeType}-${index}`"
        :ref="(el) => setOptionRef(el, index)"
        type="button"
        class="icon-wrapper"
        :class="{ 'icon-active': modelValue === index }"
        role="option"
        :aria-selected="modelValue === index"
        :tabindex="modelValue === index ? 0 : -1"
        :aria-label="`${category.name} (${category.recipes.length} 个)`"
        @click="handleSelect(index)"
        @keydown="handleOptionKeydown($event, index)"
      >
        <span class="machine-icon-container" aria-hidden="true">
          <img
            v-if="category.machineIcon"
            :src="getMachineIconPath(category.machineIcon)"
            class="machine-icon"
            @error="(e) => { (e.target as HTMLImageElement).src = '/placeholder.png' }"
          />

          <span v-else-if="category.type === 'crafting'" class="crafting-icon">
            <svg viewBox="0 0 24 24" width="32" height="32">
              <rect x="2" y="2" width="20" height="20" rx="2" fill="none" stroke="currentColor" stroke-width="2"/>
              <rect x="5" y="5" width="4" height="4" fill="currentColor"/>
              <rect x="10" y="5" width="4" height="4" fill="currentColor"/>
              <rect x="15" y="5" width="4" height="4" fill="currentColor"/>
              <rect x="5" y="10" width="4" height="4" fill="currentColor"/>
              <rect x="10" y="10" width="4" height="4" fill="currentColor"/>
              <rect x="15" y="10" width="4" height="4" fill="currentColor"/>
              <rect x="5" y="15" width="4" height="4" fill="currentColor"/>
              <rect x="10" y="15" width="4" height="4" fill="currentColor"/>
              <rect x="15" y="15" width="4" height="4" fill="currentColor"/>
            </svg>
          </span>

          <span v-else class="fallback-icon">?</span>
        </span>

        <span class="recipe-count-badge" aria-hidden="true">{{ category.recipes.length }}</span>
        <span class="icon-tooltip" role="tooltip">{{ category.name }} ({{ category.recipes.length }} 个)</span>
      </button>
    </div>
  </div>
</template>
<style scoped>
.machine-type-icons {
  background: linear-gradient(180deg, rgba(14, 18, 24, 0.84), rgba(10, 14, 19, 0.88));
  border: 1px solid rgba(156, 174, 198, 0.14);
  border-radius: 12px;
  padding: 10px 12px;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.03),
    0 10px 24px rgba(0, 0, 0, 0.26);
}

.icons-container {
  display: flex;
  gap: 10px;
  justify-content: center;
  flex-wrap: wrap;
}

.icon-wrapper {
  position: relative;
  width: 48px;
  height: 48px;
  cursor: pointer;
  transition: transform 180ms ease;
  appearance: none;
  border: none;
  padding: 0;
  background: transparent;
}

.icon-wrapper:hover {
  transform: translateY(-1px);
}

.icon-wrapper:focus-visible {
  outline: 2px solid rgba(194, 210, 230, 0.7);
  outline-offset: 2px;
  border-radius: 12px;
}

.machine-icon-container {
  width: 48px;
  height: 48px;
  background: linear-gradient(180deg, rgba(22, 27, 35, 0.86), rgba(15, 19, 25, 0.9));
  border: 1px solid rgba(147, 166, 191, 0.14);
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: border-color 170ms ease, background 170ms ease, box-shadow 170ms ease;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.02),
    0 4px 10px rgba(0, 0, 0, 0.18);
}

.icon-wrapper:hover .machine-icon-container {
  background: linear-gradient(180deg, rgba(28, 34, 43, 0.9), rgba(19, 24, 31, 0.94));
  border-color: rgba(182, 199, 220, 0.26);
}

.icon-active .machine-icon-container {
  background: linear-gradient(180deg, rgba(32, 39, 49, 0.92), rgba(22, 28, 36, 0.96));
  border-color: rgba(190, 206, 226, 0.36);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.04),
    0 0 0 1px rgba(183, 200, 220, 0.12),
    0 8px 16px rgba(0, 0, 0, 0.22);
}

.crafting-icon,
.machine-icon,
.fallback-icon {
  color: rgba(222, 233, 246, 0.95);
  filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.28));
  transition: filter 160ms ease, color 160ms ease;
}

.crafting-icon {
  width: 32px;
  height: 32px;
}

.machine-icon {
  width: 36px;
  height: 36px;
  image-rendering: pixelated;
  image-rendering: crisp-edges;
}

.fallback-icon {
  font-size: 28px;
  font-weight: bold;
}

.icon-wrapper:hover .crafting-icon,
.icon-wrapper:hover .machine-icon,
.icon-wrapper:hover .fallback-icon,
.icon-active .crafting-icon,
.icon-active .machine-icon,
.icon-active .fallback-icon {
  color: rgba(238, 245, 252, 0.98);
  filter: drop-shadow(0 3px 6px rgba(0, 0, 0, 0.34)) brightness(1.06);
}

/* Recipe Count Badge */
.recipe-count-badge {
  position: absolute;
  bottom: -4px;
  right: -4px;
  min-width: 20px;
  height: 20px;
  padding: 0 6px;
  background: linear-gradient(180deg, rgba(60, 72, 90, 0.96), rgba(45, 56, 74, 0.98));
  border: 1px solid rgba(188, 204, 224, 0.34);
  border-radius: 10px;
  color: rgba(240, 246, 252, 0.96);
  font-size: 11px;
  font-weight: bold;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.28);
}

/* Tooltip */
.icon-tooltip {
  position: absolute;
  bottom: -40px;
  left: 50%;
  transform: translateX(-50%) scale(0.8);
  padding: 6px 12px;
  background: rgba(12, 16, 21, 0.96);
  border: 1px solid rgba(157, 176, 198, 0.2);
  border-radius: 6px;
  color: rgba(223, 233, 245, 0.95);
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
  pointer-events: none;
  opacity: 0;
  transition: all 0.2s ease;
  z-index: 100;
  box-shadow: 0 10px 20px rgba(0, 0, 0, 0.36);
}

.icon-wrapper:hover .icon-tooltip {
  opacity: 1;
  transform: translateX(-50%) scale(1);
}

/* Responsive */
@media (max-width: 768px) {
  .machine-type-icons {
    padding: 8px;
  }

  .icons-container {
    gap: 8px;
  }

  .icon-wrapper {
    width: 42px;
    height: 42px;
  }

  .machine-icon-container {
    width: 42px;
    height: 42px;
  }

  .crafting-icon {
    width: 28px;
    height: 28px;
  }

  .machine-icon {
    width: 32px;
    height: 32px;
  }

  .fallback-icon {
    font-size: 24px;
  }

  .recipe-count-badge {
    min-width: 18px;
    height: 18px;
    font-size: 10px;
  }
}
</style>
