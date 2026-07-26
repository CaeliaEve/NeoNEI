import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { resolveElysiumOutputGeneration } from './lib/elysium-output-generation.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const json = args.includes('--json');
const keep = args.includes('--keep');
const lockPath = resolve(readArg('--lock') ?? join(repoRoot, 'tools', 'elysium-compiler', 'elysium-compiler.lock.json'));
const fixturePath = resolve(
  readArg('--fixture')
    ?? join(repoRoot, '..', 'elysium-compiler', 'crates', 'elysium-compiler-core', 'fixtures', 'raw-export-minimal'),
);
const scope = readArg('--scope') ?? 'native-ui';

function readArg(name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
}

function fail(message, extra = {}) {
  const payload = { status: 'failed', message, fixturePath, lockPath, ...extra };
  if (json) console.log(JSON.stringify(payload, null, 2));
  else console.error(`[elysium-compiler-fixture-smoke] ${message}`);
  process.exit(1);
}

function runNodeJson(scriptArgs, label) {
  const result = spawnSync(process.execPath, scriptArgs, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: 'pipe',
    shell: false,
  });
  if ((result.status ?? 1) !== 0) {
    fail(`${label} failed`, { stderr: result.stderr, stdout: result.stdout });
  }
  try {
    return JSON.parse(result.stdout);
  } catch (error) {
    fail(`${label} returned invalid JSON: ${error.message}`, { stdout: result.stdout });
  }
}

function runCompiler(compiler, commandArgs, label) {
  const result = spawnSync(compiler, commandArgs, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: 'pipe',
    shell: false,
  });
  if ((result.status ?? 1) !== 0) {
    fail(`${label} failed`, { stderr: result.stderr, stdout: result.stdout, commandArgs });
  }
  return { stdout: result.stdout, stderr: result.stderr };
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

if (!existsSync(fixturePath)) {
  fail(`fixture does not exist: ${fixturePath}`);
}

const handshake = runNodeJson(['scripts/ensure-elysium-compiler.mjs', '--lock', lockPath, '--json'], 'compiler handshake');
const compiler = handshake.compiler;
const workDir = mkdtempSync(join(tmpdir(), 'neonei-elysium-compiler-smoke-'));
const outputDir = join(workDir, 'compiled');
const validateReport = join(workDir, 'validate-report.json');
const compileReport = join(workDir, 'compile-report.json');

try {
  runCompiler(compiler, ['validate', '--input', fixturePath, '--report', validateReport], 'elysium-compiler validate');
  runCompiler(
    compiler,
    ['compile', '--input', fixturePath, '--output', outputDir, '--report', compileReport, '--scope', scope],
    'elysium-compiler compile',
  );
  const compiledGeneration = resolveElysiumOutputGeneration(outputDir);
  const artifactRoot = compiledGeneration.generationRoot;

  const requiredOutputs = [
    join(artifactRoot, 'manifest.json'),
    join(artifactRoot, 'rust', 'runtime-manifest.json'),
    join(artifactRoot, 'rust', 'ui-pack', 'ui_templates.bin'),
    join(artifactRoot, 'rust', 'ui-pack', 'ui_bindings.bin'),
    join(artifactRoot, 'rust', 'ui-pack', 'ui_strings.bin'),
    validateReport,
    compileReport,
  ];
  const missingOutputs = requiredOutputs.filter((file) => !existsSync(file));
  if (missingOutputs.length > 0) {
    fail('external compiler smoke missing required outputs', { missingOutputs, workDir });
  }

  const runtimeManifest = readJson(join(artifactRoot, 'rust', 'runtime-manifest.json'));
  const payload = {
    status: 'ok',
    compiler,
    fixturePath,
    scope,
    workDir: keep ? workDir : null,
    outputGenerationId: compiledGeneration.generationId,
    metadata: handshake.metadata,
    runtimeManifestSchema: runtimeManifest.schemaVersion ?? null,
    requiredOutputs: requiredOutputs.map((file) => file.replace(workDir, '<workDir>')),
  };
  if (json) console.log(JSON.stringify(payload, null, 2));
  else console.log(`[elysium-compiler-fixture-smoke] ok: ${compiler}`);
} finally {
  if (!keep) {
    rmSync(workDir, { recursive: true, force: true });
  }
}
