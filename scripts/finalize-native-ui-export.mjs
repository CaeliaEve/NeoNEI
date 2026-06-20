import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const reportDir = join(repoRoot, '.runtime-logs');
const reportPath = join(reportDir, 'native-ui-final-export.json');
const cargoToml = join(repoRoot, 'tools', 'neonei-compiler-rs', 'Cargo.toml');
const rustReport = resolve(readArg('--report') ?? join(reportDir, 'native-ui-final-rust-compile-report.json'));
const rawExportInput = readArg('--raw-export') ?? process.env.RUST_GATE_RAW_EXPORT ?? null;
const distDataDir = resolve(
  readArg('--dist-data')
    ?? process.env.RUST_GATE_DIST_DATA
    ?? join(repoRoot, 'backend', 'public', 'dist-data'),
);
const compileScope = readArg('--scope') ?? 'all';
const skipCompile = args.includes('--skip-compile');
const skipCargoTest = args.includes('--skip-cargo-test');
const runExtendedRuntime = args.includes('--extended-runtime');
const cargoCommand = resolveCargoCommand();

const steps = [];

function readArg(name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
}

function usage() {
  return [
    'Usage:',
    '  node scripts/finalize-native-ui-export.mjs --raw-export <raw-export-dir> [--dist-data <dist-data-dir>]',
    '',
    'Options:',
    '  --skip-compile       Validate an already compiled dist-data directory.',
    '  --skip-cargo-test    Skip compiler unit tests before compilation.',
    '  --extended-runtime   Also run browser/texture runtime validators after the three final gates.',
    '  --scope <scope>      Rust compile scope; default: all.',
  ].join('\n');
}

function fail(message) {
  writeSummary('failed', message);
  console.error(`[native-ui-final-export] ${message}`);
  process.exit(1);
}

function commandExists(command, commandArgs = ['--version']) {
  const result = spawnSync(command, commandArgs, { stdio: 'ignore', shell: false });
  return (result.status ?? 1) === 0;
}

function windowsRustCargoCandidates() {
  if (process.platform !== 'win32') return [];
  return ['C', 'D', 'E', 'F']
    .flatMap((drive) => [
      join(`${drive}:`, 'Rust', 'cargo', 'bin', 'cargo.exe'),
      join(`${drive}:`, 'Rust', 'rustup', 'toolchains', 'stable-x86_64-pc-windows-msvc', 'bin', 'cargo.exe'),
    ]);
}

function userCargoCandidate() {
  if (process.platform !== 'win32' || !process.env.USERPROFILE) return null;
  return join(process.env.USERPROFILE, '.cargo', 'bin', 'cargo.exe');
}

function resolveCargoCommand() {
  const candidates = [
    process.env.CARGO,
    process.env.CARGO_HOME ? join(process.env.CARGO_HOME, 'bin', process.platform === 'win32' ? 'cargo.exe' : 'cargo') : null,
    userCargoCandidate(),
    ...windowsRustCargoCandidates(),
    'cargo',
  ].filter(Boolean);
  return candidates.find((candidate) => existsSync(candidate) || commandExists(candidate)) ?? 'cargo';
}

function runStep(name, command, stepArgs, options = {}) {
  const startedAt = Date.now();
  console.log(`[native-ui-final-export] ${name}: ${command} ${stepArgs.join(' ')}`);
  const result = process.platform === 'win32' && /\.cmd$/i.test(command)
    ? spawnSync('cmd.exe', ['/d', '/s', '/c', command, ...stepArgs], {
        cwd: options.cwd ?? repoRoot,
        stdio: options.capture ? 'pipe' : 'inherit',
        shell: false,
        env: { ...process.env, ...(options.env ?? {}) },
      })
    : spawnSync(command, stepArgs, {
        cwd: options.cwd ?? repoRoot,
        stdio: options.capture ? 'pipe' : 'inherit',
        shell: false,
        env: { ...process.env, ...(options.env ?? {}) },
      });
  const step = {
    name,
    command,
    args: stepArgs,
    elapsedMs: Date.now() - startedAt,
    status: result.status ?? 1,
  };
  steps.push(step);
  if ((result.status ?? 1) !== 0) {
    if (options.capture) {
      console.error(result.stdout?.toString() ?? '');
      console.error(result.stderr?.toString() ?? '');
    }
    fail(`${name} failed with exit code ${result.status ?? 1}`);
  }
  return result;
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function writeSummary(status, message = null) {
  mkdirSync(reportDir, { recursive: true });
  writeFileSync(reportPath, `${JSON.stringify({
    schemaVersion: 'neonei/native-ui-final-export/current',
    status,
    message,
    rawExportInput: rawExportInput ? resolve(rawExportInput).replaceAll('\\', '/') : null,
    distDataDir: distDataDir.replaceAll('\\', '/'),
    compileScope,
    skipCompile,
    skipCargoTest,
    runExtendedRuntime,
    steps,
  }, null, 2)}\n`, 'utf8');
}

if (!skipCompile) {
  if (!rawExportInput) fail(`${usage()}\n\nMissing --raw-export.`);
  const rawExportDir = resolve(rawExportInput);
  if (!existsSync(rawExportDir)) fail(`raw export directory does not exist: ${rawExportDir}`);
  if (!existsSync(join(rawExportDir, 'manifest.json'))) fail(`raw export manifest is missing: ${join(rawExportDir, 'manifest.json')}`);
  if (!existsSync(cargoToml)) fail(`missing Rust compiler manifest: ${cargoToml}`);
  if (!skipCargoTest) {
    runStep('rust compiler tests', cargoCommand, ['test', '--manifest-path', cargoToml]);
  }
  mkdirSync(dirname(rustReport), { recursive: true });
  runStep('rust compiler strict full compile', cargoCommand, [
    'run', '--manifest-path', cargoToml, '--',
    'compile', '--input', rawExportDir, '--output', distDataDir, '--report', rustReport, '--scope', compileScope, '--strict',
  ]);
} else if (!existsSync(join(distDataDir, 'manifest.json'))) {
  fail(`compiled dist-data manifest is missing: ${join(distDataDir, 'manifest.json')}`);
}

const distEnv = { DIST_DATA_V3_DIR: distDataDir };
runStep('rust production manifest gate', 'node', ['scripts/validate-rust-production-manifest.mjs', '--gate', '--dist-data', distDataDir], { env: distEnv });
runStep('rust recipe runtime gate', 'node', ['scripts/validate-rust-recipe-runtime.mjs', '--gate', '--dist-data', distDataDir], { env: distEnv });
runStep('native UI layout gate', 'node', ['scripts/validate-native-ui-layouts.mjs', '--gate', '--dist-data', distDataDir], { env: distEnv });

if (runExtendedRuntime) {
  runStep('rust browser runtime gate', 'node', ['scripts/validate-rust-browser-runtime.mjs', '--gate', '--dist-data', distDataDir], { env: distEnv });
  runStep('rust texture runtime gate', 'node', ['scripts/validate-rust-texture-runtime.mjs', '--gate', '--dist-data', distDataDir], { env: distEnv });
}

const manifest = readJson(join(distDataDir, 'manifest.json'));
const nativeReportPath = manifest?.files?.rustNativeUiLayoutReport
  ? join(distDataDir, manifest.files.rustNativeUiLayoutReport)
  : join(distDataDir, 'rust', 'native-ui-layout-report.json');
const nativeReport = existsSync(nativeReportPath) ? readJson(nativeReportPath) : null;
writeSummary('ok');
console.log(JSON.stringify({
  status: 'ok',
  distDataDir,
  nativeUiLayoutReport: manifest?.files?.rustNativeUiLayoutReport ?? null,
  nativeUiStatus: nativeReport?.status ?? null,
  nativeUiCounts: nativeReport?.counts ?? null,
  reportPath,
}, null, 2));
