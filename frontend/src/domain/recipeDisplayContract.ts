export type RecipeOverlayStatus = 'idle' | 'loading' | 'success' | 'error';

export type RecipeOverlayUiState = {
  status: RecipeOverlayStatus;
  message: string;
  canRetry: boolean;
  requestId: string | null;
  updatedAt: number;
};

export type RecipeDisplayHandle = {
  handleRecipeOverlay?: () => void | Promise<void>;
};