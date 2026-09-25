import { ref } from "vue";

export function useHomeSearchContextMenu(options: {
  searchQuery: { value: string };
  currentPage: { value: number };
  loadItems: () => Promise<unknown> | unknown;
}) {
  const showSearchContextMenu = ref(false);
  const searchContextMenuPosition = ref({ x: 0, y: 0 });

  const handleSearchContextMenu = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    searchContextMenuPosition.value = { x: event.clientX, y: event.clientY };
    showSearchContextMenu.value = true;
  };

  const closeSearchContextMenu = () => {
    showSearchContextMenu.value = false;
  };

  const clearSearchQuery = () => {
    options.searchQuery.value = "";
    options.currentPage.value = 1;
    closeSearchContextMenu();
    void options.loadItems();
  };

  const handleGlobalPointerDown = () => {
    if (!showSearchContextMenu.value) return;
    closeSearchContextMenu();
  };

  const handleGlobalKeydown = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      closeSearchContextMenu();
    }
  };

  return {
    showSearchContextMenu,
    searchContextMenuPosition,
    handleSearchContextMenu,
    closeSearchContextMenu,
    clearSearchQuery,
    handleGlobalPointerDown,
    handleGlobalKeydown,
  };
}
