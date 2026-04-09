import { ref } from 'vue';
import type { Item, Recipe } from '../../services/api';

export const useRecipeDataState = () => {
  const loading = ref(true);
  const item = ref<Item | null>(null);
  const recipes = ref<{ usedIn: Recipe[]; producedBy: Recipe[] }>({
    usedIn: [],
    producedBy: [],
  });

  return {
    loading,
    item,
    recipes,
  };
};
