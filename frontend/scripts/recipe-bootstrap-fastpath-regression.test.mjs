import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';

const source = fs.readFileSync(
  'E:/codex/ae2/NeoNEI/frontend/src/composables/useRecipeBootstrap.ts',
  'utf8',
);

test('recipe bootstrap fast path avoids eager batch hydration on initial open', () => {
  assert.equal(
    source.includes('getIndexedRecipesByIds('),
    false,
    'initial recipe bootstrap should not issue batch indexed-recipe requests',
  );
  assert.equal(
    source.includes('INITIAL_EAGER_RECIPE_LIMIT'),
    false,
    'frontend eager recipe limit constant should be removed once bootstrap top-up moves server-side',
  );
});
