import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const repoRoot = process.cwd();
const readSource = (relativePath) => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');

const selectors = readSource('src/composables/recipe-browser/useRecipeBrowserSelectors.ts');
const viewer = readSource('src/composables/useRecipeViewer.ts');
const recipeView = readSource('src/views/RecipeView.vue');

test('recipe detail summary projection state is not exposed as a fallback path', () => {
  assert.match(selectors, /const isCurrentRecipeUsingSummaryProjection = computed/);
  assert.match(selectors, /!hasCurrentRecipeDetailedData\.value/);
  assert.match(viewer, /isCurrentRecipeUsingSummaryProjection/);
  assert.match(recipeView, /isCurrentRecipeUsingSummaryProjection/);
  assert.match(recipeView, /recipeDetailProjection/);
  assert.match(recipeView, /recipe-detail-pill-warning/);

  for (const source of [selectors, viewer, recipeView]) {
    assert.doesNotMatch(source, /isCurrentRecipeUsingFallback/);
  }
  assert.doesNotMatch(recipeView, /recipeDetailFallback/);
  assert.doesNotMatch(recipeView, /recipe-detail-pill-fallback/);
  assert.doesNotMatch(recipeView, /\\u56de\\u9000/);
});
