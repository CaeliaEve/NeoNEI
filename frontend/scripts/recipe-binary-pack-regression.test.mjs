import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const runtimeSource = readFileSync(new URL('../src/services/distDataRuntime.ts', import.meta.url), 'utf8');
const renderRuntimeSource = readFileSync(new URL('../src/services/distDataRuntimeRender.ts', import.meta.url), 'utf8');
const recipeBrowserSelectorsSource = readFileSync(new URL('../src/composables/recipe-browser/useRecipeBrowserSelectors.ts', import.meta.url), 'utf8');
const recipeBrowserHelpersSource = readFileSync(new URL('../src/composables/recipe-browser/helpers.ts', import.meta.url), 'utf8');
const recipeBinarySource = readFileSync(new URL('../src/services/distDataRuntimeBinaryRecipePack.ts', import.meta.url), 'utf8');
const textureBinarySource = readFileSync(new URL('../src/services/distDataRuntimeBinaryTexturePack.ts', import.meta.url), 'utf8');
const source = `${runtimeSource}
${renderRuntimeSource}
${recipeBinarySource}
${textureBinarySource}`;

test('dist-data recipe runtime uses binary recipes.bin as the production index path', () => {
  assert.match(source, /RUNTIME_PACK_CONTRACTS\.recipes\.schema/,
    'recipe runtime must read the current recipe binary schema from the pack ABI contract');
  assert.match(source, /parseNativeBinaryPackEnvelope\(buffer, RUNTIME_PACK_CONTRACTS\.recipes\.schema\)/,
    'recipe runtime must validate the native binary recipe pack envelope');
  assert.match(source, /parseCompactRecipePayload\(envelope\.payload\)/,
    'recipe runtime must parse NEIRCP compact payloads');
  assert.match(source, /RUNTIME_PACK_CONTRACTS\.recipes/,
    'recipe runtime must discover recipes.bin through the explicit runtime pack contract');
  assert.match(source, /COMPACT_RECIPE_MAGIC = "NEIRCP1\\0"/,
    'recipe runtime must recognize the compact recipe payload magic');
});

test('dist-data recipe runtime routes binary UI shard entries to canonical recipe shards', () => {
  assert.match(
    runtimeSource,
    /function normalizeRecipeUiPayloadPath\(path: string\): string/,
    'recipe UI payload paths from recipes.bin must be normalized before fetch',
  );
  assert.match(
    runtimeSource,
    /LEGACY_RUST_RECIPE_UI_SHARD_PREFIX = "rust\/recipe-ui-payload-shards\/"/,
    'runtime should recognize stale rust shard prefixes emitted by older binary packs',
  );
  assert.match(
    runtimeSource,
    /CURRENT_RECIPE_UI_SHARD_PREFIX = "recipes\/ui-payload-shards\/"/,
    'runtime should resolve stale shard prefixes to the canonical dist-data recipe shard tree',
  );
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
  assert.match(source, /RUNTIME_PACK_CONTRACTS\.textures\.schema/,
    'atlas runtime must read the current texture binary schema from the pack ABI contract');
  assert.match(source, /parseNativeBinaryPackEnvelope\(buffer, RUNTIME_PACK_CONTRACTS\.textures\.schema\)/,
    'atlas runtime must validate the native binary texture pack envelope');
  assert.match(source, /parseCompactTexturePayloadToAtlasIndex\(envelope\.payload\)/,
    'atlas runtime must project NEITEX compact payloads into atlas index entries');
  assert.match(source, /RUNTIME_PACK_CONTRACTS\.textures/,
    'atlas runtime must discover textures.bin through the explicit runtime pack contract');
  assert.match(source, /COMPACT_TEXTURE_MAGIC = "NEITEX1\\0"/,
    'atlas runtime must recognize the compact texture payload magic');
});

test('dist-data atlas runtime does not fetch texture-pack.json as the primary pack', () => {
  const getAtlas = renderRuntimeSource.slice(
    renderRuntimeSource.indexOf('async function getDistDataBrowserAtlasIndex()'),
    renderRuntimeSource.indexOf('async function getDistDataNativeRenderIndex()'),
  );
  assert.ok(getAtlas.includes('fetchDistDataArrayBuffer'), 'atlas loader must fetch binary textures.bin');
  assert.ok(!getAtlas.includes('fetchJson<DistDataRustTexturePackPayload>'),
    'atlas loader must not fetch texture-pack.json JSON as the production atlas index');
});

test('recipe category windows preserve raw runtime category keys through the viewer', () => {
  assert.match(
    recipeBrowserHelpersSource,
    /const rawCategoryKey = `\$\{group\.categoryKey \?\? ''\}`\.trim\(\)/,
    'summary categories must preserve raw dist-data category keys such as display~furnace',
  );
  assert.match(
    recipeBrowserHelpersSource,
    /const rawMachineKey = `\$\{group\.machineKey \?\? ''\}`\.trim\(\)/,
    'summary categories must preserve raw machine keys for category pack fetches',
  );
  assert.match(
    recipeBrowserSelectorsSource,
    /return `\$\{currentTab\.value\}:\$\{categoryKey\}:\$\{machineKey\}`/,
    'viewer must read recipeIds from the same category+machine key used by category pack writes',
  );
});

test('recipe category summaries preserve exported machine icons from native recipe packs', () => {
  assert.match(
    recipeBinarySource,
    /machineIcon:\s*categoryStride >= 7/,
    'binary recipe parser must preserve compact category machineIcon columns',
  );
  assert.match(
    runtimeSource,
    /toIndexedMachineIconFromRaw\(category\?\.machineIcon, runtime\)/,
    'runtime category summaries must project exported machine icons instead of forcing null icons',
  );
  assert.match(
    runtimeSource,
    /toIndexedMachineIconFromRaw\(payloadMachineInfo\.machineIcon, runtime\)/,
    'recipe UI payloads must prefer exported machineInfo.machineIcon for recipe title icons',
  );
});
