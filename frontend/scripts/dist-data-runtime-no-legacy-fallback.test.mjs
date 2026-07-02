import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const frontendRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const runtimeSource = readFileSync(resolve(frontendRoot, 'src/services/distDataRuntime.ts'), 'utf8');
const manifestSource = readFileSync(resolve(frontendRoot, 'src/services/distDataRuntimeManifest.ts'), 'utf8');

test('dist-data runtime does not consume legacy searchAll fallback', () => {
  assert.match(runtimeSource, /manifest\.files\?\.rustSearchPack/);
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
