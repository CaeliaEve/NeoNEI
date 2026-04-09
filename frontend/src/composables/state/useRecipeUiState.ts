import { storeToRefs } from 'pinia';
import { useRecipeBrowserUiStore } from '../../stores/recipeBrowserUi';

export const useRecipeUiState = () => {
  const store = useRecipeBrowserUiStore();
  const {
    currentTab,
    selectedMachineIndex,
    currentPage,
    recipeSearchQuery,
    selectedVariantBySlot,
  } = storeToRefs(store);

  return {
    currentTab,
    selectedMachineIndex,
    currentPage,
    recipeSearchQuery,
    selectedVariantBySlot,
    setSelectedVariant: store.setSelectedVariant,
    getSelectedVariant: store.getSelectedVariant,
    clearSelectedVariants: store.clearSelectedVariants,
  };
};
