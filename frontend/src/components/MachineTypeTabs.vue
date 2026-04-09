<script setup lang="ts">
import { computed, ref } from "vue";
import { useSound } from "../services/sound.service";

export interface MachineTypeTab {
  recipeType: string;
  machineName: string;
  machineIcon: string | null;
  recipeCount: number;
}

interface Props {
  tabs: MachineTypeTab[];
  modelValue: number;
}

interface Emits {
  (e: "update:modelValue", value: number): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();
const { playClick } = useSound();

const tabsContainerRef = ref<HTMLElement | null>(null);

const selectedIndex = computed({
  get: () => props.modelValue,
  set: (value: number) => emit("update:modelValue", value),
});

const scrollToTab = (index: number) => {
  if (!tabsContainerRef.value) return;
  const tabs = tabsContainerRef.value.children;
  if (!tabs[index]) return;
  tabs[index].scrollIntoView({
    behavior: "smooth",
    block: "nearest",
    inline: "center",
  });
};

const selectTab = (index: number) => {
  selectedIndex.value = index;
  scrollToTab(index);
  playClick();
};

const getMachineIconPath = (icon: string | null): string => {
  if (!icon) return "/placeholder.png";
  if (icon.startsWith("http") || icon.startsWith("/")) return icon;
  return `${__BACKEND_BASE_URL__}/images/item/${icon}`;
};
</script>

<template>
  <div class="machine-type-tabs">
    <div ref="tabsContainerRef" class="tabs-container">
      <button
        v-for="(tab, index) in tabs"
        :key="`${tab.recipeType}-${index}`"
        type="button"
        class="tab"
        :class="{ 'tab-active': selectedIndex === index }"
        :data-tooltip="`${tab.machineName} (${tab.recipeCount})`"
        @click="selectTab(index)"
      >
        <div class="tab-icon">
          <img
            v-if="tab.machineIcon"
            :src="getMachineIconPath(tab.machineIcon)"
            :alt="tab.machineName"
            class="machine-icon"
          />
          <span v-else class="no-icon">?</span>
        </div>
      </button>
    </div>
  </div>
</template>

<style scoped>
.machine-type-tabs {
  width: 100%;
  border: 1px solid rgba(156, 174, 198, 0.14);
  background: linear-gradient(
    180deg,
    rgba(14, 18, 24, 0.84),
    rgba(10, 14, 19, 0.88)
  );
  border-radius: 10px;
  padding: 8px;
  position: relative;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.03),
    0 8px 20px rgba(0, 0, 0, 0.22);
}

.tabs-container {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  overflow-y: hidden;
  padding: 0 1px 2px;
  scroll-behavior: smooth;
  scrollbar-width: thin;
  scrollbar-color: rgba(156, 174, 198, 0.5) rgba(12, 16, 21, 0.6);
}

.tabs-container::-webkit-scrollbar {
  height: 6px;
}

.tabs-container::-webkit-scrollbar-track {
  background: rgba(12, 16, 21, 0.6);
  border-radius: 999px;
}

.tabs-container::-webkit-scrollbar-thumb {
  background: linear-gradient(
    180deg,
    rgba(147, 166, 191, 0.68),
    rgba(118, 136, 160, 0.78)
  );
  border-radius: 999px;
}

.tabs-container::-webkit-scrollbar-thumb:hover {
  background: linear-gradient(
    180deg,
    rgba(179, 196, 216, 0.8),
    rgba(136, 154, 178, 0.86)
  );
}

.tab {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border: 1px solid rgba(147, 166, 191, 0.14);
  border-radius: 10px;
  background: linear-gradient(
    180deg,
    rgba(22, 27, 35, 0.86),
    rgba(15, 19, 25, 0.9)
  );
  cursor: pointer;
  flex-shrink: 0;
  transition:
    border-color 170ms ease,
    background 170ms ease,
    transform 170ms ease;
  user-select: none;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.02),
    0 4px 10px rgba(0, 0, 0, 0.18);
}

.tab:hover {
  background: linear-gradient(
    180deg,
    rgba(28, 34, 43, 0.9),
    rgba(19, 24, 31, 0.94)
  );
  border-color: rgba(182, 199, 220, 0.26);
  transform: translateY(-1px);
}

.tab-active {
  background: linear-gradient(
    180deg,
    rgba(32, 39, 49, 0.92),
    rgba(22, 28, 36, 0.96)
  );
  border-color: rgba(190, 206, 226, 0.36);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.04),
    0 0 0 1px rgba(183, 200, 220, 0.12),
    0 8px 16px rgba(0, 0, 0, 0.22);
}

.tab-icon {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.machine-icon {
  width: 30px;
  height: 30px;
  image-rendering: pixelated;
  image-rendering: crisp-edges;
  filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.28));
  transition: filter 160ms ease;
}

.tab-active .machine-icon {
  filter: drop-shadow(0 3px 6px rgba(0, 0, 0, 0.34)) brightness(1.06);
}

.no-icon {
  font-size: 18px;
  font-weight: bold;
  color: rgba(222, 233, 246, 0.95);
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.35);
}

.tab-active .no-icon {
  color: rgba(238, 245, 252, 0.98);
}

.tab::after {
  content: attr(data-tooltip);
  position: absolute;
  bottom: -28px;
  left: 50%;
  transform: translateX(-50%);
  padding: 4px 8px;
  background: rgba(12, 16, 21, 0.96);
  border: 1px solid rgba(157, 176, 198, 0.2);
  color: rgba(223, 233, 245, 0.95);
  font-size: 11px;
  white-space: nowrap;
  border-radius: 6px;
  pointer-events: none;
  opacity: 0;
  transition:
    opacity 150ms ease,
    transform 150ms ease;
  z-index: 100;
  box-shadow: 0 10px 20px rgba(0, 0, 0, 0.36);
}

.tab:hover::after {
  opacity: 1;
  transform: translateX(-50%) translateY(-2px);
}
</style>
