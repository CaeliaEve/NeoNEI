import assert from 'node:assert/strict';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const compilerScript = join(repoRoot, 'scripts', 'compile-raw-export.mjs');
const frontendPackage = JSON.parse(readFileSync(join(repoRoot, 'frontend', 'package.json'), 'utf8'));

function runLegacyCompiler(extraArgs = [], env = {}) {
  const token = `${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const input = join(tmpdir(), `neonei-retired-compiler-input-${token}`);
  const output = join(tmpdir(), `neonei-retired-compiler-output-${token}`);
  const childEnv = { ...process.env, ...env };
  delete childEnv.NEONEI_ALLOW_LEGACY_JS_COMPILE;
  Object.assign(childEnv, env);
  const result = spawnSync(
    process.execPath,
    [compilerScript, '--input', input, '--output', output, ...extraArgs],
    {
      cwd: repoRoot,
      encoding: 'utf8',
      env: childEnv,
      windowsHide: true,
    },
  );
  return {
    ...result,
    inputPath: input,
    outputPath: output,
    combined: `${result.stdout ?? ''}\n${result.stderr ?? ''}`,
  };
}

function cleanupRun(result) {
  rmSync(result.inputPath, { recursive: true, force: true });
  rmSync(result.outputPath, { recursive: true, force: true });
}

test('retired JS compiler fails before reading input unless migration execution is explicit', () => {
  const result = runLegacyCompiler();
  try {
    assert.notEqual(result.status, 0);
    assert.match(result.combined, /legacy JS compiler execution is disabled/i);
    assert.equal(existsSync(result.outputPath), false);
  } finally {
    cleanupRun(result);
  }
});

test('explicit CLI migration permission reaches the legacy compiler input validation', () => {
  const result = runLegacyCompiler(['--legacy-compile-ok']);
  try {
    assert.equal(result.status, 0);
    assert.doesNotMatch(result.combined, /legacy JS compiler execution is disabled/i);
    assert.equal(existsSync(join(result.outputPath, 'manifest.json')), true);
  } finally {
    cleanupRun(result);
  }
});

test('explicit environment migration permission reaches the legacy compiler input validation', () => {
  const result = runLegacyCompiler([], { NEONEI_ALLOW_LEGACY_JS_COMPILE: '1' });
  try {
    assert.equal(result.status, 0);
    assert.doesNotMatch(result.combined, /legacy JS compiler execution is disabled/i);
    assert.equal(existsSync(join(result.outputPath, 'manifest.json')), true);
  } finally {
    cleanupRun(result);
  }
});

test('frontend package exposes self-test and retirement regression only, not a generic legacy compile command', () => {
  assert.equal(frontendPackage.scripts['compile:raw-export'], undefined);
  assert.equal(frontendPackage.scripts['test:raw-export'], 'node ../scripts/compile-raw-export.mjs --self-test');
  assert.equal(
    frontendPackage.scripts['test:legacy-compiler-retirement'],
    'node --test ../scripts/legacy-compiler-retirement.test.mjs',
  );
});
