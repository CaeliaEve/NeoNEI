import assert from 'node:assert/strict';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
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

function tempRoot(prefix) {
  return join(tmpdir(), `${prefix}-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`);
}

function writeJson(filePath, payload) {
  writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`);
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

test('external runtime source identity is stable for unchanged raw export files', () => {
  const rawRoot = createRawExportRoot();
  try {
    const first = computeExternalRuntimeSourceIdentity(rawRoot);
    const second = computeExternalRuntimeSourceIdentity(rawRoot);
    assert.equal(first.schemaVersion, 'neonei/external-runtime-source-identity/current');
    assert.equal(first.identity, second.identity);
    assert.equal(first.fileCount, 3);
    assert.equal(first.manifestSchemaVersion, 'neonei/raw-export-fixture/v1');
    assert.match(first.identity, /^sha256:[0-9a-f]{64}$/);
  } finally {
    rmSync(rawRoot, { recursive: true, force: true });
  }
});

test('external runtime freshness compares current raw export identity with promotion report', () => {
  const rawRoot = createRawExportRoot();
  const distRoot = tempRoot('neonei-dist-data');
  try {
    const current = computeExternalRuntimeSourceIdentity(rawRoot);
    mkdirSync(join(distRoot, 'rust'), { recursive: true });
    writeJson(join(distRoot, 'rust', 'external-runtime-artifact-promotion-report.json'), {
      schemaVersion: 'neonei/external-runtime-artifact-promotion/current',
      sourceIdentity: current,
    });

    assert.equal(probeExternalRuntimeIdentityFreshness({ rawExportRoot: rawRoot, distDataDir: distRoot }).fresh, true);
    writeFileSync(join(rawRoot, 'items.jsonl'), '{"itemId":"minecraft:dirt"}\n');
    assert.equal(probeExternalRuntimeIdentityFreshness({ rawExportRoot: rawRoot, distDataDir: distRoot }).fresh, false);
  } finally {
    rmSync(rawRoot, { recursive: true, force: true });
    rmSync(distRoot, { recursive: true, force: true });
  }
});
