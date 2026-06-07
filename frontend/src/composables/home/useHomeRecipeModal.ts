import { computed, ref, watch, type Ref } from "vue";
import type { Router } from "vue-router";
import type { Item } from "../../services/api";
import { useRecipeViewer } from "../useRecipeViewer";
import { useHomeRecipePresentation } from "./useHomeRecipePresentation";

type RecipeTab = "usedIn" | "producedBy";

export function useHomeRecipeModal(options: {
  items: Ref<Item[]>;
  router: Router;
  playClick: () => void;
  addToHistory: (item: Item) => void;
}) {
  const showRecipeModal = ref(false);
  const recipeModalItem = ref<Item | null>(null);
  const recipeModalMode = ref<RecipeTab>("producedBy");
  const modalRecipeItemId = computed(() => recipeModalItem.value?.itemId);

  const {
    loading: recipeModalLoading,
    currentTab,
    loadError: recipeLoadError,
    selectedMachineIndex,
    currentPage: recipeModalPage,
    machineCategories,
    currentCategory,
    currentPageRecipes,
    totalPages: totalRecipePages,
    selectMachine,
    nextPage,
    prevPage,
    setCurrentTab,
    retryLoadRecipes,
  } = useRecipeViewer(modalRecipeItemId, options.playClick);

  const recipeModalError = computed(() => recipeLoadError.value);
  const pendingRecipeMachineName = ref<string | null>(null);

  watch(recipeModalMode, (mode) => {
    setCurrentTab(mode);
  });

  watch(showRecipeModal, (visible) => {
    if (!visible) {
      recipeModalItem.value = null;
      recipeModalMode.value = "producedBy";
    }
  });

  const {
    currentRecipePresentation,
    isRecipeModalWorkbenchCanvas,
    isRecipeModalWideCanvas,
    isRecipeModalFurnaceCanvas,
    recipeModalScaleToFit,
    recipeStageIsStateView,
    recipePreviewNeedsWideStage,
    recipeStageKey,
  } = useHomeRecipePresentation({
    currentPageRecipes,
    currentCategory,
    recipeModalLoading,
    recipeModalError,
    recipeModalMode,
  });

  const openCurrentRecipeMode = () => {
    retryLoadRecipes();
  };

  const openRecipeModal = (item: Item) => {
    recipeModalItem.value = item;
    recipeModalMode.value = "producedBy";
    setCurrentTab("producedBy");
    showRecipeModal.value = true;
    options.addToHistory(item);
  };

  const openCraftingRecipes = (item: Item) => {
    openRecipeModal(item);
  };

  const openUsageRecipes = (item: Item) => {
    recipeModalItem.value = item;
    recipeModalMode.value = "usedIn";
    setCurrentTab("usedIn");
    showRecipeModal.value = true;
    options.addToHistory(item);
  };

  const handleItemContextMenu = (item: Item, event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    openUsageRecipes(item);
  };

  const handleCardContextMenu = (item: Item, event?: MouseEvent) => {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    openUsageRecipes(item);
  };

  const nextRecipePage = () => {
    nextPage();
  };

  const prevRecipePage = () => {
    prevPage();
  };

  const handleRecipeWheel = (event: WheelEvent) => {
    if (Math.abs(event.deltaY) < 8 || totalRecipePages.value <= 1) return;
    event.preventDefault();
    if (event.deltaY > 0) {
      nextPage();
    } else {
      prevPage();
    }
  };

  const handleRecipeItemClick = (itemId: string, itemOptions?: { tab?: RecipeTab }) => {
    const item = options.items.value.find((candidate) => candidate.itemId === itemId);
    if (item) {
      if (itemOptions?.tab) {
        setCurrentTab(itemOptions.tab);
        recipeModalMode.value = itemOptions.tab;
        pendingRecipeMachineName.value = itemOptions.tab === "producedBy" ? "物品中的要素" : null;
      }
      openRecipeModal(item);
      return;
    }
    void options.router.push({
      name: "recipe",
      params: { itemId },
      query: itemOptions?.tab
        ? {
            tab: itemOptions.tab,
            mode: itemOptions.tab === "usedIn" ? "u" : "r",
            machineName: itemOptions.tab === "producedBy" ? "物品中的要素" : undefined,
            page: "0",
          }
        : undefined,
    });
  };

  watch(
    () => [pendingRecipeMachineName.value, machineCategories.value.map((category) => category.name).join("|")] as const,
    ([pendingMachineName]) => {
      if (!pendingMachineName) return;
      const index = machineCategories.value.findIndex(
        (category) => category.name.trim().toLowerCase() === pendingMachineName.trim().toLowerCase(),
      );
      if (index >= 0) {
        selectMachine(index);
        pendingRecipeMachineName.value = null;
      }
    },
  );

  return {
    showRecipeModal,
    recipeModalItem,
    recipeModalMode,
    recipeModalLoading,
    currentTab,
    selectedMachineIndex,
    recipeModalPage,
    machineCategories,
    currentCategory,
    currentPageRecipes,
    totalRecipePages,
    recipeModalError,
    currentRecipePresentation,
    isRecipeModalWorkbenchCanvas,
    isRecipeModalWideCanvas,
    isRecipeModalFurnaceCanvas,
    recipeModalScaleToFit,
    recipeStageIsStateView,
    recipePreviewNeedsWideStage,
    recipeStageKey,
    selectMachine,
    openCurrentRecipeMode,
    openRecipeModal,
    openCraftingRecipes,
    openUsageRecipes,
    handleItemContextMenu,
    handleCardContextMenu,
    nextRecipePage,
    prevRecipePage,
    handleRecipeWheel,
    handleRecipeItemClick,
  };
}
