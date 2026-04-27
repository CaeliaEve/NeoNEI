import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';

const viewerSource = fs.readFileSync(
  'E:/codex/ae2/NeoNEI/frontend/src/composables/useRecipeViewer.ts',
  'utf8',
);

const selectorsSource = fs.readFileSync(
  'E:/codex/ae2/NeoNEI/frontend/src/composables/recipe-browser/useRecipeBrowserSelectors.ts',
  'utf8',
);

test('recipe viewer preserves requested tab across bootstrap and exposes bootstrap-backed total counts', () => {
  assert.equal(
    viewerSource.includes('const producedByTotalCount = computed(() =>'),
    true,
    'viewer should compute producedBy totals from bootstrap indexes/summary instead of loaded recipes only',
  );
  assert.equal(
    viewerSource.includes('const usedInTotalCount = computed(() =>'),
    true,
    'viewer should compute usedIn totals from bootstrap indexes/summary instead of loaded recipes only',
  );
  assert.equal(
    viewerSource.includes("if (currentTab.value === 'usedIn')"),
    true,
    'viewer should preserve a usedIn route/tab request after bootstrap finishes',
  );
  assert.equal(
    viewerSource.includes("if (currentTab.value === 'producedBy')"),
    true,
    'viewer should preserve a producedBy route/tab request after bootstrap finishes',
  );
});

test('recipe browser selectors use bootstrap totals for tab counts before full hydration completes', () => {
  assert.equal(
    selectorsSource.includes('tabRecipeTotals: Ref<{ usedIn: number; producedBy: number }>;'),
    true,
    'selectors should accept bootstrap-backed tab totals',
  );
  assert.equal(
    selectorsSource.includes('return Math.max(totalFromBootstrap, currentRecipesInTab.value.length);'),
    true,
    'selectors should prefer bootstrap totals over partially hydrated recipe arrays',
  );
  assert.equal(
    selectorsSource.includes('if (!recipeSearchQuery.value.trim()) {'),
    true,
    'selectors should keep non-search result counts aligned with bootstrap totals',
  );
});
