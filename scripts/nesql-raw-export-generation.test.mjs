import assert from 'node:assert/strict';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { resolveNesqlRawExportGeneration } from './lib/nesql-raw-export-generation.mjs';

function writeJson(filePath, value) {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

test('production raw-export resolver requires current.json and rejects direct manifest authority', () => {
  const root = join(tmpdir(), `nesql-raw-authority-${process.pid}-${Date.now()}`);
  const direct = join(root, 'direct');
  const authority = join(root, 'authority');
  const generationId = 'raw-generation-0001';
  const generation = join(authority, 'generations', generationId);
  try {
    writeJson(join(direct, 'manifest.json'), { schemaVersion: 'legacy-direct' });
    assert.throws(() => resolveNesqlRawExportGeneration(direct), /current\.json/);
    writeJson(join(generation, 'manifest.json'), { schemaVersion: 'nesqlpp/raw-export/test' });
    writeJson(join(authority, 'current.json'), {
      schemaVersion: 'nesqlpp/raw-export-generation-pointer/v1',
      generationId,
      relativePath: `generations/${generationId}`,
    });
    const resolvedGeneration = resolveNesqlRawExportGeneration(authority);
    assert.equal(resolvedGeneration.authorityRoot, resolve(authority));
    assert.equal(resolvedGeneration.generationRoot, resolve(generation));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
