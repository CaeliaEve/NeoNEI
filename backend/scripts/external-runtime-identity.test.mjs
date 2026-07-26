import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, rmSync, statSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
require('ts-node/register');

const root = resolve(import.meta.dirname, '..');
const {
  computeExternalRuntimeSourceIdentity,
  probeExternalRuntimeIdentityFreshness,
} = require(resolve(root, 'src/services/external-runtime-identity.service.ts'));
const {
  resolveAccelerationCompilerAuthority,
  resolveExternalRuntimeRawExportInput,
} = require(resolve(root, 'src/services/acceleration-runtime-compiler-authority.service.ts'));

test('external Elysium is the default and internal SQLite cannot be selected in production', () => {
  const previousAuthority = process.env.NEONEI_ACCELERATION_COMPILER_AUTHORITY;
  const previousNodeEnv = process.env.NODE_ENV;
  try {
    delete process.env.NEONEI_ACCELERATION_COMPILER_AUTHORITY;
    process.env.NODE_ENV = 'production';
    assert.equal(resolveAccelerationCompilerAuthority(), 'external-runtime');
    process.env.NEONEI_ACCELERATION_COMPILER_AUTHORITY = 'internal-sqlite';
    assert.throws(resolveAccelerationCompilerAuthority, /internal-sqlite is retired from the production runtime/);
    process.env.NODE_ENV = 'test';
    assert.equal(resolveAccelerationCompilerAuthority(), 'internal-sqlite');
  } finally {
    if (previousAuthority === undefined) delete process.env.NEONEI_ACCELERATION_COMPILER_AUTHORITY;
    else process.env.NEONEI_ACCELERATION_COMPILER_AUTHORITY = previousAuthority;
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
  }
});

function tempRoot(prefix) {
  return join(tmpdir(), `${prefix}-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`);
}

function writeJson(filePath, payload) {
  writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`);
}

function sha256File(filePath) {
  return createHash('sha256').update(Buffer.from(require('node:fs').readFileSync(filePath))).digest('hex');
}

function createPromotedRuntimeAuthority(distRoot, sourceIdentity, options = {}) {
  const generationId = 'gen-runtime-fixture-0123456789abcdef';
  const generationRoot = join(distRoot, 'generations', generationId);
  mkdirSync(join(generationRoot, 'rust'), { recursive: true });
  writeJson(join(generationRoot, 'manifest.json'), { runtimeId: 'fixture' });
  const manifestStat = statSync(join(generationRoot, 'manifest.json'));
  writeJson(join(generationRoot, 'rust', 'external-runtime-artifact-promotion-report.json'), {
    schemaVersion: 'neonei/external-runtime-artifact-promotion/current',
    sourceIdentity,
    copiedFiles: [{
      key: 'manifest',
      path: 'manifest.json',
      bytes: manifestStat.size,
      sha256: options.manifestSha256 ?? sha256File(join(generationRoot, 'manifest.json')),
    }],
  });
  writeJson(join(generationRoot, 'rust', 'runtime-manifest.json'), {
    schemaVersion: 'neonei/rust-runtime-manifest/current',
    runtimeId: 'runtime-fixture',
  });
  const releaseHash = '1'.repeat(64);
  writeJson(join(generationRoot, 'generation-seal.json'), {
    schemaVersion: 'neonei/external-runtime-generation-seal/current',
    generationId,
    runtimeId: 'runtime-fixture',
    releaseHash,
    fileCount: 3,
    totalBytes: 3,
    files: [
      { path: 'manifest.json', bytes: 1, sha256: '2'.repeat(64) },
      { path: 'rust/external-runtime-artifact-promotion-report.json', bytes: 1, sha256: '3'.repeat(64) },
      { path: 'rust/runtime-manifest.json', bytes: 1, sha256: '4'.repeat(64) },
    ],
  });
  writeJson(join(distRoot, 'current.json'), {
    schemaVersion: 'neonei/runtime-artifact-generation-pointer/current',
    generationId,
    relativePath: `generations/${generationId}`,
    runtimeId: 'runtime-fixture',
    runtimeManifestSchema: 'neonei/rust-runtime-manifest/current',
    promotedAt: '2026-07-15T00:00:00.000Z',
    releaseHash,
  });
  return { generationId, generationRoot };
}

function createRawExportRoot() {
  const dir = tempRoot('neonei-raw-export');
  mkdirSync(join(dir, 'recipes', 'shards'), { recursive: true });
  writeJson(join(dir, 'manifest.json'), {
    schemaVersion: 'neonei/raw-export-fixture/v1',
    files: {
      items: 'items.jsonl',
      recipes: 'recipes/shards/recipes-000.jsonl',
    },
  });
  writeFileSync(join(dir, 'items.jsonl'), '{"itemId":"minecraft:stone"}\n');
  writeFileSync(join(dir, 'recipes', 'shards', 'recipes-000.jsonl'), '{"id":"recipe:stone"}\n');
  return dir;
}

function createPointerAuthority() {
  const authority = tempRoot('neonei-raw-export-authority');
  const oldId = 'old-generation-0001';
  const nextId = 'next-generation-0002';
  const oldRoot = join(authority, 'generations', oldId);
  const nextRoot = join(authority, 'generations', nextId);
  for (const [rootDir, itemId] of [[oldRoot, 'minecraft:stone'], [nextRoot, 'minecraft:dirt']]) {
    mkdirSync(join(rootDir, 'recipes', 'shards'), { recursive: true });
    writeJson(join(rootDir, 'manifest.json'), {
      schemaVersion: 'neonei/raw-export-fixture/v1',
      files: { items: 'items.jsonl', recipes: 'recipes/shards/recipes-000.jsonl' },
    });
    writeFileSync(join(rootDir, 'items.jsonl'), `${JSON.stringify({ itemId })}\n`);
    writeFileSync(join(rootDir, 'recipes', 'shards', 'recipes-000.jsonl'), '{"id":"recipe:test"}\n');
  }
  writeJson(join(authority, 'current.json'), {
    schemaVersion: 'nesqlpp/raw-export-generation-pointer/v1',
    generationId: oldId,
    relativePath: `generations/${oldId}`,
  });
  return { authority, oldId, nextId, oldRoot, nextRoot };
}

test('external runtime authority rejects a direct manifest without a generation pointer', () => {
  const rawRoot = createRawExportRoot();
  try {
    assert.throws(
      () => computeExternalRuntimeSourceIdentity(rawRoot),
      /missing required current\.json/,
    );
  } finally {
    rmSync(rawRoot, { recursive: true, force: true });
  }
});

test('external runtime source identity is stable for an unchanged current generation', () => {
  const fixture = createPointerAuthority();
  try {
    const first = computeExternalRuntimeSourceIdentity(fixture.authority);
    const second = computeExternalRuntimeSourceIdentity(fixture.authority);
    assert.equal(first.schemaVersion, 'neonei/external-runtime-source-identity/current');
    assert.equal(first.identity, second.identity);
    assert.equal(first.fileCount, 3);
    assert.equal(first.authority, 'generation-pointer');
    assert.equal(first.authorityRoot, resolve(fixture.authority));
    assert.equal(first.rootDir, resolve(fixture.oldRoot));
    assert.equal(first.manifestSchemaVersion, 'neonei/raw-export-fixture/v1');
    assert.match(first.identity, /^sha256:[0-9a-f]{64}$/);
    assert.ok(first.files.every((file) => /^[0-9a-f]{64}$/.test(file.sha256)));
  } finally {
    rmSync(fixture.authority, { recursive: true, force: true });
  }
});

test('external runtime source identity detects same-size content replacement with preserved mtime', () => {
  const fixture = createPointerAuthority();
  try {
    const filePath = join(fixture.oldRoot, 'items.jsonl');
    const beforeStat = statSync(filePath);
    const before = computeExternalRuntimeSourceIdentity(fixture.authority);
    writeFileSync(filePath, '{"itemId":"minecraft:brick"}\n');
    assert.equal(statSync(filePath).size, beforeStat.size);
    utimesSync(filePath, beforeStat.atime, beforeStat.mtime);
    const after = computeExternalRuntimeSourceIdentity(fixture.authority);
    assert.notEqual(after.identity, before.identity);
  } finally {
    rmSync(fixture.authority, { recursive: true, force: true });
  }
});

test('external runtime authority resolves current generation and switches atomically for new probes', () => {
  const fixture = createPointerAuthority();
  try {
    const oldInput = resolveExternalRuntimeRawExportInput(fixture.authority);
    const oldIdentity = computeExternalRuntimeSourceIdentity(fixture.authority);
    assert.equal(oldInput.authority, 'generation-pointer');
    assert.equal(oldInput.authorityRoot, resolve(fixture.authority));
    assert.equal(oldInput.generationRoot, resolve(fixture.oldRoot));
    assert.equal(oldIdentity.rootDir, resolve(fixture.oldRoot));

    writeJson(join(fixture.authority, 'current.json'), {
      schemaVersion: 'nesqlpp/raw-export-generation-pointer/v1',
      generationId: fixture.nextId,
      relativePath: `generations/${fixture.nextId}`,
    });
    const nextInput = resolveExternalRuntimeRawExportInput(fixture.authority);
    const nextIdentity = computeExternalRuntimeSourceIdentity(fixture.authority);
    assert.equal(oldInput.generationRoot, resolve(fixture.oldRoot), 'already resolved input remains pinned');
    assert.equal(nextInput.generationRoot, resolve(fixture.nextRoot));
    assert.equal(nextIdentity.rootDir, resolve(fixture.nextRoot));
    assert.notEqual(oldIdentity.identity, nextIdentity.identity);
  } finally {
    rmSync(fixture.authority, { recursive: true, force: true });
  }
});

test('external runtime pointer authority rejects malformed traversal and missing generations', () => {
  for (const [name, pointer, expected] of [
    ['malformed', '{not-json', /failed to parse external runtime raw-export pointer/],
    ['traversal', JSON.stringify({
      schemaVersion: 'nesqlpp/raw-export-generation-pointer/v1',
      generationId: 'valid-generation-0001',
      relativePath: 'generations/../outside',
    }), /relativePath must equal/],
    ['missing', JSON.stringify({
      schemaVersion: 'nesqlpp/raw-export-generation-pointer/v1',
      generationId: 'missing-generation-01',
      relativePath: 'generations/missing-generation-01',
    }), /current generation is missing or invalid/],
  ]) {
    const authority = tempRoot(`neonei-${name}-pointer`);
    try {
      mkdirSync(join(authority, 'generations'), { recursive: true });
      writeFileSync(join(authority, 'current.json'), pointer);
      assert.throws(() => resolveExternalRuntimeRawExportInput(authority), expected);
    } finally {
      rmSync(authority, { recursive: true, force: true });
    }
  }
});

test('external runtime pointer authority rejects a generations junction escaping authority', () => {
  const authority = tempRoot('neonei-junction-authority');
  const outside = tempRoot('neonei-junction-outside');
  const generationId = 'outside-generation-01';
  try {
    mkdirSync(join(outside, generationId), { recursive: true });
    writeJson(join(outside, generationId, 'manifest.json'), { schemaVersion: 'fixture' });
    mkdirSync(authority, { recursive: true });
    symlinkSync(outside, join(authority, 'generations'), 'junction');
    writeJson(join(authority, 'current.json'), {
      schemaVersion: 'nesqlpp/raw-export-generation-pointer/v1',
      generationId,
      relativePath: `generations/${generationId}`,
    });
    assert.throws(
      () => resolveExternalRuntimeRawExportInput(authority),
      /generations directory escapes authority|non-symlink directory/,
    );
  } finally {
    rmSync(authority, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});

test('external runtime source identity rejects a nested junction', () => {
  const fixture = createPointerAuthority();
  const outside = tempRoot('neonei-nested-junction-outside');
  try {
    mkdirSync(outside, { recursive: true });
    writeFileSync(join(outside, 'escaped.json'), '{}\n');
    symlinkSync(outside, join(fixture.oldRoot, 'escaped'), process.platform === 'win32' ? 'junction' : 'dir');
    assert.throws(
      () => computeExternalRuntimeSourceIdentity(fixture.authority),
      /symbolic link|junction|reparse-point/,
    );
  } finally {
    rmSync(fixture.authority, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});

test('external runtime freshness compares current raw export identity with promotion report', () => {
  const fixture = createPointerAuthority();
  const distRoot = tempRoot('neonei-dist-data');
  try {
    const current = computeExternalRuntimeSourceIdentity(fixture.authority);
    createPromotedRuntimeAuthority(distRoot, current);

    assert.equal(probeExternalRuntimeIdentityFreshness({ rawExportRoot: fixture.authority, distDataDir: distRoot }).fresh, true);
    writeFileSync(join(fixture.oldRoot, 'items.jsonl'), '{"itemId":"minecraft:changed"}\n');
    assert.equal(probeExternalRuntimeIdentityFreshness({ rawExportRoot: fixture.authority, distDataDir: distRoot }).fresh, false);
  } finally {
    rmSync(fixture.authority, { recursive: true, force: true });
    rmSync(distRoot, { recursive: true, force: true });
  }
});

test('external runtime freshness rejects forged reports and corrupted promoted files', () => {
  const fixture = createPointerAuthority();
  const distRoot = tempRoot('neonei-dist-data-corruption');
  try {
    const current = computeExternalRuntimeSourceIdentity(fixture.authority);
    const promoted = createPromotedRuntimeAuthority(distRoot, current, { manifestSha256: '0'.repeat(64) });
    let probe = probeExternalRuntimeIdentityFreshness({ rawExportRoot: fixture.authority, distDataDir: distRoot });
    assert.equal(probe.fresh, false);
    assert.match(probe.promoted.errors.join('\n'), /content mismatch/);

    const manifestPath = join(promoted.generationRoot, 'manifest.json');
    writeJson(join(promoted.generationRoot, 'rust', 'external-runtime-artifact-promotion-report.json'), {
      schemaVersion: 'neonei/external-runtime-artifact-promotion/current',
      sourceIdentity: current,
      copiedFiles: [{
        key: 'manifest',
        path: 'manifest.json',
        bytes: statSync(manifestPath).size,
        sha256: sha256File(manifestPath),
      }],
    });
    writeFileSync(manifestPath, '{"runtimeId":"changed"}\n');
    probe = probeExternalRuntimeIdentityFreshness({ rawExportRoot: fixture.authority, distDataDir: distRoot });
    assert.equal(probe.fresh, false);
    assert.match(probe.promoted.errors.join('\n'), /content mismatch/);
  } finally {
    rmSync(fixture.authority, { recursive: true, force: true });
    rmSync(distRoot, { recursive: true, force: true });
  }
});
