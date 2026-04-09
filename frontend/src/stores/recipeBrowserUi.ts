import { defineStore } from 'pinia';
import { ref } from 'vue';

export const useRecipeBrowserUiStore = defineStore('recipeBrowserUi', () => {
  const currentTab = ref<'usedIn' | 'producedBy'>('producedBy');
  const selectedMachineIndex = ref(0);
  const currentPage = ref(0);
  const recipeSearchQuery = ref('');
  const selectedVariantBySlot = ref<Record<string, number>>({});

  const setSelectedVariant = (recipeId: string, slotKey: string, variantIndex: number) => {
    if (!recipeId || !slotKey || variantIndex < 0) {
      return;
    }
    selectedVariantBySlot.value = {
      ...selectedVariantBySlot.value,
      [`${recipeId}::${slotKey}`]: variantIndex,
    };
  };

  const getSelectedVariant = (recipeId: string, slotKey: string): number => {
    return selectedVariantBySlot.value[`${recipeId}::${slotKey}`] ?? 0;
  };

  const clearSelectedVariants = () => {
    selectedVariantBySlot.value = {};
  };

  return {
    currentTab,
    selectedMachineIndex,
    currentPage,
    recipeSearchQuery,
    selectedVariantBySlot,
    setSelectedVariant,
    getSelectedVariant,
    clearSelectedVariants,
  };
});
