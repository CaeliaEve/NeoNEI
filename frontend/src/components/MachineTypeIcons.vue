<script setup lang="ts">
import { ref } from 'vue';
import type { Recipe } from '../services/api';
import AnimatedItemIcon from './AnimatedItemIcon.vue';

export interface MachineCategory {
  type: 'crafting' | 'machine';
  name: string;
  recipeType: string;
  machineIcon: string | null;
  recipes: Recipe[];
  recipeCount?: number;
  machineKey?: string | null;
  voltageTier?: string | null;
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
  if (getMachineIconItemId(icon)) return '';
  if (icon.startsWith('http') || icon.startsWith('/')) return icon;
  return `${__BACKEND_BASE_URL__}/images/item/${icon}`;
};

const getMachineIconItemId = (icon: string | null): string | null => {
  if (!icon) return null;
  if (icon.startsWith('item:')) {
    return icon.slice('item:'.length);
  }
  if (icon.startsWith('i~')) {
    return icon;
  }
  const match = icon.match(/(?:^|\/)images\/item\/([^/]+)\/(.+?)\.(?:png|gif|webp)(?:$|\?)/i);
  if (match) {
    return `i~${decodeURIComponent(match[1])}~${decodeURIComponent(match[2])}`;
  }
  return null;
};

const handleSelect = (index: number) => {
  emit('update:modelValue', index);
  emit('select', index);
};

const setOptionRef = (element: unknown, index: number) => {
  optionRefs.value[index] = element instanceof HTMLButtonElement ? element : null;
};

const getCategoryCount = (category: MachineCategory): number =>
  typeof category.recipeCount === 'number' ? category.recipeCount : category.recipes.length;

const getDisplayName = (name: string): string => {
  const normalized = `${name ?? ''}`.trim();
  if (/mana\s*pool/i.test(normalized)) return '魔力池';
  if (/crucible/i.test(normalized)) return '坩埚';
  if (/crafting\s*\(shaped\)|codechicken.*shaped|crafting~shaped/i.test(normalized)) return '有序合成';
  if (/crafting\s*\(shapeless\)|codechicken.*shapeless|crafting~shapeless/i.test(normalized)) return '无序合成';
  if (/^rt~gregtech~gt\.recipe\.laserengraver/i.test(normalized)) return '激光蚀刻机';
  if (/^rt~gregtech~gt\.recipe\.implosioncompressor/i.test(normalized)) return '聚爆压缩机';
  if (/^rt~gregtech~gt\.recipe\.electricimplosioncompressor/i.test(normalized)) return '电动聚爆压缩机';
  if (/^rt~gregtech~gt\.recipe\.compressor/i.test(normalized)) return '压缩机';
  if (/^rt~gregtech~gt\.recipe\.bender/i.test(normalized)) return '压模机';
  return normalized.replace(/^\s*[A-Za-z0-9_ -]+\s+-\s+/, '').replace(/\s*\((ULV|LV|MV|HV|EV|IV|LuV|ZPM|UV|UHV|UEV|UIV|UMV|UXV|MAX)\)\s*$/i, '').trim() || normalized;
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
        :aria-label="`${getDisplayName(category.name)} (${getCategoryCount(category)} 个)`"
        @click="handleSelect(index)"
        @keydown="handleOptionKeydown($event, index)"
      >
        <span class="machine-icon-container" aria-hidden="true">
          <AnimatedItemIcon
            v-if="getMachineIconItemId(category.machineIcon)"
            :item-id="getMachineIconItemId(category.machineIcon)!"
            :size="38"
            class="machine-icon"
          />

          <img
            v-else-if="category.machineIcon"
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

        <span class="recipe-count-badge" aria-hidden="true">{{ getCategoryCount(category) }}</span>
        <span class="icon-tooltip" role="tooltip">{{ getDisplayName(category.name) }} ({{ getCategoryCount(category) }} 个)</span>
      </button>
    </div>
  </div>
</template>
<style scoped>
.machine-type-icons {
  position: relative;
  z-index: 20;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.018), transparent 18%),
    radial-gradient(circle at 50% 0%, rgba(107, 211, 255, 0.04), transparent 30%),
    linear-gradient(180deg, rgba(15, 20, 28, 0.92), rgba(8, 12, 18, 0.96));
  border: 1px solid rgba(140, 170, 209, 0.16);
  border-radius: 16px;
  padding: 12px 14px;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.035),
    inset 0 0 0 1px rgba(84, 114, 151, 0.04),
    0 14px 28px rgba(0, 0, 0, 0.22);
}

.icons-container {
  display: flex;
  gap: 12px;
  justify-content: center;
  flex-wrap: wrap;
  overflow: visible;
}

.icon-wrapper {
  position: relative;
  width: 50px;
  height: 50px;
  cursor: pointer;
  transition: transform 180ms ease;
  appearance: none;
  border: none;
  padding: 0;
  background: transparent;
}

.icon-wrapper:hover {
  transform: translateY(-2px);
}

.icon-wrapper:focus-visible {
  outline: 2px solid rgba(194, 210, 230, 0.7);
  outline-offset: 2px;
  border-radius: 12px;
}

.machine-icon-container {
  width: 50px;
  height: 50px;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.02), transparent 18%),
    linear-gradient(180deg, rgba(24, 31, 41, 0.94), rgba(13, 18, 26, 0.98));
  border: 1px solid rgba(147, 166, 191, 0.16);
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: border-color 170ms ease, background 170ms ease, box-shadow 170ms ease;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.025),
    0 8px 14px rgba(0, 0, 0, 0.18);
}

.icon-wrapper:hover .machine-icon-container {
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.026), transparent 18%),
    linear-gradient(180deg, rgba(29, 37, 48, 0.96), rgba(18, 24, 33, 0.99));
  border-color: rgba(182, 199, 220, 0.26);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.03),
    0 0 0 1px rgba(107, 211, 255, 0.05),
    0 12px 18px rgba(0, 0, 0, 0.22);
}

.icon-active .machine-icon-container {
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.03), transparent 20%),
    linear-gradient(180deg, rgba(31, 40, 53, 0.98), rgba(20, 28, 39, 1));
  border-color: rgba(179, 213, 242, 0.34);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.04),
    0 0 0 1px rgba(107, 211, 255, 0.1),
    0 0 20px rgba(107, 211, 255, 0.08),
    0 10px 18px rgba(0, 0, 0, 0.24);
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
  width: 38px;
  height: 38px;
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
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.03), transparent 20%),
    linear-gradient(180deg, rgba(53, 66, 84, 0.98), rgba(38, 49, 66, 1));
  border: 1px solid rgba(188, 204, 224, 0.28);
  border-radius: 10px;
  color: rgba(240, 246, 252, 0.96);
  font-size: 11px;
  font-weight: bold;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.04),
    0 4px 10px rgba(0, 0, 0, 0.24);
}

/* Tooltip */
.icon-tooltip {
  position: absolute;
  top: calc(100% + 8px);
  left: 50%;
  transform: translateX(-50%) scale(0.8);
  padding: 6px 12px;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.02), transparent 20%),
    rgba(10, 14, 20, 0.96);
  border: 1px solid rgba(157, 176, 198, 0.18);
  border-radius: 8px;
  color: rgba(223, 233, 245, 0.95);
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
  pointer-events: none;
  opacity: 0;
  transition: all 0.2s ease;
  z-index: 1200;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.03),
    0 12px 22px rgba(0, 0, 0, 0.34);
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
