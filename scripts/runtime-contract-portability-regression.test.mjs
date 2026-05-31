import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const validatorSource = fs.readFileSync(path.join(repoRoot, 'scripts/validate-runtime-contracts.mjs'), 'utf8')
  .replace(/\r\n/g, '\n');

test('runtime contract validator rejects non-portable manifest paths', () => {
  assert.equal(validatorSource.includes('function isUrlSafeRuntimePath'), true);
  assert.equal(validatorSource.includes('DIST_MANIFEST_PATH_NOT_URL_SAFE'), true);
  assert.equal(validatorSource.includes('manifest.files.${key} must be a URL-safe relative path'), true);
  assert.equal(validatorSource.includes('isAbsolute(text) || /^[A-Za-z]:[\\\\/]/.test(text)'), true);
  assert.equal(validatorSource.includes('text.includes("\\\\")'), true);
});

test('runtime contract validator scans dist-data and contract artifacts for local path leaks', () => {
  assert.equal(validatorSource.includes('RUNTIME_ARTIFACT_LOCAL_PATH_LEAK'), true);
  assert.equal(validatorSource.includes('distDataDeclaredFiles'), true);
  assert.equal(validatorSource.includes('for (const declaredPath of Object.values(manifest?.files ?? {}))'), true);
  assert.equal(validatorSource.includes('walkRuntimeJsonFiles(contractDir)'), true);
  for (const marker of [
    'WINDOWS_BACKSLASH_ABSOLUTE_PATH',
    'MINECRAFT_VERSION_PATH',
    'LOCAL_GTNH_PATH',
    'LOCAL_CODEX_PATH',
    'LINUX_MACHINE_ABSOLUTE_PATH',
  ]) {
    assert.equal(validatorSource.includes(marker), true, `missing portability marker ${marker}`);
  }
});
