import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';

const bootstrapSource = fs.readFileSync(
  'src/composables/useRecipeBootstrap.ts',
  'utf8',
).replace(/\r\n/g, '\n');

const viewerSource = fs.readFileSync(
  'src/composables/useRecipeViewer.ts',
  'utf8',
).replace(/\r\n/g, '\n');

const shardHydratorSource = fs.readFileSync(
  'src/composables/recipe-browser/recipeShardHydrator.ts',
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
    viewerSource.includes('primeRecipePayloadMedia(payload);'),
    true,
    'recipe viewer should prime media manifests for machine/category group payloads before merging recipes',
  );
  assert.equal(
    shardHydratorSource.includes('primeRecipePayloadMedia(shard);'),
    true,
    'recipe shard hydrator should prime media manifests for full-shard recovery payloads before merging recipes',
  );
});
