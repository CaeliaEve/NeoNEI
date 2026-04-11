import assert from 'node:assert/strict';
import test from 'node:test';
import { countManifestAssets } from '../src/services/manifest-counts';

test('uses manifest assetCount when assets are nested under groups', () => {
  const count = countManifestAssets({
    assetCount: 4914,
    groups: [
      { assets: [{ assetId: 'a' }] },
      { assets: [{ assetId: 'b' }, { assetId: 'c' }] },
    ],
  });

  assert.equal(count, 4914);
});

test('falls back to summing grouped assets', () => {
  const count = countManifestAssets({
    groups: [
      { assets: [{ assetId: 'a' }] },
      { assets: [{ assetId: 'b' }, { assetId: 'c' }] },
    ],
  });

  assert.equal(count, 3);
});
