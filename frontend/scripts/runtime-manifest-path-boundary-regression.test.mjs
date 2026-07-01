import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  getManifestRuntimeFileBytes,
  normalizeRuntimePath,
  runtimeManifestDeclaresPath,
  runtimeManifestFileRecord,
  runtimePathFromValue,
  runtimePathString,
  runtimePathsEqual,
} from '../src/services/runtimeManifestPath.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const frontendRoot = resolve(__dirname, '..');

function source(path) {
  return readFileSync(resolve(frontendRoot, path), 'utf8').replace(/\r\n/g, '\n');
}

test('runtime manifest path helper normalizes every frontend manifest shape', () => {
  assert.equal(runtimePathString('  rust\\recipes.bin  '), 'rust\\recipes.bin');
  assert.equal(runtimePathString(42), '');
  assert.equal(normalizeRuntimePath('\\rust\\recipes.bin'), 'rust/recipes.bin');
  assert.equal(runtimePathFromValue('/rust/ui-pack/ui_templates.bin'), 'rust/ui-pack/ui_templates.bin');
  assert.equal(runtimePathsEqual('\\rust\\recipes.bin', '/rust/recipes.bin'), true);
  assert.equal(runtimePathsEqual('', '/rust/recipes.bin'), false);

  assert.equal(
    runtimeManifestDeclaresPath({ entrypoints: { recipes: '\\rust\\recipes.bin' }, files: [] }, 'rust/recipes.bin'),
    true,
  );
  assert.equal(
    runtimeManifestDeclaresPath({ files: [{ path: 'rust\\recipes.bin', bytes: 410 }] }, '/rust/recipes.bin'),
    true,
  );
  assert.equal(
    runtimeManifestDeclaresPath({ files: { textures: '\\rust\\textures.bin' } }, 'rust/textures.bin'),
    true,
  );
  assert.equal(
    runtimeManifestDeclaresPath({ files: { invalid: 42 } }, '42'),
    false,
  );
  assert.deepEqual(runtimeManifestFileRecord({ recipes: 'rust/recipes.bin' }), { recipes: 'rust/recipes.bin' });
  assert.equal(runtimeManifestFileRecord([{ path: 'rust/recipes.bin' }]), null);
  assert.equal(getManifestRuntimeFileBytes([{ path: 'rust\\recipes.bin', bytes: 410 }], '/rust/recipes.bin'), 410);
  assert.equal(getManifestRuntimeFileBytes([{ path: 'rust\\recipes.bin', bytes: -1 }], '/rust/recipes.bin'), null);
});

test('frontend runtime consumers use the shared manifest path boundary', () => {
  const sharedSource = source('src/services/runtimeManifestPath.ts');
  const uiPackSource = source('src/services/uiPackRuntime.ts');
  const distPackSource = source('src/services/distDataRuntimePackAbi.ts');
  const runtimeLoaderSource = source('src/native-surface/runtimeLoader.ts');

  assert.match(sharedSource, /export function normalizeRuntimePath/);
  assert.match(sharedSource, /export function runtimeManifestDeclaresPath/);
  assert.match(sharedSource, /export function getManifestRuntimeFileBytes/);

  for (const consumerSource of [uiPackSource, distPackSource, runtimeLoaderSource]) {
    assert.match(consumerSource, /runtimeManifestPath/);
    assert.doesNotMatch(consumerSource, /function normalizeRuntimePath\(/);
    assert.doesNotMatch(consumerSource, /function pathsEqual\(/);
    assert.doesNotMatch(consumerSource, /function getManifestFileBytes\(/);
  }

  assert.doesNotMatch(uiPackSource, /function manifestDeclaresRuntimePath\(/);
  assert.doesNotMatch(uiPackSource, /function runtimePathFromValue\(/);
  assert.doesNotMatch(uiPackSource, /function runtimeManifestFileRecord\(/);
  assert.doesNotMatch(distPackSource, /function asString\(/);
  assert.doesNotMatch(runtimeLoaderSource, /relativePath\.replace/);
});

