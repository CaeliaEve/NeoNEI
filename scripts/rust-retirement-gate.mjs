import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveElysiumOutputGeneration } from './lib/elysium-output-generation.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const frontendDir = join(repoRoot, 'frontend');
const backendDir = join(repoRoot, 'backend');
const reportDir = join(repoRoot, '.runtime-logs');
const reportPath = join(reportDir, 'rust-retirement-gate.json');
const rawExportInput = process.env.RUST_GATE_RAW_EXPORT
  ? resolve(process.env.RUST_GATE_RAW_EXPORT)
  : join(repoRoot, 'tools', 'elysium-compiler', 'fixtures', 'raw-export-native-ui-gt');
const distDataDir = process.env.RUST_GATE_DIST_DATA
  ? resolve(process.env.RUST_GATE_DIST_DATA)
  : join(repoRoot, '.tmp-runtime', 'dist-data-v3-self-test');
const rustReport = join(repoRoot, '.tmp-runtime', 'rust-retirement-gate', 'rust-compile-report.json');
const quick = process.argv.includes('--quick');
const compileScopeArg = process.argv.find((arg) => arg.startsWith('--scope='));
const compileScope = compileScopeArg?.split('=')[1] || process.env.RUST_GATE_SCOPE || 'all';
const steps = [];

function fail(message) {
  writeSummary('failed', message);
  console.error(`[rust-retirement-gate] ${message}`);
  process.exit(1);
}

function runStep(name, command, args, options = {}) {
  const startedAt = Date.now();
  console.log(`[rust-retirement-gate] ${name}: ${command} ${args.join(' ')}`);
  const result = process.platform === 'win32' && /\.cmd$/i.test(command)
    ? spawnSync('cmd.exe', ['/d', '/s', '/c', command, ...args], {
        cwd: options.cwd ?? repoRoot,
        stdio: options.capture ? 'pipe' : 'inherit',
        shell: false,
        env: { ...process.env, ...(options.env ?? {}) },
      })
    : spawnSync(command, args, {
        cwd: options.cwd ?? repoRoot,
        stdio: options.capture ? 'pipe' : 'inherit',
        shell: false,
        env: { ...process.env, ...(options.env ?? {}) },
      });
  const step = { name, command, args, elapsedMs: Date.now() - startedAt, status: result.status ?? 1 };
  if (options.capture) {
    step.stdout = result.stdout?.toString() ?? '';
    step.stderr = result.stderr?.toString() ?? '';
  }
  steps.push(step);
  if ((result.status ?? 1) !== 0) {
    if (options.capture) {
      console.error(step.stdout);
      console.error(step.stderr);
    }
    fail(`${name} failed with exit code ${result.status ?? 1}`);
  }
  return step;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function writeSummary(status, message = null) {
  mkdirSync(reportDir, { recursive: true });
  writeFileSync(reportPath, JSON.stringify({
    schemaVersion: 'neonei/rust-retirement-gate/current',
    status,
    message,
    quick,
    compileScope,
    rawExportInput: rawExportInput.replaceAll('\\', '/'),
    distDataDir: distDataDir.replaceAll('\\', '/'),
    steps,
  }, null, 2));
}

if (existsSync(join(repoRoot, 'tools', 'neonei-compiler-rs'))) {
  fail('retired in-repo compiler source path still exists: tools/neonei-compiler-rs');
}
if (!existsSync(rawExportInput)) fail(`raw export fixture/input does not exist: ${rawExportInput}`);

const ensure = runStep('resolve pinned elysium compiler', 'node', ['scripts/ensure-elysium-compiler.mjs', '--json'], { capture: true });
const compiler = JSON.parse(ensure.stdout).compiler;
runStep('elysium compiler strict compile', compiler, [
  'compile', '--input', rawExportInput, '--output', distDataDir, '--report', rustReport, '--scope', compileScope, '--strict',
]);
const compiledGeneration = resolveElysiumOutputGeneration(distDataDir);
const artifactRoot = compiledGeneration.generationRoot;

const rustCompile = readJson(rustReport);
const rustManifest = readJson(join(artifactRoot, 'rust', 'runtime-manifest.json'));
const distManifest = readJson(join(artifactRoot, 'manifest.json'));
const rustReadiness = readJson(join(artifactRoot, 'rust', 'migration-readiness.json'));
if (rustCompile?.runtime?.counts?.recipes < 1) fail('compiled runtime has no recipes');
if (rustManifest?.compiler?.name !== 'elysium-compiler') fail('runtime manifest lacks compiler metadata');
if (distManifest?.compiler?.name !== 'elysium-compiler') fail('dist manifest lacks compiler metadata');
if (rustReadiness?.ready !== true) fail(`runtime readiness is not green: ${JSON.stringify(rustReadiness)}`);

const distEnv = { DIST_DATA_V3_DIR: artifactRoot };
runStep('rust production manifest validation', 'node', ['scripts/validate-rust-production-manifest.mjs', '--gate', '--dist-data', artifactRoot], { env: distEnv });
runStep('native UI layout validation', 'node', ['scripts/validate-native-ui-layouts.mjs', '--gate', '--dist-data', artifactRoot], { env: distEnv });
runStep('rust recipe runtime validation', 'node', ['scripts/validate-rust-recipe-runtime.mjs', '--gate', '--dist-data', artifactRoot], { env: distEnv });
if (!quick) {
  runStep('backend build', process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build'], { cwd: backendDir });
  runStep('frontend typecheck', process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'typecheck'], { cwd: frontendDir, env: distEnv });
}
writeSummary('ok');
console.log(JSON.stringify({ status: 'ok', compiler, distDataDir, artifactRoot, compileScope }, null, 2));
