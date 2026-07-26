import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';

const require = createRequire(import.meta.url);
require('ts-node/register');
const root = resolve(import.meta.dirname, '..');
const { resolveElysiumOutputGeneration } = require(resolve(root, 'src/compiler-client/elysium-output-generation.ts'));
const { resolveElysiumOutputGeneration: resolveScriptGeneration } = await import('../../scripts/lib/elysium-output-generation.mjs');

function writeJson(filePath, value) {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function sha256(filePath) {
  return crypto.createHash('sha256').update(require('node:fs').readFileSync(filePath)).digest('hex');
}

function fixture() {
  const authority = join(tmpdir(), `elysium-output-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  const generationId = 'output-generation-0001';
  const generation = join(authority, 'generations', generationId);
  mkdirSync(generation, { recursive: true });
  const manifestPath = join(generation, 'manifest.json');
  writeJson(manifestPath, { schemaVersion: 'neonei/dist-data/test' });
  const manifestBytes = readFileSync(manifestPath).length;
  const sealPath = join(generation, 'generation-seal.json');
  writeJson(sealPath, {
    schemaVersion: 'elysium-compiler/output-generation-seal/v1',
    generationId,
    compiler: {},
    inputGeneration: {},
    scope: 'all',
    strict: true,
    debugJson: false,
    runtimeId: 'runtime:test',
    fileCount: 1,
    totalBytes: manifestBytes,
    files: [{ path: 'manifest.json', bytes: manifestBytes, sha256: sha256(manifestPath) }],
  });
  writeJson(join(authority, 'current.json'), {
    schemaVersion: 'elysium-compiler/output-generation-pointer/v1',
    generationId,
    relativePath: `generations/${generationId}`,
    sealSha256: sha256(sealPath),
    runtimeId: 'runtime:test',
  });
  return { authority, generation, manifestPath, sealPath };
}

test('compiled output resolver requires a sealed generation pointer and rejects flat fallback', () => {
  const valid = fixture();
  const flat = join(tmpdir(), `elysium-flat-output-${process.pid}-${Date.now()}`);
  try {
    const resolvedGeneration = resolveElysiumOutputGeneration(valid.authority);
    assert.equal(resolvedGeneration.generationRoot, resolve(valid.generation));
    assert.equal(resolveScriptGeneration(valid.authority).generationRoot, resolve(valid.generation));
    mkdirSync(flat, { recursive: true });
    writeJson(join(flat, 'manifest.json'), { schemaVersion: 'legacy-flat-output' });
    assert.throws(() => resolveElysiumOutputGeneration(flat), /generations must be a non-symlink directory/);
    writeFileSync(valid.manifestPath, '{"tampered":true}\n');
    assert.throws(() => resolveElysiumOutputGeneration(valid.authority), /tree does not match generation seal/);
    assert.throws(() => resolveScriptGeneration(valid.authority), /tree does not match generation seal/);
  } finally {
    rmSync(valid.authority, { recursive: true, force: true });
    rmSync(flat, { recursive: true, force: true });
  }
});

test('compiled output resolver rejects a nested junction before promotion', () => {
  const valid = fixture();
  const outside = join(tmpdir(), `elysium-output-outside-${process.pid}-${Date.now()}`);
  try {
    mkdirSync(outside, { recursive: true });
    writeFileSync(join(outside, 'payload.bin'), 'outside');
    symlinkSync(outside, join(valid.generation, 'nested-junction'), 'junction');
    assert.throws(() => resolveElysiumOutputGeneration(valid.authority), /junction|reparse-point/);
    assert.throws(() => resolveScriptGeneration(valid.authority), /junction|reparse-point/);
  } finally {
    rmSync(valid.authority, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});
