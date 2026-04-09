<script setup lang="ts">
import { ref, computed } from 'vue';

interface Props {
  recipeId: string;
  isFavorite?: boolean;
}

interface Emits {
  (e: 'overlay'): void;
  (e: 'toggle-favorite', recipeId: string): void;
}

const props = withDefaults(defineProps<Props>(), {
  isFavorite: false
});

const emit = defineEmits<Emits>();

const showButtons = ref(false);

const handleOverlay = () => {
  emit('overlay');
};

const handleToggleFavorite = () => {
  emit('toggle-favorite', props.recipeId);
};

// Expose methods for parent component
defineExpose({
  show: () => { showButtons.value = true; },
  hide: () => { showButtons.value = false; }
});
</script>

<template>
  <div
    class="recipe-action-buttons"
    @mouseenter="showButtons = true"
    @mouseleave="showButtons = false"
  >
    <Transition name="fade">
      <div v-if="showButtons" class="action-buttons-container">
        <!-- Overlay Button -->
        <button
          class="action-btn overlay-btn"
          @click="handleOverlay"
          title="在GUI中显示配方位置"
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 12 12"
          >
            <rect
              x="1"
              y="1"
              width="10"
              height="10"
              fill="none"
              stroke="currentColor"
              stroke-width="1.5"
            />
            <line
              x1="6"
              y1="1"
              x2="6"
              y2="11"
              stroke="currentColor"
              stroke-width="1"
            />
            <line
              x1="1"
              y1="6"
              x2="11"
              y2="6"
              stroke="currentColor"
              stroke-width="1"
            />
          </svg>
        </button>

        <!-- Favorite Button -->
        <button
          class="action-btn favorite-btn"
          :class="{ 'is-favorite': isFavorite }"
          @click="handleToggleFavorite"
          :title="isFavorite ? '取消收藏' : '收藏配方'"
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 12 12"
          >
            <polygon
              points="6,1 7.5,4 11,4.5 8.5,7 9,10.5 6,9 3,10.5 3.5,7 1,4.5 4.5,4"
              :fill="isFavorite ? 'currentColor' : 'none'"
              stroke="currentColor"
              stroke-width="1"
            />
          </svg>
        </button>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.recipe-action-buttons {
  position: absolute;
  bottom: 2px;
  right: 2px;
  z-index: 10;
}

.action-buttons-container {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.action-btn {
  width: 14px;
  height: 14px;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(139, 139, 139, 0.9);
  border: 1px solid #555555;
  cursor: pointer;
  transition: all 0.15s ease;
  color: #FFFFFF;
}

.action-btn:hover {
  background: rgba(155, 155, 155, 0.95);
  border-color: #777777;
  transform: scale(1.1);
}

.action-btn:active {
  transform: scale(1);
}

.overlay-btn {
  background: rgba(85, 85, 85, 0.9);
}

.favorite-btn {
  background: rgba(139, 139, 139, 0.9);
}

.favorite-btn.is-favorite {
  background: rgba(255, 170, 0, 0.9);
  color: #FFAA00;
}

/* Fade transition */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.15s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
