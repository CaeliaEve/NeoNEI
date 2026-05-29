import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';

const source = fs.readFileSync(
  'src/components/HomeCanvasGrid.vue',
  'utf8',
);

test('HomePage does not prewarm per-item images when precomputed page atlas is active', () => {
  assert.equal(
    source.includes('prewarmVisibleItemImages();'),
    false,
    'homepage should not eagerly prewarm individual item images alongside precomputed atlas',
  );
  assert.equal(
    source.includes('shouldHoldFallbackImages'),
    true,
    'homepage canvas grid should hold fallback image loading until atlas handoff is ready',
  );
  assert.equal(
    source.includes('const hasAtlasSource = computed('),
    true,
    'homepage atlas-first mode should track atlas availability before falling back to per-item images',
  );
  assert.equal(
    source.includes('fetchRenderContractAsset'),
    false,
    'homepage canvas grid should not inspect per-item render contracts on the V3 browser hot path',
  );
  assert.equal(
    source.includes('probeAnimationSupport'),
    false,
    'homepage canvas grid should not probe per-item animation support during fast page flips',
  );
});

