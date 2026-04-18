import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';

const source = fs.readFileSync(
  'E:/codex/ae2/NeoNEI/frontend/src/views/HomePage.vue',
  'utf8',
);

test('HomePage does not prewarm per-item images when precomputed page atlas is active', () => {
  assert.equal(
    source.includes('prewarmVisibleItemImages();'),
    false,
    'homepage should not eagerly prewarm individual item images alongside precomputed atlas',
  );
  assert.equal(
    source.includes('shouldDeferHomepageCards'),
    true,
    'homepage should defer item card rendering until atlas is ready',
  );
});
