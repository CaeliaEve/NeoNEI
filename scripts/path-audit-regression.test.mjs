import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const source = readFileSync(resolve('scripts/audit-path-portability.mjs'), 'utf8');

test('path portability audit ignores local runtime state directories', () => {
  for (const ignored of [
    "'.git'",
    "'.omx'",
    "'node_modules'",
    "'.tmp-runtime'",
    "'data'",
  ]) {
    assert.equal(source.includes(ignored), true, `missing ignored local/runtime directory ${ignored}`);
  }
});

test('path portability audit still blocks machine-specific source paths', () => {
  for (const pattern of [
    'windows-backslash-absolute',
    'windows-slash-absolute',
    'minecraft-version-path',
    'local-gtnh-path',
    'local-codex-path',
  ]) {
    assert.equal(source.includes(pattern), true, `missing denied pattern ${pattern}`);
  }
});
