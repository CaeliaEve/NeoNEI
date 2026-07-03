import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';

const bootstrapClientSource = fs.readFileSync(
  'src/runtime/recipeBootstrapClient.ts',
  'utf8',
).replace(/\r\n/g, '\n');

const viewerSource = fs.readFileSync(
  'src/composables/useRecipeViewer.ts',
  'utf8',
).replace(/\r\n/g, '\n');

test('recipe opening has source attribution and budget marks', () => {
  assert.equal(
    bootstrapClientSource.includes("markPerfEvent('recipe-bootstrap-resolved'"),
    true,
    'recipe bootstrap should emit a resolved perf mark with its source and latency',
  );
  for (const source of [
    'dist-data-v3',
    'memory-cache',
    'in-flight',
    'item-recipe-bundle',
    'published-bootstrap',
  ]) {
    assert.equal(
      bootstrapClientSource.includes(`'${source}'`),
      true,
      `recipe bootstrap perf attribution should include ${source}`,
    );
  }
  assert.equal(
    bootstrapClientSource.indexOf('resolvePublishedItemRecipeBundlePath(manifest, itemId)')
      < bootstrapClientSource.indexOf("resolvePublishedRecipeBootstrapPath(manifest, itemId, 'bootstrap')"),
    true,
    'item-centric recipe bundles should remain ahead of immutable bootstrap shards',
  );
  assert.equal(
    bootstrapClientSource.includes('api-fallback'),
    false,
    'recipe bootstrap source attribution must not retain retired API fallback labels',
  );
});

test('recipe viewer gates open latency budgets without changing UI behavior', () => {
  assert.equal(
    viewerSource.includes('const RECIPE_BOOTSTRAP_SUMMARY_BUDGET_MS = 100;'),
    true,
    'summary open budget should be explicit and grep-able',
  );
  assert.equal(
    viewerSource.includes('const RECIPE_FULL_GROUP_BUDGET_MS = 300;'),
    true,
    'full group open budget should be explicit and grep-able',
  );
  assert.equal(
    viewerSource.includes("markPerfEvent('recipe-open-budget'"),
    true,
    'recipe open should emit a budget event for browser/E2E Gate C checks',
  );
  assert.equal(
    viewerSource.includes('withinSummaryBudget: bootstrapDurationMs <= RECIPE_BOOTSTRAP_SUMMARY_BUDGET_MS'),
    true,
    'budget mark should compute whether the common summary target was met',
  );
  assert.equal(
    viewerSource.includes('withinFullGroupBudget: bootstrapDurationMs <= RECIPE_FULL_GROUP_BUDGET_MS'),
    true,
    'budget mark should compute whether the full group target was met',
  );
});
