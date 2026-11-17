import {computed, onBeforeUnmount, onMounted, ref, type Ref} from 'vue';
import {PANEL_LAYOUT_KEY, readPanelLayout, panelBounds, clampPanelSize} from '../../state/panel-layout';

export function useHomePanelResize(itemSize: Ref<number>) {
  let saved = readPanelLayout(null);
  try { saved = readPanelLayout(localStorage.getItem(PANEL_LAYOUT_KEY)); } catch { /* Storage is optional. */ }
  const preferredWidth = ref(saved.browserWidth), preferredHeight = ref(saved.historyHeight);
  const resizeEnabled = ref(saved.resizeEnabled);
  const viewport = ref({width: window.innerWidth, height: window.innerHeight});
  const measuredWidth = ref(0);
  const resizing = ref(false);
  const bounds = computed(() => panelBounds(viewport.value.width, viewport.value.height, itemSize.value));
  const browserWidth = computed(() => preferredWidth.value === null ? measuredWidth.value : clampPanelSize(preferredWidth.value, bounds.value.browser));
  const historyHeight = computed(() => clampPanelSize(preferredHeight.value ?? Math.min(itemSize.value, 56) * 2 + 4 + 48, bounds.value.history));
  const shellStyle = computed(() => preferredWidth.value === null ? {} : {'--home-right-width': `${browserWidth.value}px`});
  const storageError = ref('');
  let columnObserver: ResizeObserver | null = null;
  let observedColumn: HTMLElement | null = null;

  function setBrowserColumnRef(element: HTMLElement | null) {
    if (element === observedColumn) return;
    observedColumn = element;
    columnObserver?.disconnect();
    columnObserver = null;
    if (!element) return;
    measuredWidth.value = element.getBoundingClientRect().width;
    columnObserver = new ResizeObserver(() => { measuredWidth.value = element.getBoundingClientRect().width; });
    columnObserver.observe(element);
  }
  function saveLayout() {
    resizing.value = false;
    try {
      localStorage.setItem(PANEL_LAYOUT_KEY, JSON.stringify({browserWidth: preferredWidth.value, historyHeight: preferredHeight.value, resizeEnabled: resizeEnabled.value}));
      storageError.value = '';
    } catch { storageError.value = '面板设置暂未保存，下次打开可能恢复旧设置。' }
  }
  function setResizeEnabled(value: boolean) { resizeEnabled.value = value; saveLayout(); }
  function resetWidth() { preferredWidth.value = null; saveLayout(); }
  function resetHeight() { preferredHeight.value = null; saveLayout(); }
  function refreshViewport() { viewport.value = {width: window.innerWidth, height: window.innerHeight}; }
  onMounted(() => window.addEventListener('resize', refreshViewport));
  onBeforeUnmount(() => { columnObserver?.disconnect(); window.removeEventListener('resize', refreshViewport); });
  return {
    browserWidth, historyHeight, bounds, shellStyle, resizing, storageError, setBrowserColumnRef, resizeEnabled, setResizeEnabled,
    startResize: () => { resizing.value = true; },
    resizeWidth: (value: number) => { preferredWidth.value = clampPanelSize(value, bounds.value.browser); },
    resizeHeight: (value: number) => { preferredHeight.value = clampPanelSize(value, bounds.value.history); },
    saveLayout, resetWidth, resetHeight,
  };
}
