import { nextTick, ref } from 'vue';

export function useRecipeDebugPanel() {
  const showDebugInfo = ref(false);
  const isDev = import.meta.env.DEV;
  const debugPanelRef = ref<HTMLElement | null>(null);
  const debugToggleRef = ref<HTMLElement | null>(null);
  const debugCloseRef = ref<HTMLElement | null>(null);
  const lastFocusedElementBeforeDebug = ref<HTMLElement | null>(null);

  const openDebugPanel = async () => {
    if (showDebugInfo.value) return;
    lastFocusedElementBeforeDebug.value = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    showDebugInfo.value = true;
    await nextTick();
    (debugCloseRef.value ?? debugPanelRef.value)?.focus();
  };

  const closeDebugPanel = async () => {
    if (!showDebugInfo.value) return;
    showDebugInfo.value = false;
    await nextTick();
    const target = lastFocusedElementBeforeDebug.value;
    if (target && document.contains(target)) {
      target.focus();
    } else {
      debugToggleRef.value?.focus();
    }
    lastFocusedElementBeforeDebug.value = null;
  };

  const handleDebugPanelKeydown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      void closeDebugPanel();
    }
  };

  return {
    closeDebugPanel,
    debugCloseRef,
    debugPanelRef,
    debugToggleRef,
    handleDebugPanelKeydown,
    isDev,
    openDebugPanel,
    showDebugInfo,
  };
}
