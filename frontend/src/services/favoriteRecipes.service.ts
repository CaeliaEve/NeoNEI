import { ref, watch } from 'vue';

export interface FavoriteRecipe {
  recipeId: string;
  itemId: string;
  recipeType: string;
  machineName: string;
  timestamp: number;
}

const STORAGE_KEY = 'ae2_pattern_encoder_favorite_recipes';

// Global state
const favoriteRecipes = ref<Map<string, FavoriteRecipe>>(new Map());

// Load from localStorage
const loadFavorites = (): void => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const recipes: FavoriteRecipe[] = JSON.parse(stored);
      favoriteRecipes.value = new Map(
        recipes.map(recipe => [recipe.recipeId, recipe])
      );
    }
  } catch (error) {
    console.error('Failed to load favorite recipes:', error);
    favoriteRecipes.value = new Map();
  }
};

// Save to localStorage
const saveFavorites = (): void => {
  try {
    const recipes = Array.from(favoriteRecipes.value.values());
    localStorage.setItem(STORAGE_KEY, JSON.stringify(recipes));
  } catch (error) {
    console.error('Failed to save favorite recipes:', error);
  }
};

// Watch for changes and auto-save
watch(favoriteRecipes, () => {
  saveFavorites();
}, { deep: true });

// Initialize on load
loadFavorites();

// Service API
export const useFavoriteRecipes = () => {
  // Check if a recipe is favorited
  const isFavorite = (recipeId: string): boolean => {
    return favoriteRecipes.value.has(recipeId);
  };

  // Add to favorites
  const addFavorite = (recipe: Omit<FavoriteRecipe, 'timestamp'>): void => {
    const favorite: FavoriteRecipe = {
      ...recipe,
      timestamp: Date.now()
    };
    favoriteRecipes.value.set(recipe.recipeId, favorite);
  };

  // Remove from favorites
  const removeFavorite = (recipeId: string): void => {
    favoriteRecipes.value.delete(recipeId);
  };

  // Toggle favorite
  const toggleFavorite = (recipe: Omit<FavoriteRecipe, 'timestamp'>): void => {
    if (isFavorite(recipe.recipeId)) {
      removeFavorite(recipe.recipeId);
    } else {
      addFavorite(recipe);
    }
  };

  // Get all favorite recipes
  const getAllFavorites = (): FavoriteRecipe[] => {
    return Array.from(favoriteRecipes.value.values())
      .sort((a, b) => b.timestamp - a.timestamp);
  };

  // Get favorites for a specific item
  const getFavoritesForItem = (itemId: string): FavoriteRecipe[] => {
    return getAllFavorites()
      .filter(fav => fav.itemId === itemId);
  };

  // Clear all favorites
  const clearAll = (): void => {
    favoriteRecipes.value.clear();
  };

  // Export favorites
  const exportFavorites = (): string => {
    const recipes = Array.from(favoriteRecipes.value.values());
    return JSON.stringify(recipes, null, 2);
  };

  // Import favorites
  const importFavorites = (jsonData: string): boolean => {
    try {
      const recipes: FavoriteRecipe[] = JSON.parse(jsonData);
      favoriteRecipes.value = new Map(
        recipes.map(recipe => [recipe.recipeId, recipe])
      );
      saveFavorites();
      return true;
    } catch (error) {
      console.error('Failed to import favorites:', error);
      return false;
    }
  };

  return {
    favoriteRecipes,
    isFavorite,
    addFavorite,
    removeFavorite,
    toggleFavorite,
    getAllFavorites,
    getFavoritesForItem,
    clearAll,
    exportFavorites,
    importFavorites
  };
};
