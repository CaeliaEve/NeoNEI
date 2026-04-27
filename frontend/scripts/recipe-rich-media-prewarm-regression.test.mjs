import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';

const bootstrapSource = fs.readFileSync(
  'E:/codex/ae2/NeoNEI/frontend/src/composables/useRecipeBootstrap.ts',
  'utf8',
).replace(/\r\n/g, '\n');

const viewerSource = fs.readFileSync(
  'E:/codex/ae2/NeoNEI/frontend/src/composables/useRecipeViewer.ts',
  'utf8',
).replace(/\r\n/g, '\n');

test('recipe viewer primes atlas metadata and warmups from payload-level media manifests', () => {
  assert.equal(
    bootstrapSource.includes('primeAnimatedAtlasManifest(bootstrap.mediaManifest);'),
    true,
    'initial bootstrap load should prime animated atlas metadata from the recipe payload',
  );
  assert.equal(
    bootstrapSource.includes('void loadImageAsset(url);'),
    true,
    'initial bootstrap load should warm a small set of atlas images ahead of first render',
  );
  assert.equal(
    viewerSource.includes('const primeRecipePayloadMedia ='),
    true,
    'recipe viewer should centralize payload-level rich-media priming',
  );
  assert.equal(
    viewerSource.includes('primeAnimatedAtlasManifest(mediaManifest);'),
    true,
    'recipe viewer should prime animated atlas metadata from machine/category/shard payloads',
  );
  assert.equal(
    viewerSource.includes('primeRecipePayloadMedia(payload);'),
    true,
    'recipe viewer should prime media manifests for machine/category group payloads before merging recipes',
  );
  assert.equal(
    viewerSource.includes('primeRecipePayloadMedia(shard);'),
    true,
    'recipe viewer should prime media manifests for full shard fallback payloads before merging recipes',
  );
});
