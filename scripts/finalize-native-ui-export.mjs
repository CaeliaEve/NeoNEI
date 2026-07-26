import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveElysiumOutputGeneration } from './lib/elysium-output-generation.mjs';
import { resolveNesqlRawExportGeneration } from './lib/nesql-raw-export-generation.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const reportDir = join(repoRoot, '.runtime-logs');
const reportPath = join(reportDir, 'native-ui-final-export.json');
const rustReport = resolve(readArg('--report') ?? join(reportDir, 'native-ui-final-rust-compile-report.json'));
const rawExportInput = readArg('--raw-export') ?? process.env.RUST_GATE_RAW_EXPORT ?? null;
const distDataDir = resolve(
  readArg('--dist-data')
    ?? process.env.RUST_GATE_DIST_DATA
    ?? join(repoRoot, 'backend', 'public', 'dist-data'),
);
const explicitCompileScope = readArg('--scope');
const explicitThreads = readArg('--threads');
const explicitCompiler = readArg('--compiler') ?? process.env.NEONEI_COMPILER_BIN ?? null;
const skipCompile = args.includes('--skip-compile');
const runExtendedRuntime = args.includes('--extended-runtime');
let compilerCommand = null;
let compiledDistDataDir = null;
let resolvedRawExportDir = null;

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
    '  --extended-runtime   Also run browser/texture runtime validators after the three final gates.',
    '  --scope <scope>      Rust compile scope; default: all.',
    '  --threads <count>    Positive compiler worker count; omit to use compiler default.',
    '  --compiler <path>    Use an explicit local elysium-compiler binary instead of the pinned lock binary.',
    '',
    'Environment:',
    '  NEONEI_COMPILER_BIN  Explicit compiler binary path or command, overridden by --compiler.',
  ].join('\n');
}

function fail(message) {
  writeSummary('failed', message);
  console.error(`[native-ui-final-export] ${message}`);
  process.exit(1);
}

function commandExists(command, commandArgs = ['--help']) {
  const result = spawnSync(command, commandArgs, { stdio: 'ignore', shell: false });
  return (result.status ?? 1) === 0;
}

function resolvePinnedCompiler() {
  const result = spawnSync('node', ['scripts/ensure-elysium-compiler.mjs'], {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: 'pipe',
    shell: false,
  });
  if ((result.status ?? 1) !== 0) {
    fail(`pinned elysium-compiler resolution failed: ${result.stderr || result.stdout}`);
  }
  return result.stdout.trim();
}

function resolveCompilerCommand() {
  if (explicitCompiler) {
    const command = explicitCompiler.includes('\\') || explicitCompiler.includes('/')
      ? resolve(explicitCompiler)
      : explicitCompiler;
    return { mode: 'explicit-external-binary', command };
  }
  return { mode: 'pinned-external-binary', command: resolvePinnedCompiler() };
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

function resolveCompileScope() {
  if (explicitCompileScope) return explicitCompileScope;
  if (!resolvedRawExportDir) return 'all';
  const manifestPath = join(resolvedRawExportDir, 'manifest.json');
  if (!existsSync(manifestPath)) return 'all';
  const manifest = readJson(manifestPath);
  const profile = `${manifest.profile ?? ''}`;
  const selection = `${manifest.selection ?? ''}`;
  const files = manifest.files ?? {};
  const hasBrowserAtlas = Boolean(`${files.browserAtlasIndex ?? files.browserAtlas ?? ''}`.trim())
    || existsSync(join(resolvedRawExportDir, 'assets', 'textures', 'browser_atlas_index.json'));
  if (profile.includes('data') || selection.includes('-images') || !hasBrowserAtlas) {
    return 'native-ui';
  }
  return 'all';
}

let compileScope = explicitCompileScope ?? 'all';

function writeSummary(status, message = null) {
  mkdirSync(reportDir, { recursive: true });
  writeFileSync(reportPath, `${JSON.stringify({
    schemaVersion: 'neonei/native-ui-final-export/current',
    status,
    message,
    rawExportInput: rawExportInput ? resolve(rawExportInput).replaceAll('\\', '/') : null,
    distDataDir: distDataDir.replaceAll('\\', '/'),
    compileScope,
    threads: explicitThreads ? Number(explicitThreads) : null,
    compiler: compilerCommand,
    skipCompile,
    runExtendedRuntime,
    steps,
  }, null, 2)}\n`, 'utf8');
}

if (!skipCompile) {
  compilerCommand = resolveCompilerCommand();
  if (!rawExportInput) fail(`${usage()}\n\nMissing --raw-export.`);
  const rawExportDir = resolve(rawExportInput);
  if (!existsSync(rawExportDir)) fail(`raw export directory does not exist: ${rawExportDir}`);
  try {
    resolvedRawExportDir = resolveNesqlRawExportGeneration(rawExportDir).generationRoot;
    compileScope = resolveCompileScope();
  } catch (error) {
    fail(`raw export authority is invalid: ${error.message}`);
  }
  if (compilerCommand.command.includes('\\') || compilerCommand.command.includes('/')) {
    if (!existsSync(compilerCommand.command)) fail(`external compiler binary does not exist: ${compilerCommand.command}`);
  } else if (!commandExists(compilerCommand.command)) {
    fail(`external compiler command is not executable: ${compilerCommand.command}`);
  }
  mkdirSync(dirname(rustReport), { recursive: true });
  if (explicitThreads && (!/^\d+$/.test(explicitThreads) || Number(explicitThreads) < 1)) {
    fail(`--threads must be a positive integer, got: ${explicitThreads}`);
  }
  const compileArgs = [
    'compile', '--input', rawExportDir, '--output', distDataDir, '--report', rustReport, '--scope', compileScope,
  ];
  if (explicitThreads) compileArgs.push('--threads', explicitThreads);
  compileArgs.push('--strict');
  runStep('elysium compiler strict compile', compilerCommand.command, compileArgs);
}
try {
  compiledDistDataDir = resolveElysiumOutputGeneration(distDataDir).generationRoot;
} catch (error) {
  fail(`compiled dist-data authority is invalid: ${error.message}`);
}

const distEnv = { DIST_DATA_V3_DIR: compiledDistDataDir };
runStep('rust production manifest gate', 'node', ['scripts/validate-rust-production-manifest.mjs', '--gate', '--dist-data', compiledDistDataDir], { env: distEnv });
runStep('rust recipe runtime gate', 'node', ['scripts/validate-rust-recipe-runtime.mjs', '--gate', '--dist-data', compiledDistDataDir], { env: distEnv });
runStep('native UI layout gate', 'node', ['scripts/validate-native-ui-layouts.mjs', '--gate', '--dist-data', compiledDistDataDir], { env: distEnv });

if (runExtendedRuntime) {
  runStep('rust browser runtime gate', 'node', ['scripts/validate-rust-browser-runtime.mjs', '--gate', '--dist-data', compiledDistDataDir], { env: distEnv });
  runStep('rust texture runtime gate', 'node', ['scripts/validate-rust-texture-runtime.mjs', '--gate', '--dist-data', compiledDistDataDir], { env: distEnv });
}

const manifest = readJson(join(compiledDistDataDir, 'manifest.json'));
const nativeReportPath = manifest?.files?.rustNativeUiLayoutReport
  ? join(compiledDistDataDir, manifest.files.rustNativeUiLayoutReport)
  : join(compiledDistDataDir, 'rust', 'native-ui-layout-report.json');
const nativeReport = existsSync(nativeReportPath) ? readJson(nativeReportPath) : null;
writeSummary('ok');
console.log(JSON.stringify({
  status: 'ok',
  distDataDir,
  compiledDistDataDir,
  nativeUiLayoutReport: manifest?.files?.rustNativeUiLayoutReport ?? null,
  nativeUiStatus: nativeReport?.status ?? null,
  nativeUiCounts: nativeReport?.counts ?? null,
  compiler: manifest?.compiler ?? null,
  reportPath,
}, null, 2));
