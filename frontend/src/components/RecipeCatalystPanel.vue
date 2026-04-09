<script setup lang="ts">
import { computed } from "vue";

export interface Catalyst {
  machineName: string;
  machineIcon: string | null;
  recipeType: string;
  recipeCount: number;
  isActive: boolean;
}

interface Props {
  catalysts: Catalyst[];
  modelValue: string | null;
  visible?: boolean;
}

interface Emits {
  (e: "update:modelValue", value: string | null): void;
  (e: "toggle"): void;
}

const props = withDefaults(defineProps<Props>(), {
  visible: false,
});

const emit = defineEmits<Emits>();

const isExpanded = computed(() => props.visible);

const selectedRecipeType = computed({
  get: () => props.modelValue,
  set: (value: string | null) => emit("update:modelValue", value),
});

const togglePanel = () => emit("toggle");

const selectCatalyst = (recipeType: string) => {
  selectedRecipeType.value =
    selectedRecipeType.value === recipeType ? null : recipeType;
};

const getMachineIconPath = (icon: string | null): string => {
  if (!icon) return "/placeholder.png";
  if (icon.startsWith("http") || icon.startsWith("/")) return icon;
  return `${__BACKEND_BASE_URL__}/images/item/${icon}`;
};
</script>

<template>
  <Teleport to="body">
    <Transition name="slide">
      <div
        v-if="catalysts.length > 0"
        class="recipe-catalyst-panel"
        :class="{ 'is-expanded': isExpanded }"
      >
        <button
          type="button"
          class="panel-toggle"
          :class="{ 'is-visible': isExpanded }"
          @click="togglePanel"
          :title="isExpanded ? '隐藏催化剂面板' : '显示可制作该配方的机器'"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" :class="{ rotated: isExpanded }">
            <polygon points="3,5 8,10 13,5" fill="none" stroke="currentColor" stroke-width="2" />
          </svg>
        </button>

        <Transition name="slide-left">
          <div v-if="isExpanded" class="catalyst-list">
            <button
              v-for="catalyst in catalysts"
              :key="catalyst.recipeType"
              type="button"
              class="catalyst-item"
              :class="{ 'is-active': catalyst.isActive }"
              @click="selectCatalyst(catalyst.recipeType)"
              :title="`${catalyst.machineName} (${catalyst.recipeCount} 个配方)`"
            >
              <div class="catalyst-icon">
                <img
                  v-if="catalyst.machineIcon"
                  :src="getMachineIconPath(catalyst.machineIcon)"
                  :alt="catalyst.machineName"
                  class="machine-icon"
                />
                <span v-else class="no-icon">?</span>
              </div>
              <div class="catalyst-info">
                <div class="catalyst-name">{{ catalyst.machineName }}</div>
                <div class="catalyst-count">{{ catalyst.recipeCount }}</div>
              </div>
            </button>
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.recipe-catalyst-panel {
  position: fixed;
  left: 16px;
  top: 50%;
  transform: translateY(-50%);
  z-index: 100;
  display: flex;
  flex-direction: row;
  align-items: flex-start;
  gap: 8px;
}

.panel-toggle {
  width: 30px;
  height: 56px;
  border-radius: 10px;
  border: 1px solid rgba(156, 174, 198, 0.16);
  background: linear-gradient(180deg, rgba(20, 26, 34, 0.88), rgba(13, 18, 24, 0.92));
  color: rgba(226, 235, 246, 0.94);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.03),
    0 10px 22px rgba(0, 0, 0, 0.3);
  transition: border-color 170ms ease, background 170ms ease, transform 170ms ease;
}

.panel-toggle:hover {
  border-color: rgba(192, 207, 226, 0.24);
  background: linear-gradient(180deg, rgba(25, 32, 41, 0.92), rgba(16, 21, 28, 0.94));
  transform: translateY(-1px);
}

.panel-toggle svg {
  transition: transform 180ms ease;
}

.panel-toggle svg.rotated {
  transform: rotate(180deg);
}

.catalyst-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  border: 1px solid rgba(156, 174, 198, 0.14);
  border-radius: 12px;
  padding: 10px;
  max-height: 78vh;
  overflow-y: auto;
  background: linear-gradient(180deg, rgba(14, 18, 24, 0.92), rgba(10, 14, 19, 0.94));
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.03),
    0 14px 30px rgba(0, 0, 0, 0.36);
}

.catalyst-list::-webkit-scrollbar {
  width: 6px;
}

.catalyst-list::-webkit-scrollbar-track {
  background: rgba(12, 16, 21, 0.6);
  border-radius: 999px;
}

.catalyst-list::-webkit-scrollbar-thumb {
  background: linear-gradient(180deg, rgba(147, 166, 191, 0.68), rgba(118, 136, 160, 0.78));
  border-radius: 999px;
}

.catalyst-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px;
  min-width: 162px;
  border-radius: 10px;
  border: 1px solid rgba(147, 166, 191, 0.14);
  background: linear-gradient(180deg, rgba(20, 25, 33, 0.84), rgba(14, 18, 24, 0.88));
  cursor: pointer;
  transition: border-color 160ms ease, background 160ms ease, transform 160ms ease;
}

.catalyst-item:hover {
  border-color: rgba(182, 199, 220, 0.26);
  background: linear-gradient(180deg, rgba(28, 34, 43, 0.9), rgba(19, 24, 31, 0.94));
  transform: translateY(-1px);
}

.catalyst-item.is-active {
  border-color: rgba(190, 206, 226, 0.36);
  background: linear-gradient(180deg, rgba(32, 39, 49, 0.92), rgba(22, 28, 36, 0.96));
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.04),
    0 0 0 1px rgba(183, 200, 220, 0.12);
}

.catalyst-icon {
  width: 20px;
  height: 20px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.machine-icon {
  width: 18px;
  height: 18px;
  image-rendering: pixelated;
  image-rendering: crisp-edges;
}

.no-icon {
  font-size: 14px;
  font-weight: bold;
  color: rgba(179, 194, 213, 0.72);
}

.catalyst-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  text-align: left;
}

.catalyst-name {
  font-size: 12px;
  font-weight: 600;
  color: rgba(228, 236, 246, 0.96);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.catalyst-count {
  font-size: 11px;
  color: rgba(183, 197, 215, 0.78);
}

.slide-enter-active,
.slide-leave-active {
  transition: all 260ms ease;
}

.slide-enter-from,
.slide-leave-to {
  opacity: 0;
  transform: translateY(-50%) translateX(-24px);
}

.slide-left-enter-active,
.slide-left-leave-active {
  transition: all 220ms ease;
}

.slide-left-enter-from,
.slide-left-leave-to {
  opacity: 0;
  transform: translateX(-18px);
}
</style>
