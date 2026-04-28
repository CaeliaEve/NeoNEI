import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';

const recipeViewSource = fs.readFileSync(
  'E:/codex/ae2/NeoNEI/frontend/src/views/RecipeView.vue',
  'utf8',
);

const gtDiagramsSource = fs.readFileSync(
  'E:/codex/ae2/NeoNEI/frontend/src/views/GTDiagramsView.vue',
  'utf8',
);

const beeTreeSource = fs.readFileSync(
  'E:/codex/ae2/NeoNEI/frontend/src/views/ForestryBeeTreeView.vue',
  'utf8',
);

const routeSyncSource = fs.readFileSync(
  'E:/codex/ae2/NeoNEI/frontend/src/composables/useRecipeRouteSync.ts',
  'utf8',
);

const mainSource = fs.readFileSync(
  'E:/codex/ae2/NeoNEI/frontend/src/main.ts',
  'utf8',
);

test('recipe navigation uses named routes instead of raw /recipe path strings', () => {
  assert.equal(
    recipeViewSource.includes('path: `/recipe/${clickedItemId}`'),
    false,
    'recipe view should not build recipe routes from raw path strings',
  );
  assert.equal(
    recipeViewSource.includes('router.push(`/recipe/${clickedItemId}`)'),
    false,
    'fast search selection should not push recipe routes via raw string paths',
  );
  assert.equal(
    gtDiagramsSource.includes('router.push(`/recipe/${itemId}`)'),
    false,
    'GT diagrams should use named recipe navigation',
  );
  assert.equal(
    beeTreeSource.includes('router.push(`/recipe/${itemId}`)'),
    false,
    'bee tree view should use named recipe navigation',
  );
});

test('recipe route sync clears unresolved machine and recipe pending state', () => {
  assert.equal(
    routeSyncSource.includes('const fallbackIndex = pendingMachineIndexFromQuery.value;'),
    true,
    'route sync should fall back to machine index when machineName cannot be resolved',
  );
  assert.equal(
    routeSyncSource.includes('pendingRecipeIdFromQuery.value = null;'),
    true,
    'route sync should clear stuck recipeId restores once a usable page is visible',
  );
});

test('frontend bootstraps chunk-load recovery for stale lazy imports', () => {
  assert.equal(
    mainSource.includes("window.addEventListener('vite:preloadError'"),
    true,
    'frontend should recover from stale vite preload errors',
  );
  assert.equal(
    mainSource.includes('router.onError((error) =>'),
    true,
    'frontend should recover from router-level lazy chunk failures',
  );
});
