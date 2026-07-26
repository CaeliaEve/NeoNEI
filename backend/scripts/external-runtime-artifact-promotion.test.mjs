import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { hostname, tmpdir } from 'node:os';
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
const {
  recoverExternalRuntimeArtifactPromotion,
  resolveCurrentExternalRuntimeGeneration,
  verifyCurrentExternalRuntimeGenerationSeal,
} = require(resolve(
  root,
  'src/services/external-runtime-generation.service.ts',
));

function createTempRoot(prefix) {
  return join(tmpdir(), `${prefix}-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`);
}

function writeJson(filePath, payload) {
  writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`);
}

function sha256File(filePath) {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
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
  mkdirSync(join(dir, 'recipes', 'ui-payload-shards'), { recursive: true });
  writeJson(join(dir, 'recipes', 'ui-payload-shards', 'fixture.json'), { recipeId: 'fixture' });
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

test('external runtime artifact promotion publishes an immutable generation and atomically points current.json at it', () => {
  const artifactRoot = createCompiledArtifact();
  const distDataDir = createTempRoot('neonei-dist-data');
  try {
    mkdirSync(distDataDir, { recursive: true });
    const result = promoteExternalRuntimeArtifact({
      artifactRoot,
      distDataDir,
      promotedAt: '2026-06-28T00:00:00.000Z',
      sourceIdentity: {
        schemaVersion: 'neonei/external-runtime-source-identity/current',
        rootDir: artifactRoot,
        identity: 'sha256:fixture-source-identity',
        fileCount: 1,
        totalBytes: 1,
        manifestSchemaVersion: 'fixture/raw/v1',
        files: [{ path: 'manifest.json', bytes: 1, mtimeMs: 1 }],
      },
    });

    assert.equal(result.schemaVersion, 'neonei/external-runtime-artifact-promotion/current');
    assert.equal(result.runtimeId, 'runtime-fixture');
    assert.equal(result.runtimeManifestSchema, 'neonei/rust-runtime-manifest/current');
    assert.equal(result.authorityRoot, resolve(distDataDir));
    assert.match(result.generationId, /^gen-[a-z0-9-]+-[0-9a-f]{16}$/);
    assert.equal(result.generationRoot, join(distDataDir, 'generations', result.generationId));
    assert.equal(result.pointerPath, join(distDataDir, 'current.json'));
    assert.match(result.releaseHash, /^[0-9a-f]{64}$/);
    const current = resolveCurrentExternalRuntimeGeneration(distDataDir);
    assert.equal(current.generationId, result.generationId);
    assert.equal(current.generationRoot, result.generationRoot);
    assert.equal(current.pointer.runtimeId, 'runtime-fixture');
    assert.equal(current.pointer.releaseHash, result.releaseHash);
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
      'recipes/ui-payload-shards/fixture.json',
      'rust/external-runtime-artifact-promotion-report.json',
    ]) {
      assert.equal(existsSync(join(result.generationRoot, relativePath)), true, `missing promoted file: ${relativePath}`);
    }

    const distManifest = JSON.parse(readFileSync(join(result.generationRoot, 'manifest.json'), 'utf8'));
    assert.equal(distManifest.source, 'elysium-compiler');
    assert.equal(distManifest.generatedAt, '2026-06-28T00:00:00.000Z');
    assert.equal(distManifest.files.rustRuntimeManifest, 'rust/runtime-manifest.json');
    assert.equal(distManifest.files.rustUiTemplatesBin, 'rust/ui-pack/ui_templates.bin');
    assert.equal(distManifest.files.rustUiBindingsBin, 'rust/ui-pack/ui_bindings.bin');
    assert.equal(distManifest.files.rustUiStringsBin, 'rust/ui-pack/ui_strings.bin');
    assert.equal(distManifest.externalRuntimeSourceIdentity.identity, 'sha256:fixture-source-identity');
    assert.equal(
      distManifest.files.externalRuntimePromotionReport,
      'rust/external-runtime-artifact-promotion-report.json',
    );
    const promotionReport = JSON.parse(readFileSync(join(result.generationRoot, 'rust', 'external-runtime-artifact-promotion-report.json'), 'utf8'));
    assert.equal(promotionReport.sourceIdentity.identity, 'sha256:fixture-source-identity');
    assert.equal(result.sourceIdentity.identity, 'sha256:fixture-source-identity');
    assert.equal(Array.isArray(result.copiedFiles), true);
    assert.ok(result.copiedFiles.length >= 9, 'promotion should copy every compiler-declared runtime file');
    for (const entry of result.copiedFiles) {
      assert.match(entry.sha256, /^[0-9a-f]{64}$/);
      assert.ok(entry.bytes > 0, `promoted file should not be empty: ${entry.path}`);
    }
    const manifestEntry = result.copiedFiles.find((entry) => entry.path === 'manifest.json');
    assert.ok(manifestEntry, 'promotion report must describe the final materialized manifest');
    assert.equal(manifestEntry.bytes, readFileSync(join(result.generationRoot, 'manifest.json')).length);
    assert.equal(manifestEntry.sha256, sha256File(join(result.generationRoot, 'manifest.json')));
    assert.deepEqual(promotionReport.copiedFiles, result.copiedFiles);
  } finally {
    rmSync(artifactRoot, { recursive: true, force: true });
    rmSync(distDataDir, { recursive: true, force: true });
  }
});

test('external runtime generation full-tree verification rejects changed or unsealed files', () => {
  const artifactRoot = createCompiledArtifact();
  const distDataDir = createTempRoot('neonei-dist-data');
  try {
    const result = promoteExternalRuntimeArtifact({ artifactRoot, distDataDir });
    const verified = verifyCurrentExternalRuntimeGenerationSeal(distDataDir);
    assert.equal(verified?.generationId, result.generationId);
    assert.equal(verified?.fileCount, JSON.parse(readFileSync(join(result.generationRoot, 'generation-seal.json'), 'utf8')).fileCount);

    const browserPack = join(result.generationRoot, 'rust', 'browser.bin');
    writeFileSync(browserPack, Buffer.from('tampered'));
    assert.throws(
      () => verifyCurrentExternalRuntimeGenerationSeal(distDataDir),
      /generation tree does not match generation seal/,
    );

    writeFileSync(browserPack, Buffer.from('browser'));
    writeFileSync(join(result.generationRoot, 'unexpected.txt'), 'unexpected');
    assert.throws(
      () => verifyCurrentExternalRuntimeGenerationSeal(distDataDir),
      /generation tree does not match generation seal/,
    );
  } finally {
    rmSync(artifactRoot, { recursive: true, force: true });
    rmSync(distDataDir, { recursive: true, force: true });
  }
});

test('external runtime artifact promotion retains the previous immutable generation while switching the pointer', () => {
  const firstArtifact = createCompiledArtifact({ runtimeId: 'runtime-first' });
  const secondArtifact = createCompiledArtifact({ runtimeId: 'runtime-second' });
  const distDataDir = createTempRoot('neonei-dist-data');
  try {
    const first = promoteExternalRuntimeArtifact({ artifactRoot: firstArtifact, distDataDir });
    const firstManifestHash = sha256File(join(first.generationRoot, 'manifest.json'));
    const second = promoteExternalRuntimeArtifact({ artifactRoot: secondArtifact, distDataDir });
    const current = resolveCurrentExternalRuntimeGeneration(distDataDir);

    assert.notEqual(second.generationId, first.generationId);
    assert.equal(current.generationId, second.generationId);
    assert.equal(current.pointer.runtimeId, 'runtime-second');
    assert.equal(existsSync(first.generationRoot), true);
    assert.equal(sha256File(join(first.generationRoot, 'manifest.json')), firstManifestHash);
    assert.equal(existsSync(second.generationRoot), true);
  } finally {
    rmSync(firstArtifact, { recursive: true, force: true });
    rmSync(secondArtifact, { recursive: true, force: true });
    rmSync(distDataDir, { recursive: true, force: true });
  }
});

test('external runtime promotion succeeds while a reader keeps an old generation file handle open', () => {
  const firstArtifact = createCompiledArtifact({ runtimeId: 'runtime-open-handle-first' });
  const secondArtifact = createCompiledArtifact({ runtimeId: 'runtime-open-handle-second' });
  const distDataDir = createTempRoot('neonei-dist-data-open-handle');
  let descriptor = null;
  try {
    const first = promoteExternalRuntimeArtifact({ artifactRoot: firstArtifact, distDataDir });
    const firstBrowserPack = join(first.generationRoot, 'rust', 'browser.bin');
    descriptor = openSync(firstBrowserPack, 'r');
    const before = Buffer.alloc(7);
    assert.equal(readSync(descriptor, before, 0, before.length, 0), before.length);
    assert.equal(before.toString('utf8'), 'browser');

    const second = promoteExternalRuntimeArtifact({ artifactRoot: secondArtifact, distDataDir });
    assert.notEqual(second.generationId, first.generationId);
    assert.equal(resolveCurrentExternalRuntimeGeneration(distDataDir).generationId, second.generationId);
    assert.equal(existsSync(first.generationRoot), true, 'old generation must remain while readers may hold file handles');

    const after = Buffer.alloc(7);
    assert.equal(readSync(descriptor, after, 0, after.length, 0), after.length);
    assert.equal(after.toString('utf8'), 'browser');
  } finally {
    if (descriptor !== null) closeSync(descriptor);
    rmSync(firstArtifact, { recursive: true, force: true });
    rmSync(secondArtifact, { recursive: true, force: true });
    rmSync(distDataDir, { recursive: true, force: true });
  }
});

test('external runtime artifact promotion rejects an active writer lock', () => {
  const artifactRoot = createCompiledArtifact();
  const distDataDir = createTempRoot('neonei-dist-data');
  try {
    mkdirSync(distDataDir, { recursive: true });
    writeJson(join(distDataDir, '.promotion.lock'), {
      schemaVersion: 'neonei/external-runtime-promotion-lock/current',
      pid: process.pid,
      hostname: hostname(),
      transactionId: 'active-fixture',
      acquiredAt: new Date().toISOString(),
    });
    assert.throws(
      () => promoteExternalRuntimeArtifact({ artifactRoot, distDataDir }),
      /promotion writer lock is active/,
    );
  } finally {
    rmSync(artifactRoot, { recursive: true, force: true });
    rmSync(distDataDir, { recursive: true, force: true });
  }
});

test('external runtime promotion startup recovery rolls back an interrupted sealed generation', () => {
  const artifactRoot = createCompiledArtifact({ runtimeId: 'runtime-stable' });
  const distDataDir = createTempRoot('neonei-dist-data');
  try {
    const stable = promoteExternalRuntimeArtifact({ artifactRoot, distDataDir });
    const interruptedId = 'gen-interrupted-0123456789abcdef';
    const interruptedRoot = join(distDataDir, 'generations', interruptedId);
    mkdirSync(interruptedRoot, { recursive: true });
    writeFileSync(join(interruptedRoot, 'partial.bin'), 'partial');
    writeJson(join(distDataDir, '.promotion-journal.json'), {
      schemaVersion: 'neonei/external-runtime-promotion-journal/current',
      transactionId: 'interrupted-fixture',
      phase: 'generation-sealed',
      authorityRoot: resolve(distDataDir),
      stagingRelativePath: `generations/.staging-interrupted-fixture`,
      generationId: interruptedId,
      generationRelativePath: `generations/${interruptedId}`,
      previousPointer: JSON.parse(readFileSync(stable.pointerPath, 'utf8')),
      targetPointer: {
        schemaVersion: 'neonei/runtime-artifact-generation-pointer/current',
        generationId: interruptedId,
        relativePath: `generations/${interruptedId}`,
        runtimeId: 'runtime-interrupted',
        runtimeManifestSchema: 'neonei/rust-runtime-manifest/current',
        promotedAt: new Date().toISOString(),
        releaseHash: '0'.repeat(64),
      },
      updatedAt: new Date().toISOString(),
    });
    writeJson(join(distDataDir, '.promotion.lock'), {
      schemaVersion: 'neonei/external-runtime-promotion-lock/current',
      pid: 999999,
      hostname: hostname(),
      transactionId: 'interrupted-fixture',
      acquiredAt: new Date(0).toISOString(),
    });

    const recovery = recoverExternalRuntimeArtifactPromotion(distDataDir);
    const current = resolveCurrentExternalRuntimeGeneration(distDataDir);
    assert.equal(recovery.status, 'rolled-back');
    assert.equal(current.generationId, stable.generationId);
    assert.equal(existsSync(interruptedRoot), false);
    assert.equal(existsSync(join(distDataDir, '.promotion-journal.json')), false);
    assert.equal(existsSync(join(distDataDir, '.promotion.lock')), false);
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
    mkdirSync(distDataDir, { recursive: true });
    writeFileSync(join(distDataDir, 'current-release.txt'), 'keep-me');
    assert.throws(
      () => promoteExternalRuntimeArtifact({ artifactRoot, distDataDir }),
      /runtimeManifest\.files\[1\]\.path must be a portable relative path/,
    );
    assert.equal(readFileSync(join(distDataDir, 'current-release.txt'), 'utf8'), 'keep-me');
  } finally {
    rmSync(artifactRoot, { recursive: true, force: true });
    rmSync(distDataDir, { recursive: true, force: true });
  }
});

test('external runtime artifact promotion rejects a symlink or junction destination', () => {
  const artifactRoot = createCompiledArtifact();
  const targetDir = createTempRoot('neonei-dist-target');
  const linkedDistDataDir = createTempRoot('neonei-dist-link');
  try {
    mkdirSync(targetDir, { recursive: true });
    symlinkSync(targetDir, linkedDistDataDir, process.platform === 'win32' ? 'junction' : 'dir');
    assert.throws(
      () => promoteExternalRuntimeArtifact({ artifactRoot, distDataDir: linkedDistDataDir }),
      /authority root must be a real directory|must not be a symlink, junction, or reparse-point/,
    );
  } finally {
    rmSync(linkedDistDataDir, { recursive: true, force: true });
    rmSync(targetDir, { recursive: true, force: true });
    rmSync(artifactRoot, { recursive: true, force: true });
  }
});
