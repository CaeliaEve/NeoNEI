export function shouldPreferLiveRecipeBootstrap(): boolean {
  if (import.meta.env.VITE_PREFER_LIVE_RECIPE_BOOTSTRAP === '1') {
    return true;
  }

  if (typeof window === 'undefined') {
    return false;
  }

  try {
    const override = window.localStorage.getItem('neonei:prefer-live-recipe-bootstrap');
    if (override === '1') {
      return true;
    }
    if (override === '0') {
      return false;
    }
  } catch {
    // Ignore storage access failures and keep the immutable runtime as the default.
  }

  // Keep the published/static runtime as the default even during local development.
  // NeoNEI's target browsing feel is closer to in-game NEI when recipe bootstrap
  // reads hit the materialized publish payloads instead of live SQLite routes.
  return false;
}
