import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const clientSource = fs.readFileSync(
  path.join(frontendRoot, 'src/runtime/recipeBootstrapClient.ts'),
  'utf8',
).replace(/\r\n/g, '\n');

const recipeClientSource = fs.readFileSync(
  path.join(frontendRoot, 'src/runtime/recipeClient.ts'),
  'utf8',
).replace(/\r\n/g, '\n');

const viewerSource = fs.readFileSync(
  path.join(frontendRoot, 'src/composables/useRecipeViewer.ts'),
  'utf8',
).replace(/\r\n/g, '\n');

test('recipe search uses static publish packs before falling back to the live API search route', () => {
  assert.equal(
    recipeClientSource.includes('canUsePublishedRecipeSearchPack('),
    true,
    'api should detect whether a published recipe search pack is available',
  );
  assert.equal(
    recipeClientSource.includes('resolvePublishedRecipeSearchPath('),
    true,
    'api should resolve deterministic published recipe search pack paths',
  );
  assert.equal(
    clientSource.includes('getPublishedRecipeBootstrapSearchPack('),
    true,
    'api should cache and load published recipe search packs',
  );
  assert.equal(
    clientSource.includes('searchPublishedRecipeBootstrapPack('),
    true,
    'api should execute recipe search locally against the published pack',
  );
  assert.equal(
    clientSource.includes('searchPublishedItemMatches('),
    true,
    'local recipe search should resolve item matches from published browser search shards before API fallback',
  );
  assert.equal(
    clientSource.includes("await api.searchItemsFast(normalizedQuery, 80"),
    false,
    'static recipe search should no longer depend on the live item search API on its hot path',
  );
  assert.equal(
    viewerSource.includes('prefetchRecipeSearchPack()'),
    true,
    'recipe viewer should warm the current tab search pack in the background',
  );
});

