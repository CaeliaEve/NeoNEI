import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';

const apiSource = fs.readFileSync(
  'E:/codex/ae2/NeoNEI/frontend/src/services/api.ts',
  'utf8',
).replace(/\r\n/g, '\n');

const viewerSource = fs.readFileSync(
  'E:/codex/ae2/NeoNEI/frontend/src/composables/useRecipeViewer.ts',
  'utf8',
).replace(/\r\n/g, '\n');

test('recipe opening has source attribution and budget marks', () => {
  assert.equal(
    apiSource.includes("markPerfEvent('recipe-bootstrap-resolved'"),
    true,
    'recipe bootstrap should emit a resolved perf mark with its source and latency',
  );
  for (const source of [
    'persistent-cache',
    'item-recipe-bundle',
    'legacy-static-bootstrap',
    'api-fallback',
  ]) {
    assert.equal(
      apiSource.includes(`'${source}'`),
      true,
      `recipe bootstrap perf attribution should include ${source}`,
    );
  }
  assert.equal(
    apiSource.indexOf('resolvePublishedItemRecipeBundlePath(manifest, itemId)')
      < apiSource.indexOf("resolvePublishedRecipeBootstrapPath(manifest, itemId, 'bootstrap')"),
    true,
    'item-centric recipe bundles should remain ahead of legacy bootstrap shards',
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
