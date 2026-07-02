import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '..');
const apiSource = readFileSync(resolve(root, 'src/services/current-runtime-api.service.ts'), 'utf8');
const apiAbiSource = readFileSync(resolve(root, 'src/services/current-runtime-api-abi.ts'), 'utf8');
const transportSource = readFileSync(resolve(root, 'src/routes/current-runtime-transport.ts'), 'utf8');
const transportAbiSource = readFileSync(resolve(root, 'src/routes/current-runtime-transport-abi.ts'), 'utf8');

test('current runtime API schema, URLs, ETags, cache, params, and errors are ABI-catalog owned', () => {
  assert.match(apiSource, /from '\.\/current-runtime-api-abi'/);
  for (const symbol of [
    'CURRENT_RUNTIME_API_SCHEMA',
    'CURRENT_RUNTIME_API_SCHEMA_REVISION',
    'CURRENT_RUNTIME_API_CACHE',
    'CURRENT_RUNTIME_API_PARAMS',
    'CURRENT_RUNTIME_API_ERRORS',
    'CURRENT_RUNTIME_API_ETAG_KEYS',
    'CURRENT_RUNTIME_API_URLS',
    'buildPinnedRuntimeManifestUrl',
    'buildPinnedRuntimeAssetBaseUrl',
  ]) {
    assert.match(apiAbiSource, new RegExp(`export (?:const|function) ${symbol}`));
  }
  assert.match(apiAbiSource, /CURRENT_RUNTIME_SNAPSHOT_DEFAULTS/);

  for (const ownedLiteral of [
    /'neonei\/api\/current'/,
    /'runtime-manifest'/,
    /'runtime-asset'/,
    /'\/api\/runtime\/current\/manifest'/,
    /'\/api\/runtime\/current\/asset\/'/,
    /'Runtime manifest not found'/,
    /'Runtime file is not declared by the current runtime manifest'/,
    /'fileName must be a runtime-relative file path'/,
  ]) {
    assert.match(apiAbiSource, ownedLiteral);
    assert.doesNotMatch(apiSource, ownedLiteral);
  }
});

test('current runtime express transport consumes transport ABI policy', () => {
  assert.match(transportSource, /from '\.\/current-runtime-transport-abi'/);
  for (const symbol of [
    'CURRENT_RUNTIME_JSON_ENVELOPE_OK',
    'CURRENT_RUNTIME_IMMUTABLE_ASSET_CACHE',
    'CURRENT_RUNTIME_ASSET_REQUEST_METHODS',
    'CURRENT_RUNTIME_MOUNTED_ASSET_PATH_PREFIX',
  ]) {
    assert.match(transportAbiSource, new RegExp(`export const ${symbol}`));
  }

  for (const ownedLiteral of [
    /maxAge: '365d'/,
    /'GET'/,
    /'HEAD'/,
  ]) {
    assert.match(transportAbiSource, ownedLiteral);
    assert.doesNotMatch(transportSource, ownedLiteral);
  }
  assert.doesNotMatch(transportSource, /ok: true/);
});
