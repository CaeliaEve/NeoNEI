import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';

const source = fs.readFileSync(
  'E:/codex/ae2/NeoNEI/frontend/src/components/HomeCanvasGrid.vue',
  'utf8',
).replace(/\r\n/g, '\n');

test('homepage canvas grid consumes embedded render hints before falling back to per-item render-contract fetches', () => {
  assert.equal(
    source.includes('const renderHint = item.renderHint ?? null;'),
    true,
    'homepage grid should read per-item render hints directly from page-pack payloads',
  );
  assert.equal(
    source.includes('&& !renderHint\n      ? await fetchRenderContractAsset(item.renderAssetRef)'),
    true,
    'homepage grid should only fetch per-item render contracts when a baked render hint is unavailable',
  );
  assert.equal(
    source.includes('const supportsAnimation = renderHint'),
    true,
    'homepage grid should use baked animation hints to skip redundant animation support probing',
  );
});
