import assert from 'node:assert/strict';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
require('ts-node/register');

const root = resolve(import.meta.dirname, '..');
const {
  REQUIRED_EXTERNAL_RUNTIME_ENTRYPOINTS,
  loadElysiumCompiledArtifactDescriptor,
} = require(resolve(root, 'src/compiler-client/elysium-compiled-artifact-loader.ts'));

function createArtifactRoot(runtimeManifest) {
  const dir = join(tmpdir(), `neonei-compiled-artifact-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  mkdirSync(join(dir, 'rust', 'ui-pack'), { recursive: true });
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify({ schemaVersion: 'elysium.pack.v1' }));
  writeFileSync(join(dir, 'rust', 'runtime-manifest.json'), JSON.stringify(runtimeManifest));
  writeFileSync(join(dir, 'rust', 'ui-pack', 'ui_templates.bin'), Buffer.from('templates'));
  writeFileSync(join(dir, 'rust', 'ui-pack', 'ui_bindings.bin'), Buffer.from('bindings'));
  writeFileSync(join(dir, 'rust', 'ui-pack', 'ui_strings.bin'), Buffer.from('strings'));
  return dir;
}

test('compiled artifact loader resolves required external runtime entrypoints', () => {
  const dir = createArtifactRoot({
    schemaVersion: 'neonei/rust-runtime-manifest/current',
    runtimeId: 'fixture-runtime',
    entrypoints: {
      uiTemplates: 'rust/ui-pack/ui_templates.bin',
      uiBindings: 'rust/ui-pack/ui_bindings.bin',
      uiStrings: 'rust/ui-pack/ui_strings.bin',
    },
  });
  try {
    assert.deepEqual([...REQUIRED_EXTERNAL_RUNTIME_ENTRYPOINTS], [
      'manifest',
      'runtimeManifest',
      'uiTemplates',
      'uiBindings',
      'uiStrings',
    ]);
    const descriptor = loadElysiumCompiledArtifactDescriptor(dir);
    assert.equal(descriptor.runtimeManifestSchema, 'neonei/rust-runtime-manifest/current');
    assert.equal(descriptor.runtimeId, 'fixture-runtime');
    for (const filePath of [
      descriptor.manifestPath,
      descriptor.runtimeManifestPath,
      descriptor.uiTemplatesPath,
      descriptor.uiBindingsPath,
      descriptor.uiStringsPath,
    ]) {
      assert.equal(existsSync(filePath), true, `descriptor path should exist: ${filePath}`);
      assert.equal(filePath.startsWith(dir), true, `descriptor path should stay inside artifact root: ${filePath}`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('compiled artifact loader rejects non-portable runtime entrypoint paths', () => {
  const dir = createArtifactRoot({
    schemaVersion: 'neonei/rust-runtime-manifest/current',
    entrypoints: {
      uiTemplates: '../escape.bin',
      uiBindings: 'rust/ui-pack/ui_bindings.bin',
      uiStrings: 'rust/ui-pack/ui_strings.bin',
    },
  });
  try {
    assert.throws(
      () => loadElysiumCompiledArtifactDescriptor(dir),
      /uiTemplates must be a portable relative path/,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
