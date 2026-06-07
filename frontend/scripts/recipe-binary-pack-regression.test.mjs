import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const source = readFileSync(new URL('../src/services/distDataRuntime.ts', import.meta.url), 'utf8');

test('dist-data recipe runtime uses binary recipes.bin as the production index path', () => {
  assert.match(source, /parseNativeBinaryPackEnvelope\(buffer, "neonei\/recipe-pack\/current"\)/,
    'recipe runtime must validate the native binary recipe pack envelope');
  assert.match(source, /parseCompactRecipePayload\(envelope\.payload\)/,
    'recipe runtime must parse NEIRCP compact payloads');
  assert.match(source, /runtimeManifest\?\.entrypoints\?\.recipes/,
    'recipe runtime must discover recipes.bin from runtime-manifest entrypoints');
  assert.match(source, /COMPACT_RECIPE_MAGIC = "NEIRCP1\\0"/,
    'recipe runtime must recognize the compact recipe payload magic');
});

test('dist-data recipe runtime does not fetch recipe-pack.json as the primary pack', () => {
  const getRustRecipePack = source.slice(
    source.indexOf('async function getRustRecipePack()'),
    source.indexOf('async function getRecipeItemIndex()'),
  );
  assert.ok(getRustRecipePack.includes('fetchArrayBuffer'), 'recipe pack loader must fetch an ArrayBuffer');
  assert.ok(!getRustRecipePack.includes('fetchJson<DistDataRustRecipePackPayload>'),
    'recipe pack loader must not fetch recipe-pack.json JSON as the production index');
});
