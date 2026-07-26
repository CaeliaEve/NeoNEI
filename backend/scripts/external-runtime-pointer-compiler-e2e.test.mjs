import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
require('ts-node/register');

const backendRoot = resolve(import.meta.dirname, '..');
const neoNeiRoot = resolve(backendRoot, '..');
const compilerRepo = resolve(neoNeiRoot, '..', 'elysium-compiler');
const compiler = resolve(
  process.env.ELYSIUM_COMPILER_CROSS_REPO_BIN
    ?? join(compilerRepo, 'target', 'release', process.platform === 'win32' ? 'elysium-compiler.exe' : 'elysium-compiler'),
);
const fixture = join(
  compilerRepo,
  'crates',
  'elysium-compiler-core',
  'fixtures',
  'raw-export-texture-atlas',
);
const { resolveElysiumOutputGeneration } = require(resolve(
  backendRoot,
  'src',
  'compiler-client',
  'elysium-output-generation.ts',
));

function writeJson(filePath, value) {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function runCompiler(args, label) {
  const result = spawnSync(compiler, args, {
    cwd: neoNeiRoot,
    encoding: 'utf8',
    windowsHide: true,
    stdio: 'pipe',
  });
  assert.equal(result.status, 0, `${label} failed: ${result.stderr || result.stdout}`);
}

function normalizeReportedPath(value) {
  return resolve(String(value).replace(/^\/\/\?\//, ''));
}

test('NeoNEI stable raw-export authority completes compiler validate and compile handshake', (context) => {
  if (!existsSync(compiler) || !existsSync(fixture)) {
    context.skip('cross-repo elysium-compiler release binary or fixture is unavailable');
    return;
  }
  const work = mkdtempSync(join(tmpdir(), 'neonei-pointer-compiler-e2e-'));
  const generationId = 'cross-repo-generation-01';
  const generation = join(work, 'raw-export', 'generations', generationId);
  const authority = join(work, 'raw-export');
  const output = join(work, 'dist-data');
  const validateReport = join(work, 'validate-report.json');
  const compileReport = join(work, 'compile-report.json');
  try {
    cpSync(fixture, generation, { recursive: true });
    writeJson(join(authority, 'current.json'), {
      schemaVersion: 'nesqlpp/raw-export-generation-pointer/v1',
      generationId,
      relativePath: `generations/${generationId}`,
    });
    runCompiler(
      ['validate', '--input', authority, '--output', output, '--report', validateReport],
      'validate stable pointer authority',
    );
    runCompiler(
      ['compile', '--input', authority, '--output', output, '--report', compileReport, '--scope', 'all', '--strict'],
      'compile stable pointer authority',
    );
    const validate = JSON.parse(readFileSync(validateReport, 'utf8'));
    const compiled = JSON.parse(readFileSync(compileReport, 'utf8'));
    assert.equal(validate.inputAuthority, 'generation-pointer');
    assert.equal(compiled.inputAuthority, 'generation-pointer');
    assert.equal(normalizeReportedPath(validate.input), resolve(authority));
    assert.equal(normalizeReportedPath(compiled.resolvedInput), resolve(generation));
    const compiledGeneration = resolveElysiumOutputGeneration(output);
    assert.equal(normalizeReportedPath(compiled.output), resolve(compiledGeneration.generationRoot));
    assert.equal(existsSync(join(output, 'manifest.json')), false, 'flat output root must not remain an artifact authority');
    assert.equal(existsSync(join(compiledGeneration.generationRoot, 'manifest.json')), true);
    assert.equal(existsSync(join(compiledGeneration.generationRoot, 'rust', 'runtime-manifest.json')), true);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
});
