import { ref } from 'vue';

export interface HistoryEntry {
  itemId: string;
  itemName: string;
  tab: 'usedIn' | 'producedBy';
  machineIndex: number;
  pageIndex: number;
  timestamp: number;
}

const MAX_HISTORY_SIZE = 50;

const isSameSnapshot = (
  a: Pick<HistoryEntry, 'itemId' | 'tab' | 'machineIndex' | 'pageIndex'>,
  b: Pick<HistoryEntry, 'itemId' | 'tab' | 'machineIndex' | 'pageIndex'>,
): boolean => {
  return (
    a.itemId === b.itemId
    && a.tab === b.tab
    && a.machineIndex === b.machineIndex
    && a.pageIndex === b.pageIndex
  );
};

// Global state
const history = ref<HistoryEntry[]>([]);
const currentIndex = ref(-1);

// Service API
export const useRecipeHistory = () => {
  // Add new entry
  const pushEntry = (
    entry: Omit<HistoryEntry, 'timestamp'> & Partial<Pick<HistoryEntry, 'timestamp'>>
  ): void => {
    // Remove any entries after current index (new branch)
    if (currentIndex.value < history.value.length - 1) {
      history.value = history.value.slice(0, currentIndex.value + 1);
    }

    const newEntry: HistoryEntry = {
      ...entry,
      timestamp: entry.timestamp ?? Date.now()
    };

    const prev = history.value[history.value.length - 1];
    if (prev && isSameSnapshot(prev, newEntry)) {
      history.value[history.value.length - 1] = {
        ...prev,
        itemName: newEntry.itemName,
        timestamp: newEntry.timestamp,
      };
      currentIndex.value = history.value.length - 1;
      return;
    }

    history.value.push(newEntry);

    // Limit history size and keep currentIndex aligned
    if (history.value.length > MAX_HISTORY_SIZE) {
      const overflow = history.value.length - MAX_HISTORY_SIZE;
      history.value = history.value.slice(overflow);
      currentIndex.value = Math.max(-1, currentIndex.value - overflow);
    }

    currentIndex.value = history.value.length - 1;
  };

  // Navigate back
  const goBack = (): HistoryEntry | null => {
    if (canGoBack.value) {
      currentIndex.value--;
      return history.value[currentIndex.value] ?? null;
    }
    return null;
  };

  // Navigate forward
  const goForward = (): HistoryEntry | null => {
    if (canGoForward.value) {
      currentIndex.value++;
      return history.value[currentIndex.value] ?? null;
    }
    return null;
  };

  // Check if can navigate
  const canGoBack = ref(false);
  const canGoForward = ref(false);

  // Update navigation flags
  const updateNavigationFlags = (): void => {
    canGoBack.value = currentIndex.value > 0;
    canGoForward.value = currentIndex.value < history.value.length - 1;
  };

  // Get current entry
  const getCurrentEntry = (): HistoryEntry | null => {
    if (currentIndex.value >= 0 && currentIndex.value < history.value.length) {
      return history.value[currentIndex.value] ?? null;
    }
    return null;
  };

  // Clear history
  const clearHistory = (): void => {
    history.value = [];
    currentIndex.value = -1;
    updateNavigationFlags();
  };

  // Get history length
  const getHistoryLength = (): number => {
    return history.value.length;
  };

  // Get all history entries
  const getAllEntries = (): HistoryEntry[] => {
    return [...history.value];
  };

  return {
    history,
    currentIndex,
    canGoBack,
    canGoForward,
    pushEntry,
    goBack,
    goForward,
    getCurrentEntry,
    clearHistory,
    getHistoryLength,
    getAllEntries,
    updateNavigationFlags
  };
};
