import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const runtimeSource = readFileSync(new URL('../src/services/distDataRuntime.ts', import.meta.url), 'utf8');
const recipeBinarySource = readFileSync(new URL('../src/services/distDataRuntimeBinaryRecipePack.ts', import.meta.url), 'utf8');
const textureBinarySource = readFileSync(new URL('../src/services/distDataRuntimeBinaryTexturePack.ts', import.meta.url), 'utf8');
const source = `${runtimeSource}
${recipeBinarySource}
${textureBinarySource}`;

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
  const getRustRecipePack = runtimeSource.slice(
    runtimeSource.indexOf('async function getRustRecipePack()'),
    runtimeSource.indexOf('async function getRecipeItemIndex()'),
  );
  assert.ok(getRustRecipePack.includes('fetchDistDataArrayBuffer'), 'recipe pack loader must fetch an ArrayBuffer');
  assert.ok(!getRustRecipePack.includes('fetchJson<DistDataRustRecipePackPayload>'),
    'recipe pack loader must not fetch recipe-pack.json JSON as the production index');
});

test('dist-data atlas runtime uses binary textures.bin as the production atlas index path', () => {
  assert.match(source, /parseNativeBinaryPackEnvelope\(buffer, "neonei\/texture-pack\/current"\)/,
    'atlas runtime must validate the native binary texture pack envelope');
  assert.match(source, /parseCompactTexturePayloadToAtlasIndex\(envelope\.payload\)/,
    'atlas runtime must project NEITEX compact payloads into atlas index entries');
  assert.match(source, /runtimeManifest\?\.entrypoints\?\.textures/,
    'atlas runtime must discover textures.bin from runtime-manifest entrypoints');
  assert.match(source, /COMPACT_TEXTURE_MAGIC = "NEITEX1\\0"/,
    'atlas runtime must recognize the compact texture payload magic');
});

test('dist-data atlas runtime does not fetch texture-pack.json as the primary pack', () => {
  const getAtlas = runtimeSource.slice(
    runtimeSource.indexOf('export async function getDistDataBrowserAtlasIndex()'),
    runtimeSource.indexOf('export async function getDistDataNativeRenderIndex()'),
  );
  assert.ok(getAtlas.includes('fetchDistDataArrayBuffer'), 'atlas loader must fetch binary textures.bin');
  assert.ok(!getAtlas.includes('fetchJson<DistDataRustTexturePackPayload>'),
    'atlas loader must not fetch texture-pack.json JSON as the production atlas index');
});
