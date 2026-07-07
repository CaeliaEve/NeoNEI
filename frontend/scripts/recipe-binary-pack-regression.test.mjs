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

test('dist-data recipe runtime routes binary UI shard entries through canonical declared paths only', () => {
  assert.match(
    runtimeSource,
    /function normalizeRecipeUiPayloadPath\(path: string\): string/,
    'recipe UI payload paths from recipes.bin must be normalized before fetch',
  );
  assert.match(
    runtimeSource,
    /const payloadPath = entry \? normalizeRecipeUiPayloadPath\(entry\.path\) : ""/,
    'runtime must use the recipe-pack declared shard path directly',
  );
  assert.doesNotMatch(
    runtimeSource,
    /LEGACY_RUST_RECIPE_UI_SHARD_PREFIX|CURRENT_RECIPE_UI_SHARD_PREFIX|resolveRecipeUiPayloadPath|sha1Hex|leftRotate/,
    'runtime must not rewrite stale recipe UI shard prefixes through legacy compatibility logic',
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

test('dist-data recipe indexes do not fall back to legacy JSON sidecar indexes', () => {
  const getRecipeItemIndex = runtimeSource.slice(
    runtimeSource.indexOf('async function getRecipeItemIndex()'),
    runtimeSource.indexOf('function collectRecipeIds('),
  );
  const getRecipeUiPayloadIndex = runtimeSource.slice(
    runtimeSource.indexOf('async function getRecipeUiPayloadIndex()'),
    runtimeSource.indexOf('export async function getDistDataRecipeUiPayload('),
  );

  assert.match(getRecipeItemIndex, /const rustRecipePack = await getRustRecipePack\(\)/,
    'item index must be projected from the native recipe pack');
  assert.match(getRecipeItemIndex, /rustRecipePack\?\.itemIndex/,
    'item index must consume the pack itemIndex table');
  assert.doesNotMatch(getRecipeItemIndex, /manifest\?\.files\?\.recipeItemIndex|fetchDistDataJson<DistDataRecipeItemIndexPayload>/,
    'item index must not read the legacy JSON recipeItemIndex sidecar');

  assert.match(getRecipeUiPayloadIndex, /const rustRecipePack = await getRustRecipePack\(\)/,
    'UI payload index must be projected from the native recipe pack');
  assert.match(getRecipeUiPayloadIndex, /rustRecipePack\?\.uiPayloadIndex/,
    'UI payload index must consume the pack uiPayloadIndex table');
  assert.doesNotMatch(getRecipeUiPayloadIndex, /manifest\?\.files\?\.recipeUiPayloadIndex|fetchDistDataJson<DistDataRecipeUiPayloadIndexPayload>/,
    'UI payload index must not read the legacy JSON recipeUiPayloadIndex sidecar');

  assert.doesNotMatch(runtimeSource, /type DistDataRecipeItemIndexPayload|type DistDataRecipeUiPayloadIndexPayload/,
    'legacy JSON index payload types should not remain in the runtime source');
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

test('dist-data recipe projection backfills missing UI payload item roles from native item index', () => {
  assert.match(
    runtimeSource,
    /type DistDataRecipeItemRoleIndexEntry = \{\s*producedByItemIds: string\[\];\s*usedInItemIds: string\[\];\s*\}/,
    'runtime should materialize a recipeId -> producedBy/usedIn item role index',
  );
  assert.match(
    runtimeSource,
    /appendUniqueItemId\(getOrCreateRecipeItemRoleIndexEntry\(roleIndex, recipeId\)\.producedByItemIds, itemId\)/,
    'producedBy itemIndex entries should become recipe output candidates',
  );
  assert.match(
    runtimeSource,
    /appendUniqueItemId\(getOrCreateRecipeItemRoleIndexEntry\(roleIndex, recipeId\)\.usedInItemIds, itemId\)/,
    'usedIn itemIndex entries should become recipe input candidates',
  );
  assert.match(
    runtimeSource,
    /const resolvedInputItemIds = inputItemIds\.length > 0 \? inputItemIds : indexedInputItemIds/,
    'UI payload inputs should only be backfilled when the payload has no explicit input item IDs',
  );
  assert.match(
    runtimeSource,
    /const resolvedOutputItemIds = outputItemIds\.length > 0 \? outputItemIds : indexedOutputItemIds/,
    'UI payload outputs should only be backfilled when the payload has no explicit output item IDs',
  );
});
