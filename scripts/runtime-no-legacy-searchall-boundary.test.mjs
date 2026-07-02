import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function source(relativePath) {
  return readFileSync(resolve(root, relativePath), 'utf8');
}

const filesThatMustNotOwnLegacySearchAll = [
  'contracts/runtime/manifest.schema.json',
  'scripts/compile-raw-export.mjs',
  'scripts/validate-runtime-contracts.mjs',
  'scripts/validate-recipe-open-smoke.mjs',
  'scripts/validate-browser-pages-v3.mjs',
  'frontend/src/services/distDataRuntime.ts',
  'frontend/src/services/distDataRuntimeManifest.ts',
];

test('runtime contracts and smoke gates do not declare or consume legacy searchAll', () => {
  for (const relativePath of filesThatMustNotOwnLegacySearchAll) {
    assert.doesNotMatch(source(relativePath), /searchAll/, `${relativePath} must not reference legacy searchAll`);
  }
});

test('production manifest gate remains the only owner of legacy searchAll detection', () => {
  const productionGate = source('scripts/validate-rust-production-manifest.mjs');
  assert.match(productionGate, /legacyKey[\s\S]*searchAll/, 'production gate must still detect legacy searchAll if an export declares it');
  assert.doesNotMatch(productionGate, /files\.searchAll|manifest\.files\?\.searchAll/, 'production gate must not consume searchAll as data');
});
