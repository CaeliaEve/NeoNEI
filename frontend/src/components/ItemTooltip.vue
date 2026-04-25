<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { api, type Item } from '../services/api';
import { useFloatingTooltip } from '../composables/useFloatingTooltip';
import AnimatedItemIcon from './AnimatedItemIcon.vue';

type TooltipSizeMode = 'auto' | 'default' | 'compact' | 'dense';
type TooltipMotionLevel = 'auto' | 'high' | 'medium' | 'low' | 'off';

const props = withDefaults(defineProps<{
  item: Item;
  sizeMode?: TooltipSizeMode;
  motionLevel?: TooltipMotionLevel;
}>(), {
  sizeMode: 'auto',
  motionLevel: 'auto',
});

const emit = defineEmits<{
  (e: 'click'): void;
  (e: 'contextmenu', item: Item, event: MouseEvent): void;
}>();

const { tooltipX, tooltipY, updatePosition } = useFloatingTooltip();

const isHovered = ref(false);
const fullItem = ref<Item | null>(null);
const loadingFullItem = ref(false);
const tooltipRef = ref<HTMLElement | null>(null);
const lastMouseEvent = ref<MouseEvent | null>(null);
const windowWidth = ref(window.innerWidth);
const prefersReducedMotion = ref(false);

let mediaQueryList: MediaQueryList | null = null;
let mediaListener: ((event: MediaQueryListEvent) => void) | null = null;

const resolvedSize = computed<'default' | 'compact' | 'dense'>(() => {
  if (props.sizeMode !== 'auto') return props.sizeMode;
  if (windowWidth.value <= 960) return 'dense';
  if (windowWidth.value <= 1440) return 'compact';
  return 'default';
});

const resolvedMotion = computed<'high' | 'medium' | 'low' | 'off'>(() => {
  if (props.motionLevel !== 'auto') return props.motionLevel;
  if (prefersReducedMotion.value) return 'low';
  if (windowWidth.value <= 960) return 'low';
  return 'medium';
});

const tooltipClasses = computed(() => [
  'item-tooltip-content',
  'eclipse-tooltip',
  `size-${resolvedSize.value}`,
  `motion-${resolvedMotion.value}`,
]);

const displayItem = computed<Item>(() => fullItem.value || props.item);

const refreshViewportState = () => {
  windowWidth.value = window.innerWidth;
};

const handleMouseMove = (event: MouseEvent) => {
  lastMouseEvent.value = event;
  updatePosition(event, tooltipRef.value);
};

const showTooltip = () => {
  isHovered.value = true;

  if (!fullItem.value && !loadingFullItem.value) {
    loadingFullItem.value = true;
    api
      .getItem(props.item.itemId)
      .then((item) => {
        fullItem.value = item;
      })
      .catch(() => {
        // keep lightweight item as fallback
      })
      .finally(() => {
        loadingFullItem.value = false;
      });
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

const handleContextMenu = (event: MouseEvent) => {
  event.preventDefault();
  emit('contextmenu', props.item, event);
};

const handleRightMouseDown = (event: MouseEvent) => {
  if (event.button !== 2) return;
  event.preventDefault();
  emit('contextmenu', props.item, event);
};

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
    class="item-tooltip-container"
    @mouseenter="showTooltip"
    @mousemove="handleMouseMove"
    @mouseleave="hideTooltip"
    @click="handleClick"
    @mousedown="handleRightMouseDown"
    @contextmenu="handleContextMenu"
  >
    <slot />

    <Teleport to="body">
      <div
        v-if="isHovered"
        ref="tooltipRef"
        :class="tooltipClasses"
        :style="{ left: `${tooltipX}px`, top: `${tooltipY}px` }"
      >
        <div class="tooltip-header">
          <AnimatedItemIcon
            :item-id="displayItem.itemId"
            :render-asset-ref="displayItem.renderAssetRef || null"
            :image-file-name="displayItem.imageFileName || null"
            :size="34"
            class="tooltip-icon"
          />
          <div class="tooltip-title">
            <h3 class="item-name">{{ displayItem.localizedName }}</h3>
            <p class="item-mod">{{ displayItem.modId }} / {{ displayItem.internalName }}</p>
          </div>
        </div>

        <div class="tooltip-details">
          <div class="detail-row">
            <span class="detail-label">Stack</span>
            <span class="detail-value">{{ displayItem.maxStackSize }}</span>
          </div>

          <div v-if="displayItem.maxDamage > 0" class="detail-row">
            <span class="detail-label">Durability</span>
            <span class="detail-value">{{ displayItem.maxDamage }}</span>
          </div>

          <div v-if="displayItem.nbt" class="detail-row">
            <span class="detail-label">NBT</span>
            <span class="detail-value nbt-data">{{ displayItem.nbt.substring(0, 52) }}{{ displayItem.nbt.length > 52 ? '...' : '' }}</span>
          </div>

          <div v-if="displayItem.tooltip" class="tooltip-description">
            {{ displayItem.tooltip }}
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.item-tooltip-container {
  display: inline-block;
  position: relative;
  cursor: pointer;
}

.eclipse-tooltip {
  --tt-width: clamp(220px, 20vw, 320px);
  --tt-radius: 12px;
  --tt-padding: 10px;
  --tt-gap: 10px;
  --tt-icon: 34px;
  --tt-title: 14px;
  --tt-subtitle: 10px;
  --tt-text: 12px;

  position: fixed;
  z-index: 10000;
  width: var(--tt-width);
  pointer-events: none;
  isolation: isolate;
  backdrop-filter: blur(12px) saturate(128%);
  -webkit-backdrop-filter: blur(12px) saturate(128%);
  border-radius: var(--tt-radius);
  color: #e7efff;
  border: 1px solid transparent;
  background:
    linear-gradient(162deg, rgba(7, 12, 23, 0.9) 0%, rgba(6, 10, 20, 0.95) 52%, rgba(4, 8, 16, 0.98) 100%) padding-box,
    conic-gradient(from 210deg at 46% 50%, rgba(179, 213, 255, 0.34), rgba(84, 130, 218, 0.16), rgba(167, 198, 255, 0.3), rgba(64, 102, 183, 0.38), rgba(179, 213, 255, 0.34)) border-box;
  box-shadow:
    0 14px 36px rgba(2, 7, 16, 0.72),
    0 0 0 1px rgba(171, 201, 255, 0.08) inset,
    0 0 16px rgba(72, 122, 212, 0.08);
  overflow: hidden;
  animation: eclipse-fade 170ms cubic-bezier(0.2, 0.75, 0.24, 1);
}

.eclipse-tooltip::before {
  content: '';
  position: absolute;
  inset: -38% -28%;
  pointer-events: none;
  background:
    radial-gradient(75% 90% at 14% 18%, rgba(186, 219, 255, 0.26), transparent 66%),
    radial-gradient(58% 72% at 84% 82%, rgba(106, 152, 246, 0.22), transparent 72%),
    conic-gradient(from 220deg at 52% 46%, transparent 0deg, rgba(170, 207, 255, 0.15) 92deg, transparent 178deg, rgba(129, 171, 255, 0.13) 248deg, transparent 360deg);
  opacity: 0.62;
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
    conic-gradient(from 0deg at 52% 48%, transparent 0deg 28deg, rgba(213, 233, 255, 0.08) 48deg 66deg, transparent 92deg 168deg, rgba(183, 213, 255, 0.1) 196deg 214deg, transparent 242deg 360deg),
    linear-gradient(110deg, transparent 33%, rgba(221, 239, 255, 0.09) 49%, transparent 64%),
    radial-gradient(140% 92% at 50% -12%, rgba(156, 194, 255, 0.07), transparent 72%);
  mix-blend-mode: screen;
  opacity: 0.3;
  background-size: 100% 100%, 260% 100%, 100% 100%;
  will-change: transform, opacity;
}

.size-compact {
  --tt-width: clamp(188px, 16vw, 264px);
  --tt-icon: 28px;
  --tt-title: 12px;
  --tt-subtitle: 9px;
  --tt-text: 11px;
  --tt-padding: 8px;
  --tt-gap: 8px;
}

.size-dense {
  --tt-width: clamp(168px, 72vw, 236px);
  --tt-icon: 24px;
  --tt-title: 11px;
  --tt-subtitle: 9px;
  --tt-text: 10px;
  --tt-padding: 7px;
  --tt-gap: 7px;
}

.tooltip-header {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  gap: var(--tt-gap);
  padding: var(--tt-padding);
  border-bottom: 1px solid rgba(145, 172, 230, 0.14);
  background: linear-gradient(124deg, rgba(78, 108, 176, 0.16), rgba(56, 82, 153, 0.05));
}

.tooltip-header::after {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: linear-gradient(92deg, transparent 0%, rgba(218, 234, 255, 0.08) 42%, transparent 100%);
  opacity: 0.4;
}

.tooltip-icon {
  width: var(--tt-icon);
  height: var(--tt-icon);
  object-fit: contain;
  image-rendering: pixelated;
  image-rendering: crisp-edges;
  filter: drop-shadow(0 1px 2px rgba(141, 182, 255, 0.14));
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

.tooltip-details {
  position: relative;
  z-index: 1;
  padding: var(--tt-padding);
  display: grid;
  gap: 6px;
}

.tooltip-details::before {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  border-top: 1px solid rgba(160, 190, 252, 0.07);
  background: linear-gradient(180deg, rgba(118, 153, 229, 0.02), transparent 38%);
  opacity: 0.56;
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

.nbt-data {
  font-family: Consolas, Monaco, monospace;
  color: rgba(255, 166, 166, 0.94);
}

.tooltip-description {
  margin-top: 2px;
  padding: 7px 8px;
  border-radius: 7px;
  border: 1px solid rgba(137, 168, 236, 0.25);
  background: rgba(81, 106, 173, 0.08);
  color: rgba(234, 242, 255, 0.95);
  font-size: var(--tt-text);
  line-height: 1.45;
  white-space: pre-wrap;
  word-break: break-word;
}

.motion-high {
  animation:
    eclipse-fade 170ms cubic-bezier(0.2, 0.75, 0.24, 1),
    eclipse-breathe 11.5s ease-in-out infinite;
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

.motion-high::before {
  animation: eclipse-halo-orbit 18s ease-in-out infinite;
}

.motion-medium::before {
  animation: eclipse-halo-orbit 27s ease-in-out infinite;
}

.motion-low::before {
  opacity: 0.48;
  filter: blur(15px);
}

.motion-off {
  animation: none;
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
    opacity: 0.5;
  }
  50% {
    transform: translate3d(2.6%, 2.4%, 0) scale(1.055) rotate(14deg);
    opacity: 0.76;
  }
}

@keyframes eclipse-prism-sweep {
  0% {
    transform: rotate(-2deg) scale(0.99);
    background-position: 0 0, -140% 0, 0 0;
    opacity: 0.1;
  }
  45% {
    transform: rotate(1.5deg) scale(1.01);
    opacity: 0.28;
  }
  100% {
    transform: rotate(4deg) scale(1.03);
    background-position: 0 0, 140% 0, 0 0;
    opacity: 0.14;
  }
}

@keyframes eclipse-breathe {
  0%,
  100% {
    box-shadow:
      0 14px 36px rgba(2, 7, 16, 0.72),
      0 0 0 1px rgba(171, 201, 255, 0.08) inset,
      0 0 14px rgba(72, 122, 212, 0.07);
  }
  50% {
    box-shadow:
      0 18px 46px rgba(2, 7, 16, 0.8),
      0 0 0 1px rgba(179, 208, 255, 0.12) inset,
      0 0 16px rgba(72, 122, 212, 0.1);
  }
}

@keyframes eclipse-pulse {
  0%,
  100% {
    filter: drop-shadow(0 1px 2px rgba(136, 178, 255, 0.08));
  }
  50% {
    filter: drop-shadow(0 1px 3px rgba(170, 208, 255, 0.14));
  }
}

@media (max-width: 960px) {
  .eclipse-tooltip {
    --tt-width: clamp(164px, 72vw, 228px);
  }
}
</style>
