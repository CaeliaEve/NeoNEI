<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import MultiblockVoxelViewer from './MultiblockVoxelViewer.vue';
import type { MultiblockBlueprint } from '../services/api';

interface Props {
  open: boolean;
  itemLabel: string;
  loading: boolean;
  error: string | null;
  blueprint: MultiblockBlueprint | null;
}

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'area[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
  '[contenteditable="true"]',
].join(',');

let dialogIdSequence = 0;

const props = defineProps<Props>();
const emit = defineEmits<{
  close: [];
}>();

const overlayRef = ref<HTMLElement | null>(null);
const dialogRef = ref<HTMLElement | null>(null);
const closeButtonRef = ref<HTMLButtonElement | null>(null);
const lastFocusedElement = ref<HTMLElement | null>(null);
const titleId = `multiblock-blueprint-dialog-title-${++dialogIdSequence}`;

const dimensionsLabel = computed(() => {
  const dimensions = props.blueprint?.dimensions;
  if (!dimensions) {
    return '未解析';
  }
  return [dimensions.x, dimensions.y, dimensions.z].join(' x ');
});

const structureInformation = computed(() => props.blueprint?.structureInformation ?? []);
const structureHints = computed(() => props.blueprint?.structureHints ?? []);

const getFocusableElements = (container: HTMLElement): HTMLElement[] => {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter((element) => {
    if (element.tabIndex < 0) return false;
    const style = window.getComputedStyle(element);
    return style.display !== 'none' && style.visibility !== 'hidden';
  });
};

const focusDialog = async () => {
  await nextTick();
  if (!props.open) {
    return;
  }

  const dialog = dialogRef.value;
  if (!dialog) {
    return;
  }

  const focusableElements = getFocusableElements(dialog);
  const focusTarget = closeButtonRef.value ?? focusableElements[0] ?? dialog;
  focusTarget.focus();
};

const restoreFocus = async () => {
  await nextTick();
  const focusTarget = lastFocusedElement.value;
  if (focusTarget && document.contains(focusTarget)) {
    focusTarget.focus();
  }
  lastFocusedElement.value = null;
};

const trapFocus = (event: KeyboardEvent) => {
  const dialog = dialogRef.value;
  if (!dialog) {
    return;
  }

  const focusableElements = getFocusableElements(dialog);
  if (focusableElements.length === 0) {
    event.preventDefault();
    dialog.focus();
    return;
  }

  const firstElement = focusableElements[0];
  const lastElement = focusableElements[focusableElements.length - 1];
  const activeElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;

  if (event.shiftKey) {
    if (!activeElement || activeElement === firstElement || !dialog.contains(activeElement)) {
      event.preventDefault();
      lastElement.focus();
    }
    return;
  }

  if (!activeElement || activeElement === lastElement || !dialog.contains(activeElement)) {
    event.preventDefault();
    firstElement.focus();
  }
};

const requestClose = () => {
  emit('close');
};

const handleDocumentKeydown = (event: KeyboardEvent) => {
  if (!props.open) {
    return;
  }

  if (event.key === 'Escape') {
    event.preventDefault();
    requestClose();
    return;
  }

  if (event.key === 'Tab') {
    trapFocus(event);
  }
};

const onOverlayClick = (event: MouseEvent) => {
  if (event.target === overlayRef.value) {
    requestClose();
  }
};

const attachDocumentListeners = () => {
  document.addEventListener('keydown', handleDocumentKeydown);
};

const detachDocumentListeners = () => {
  document.removeEventListener('keydown', handleDocumentKeydown);
};

watch(
  () => props.open,
  async (isOpen, wasOpen) => {
    if (isOpen) {
      lastFocusedElement.value = document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
      attachDocumentListeners();
      await focusDialog();
      return;
    }

    detachDocumentListeners();
    if (wasOpen) {
      await restoreFocus();
    }
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  detachDocumentListeners();
  if (props.open) {
    const focusTarget = lastFocusedElement.value;
    if (focusTarget && document.contains(focusTarget)) {
      focusTarget.focus();
    }
    lastFocusedElement.value = null;
  }
});
</script>

<template>
  <div
    v-if="open"
    ref="overlayRef"
    class="fixed inset-0 z-[80] flex items-center justify-center bg-black/85 p-4 backdrop-blur-md"
    @click="onOverlayClick"
  >
    <div
      ref="dialogRef"
      class="blueprint-dialog"
      role="dialog"
      aria-modal="true"
      :aria-labelledby="titleId"
      tabindex="-1"
    >
      <div class="blueprint-dialog-head">
        <div>
          <h3 :id="titleId" class="blueprint-title">NEI 多方块蓝图</h3>
          <p class="blueprint-subtitle">{{ itemLabel }}</p>
        </div>
        <button
          ref="closeButtonRef"
          type="button"
          class="blueprint-close"
          aria-label="关闭多方块蓝图弹窗"
          @click="requestClose"
        >
          ×
        </button>
      </div>

      <div class="blueprint-dialog-body">
        <div v-if="loading" class="blueprint-muted">正在加载蓝图...</div>
        <div v-else-if="error" class="blueprint-error">{{ error }}</div>
        <div v-else-if="blueprint" class="blueprint-content">
          <div class="blueprint-card blueprint-card-full">
            <div class="blueprint-label">3D 结构预览</div>
            <MultiblockVoxelViewer
              v-if="blueprint.voxelBlueprint"
              :blueprint="blueprint.voxelBlueprint"
              :height="420"
            />
            <div v-else class="blueprint-error">
              当前导出数据不包含体素或方块坐标，暂时无法显示 3D 结构。
            </div>
          </div>

          <div class="blueprint-card">
            <div class="blueprint-label">控制器</div>
            <div class="blueprint-value">{{ blueprint.controllerLocalizedName }}</div>
            <div class="blueprint-code">{{ blueprint.controllerItemId }}</div>
          </div>

          <div class="blueprint-card">
            <div class="blueprint-label">结构尺寸</div>
            <div class="blueprint-value">{{ dimensionsLabel }}</div>
            <div v-if="blueprint.dimensions?.raw" class="blueprint-code">
              {{ blueprint.dimensions.raw }}
            </div>
          </div>

          <div class="blueprint-card">
            <div class="blueprint-label">结构说明</div>
            <ul v-if="structureInformation.length > 0" class="blueprint-list">
              <li v-for="(line, idx) in structureInformation" :key="`info-${idx}`">
                {{ line }}
              </li>
            </ul>
            <div v-else class="blueprint-muted">暂无结构说明。</div>
          </div>

          <div class="blueprint-card">
            <div class="blueprint-label">结构提示（NEI）</div>
            <ul v-if="structureHints.length > 0" class="blueprint-list">
              <li v-for="(line, idx) in structureHints" :key="`hint-${idx}`">
                {{ line }}
              </li>
            </ul>
            <div v-else class="blueprint-muted">暂无 NEI 结构提示。</div>
          </div>
        </div>
        <div v-else class="blueprint-muted">当前没有可显示的蓝图数据。</div>
      </div>

      <div class="blueprint-dialog-foot">
        <button type="button" class="blueprint-confirm" @click="requestClose">关闭</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.blueprint-dialog {
  width: min(980px, 94vw);
  max-height: 86vh;
  border-radius: 14px;
  overflow: hidden;
  border: 1px solid rgba(var(--rv-accent-rgb), 0.16);
  background: linear-gradient(180deg, rgba(11, 15, 21, 0.96), rgba(8, 11, 16, 0.98));
  box-shadow:
    0 24px 64px rgba(0, 0, 0, 0.62),
    inset 0 1px 0 rgba(255, 255, 255, 0.04);
}

.blueprint-dialog-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-bottom: 1px solid rgba(var(--rv-accent-rgb), 0.15);
}

.blueprint-title {
  margin: 0;
  font-size: 28px;
  font-weight: 700;
  color: rgba(238, 244, 253, 0.96);
}

.blueprint-subtitle {
  margin: 4px 0 0;
  color: rgba(190, 203, 219, 0.82);
  font-size: 12px;
}

.blueprint-close {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  border: 1px solid rgba(var(--rv-accent-rgb), 0.2);
  background: rgba(18, 24, 32, 0.74);
  color: rgba(222, 232, 245, 0.92);
  font-size: 22px;
  cursor: pointer;
}

.blueprint-dialog-body {
  padding: 16px;
  overflow: auto;
  max-height: calc(86vh - 124px);
}

.blueprint-content {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.blueprint-card {
  background: linear-gradient(180deg, rgba(17, 21, 28, 0.86), rgba(12, 16, 21, 0.88));
  border: 1px solid rgba(var(--rv-accent-rgb), 0.14);
  border-radius: 10px;
  padding: 12px;
}

.blueprint-card-full {
  grid-column: 1 / -1;
}

.blueprint-label {
  font-size: 12px;
  color: rgba(183, 197, 215, 0.82);
  margin-bottom: 6px;
}

.blueprint-value {
  color: rgba(239, 245, 253, 0.96);
  font-weight: 600;
}

.blueprint-code {
  margin-top: 6px;
  color: rgba(189, 203, 221, 0.86);
  font-size: 12px;
  word-break: break-all;
}

.blueprint-list {
  margin: 0;
  padding-left: 18px;
  color: rgba(224, 234, 247, 0.94);
  line-height: 1.6;
}

.blueprint-dialog-foot {
  padding: 12px 16px;
  border-top: 1px solid rgba(var(--rv-accent-rgb), 0.14);
}

.blueprint-confirm {
  width: 100%;
  height: 40px;
  border-radius: 9px;
  border: 1px solid rgba(var(--rv-accent-rgb), 0.18);
  background: linear-gradient(180deg, rgba(20, 26, 34, 0.88), rgba(13, 18, 24, 0.92));
  color: rgba(226, 235, 246, 0.96);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}

.blueprint-muted {
  color: rgba(192, 205, 223, 0.9);
}

.blueprint-error {
  color: rgba(255, 166, 170, 0.95);
}

@media (max-width: 768px) {
  .blueprint-content {
    grid-template-columns: 1fr;
  }
}
</style>
