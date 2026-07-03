import assert from 'node:assert/strict';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import test from 'node:test';

function tempRoot(prefix) {
  return join(tmpdir(), `${prefix}-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`);
}

const distDataRoot = tempRoot('neonei-native-render-diagnostics');
process.env.DIST_DATA_DIR = distDataRoot;

const require = createRequire(import.meta.url);
require('ts-node/register');

const root = resolve(import.meta.dirname, '..');
const {
  getNativeRenderRuntimeDiagnostics,
} = require(resolve(root, 'src/services/native-render-runtime-diagnostics.service.ts'));

function writeJson(filePath, payload) {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`);
}

function resetDistData() {
  rmSync(distDataRoot, { recursive: true, force: true });
  mkdirSync(distDataRoot, { recursive: true });
}

function writeValidNativeRenderRuntime() {
  writeJson(join(distDataRoot, 'manifest.json'), {
    files: {
      nativeRenderIndex: 'native-render/index.json',
    },
  });
  writeJson(join(distDataRoot, 'native-render', 'index.json'), {
    counts: {
      itemRendererByItemId: 2,
      shaderItems: 1,
      framebufferCaptures: 3,
    },
    itemRendererByItemId: {
      'i~minecraft~stone~0': { rendererKind: 'builtin' },
    },
    validation: {
      status: 'ok',
      shaderItemsNeedingCapture: 0,
      framebufferCaptures: 3,
      summary: 'native render capture ready',
    },
  });
}

test('native render runtime diagnostics reports readable artifacts as explicit probes', () => {
  resetDistData();
  writeValidNativeRenderRuntime();

  const diagnostics = getNativeRenderRuntimeDiagnostics();

  assert.equal(diagnostics.status, 'ok');
  assert.equal(diagnostics.artifacts.manifest.status, 'present');
  assert.equal(diagnostics.artifacts.nativeRenderIndex.status, 'present');
  assert.equal(diagnostics.nativeRenderIndexPath.endsWith(join('native-render', 'index.json')), true);
  assert.equal(diagnostics.checks.manifestValidJson, true);
  assert.equal(diagnostics.checks.nativeRenderIndexPathPortable, true);
  assert.equal(diagnostics.checks.nativeRenderIndexValidJson, true);
  assert.deepEqual(diagnostics.errors, []);
  assert.equal(diagnostics.counts.itemRendererByItemId, 2);
});

test('native render runtime diagnostics marks malformed manifest JSON invalid instead of missing', () => {
  resetDistData();
  writeFileSync(join(distDataRoot, 'manifest.json'), '{ not valid json');

  const diagnostics = getNativeRenderRuntimeDiagnostics();

  assert.equal(diagnostics.status, 'invalid');
  assert.equal(diagnostics.artifacts.manifest.status, 'invalid');
  assert.equal(diagnostics.checks.manifestPresent, true);
  assert.equal(diagnostics.checks.manifestValidJson, false);
  assert.match(diagnostics.errors.join('\n'), /manifest: manifest artifact is invalid JSON/);
});

test('native render runtime diagnostics rejects non-portable native render index paths', () => {
  resetDistData();
  writeJson(join(distDataRoot, 'manifest.json'), {
    files: {
      nativeRenderIndex: '../outside/index.json',
    },
  });

  const diagnostics = getNativeRenderRuntimeDiagnostics();

  assert.equal(diagnostics.status, 'invalid');
  assert.equal(diagnostics.artifacts.manifest.status, 'present');
  assert.equal(diagnostics.artifacts.nativeRenderIndex.status, 'invalid');
  assert.equal(diagnostics.checks.nativeRenderIndexPathPortable, false);
  assert.match(diagnostics.errors.join('\n'), /runtime-relative portable path/);
});

test('native render runtime diagnostics marks malformed native render index JSON invalid', () => {
  resetDistData();
  writeJson(join(distDataRoot, 'manifest.json'), {
    files: {
      nativeRenderIndex: 'native-render/index.json',
    },
  });
  mkdirSync(join(distDataRoot, 'native-render'), { recursive: true });
  writeFileSync(join(distDataRoot, 'native-render', 'index.json'), '[1, 2, 3]');

  const diagnostics = getNativeRenderRuntimeDiagnostics();

  assert.equal(diagnostics.status, 'invalid');
  assert.equal(diagnostics.artifacts.nativeRenderIndex.status, 'invalid');
  assert.equal(diagnostics.checks.nativeRenderIndexPresent, true);
  assert.equal(diagnostics.checks.nativeRenderIndexValidJson, false);
  assert.match(diagnostics.errors.join('\n'), /nativeRenderIndex artifact must be a JSON object/);
});

test('native render runtime diagnostics keeps absent declared native render index as missing', () => {
  resetDistData();
  writeJson(join(distDataRoot, 'manifest.json'), {
    files: {
      nativeRenderIndex: 'native-render/missing.json',
    },
  });

  const diagnostics = getNativeRenderRuntimeDiagnostics();

  assert.equal(diagnostics.status, 'missing');
  assert.equal(diagnostics.artifacts.nativeRenderIndex.status, 'missing');
  assert.equal(diagnostics.checks.nativeRenderIndexPresent, false);
  assert.equal(diagnostics.checks.nativeRenderIndexValidJson, false);
  assert.match(diagnostics.errors.join('\n'), /nativeRenderIndex artifact is missing/);
});

test.after(() => {
  rmSync(distDataRoot, { recursive: true, force: true });
});
