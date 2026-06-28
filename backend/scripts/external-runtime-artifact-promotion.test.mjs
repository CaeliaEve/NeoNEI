import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
require('ts-node/register');

const root = resolve(import.meta.dirname, '..');
const { promoteExternalRuntimeArtifact } = require(resolve(
  root,
  'src/services/external-runtime-artifact-promotion.service.ts',
));

function createTempRoot(prefix) {
  return join(tmpdir(), `${prefix}-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`);
}

function writeJson(filePath, payload) {
  writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`);
}

function createCompiledArtifact(runtimeManifestOverride = {}) {
  const dir = createTempRoot('neonei-external-artifact');
  mkdirSync(join(dir, 'rust', 'ui-pack'), { recursive: true });
  mkdirSync(join(dir, 'rust'), { recursive: true });
  writeFileSync(join(dir, 'rust', 'browser.bin'), Buffer.from('browser'));
  writeFileSync(join(dir, 'rust', 'groups.bin'), Buffer.from('groups'));
  writeFileSync(join(dir, 'rust', 'search.bin'), Buffer.from('search'));
  writeFileSync(join(dir, 'rust', 'recipes.bin'), Buffer.from('recipes'));
  writeFileSync(join(dir, 'rust', 'strings.zh_cn.bin'), Buffer.from('strings'));
  writeFileSync(join(dir, 'rust', 'ui-pack', 'ui_templates.bin'), Buffer.from('templates'));
  writeFileSync(join(dir, 'rust', 'ui-pack', 'ui_bindings.bin'), Buffer.from('bindings'));
  writeFileSync(join(dir, 'rust', 'ui-pack', 'ui_strings.bin'), Buffer.from('ui strings'));
  writeJson(join(dir, 'rust', 'ui-pack', 'ui_pack_report.json'), { status: 'ok' });
  writeJson(join(dir, 'manifest.json'), {
    schemaVersion: 'neonei/dist-data/current',
    source: 'elysium-compiler',
    files: {
      rustRuntimeManifest: 'rust/runtime-manifest.json',
      rustBrowserBin: 'rust/browser.bin',
      rustGroupsBin: 'rust/groups.bin',
      rustSearchBin: 'rust/search.bin',
      rustRecipeBin: 'rust/recipes.bin',
      rustStringsZhCnBin: 'rust/strings.zh_cn.bin',
      rustUiTemplatesBin: 'rust/ui-pack/ui_templates.bin',
      rustUiBindingsBin: 'rust/ui-pack/ui_bindings.bin',
      rustUiStringsBin: 'rust/ui-pack/ui_strings.bin',
      rustUiPackReport: 'rust/ui-pack/ui_pack_report.json',
    },
    nativeRuntime: {
      authority: 'rust',
      status: 'ready',
    },
  });
  writeJson(join(dir, 'rust', 'runtime-manifest.json'), {
    schemaVersion: 'neonei/rust-runtime-manifest/current',
    runtimeId: 'runtime-fixture',
    entrypoints: {
      browser: 'rust/browser.bin',
      groups: 'rust/groups.bin',
      recipes: 'rust/recipes.bin',
      search: 'rust/search.bin',
      stringsZhCn: 'rust/strings.zh_cn.bin',
      uiTemplates: 'rust/ui-pack/ui_templates.bin',
      uiBindings: 'rust/ui-pack/ui_bindings.bin',
      uiStrings: 'rust/ui-pack/ui_strings.bin',
    },
    files: [
      { path: 'rust/browser.bin', bytes: 7 },
      { path: 'rust/groups.bin', bytes: 6 },
      { path: 'rust/search.bin', bytes: 6 },
      { path: 'rust/recipes.bin', bytes: 7 },
      { path: 'rust/strings.zh_cn.bin', bytes: 7 },
      { path: 'rust/ui-pack/ui_templates.bin', bytes: 9 },
      { path: 'rust/ui-pack/ui_bindings.bin', bytes: 8 },
      { path: 'rust/ui-pack/ui_strings.bin', bytes: 10 },
      { path: 'rust/ui-pack/ui_pack_report.json', bytes: 16 },
    ],
    ...runtimeManifestOverride,
  });
  return dir;
}

test('external runtime artifact promotion publishes compiler packs into dist-data contract', () => {
  const artifactRoot = createCompiledArtifact();
  const distDataDir = createTempRoot('neonei-dist-data');
  try {
    const result = promoteExternalRuntimeArtifact({
      artifactRoot,
      distDataDir,
      promotedAt: '2026-06-28T00:00:00.000Z',
    });

    assert.equal(result.schemaVersion, 'neonei/external-runtime-artifact-promotion/current');
    assert.equal(result.runtimeId, 'runtime-fixture');
    assert.equal(result.runtimeManifestSchema, 'neonei/rust-runtime-manifest/current');
    for (const relativePath of [
      'manifest.json',
      'rust/runtime-manifest.json',
      'rust/browser.bin',
      'rust/groups.bin',
      'rust/search.bin',
      'rust/recipes.bin',
      'rust/ui-pack/ui_templates.bin',
      'rust/ui-pack/ui_bindings.bin',
      'rust/ui-pack/ui_strings.bin',
      'rust/ui-pack/ui_pack_report.json',
      'rust/external-runtime-artifact-promotion-report.json',
    ]) {
      assert.equal(existsSync(join(distDataDir, relativePath)), true, `missing promoted file: ${relativePath}`);
    }

    const distManifest = JSON.parse(readFileSync(join(distDataDir, 'manifest.json'), 'utf8'));
    assert.equal(distManifest.source, 'elysium-compiler');
    assert.equal(distManifest.generatedAt, '2026-06-28T00:00:00.000Z');
    assert.equal(distManifest.files.rustRuntimeManifest, 'rust/runtime-manifest.json');
    assert.equal(distManifest.files.rustUiTemplatesBin, 'rust/ui-pack/ui_templates.bin');
    assert.equal(distManifest.files.rustUiBindingsBin, 'rust/ui-pack/ui_bindings.bin');
    assert.equal(distManifest.files.rustUiStringsBin, 'rust/ui-pack/ui_strings.bin');
    assert.equal(
      distManifest.files.externalRuntimePromotionReport,
      'rust/external-runtime-artifact-promotion-report.json',
    );
    assert.equal(Array.isArray(result.copiedFiles), true);
    assert.ok(result.copiedFiles.length >= 9, 'promotion should copy every compiler-declared runtime file');
    for (const entry of result.copiedFiles) {
      assert.match(entry.sha256, /^[0-9a-f]{64}$/);
      assert.ok(entry.bytes > 0, `promoted file should not be empty: ${entry.path}`);
    }
  } finally {
    rmSync(artifactRoot, { recursive: true, force: true });
    rmSync(distDataDir, { recursive: true, force: true });
  }
});

test('external runtime artifact promotion rejects escaping runtime manifest paths', () => {
  const artifactRoot = createCompiledArtifact({
    files: [
      { path: 'rust/browser.bin', bytes: 7 },
      { path: '../escape.bin', bytes: 1 },
    ],
  });
  const distDataDir = createTempRoot('neonei-dist-data');
  try {
    assert.throws(
      () => promoteExternalRuntimeArtifact({ artifactRoot, distDataDir }),
      /runtimeManifest\.files\[1\]\.path must be a portable relative path/,
    );
  } finally {
    rmSync(artifactRoot, { recursive: true, force: true });
    rmSync(distDataDir, { recursive: true, force: true });
  }
});
