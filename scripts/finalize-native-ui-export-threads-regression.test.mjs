import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

test('native UI finalizer forwards an explicit positive compiler thread count', () => {
  const finalizer = readFileSync(join(repoRoot, 'scripts/finalize-native-ui-export.mjs'), 'utf8');
  assert.equal(finalizer.includes("const explicitThreads = readArg('--threads')"), true);
  assert.equal(finalizer.includes('--threads <count>'), true);
  assert.equal(finalizer.includes('--threads must be a positive integer'), true);
  assert.equal(finalizer.includes("compileArgs.push('--threads', explicitThreads)"), true);
  assert.equal(finalizer.includes('threads: explicitThreads ? Number(explicitThreads) : null'), true);
});
