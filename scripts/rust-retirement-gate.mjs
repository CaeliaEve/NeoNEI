import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const frontendDir = join(repoRoot, 'frontend');
const backendDir = join(repoRoot, 'backend');
const reportDir = join(repoRoot, '.runtime-logs');
const reportPath = join(reportDir, 'rust-retirement-gate.json');
const rawExportInput = process.env.RUST_GATE_RAW_EXPORT
  ? resolve(process.env.RUST_GATE_RAW_EXPORT)
  : join(repoRoot, '.tmp-runtime', 'raw-export-self-test');
const distDataDir = process.env.RUST_GATE_DIST_DATA
  ? resolve(process.env.RUST_GATE_DIST_DATA)
  : join(repoRoot, '.tmp-runtime', 'dist-data-v3-self-test');
const cargoToml = join(repoRoot, 'tools', 'neonei-compiler-rs', 'Cargo.toml');
const rustReport = join(repoRoot, '.tmp-runtime', 'rust-retirement-gate', 'rust-compile-report.json');
const strict = process.argv.includes('--strict') || process.argv.includes('--gate');
const quick = process.argv.includes('--quick');
const selfTestMode = !process.env.RUST_GATE_RAW_EXPORT;

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
  const step = {
    name,
    command,
    args,
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

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function assertEqual(left, right, label) {
  if (left !== right) fail(`${label} mismatch: ${left} !== ${right}`);
}

function writeSummary(status, message = null) {
  mkdirSync(reportDir, { recursive: true });
  writeFileSync(reportPath, JSON.stringify({
    schemaVersion: 'neonei/rust-retirement-gate/current',
    status,
    message,
    quick,
    strict,
    rawExportInput: rawExportInput.replaceAll('\\', '/'),
    distDataDir: distDataDir.replaceAll('\\', '/'),
    steps,
  }, null, 2));
}

if (!existsSync(cargoToml)) fail(`missing Rust compiler manifest: ${cargoToml}`);

if (!process.env.RUST_GATE_RAW_EXPORT) {
  runStep('node raw-export self-test', process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'test:raw-export'], { cwd: frontendDir });
} else if (!existsSync(rawExportInput)) {
  fail(`RUST_GATE_RAW_EXPORT does not exist: ${rawExportInput}`);
}

runStep('rust compiler test', 'cargo', ['test', '--manifest-path', cargoToml]);
runStep('rust compiler strict compile', 'cargo', [
  'run', '--manifest-path', cargoToml, '--',
  'compile', '--input', rawExportInput, '--output', distDataDir, '--report', rustReport, '--strict',
]);

const nodeReport = readJson(join(distDataDir, 'validation', 'report.json'));
const rustCompile = readJson(rustReport);
const rustManifest = readJson(join(distDataDir, 'rust', 'runtime-manifest.json'));
const rustReadiness = readJson(join(distDataDir, 'rust', 'migration-readiness.json'));
assertEqual(rustCompile?.runtime?.counts?.items, nodeReport?.counts?.items, 'runtime item count');
assertEqual(rustCompile?.runtime?.counts?.recipes, nodeReport?.counts?.recipes, 'runtime recipe count');
assertEqual(rustCompile?.runtime?.counts?.browserAtlasItems, nodeReport?.counts?.browserAtlasItems, 'runtime atlas count');
if (rustReadiness?.ready !== true) fail(`Rust migration readiness is not green: ${JSON.stringify(rustReadiness)}`);
if ((rustManifest?.files ?? []).length < 4) fail('Rust runtime manifest does not list compiled artifacts');

const distEnv = {
  DIST_DATA_V3_DIR: distDataDir,
  ...(selfTestMode ? {
    BROWSER_PAGE_SMOKE_PAGES: '1,last',
    BROWSER_PAGE_SMOKE_SEARCHES: 'iron',
    SEARCH_V3_QUERIES: 'iron',
    SEARCH_V3_MIN_ITEMS: '1',
    RECIPE_V3_SAMPLE_SIZE: '1',
    RECIPE_V3_MAX_P50_MS: '100',
    RECIPE_V3_MAX_P95_MS: '150',
  } : {}),
};
runStep('frontend typecheck', process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'typecheck'], { cwd: frontendDir });
runStep('frontend runtime contracts', 'node', ['../scripts/validate-runtime-contracts.mjs', '--gate'], { cwd: frontendDir, env: distEnv });
runStep('frontend browser page validation', 'node', ['../scripts/validate-browser-pages-v3.mjs', '--gate'], { cwd: frontendDir, env: distEnv });
runStep('frontend recipe validation', 'node', ['../scripts/validate-recipe-open-smoke.mjs', '--dist-data', distDataDir], { cwd: frontendDir, env: distEnv });
runStep('frontend search benchmark', 'node', ['../scripts/bench-search-v3.mjs', '--gate'], { cwd: frontendDir, env: distEnv });
runStep('frontend atlas benchmark', 'node', ['../scripts/bench-browser-atlas-v3.mjs', '--gate'], { cwd: frontendDir, env: distEnv });

if (!quick) {
  runStep('backend build', process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build'], { cwd: backendDir });
  runStep('backend runtime health contract', 'node', ['--test', 'scripts/runtime-health-contract.test.mjs'], { cwd: backendDir });
  runStep('frontend recipe benchmark', 'node', ['../scripts/bench-recipe-v3.mjs', '--gate'], { cwd: frontendDir, env: distEnv });
}

writeSummary('ok');
console.log(`[rust-retirement-gate] OK ${reportPath}`);
