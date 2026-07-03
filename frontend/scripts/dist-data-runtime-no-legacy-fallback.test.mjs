import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const frontendRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const runtimeSource = readFileSync(resolve(frontendRoot, 'src/services/distDataRuntime.ts'), 'utf8');
const manifestSource = readFileSync(resolve(frontendRoot, 'src/services/distDataRuntimeManifest.ts'), 'utf8');

test('dist-data browser and search runtime consume binary packs only', () => {
  assert.match(runtimeSource, /getDeclaredNativeBinaryPackPath\(manifest, RUNTIME_PACK_CONTRACTS\.browser\)/);
  assert.match(runtimeSource, /getDeclaredNativeBinaryPackPath\(manifest, RUNTIME_PACK_CONTRACTS\.groups\)/);
  assert.match(runtimeSource, /getDeclaredNativeBinaryPackPath\(manifest, RUNTIME_PACK_CONTRACTS\.search\)/);
  assert.match(runtimeSource, /parseNativeBrowserPackPayload/);
  assert.match(runtimeSource, /parseNativeGroupPackPayload/);
  assert.match(runtimeSource, /parseNativeSearchPackPayload/);
  assert.match(runtimeSource, /Native browser runtime requires declared browser\.bin and groups\.bin artifacts/);
  assert.match(runtimeSource, /Native search runtime requires declared search\.bin artifact/);
  assert.doesNotMatch(runtimeSource, /coerceSearchPack/);
  assert.doesNotMatch(runtimeSource, /DistDataSearchPayload/);
  assert.doesNotMatch(runtimeSource, /DistDataRustBrowserPackPayload/);
  assert.doesNotMatch(runtimeSource, /manifest\.files\?\.rustBrowserPack/);
  assert.doesNotMatch(runtimeSource, /manifest\.files\?\.browserCatalog/);
  assert.doesNotMatch(runtimeSource, /manifest\.files\?\.hiddenBrowserCatalog/);
  assert.doesNotMatch(runtimeSource, /manifest\.files\?\.browserGroups/);
  assert.doesNotMatch(runtimeSource, /manifest\.files\?\.rustSearchPack/);
  assert.doesNotMatch(runtimeSource, /JSON fallback/);
  assert.doesNotMatch(runtimeSource, /fallback is allowed/);
  assert.doesNotMatch(runtimeSource, /manifest\.files\?\.searchAll/);
  assert.doesNotMatch(runtimeSource, /searchAll\?: string/);
  assert.doesNotMatch(manifestSource, /searchAll\?: string/);
});

test('recipe UI payload resolver does not rewrite legacy rust shard paths', () => {
  assert.doesNotMatch(runtimeSource, /LEGACY_RUST_RECIPE_UI_SHARD_PREFIX/);
  assert.doesNotMatch(runtimeSource, /rust\/recipe-ui-payload-shards\//);
  assert.doesNotMatch(runtimeSource, /CURRENT_RECIPE_UI_SHARD_PREFIX/);
  assert.doesNotMatch(runtimeSource, /recipes\/ui-payload-shards\/.*hash\.slice/);
  assert.doesNotMatch(runtimeSource, /function sha1Hex/);
  assert.doesNotMatch(runtimeSource, /function leftRotate/);
  assert.doesNotMatch(runtimeSource, /function resolveRecipeUiPayloadPath/);
  assert.match(runtimeSource, /const payloadPath = entry \? normalizeRecipeUiPayloadPath\(entry\.path\) : ""/);
});
