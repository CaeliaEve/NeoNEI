<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { api, type Item } from '../services/api';
import { useFloatingTooltip } from '../composables/useFloatingTooltip';
import ThaumcraftTooltip from './ThaumcraftTooltip.vue';
import AnimatedItemIcon from './AnimatedItemIcon.vue';

type TooltipSizeMode = 'auto' | 'default' | 'compact' | 'dense';
type TooltipMotionLevel = 'auto' | 'high' | 'medium' | 'low' | 'off';

const props = withDefaults(defineProps<{
  itemId: string;
  count?: number;
  sizeMode?: TooltipSizeMode;
  motionLevel?: TooltipMotionLevel;
}>(), {
  sizeMode: 'auto',
  motionLevel: 'auto',
});

const emit = defineEmits<{
  (e: 'click'): void;
}>();

const { tooltipX, tooltipY, updatePosition } = useFloatingTooltip();

const isHovered = ref(false);
const tooltipRef = ref<HTMLElement | null>(null);
const itemData = ref<Item | null>(null);
const loading = ref(false);
const lastMouseEvent = ref<MouseEvent | null>(null);
const windowWidth = ref(window.innerWidth);
const prefersReducedMotion = ref(false);

let mediaQueryList: MediaQueryList | null = null;
let mediaListener: ((event: MediaQueryListEvent) => void) | null = null;

const resolvedSize = computed<'default' | 'compact' | 'dense'>(() => {
  if (props.sizeMode !== 'auto') return props.sizeMode;
  if (windowWidth.value <= 960) return 'dense';
  return 'compact';
});

const resolvedMotion = computed<'high' | 'medium' | 'low' | 'off'>(() => {
  if (props.motionLevel !== 'auto') return props.motionLevel;
  if (prefersReducedMotion.value) return 'low';
  if (windowWidth.value <= 960) return 'low';
  return 'medium';
});

const tooltipClasses = computed(() => [
  'recipe-tooltip-content',
  'eclipse-tooltip',
  `size-${resolvedSize.value}`,
  `motion-${resolvedMotion.value}`,
]);

const refreshViewportState = () => {
  windowWidth.value = window.innerWidth;
};

const handleMouseMove = (event: MouseEvent) => {
  lastMouseEvent.value = event;
  updatePosition(event, tooltipRef.value);
};

const showTooltip = async () => {
  isHovered.value = true;

  if (!itemData.value && !loading.value) {
    loading.value = true;
    try {
      itemData.value = await api.getItem(props.itemId);
    } catch (error) {
      console.error('Failed to load item data:', error);
    } finally {
      loading.value = false;
    }
  }

  nextTick(() => {
    if (lastMouseEvent.value) {
      updatePosition(lastMouseEvent.value, tooltipRef.value);
    }
  });
};

const hideTooltip = () => {
  isHovered.value = false;
};

const handleClick = () => {
  emit('click');
};

const parsedItemId = computed(() => {
  const parts = props.itemId.split('~');
  if (parts.length >= 3) {
    return { modId: parts[1], internalName: parts[2] };
  }
  return { modId: 'unknown', internalName: props.itemId };
});

onMounted(() => {
  window.addEventListener('resize', refreshViewportState, { passive: true });
  mediaQueryList = window.matchMedia('(prefers-reduced-motion: reduce)');
  prefersReducedMotion.value = mediaQueryList.matches;
  mediaListener = (event: MediaQueryListEvent) => {
    prefersReducedMotion.value = event.matches;
  };
  mediaQueryList.addEventListener('change', mediaListener);
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', refreshViewportState);
  if (mediaQueryList && mediaListener) {
    mediaQueryList.removeEventListener('change', mediaListener);
  }
});
</script>

<template>
  <div
    class="recipe-item-tooltip-container"
    @mouseenter="showTooltip"
    @mousemove="handleMouseMove"
    @mouseleave="hideTooltip"
    @click="handleClick"
  >
    <slot />

    <Teleport to="body">
      <div
        v-if="isHovered"
        ref="tooltipRef"
        :class="tooltipClasses"
        :style="{ left: `${tooltipX}px`, top: `${tooltipY}px` }"
      >
        <div v-if="loading" class="tooltip-loading">
          <div class="mini-spinner"></div>
          <span>Loading...</span>
        </div>

        <template v-else-if="itemData">
          <div class="tooltip-header">
            <AnimatedItemIcon
              :item-id="itemData.itemId || itemId"
              :render-asset-ref="itemData.renderAssetRef || null"
              :image-file-name="itemData.imageFileName || null"
              :size="34"
              class="tooltip-icon"
            />
            <div class="tooltip-title">
              <h3 class="item-name">{{ itemData.localizedName }}</h3>
              <p class="item-mod">{{ itemData.modId }} / {{ itemData.internalName }}</p>
            </div>
          </div>

          <div v-if="count && count > 1" class="item-count-badge">
            Count: {{ count }}
          </div>

          <div class="tooltip-details">
            <div class="detail-row">
              <span class="detail-label">Stack</span>
              <span class="detail-value">{{ itemData.maxStackSize }}</span>
            </div>

            <div v-if="itemData.maxDamage > 0" class="detail-row">
              <span class="detail-label">Durability</span>
              <span class="detail-value">{{ itemData.maxDamage }}</span>
            </div>

            <div v-if="itemData.tooltip" class="tooltip-description">
              <ThaumcraftTooltip :tooltip="itemData.tooltip" />
            </div>
          </div>
        </template>

        <div v-else class="tooltip-fallback">
          <AnimatedItemIcon
            :item-id="itemId"
            :size="28"
            class="tooltip-icon"
          />
          <div class="fallback-info">
            <p class="fallback-id">{{ parsedItemId.modId }} / {{ parsedItemId.internalName }}</p>
            <p v-if="count && count > 1" class="fallback-count">Count: {{ count }}</p>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.recipe-item-tooltip-container {
  display: inline-block;
  position: relative;
  cursor: pointer;
}

.eclipse-tooltip {
  --tt-width: clamp(188px, 16vw, 264px);
  --tt-radius: 11px;
  --tt-padding: 8px;
  --tt-gap: 8px;
  --tt-icon: 28px;
  --tt-title: 12px;
  --tt-subtitle: 9px;
  --tt-text: 11px;

  position: fixed;
  z-index: 10000;
  width: var(--tt-width);
  pointer-events: none;
  isolation: isolate;
  backdrop-filter: blur(12px) saturate(126%);
  -webkit-backdrop-filter: blur(12px) saturate(126%);
  border-radius: var(--tt-radius);
  color: #e7efff;
  border: 1px solid transparent;
  background:
    linear-gradient(162deg, rgba(7, 12, 23, 0.9) 0%, rgba(6, 10, 20, 0.95) 52%, rgba(4, 8, 16, 0.98) 100%) padding-box,
    conic-gradient(from 210deg at 46% 50%, rgba(179, 213, 255, 0.3), rgba(84, 130, 218, 0.14), rgba(167, 198, 255, 0.26), rgba(64, 102, 183, 0.34), rgba(179, 213, 255, 0.3)) border-box;
  box-shadow:
    0 14px 34px rgba(2, 7, 16, 0.72),
    0 0 0 1px rgba(171, 201, 255, 0.07) inset,
    0 0 14px rgba(72, 122, 212, 0.08);
  overflow: hidden;
  animation: eclipse-fade 160ms cubic-bezier(0.2, 0.75, 0.24, 1);
}

.eclipse-tooltip::before {
  content: '';
  position: absolute;
  inset: -38% -28%;
  pointer-events: none;
  background:
    radial-gradient(75% 90% at 14% 18%, rgba(186, 219, 255, 0.22), transparent 66%),
    radial-gradient(58% 72% at 84% 82%, rgba(106, 152, 246, 0.18), transparent 72%),
    conic-gradient(from 220deg at 52% 46%, transparent 0deg, rgba(170, 207, 255, 0.13) 92deg, transparent 178deg, rgba(129, 171, 255, 0.12) 248deg, transparent 360deg);
  opacity: 0.58;
  filter: blur(15px) saturate(108%);
  mix-blend-mode: screen;
  transform-origin: center;
  will-change: transform, opacity;
}

.eclipse-tooltip::after {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  background:
    conic-gradient(from 0deg at 52% 48%, transparent 0deg 28deg, rgba(213, 233, 255, 0.07) 48deg 66deg, transparent 92deg 168deg, rgba(183, 213, 255, 0.08) 196deg 214deg, transparent 242deg 360deg),
    linear-gradient(110deg, transparent 33%, rgba(221, 239, 255, 0.07) 49%, transparent 64%),
    radial-gradient(140% 92% at 50% -12%, rgba(156, 194, 255, 0.06), transparent 72%);
  mix-blend-mode: screen;
  opacity: 0.26;
  background-size: 100% 100%, 260% 100%, 100% 100%;
  will-change: transform, opacity;
}

.size-default {
  --tt-width: clamp(220px, 20vw, 320px);
  --tt-icon: 34px;
  --tt-title: 14px;
  --tt-subtitle: 10px;
  --tt-text: 12px;
  --tt-padding: 10px;
  --tt-gap: 10px;
}

.size-dense {
  --tt-width: clamp(160px, 72vw, 228px);
  --tt-icon: 22px;
  --tt-title: 11px;
  --tt-subtitle: 9px;
  --tt-text: 10px;
  --tt-padding: 7px;
  --tt-gap: 7px;
}

.tooltip-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px;
  font-size: var(--tt-text);
}

.mini-spinner {
  width: 14px;
  height: 14px;
  border: 2px solid rgba(163, 197, 255, 0.22);
  border-top-color: rgba(222, 236, 255, 0.9);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

.tooltip-header {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  gap: var(--tt-gap);
  padding: var(--tt-padding);
  border-bottom: 1px solid rgba(145, 172, 230, 0.14);
  background: linear-gradient(124deg, rgba(78, 108, 176, 0.14), rgba(56, 82, 153, 0.04));
}

.tooltip-header::after {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: linear-gradient(92deg, transparent 0%, rgba(218, 234, 255, 0.06) 42%, transparent 100%);
  opacity: 0.36;
}

.tooltip-icon {
  width: var(--tt-icon);
  height: var(--tt-icon);
  object-fit: contain;
  image-rendering: pixelated;
  image-rendering: crisp-edges;
  filter: drop-shadow(0 1px 2px rgba(141, 182, 255, 0.12));
  flex-shrink: 0;
}

.tooltip-title {
  flex: 1;
  min-width: 0;
}

.item-name {
  margin: 0;
  font-size: var(--tt-title);
  font-weight: 700;
  line-height: 1.2;
  color: #f0f5ff;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.item-mod {
  margin: 2px 0 0;
  font-size: var(--tt-subtitle);
  color: rgba(182, 204, 255, 0.85);
  font-family: Consolas, Monaco, monospace;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.item-count-badge {
  position: relative;
  z-index: 1;
  padding: 6px 8px;
  border-top: 1px solid rgba(145, 172, 230, 0.14);
  border-bottom: 1px solid rgba(145, 172, 230, 0.14);
  color: rgba(230, 239, 255, 0.92);
  font-size: var(--tt-text);
}

.tooltip-details {
  position: relative;
  z-index: 1;
  padding: var(--tt-padding);
  display: grid;
  gap: 5px;
}

.tooltip-details::before {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  border-top: 1px solid rgba(160, 190, 252, 0.06);
  background: linear-gradient(180deg, rgba(118, 153, 229, 0.017), transparent 38%);
  opacity: 0.52;
}

.detail-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  font-size: var(--tt-text);
}

.detail-label {
  color: rgba(189, 209, 255, 0.76);
  font-weight: 600;
  flex-shrink: 0;
}

.detail-value {
  color: #fff;
  font-weight: 500;
  text-align: right;
  word-break: break-word;
  flex: 1;
}

.tooltip-description {
  margin-top: 2px;
  padding: 6px 7px;
  border-radius: 7px;
  border: 1px solid rgba(137, 168, 236, 0.22);
  background: rgba(81, 106, 173, 0.08);
  color: rgba(234, 242, 255, 0.95);
  font-size: var(--tt-text);
  line-height: 1.42;
}

.tooltip-fallback {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: var(--tt-padding);
}

.fallback-info {
  min-width: 0;
}

.fallback-id {
  margin: 0;
  font-size: var(--tt-text);
  color: rgba(225, 236, 255, 0.92);
  font-family: Consolas, Monaco, monospace;
  word-break: break-word;
}

.fallback-count {
  margin: 2px 0 0;
  font-size: var(--tt-subtitle);
  color: rgba(189, 209, 255, 0.8);
}

.motion-high::after {
  animation: eclipse-prism-sweep 14.5s cubic-bezier(0.24, 0.38, 0.32, 1) infinite;
}

.motion-medium::after {
  animation: eclipse-prism-sweep 22s cubic-bezier(0.24, 0.38, 0.32, 1) infinite;
}

.motion-low::after,
.motion-off::after {
  display: none;
}

.motion-high .tooltip-icon {
  animation: eclipse-pulse 16s ease-in-out infinite;
}

.motion-medium .tooltip-icon {
  animation: eclipse-pulse 24s ease-in-out infinite;
}

.motion-low .tooltip-icon,
.motion-off .tooltip-icon {
  animation: none;
}

.motion-off {
  animation: none;
}

.motion-high {
  animation:
    eclipse-fade 160ms cubic-bezier(0.2, 0.75, 0.24, 1),
    eclipse-breathe 11.5s ease-in-out infinite;
}

.motion-high::before {
  animation: eclipse-halo-orbit 18s ease-in-out infinite;
}

.motion-medium::before {
  animation: eclipse-halo-orbit 27s ease-in-out infinite;
}

.motion-low::before {
  opacity: 0.46;
  filter: blur(14px);
}

@keyframes eclipse-fade {
  from {
    opacity: 0;
    transform: translateY(4px) scale(0.96);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

@keyframes eclipse-halo-orbit {
  0%,
  100% {
    transform: translate3d(-2.4%, -1.8%, 0) scale(1) rotate(0deg);
    opacity: 0.46;
  }
  50% {
    transform: translate3d(2.6%, 2.4%, 0) scale(1.055) rotate(14deg);
    opacity: 0.68;
  }
}

@keyframes eclipse-prism-sweep {
  0% {
    transform: rotate(-2deg) scale(0.99);
    background-position: 0 0, -140% 0, 0 0;
    opacity: 0.08;
  }
  45% {
    transform: rotate(1.5deg) scale(1.01);
    opacity: 0.2;
  }
  100% {
    transform: rotate(4deg) scale(1.03);
    background-position: 0 0, 140% 0, 0 0;
    opacity: 0.11;
  }
}

@keyframes eclipse-breathe {
  0%,
  100% {
    box-shadow:
      0 14px 34px rgba(2, 7, 16, 0.72),
      0 0 0 1px rgba(171, 201, 255, 0.07) inset,
      0 0 12px rgba(72, 122, 212, 0.06);
  }
  50% {
    box-shadow:
      0 18px 44px rgba(2, 7, 16, 0.8),
      0 0 0 1px rgba(179, 208, 255, 0.1) inset,
      0 0 14px rgba(72, 122, 212, 0.1);
  }
}

@keyframes eclipse-pulse {
  0%,
  100% {
    filter: drop-shadow(0 1px 2px rgba(136, 178, 255, 0.08));
  }
  50% {
    filter: drop-shadow(0 1px 3px rgba(170, 208, 255, 0.12));
  }
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 960px) {
  .eclipse-tooltip {
    --tt-width: clamp(160px, 72vw, 228px);
  }
}
</style>
