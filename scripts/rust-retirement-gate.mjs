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
const compileScopeArg = process.argv.find((arg) => arg.startsWith('--scope='));
const compileScope = compileScopeArg?.split('=')[1] || process.env.RUST_GATE_SCOPE || (quick ? 'search' : 'all');
const selfTestMode = !process.env.RUST_GATE_RAW_EXPORT;
const cargoCommand = resolveCargoCommand();

const steps = [];

function fail(message) {
  writeSummary('failed', message);
  console.error(`[rust-retirement-gate] ${message}`);
  process.exit(1);
}

function commandExists(command, args = ['--version']) {
  const result = spawnSync(command, args, { stdio: 'ignore', shell: false });
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
    compileScope,
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
} else if (!existsSync(join(distDataDir, 'validation', 'report.json'))) {
  runStep('node raw-export compile', 'node', [
    '../scripts/compile-raw-export.mjs',
    '--input', rawExportInput,
    '--output', distDataDir,
  ], { cwd: frontendDir });
}

runStep('rust compiler test', cargoCommand, ['test', '--manifest-path', cargoToml]);
runStep('rust compiler strict compile', cargoCommand, [
  'run', '--manifest-path', cargoToml, '--',
  'compile', '--input', rawExportInput, '--output', distDataDir, '--report', rustReport, '--scope', compileScope, '--strict',
]);

const nodeReport = readJson(join(distDataDir, 'validation', 'report.json'));
const rustCompile = readJson(rustReport);
const rustManifest = readJson(join(distDataDir, 'rust', 'runtime-manifest.json'));
const rustReadiness = readJson(join(distDataDir, 'rust', 'migration-readiness.json'));
assertEqual(rustCompile?.runtime?.counts?.items, nodeReport?.counts?.items, 'runtime item count');
assertEqual(rustCompile?.runtime?.counts?.recipes, nodeReport?.counts?.recipes, 'runtime recipe count');
assertEqual(rustCompile?.runtime?.counts?.browserAtlasItems, nodeReport?.counts?.browserAtlasItems, 'runtime atlas count');
if (rustReadiness?.ready !== true) fail(`Rust migration readiness is not green: ${JSON.stringify(rustReadiness)}`);
const expectedArtifactCount = compileScope === 'all' ? 12 : compileScope === 'browser' ? 4 : 1;
if ((rustManifest?.files ?? []).length < expectedArtifactCount) fail('Rust runtime manifest does not list compiled artifacts');
if (compileScope === 'all' || compileScope === 'recipes') {
  const recipeBinPath = join(distDataDir, 'rust', 'recipes.bin');
  if (!existsSync(recipeBinPath)) fail('Rust recipe binary pack is missing');
  const uiPayloadIndexPath = join(distDataDir, 'recipes', 'ui-payload-index.json');
  const categoryIndexPath = join(distDataDir, 'recipes', 'recipe-category-index.json');
  const nativeUiLayoutReportPath = join(distDataDir, 'rust', 'native-ui-layout-report.json');
  if (!existsSync(uiPayloadIndexPath)) fail('Rust recipe UI payload index is missing');
  if (!existsSync(categoryIndexPath)) fail('Rust recipe category index is missing');
  if (!existsSync(nativeUiLayoutReportPath)) fail('Rust native UI layout report is missing');
  const uiPayloadIndex = readJson(uiPayloadIndexPath);
  const categoryIndex = readJson(categoryIndexPath);
  const nativeUiLayoutReport = readJson(nativeUiLayoutReportPath);
  const uiPayloadEntries = Array.isArray(uiPayloadIndex?.recipes) ? uiPayloadIndex.recipes : [];
  const categories = Array.isArray(categoryIndex?.categories) ? categoryIndex.categories : [];
  if (uiPayloadEntries.length !== nodeReport?.counts?.recipes) fail(`Rust UI payload index count mismatch: ${uiPayloadEntries.length} !== ${nodeReport?.counts?.recipes}`);
  if (categories.length < 1) fail('Rust recipe category index is empty');
  if (nativeUiLayoutReport?.status === 'blocked') fail(`Rust native UI layout report is blocked: ${JSON.stringify(nativeUiLayoutReport?.failures ?? [])}`);
  const sampleUiPayload = uiPayloadEntries.find((entry) => entry?.recipeId && entry?.path && entry?.payloadKey);
  if (!sampleUiPayload) fail('Rust UI payload index lacks routeable entries');
  const sampleShardPath = join(distDataDir, sampleUiPayload.path);
  if (!existsSync(sampleShardPath)) fail('Rust recipe UI payload shard is missing: ' + sampleUiPayload.path);
  const sampleShard = readJson(sampleShardPath);
  const samplePayload = sampleShard?.payloads?.[sampleUiPayload.payloadKey];
  if (!samplePayload?.recipeId) fail('Rust recipe UI payload shard lacks sample payload');
  if (samplePayload.schemaVersion !== 'neonei/recipe-ui-payload/v1') fail('Rust recipe UI payload has wrong schemaVersion');
  if (!samplePayload.familyKey || !samplePayload.machineType || !samplePayload.recipeType) fail('Rust recipe UI payload lacks display metadata');
  if (!Array.isArray(samplePayload.inputItemIds) || !Array.isArray(samplePayload.outputItemIds)) fail('Rust recipe UI payload lacks item id arrays');
  if (!samplePayload.slotCount || typeof samplePayload.slotCount !== 'object') fail('Rust recipe UI payload lacks slotCount');
}

const distEnv = {
  DIST_DATA_V3_DIR: distDataDir,
  ...(compileScope === 'search' ? {
    SEARCH_V3_PACK_PATH: join(distDataDir, 'rust', 'search-pack.json'),
  } : {}),
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
if (compileScope !== 'search') {
  runStep('frontend typecheck', process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'typecheck'], { cwd: frontendDir });
  runStep('frontend runtime contracts', 'node', ['../scripts/validate-runtime-contracts.mjs', '--gate'], { cwd: frontendDir, env: distEnv });
  runStep('frontend rust production manifest validation', 'node', ['../scripts/validate-rust-production-manifest.mjs', '--gate', '--dist-data', distDataDir], { cwd: frontendDir, env: distEnv });
  if (!selfTestMode) {
    runStep('frontend native UI layout validation', 'node', ['../scripts/validate-native-ui-layouts.mjs', '--gate', '--dist-data', distDataDir], { cwd: frontendDir, env: distEnv });
  }
  runStep('frontend browser page validation', 'node', ['../scripts/validate-browser-pages-v3.mjs', '--gate'], { cwd: frontendDir, env: distEnv });
  runStep('frontend rust browser runtime validation', 'node', ['../scripts/validate-rust-browser-runtime.mjs', '--gate', '--dist-data', distDataDir], { cwd: frontendDir, env: distEnv });
  runStep('frontend rust texture runtime validation', 'node', ['../scripts/validate-rust-texture-runtime.mjs', '--gate', '--dist-data', distDataDir], { cwd: frontendDir, env: distEnv });
  runStep('frontend rust recipe runtime validation', 'node', ['../scripts/validate-rust-recipe-runtime.mjs', '--gate', '--dist-data', distDataDir], { cwd: frontendDir, env: distEnv });
  runStep('frontend recipe validation', 'node', ['../scripts/validate-recipe-open-smoke.mjs', '--dist-data', distDataDir], { cwd: frontendDir, env: distEnv });
}
runStep('frontend search benchmark', 'node', ['../scripts/bench-search-v3.mjs', '--gate'], { cwd: frontendDir, env: distEnv });
if (compileScope !== 'search') {
  runStep('frontend atlas benchmark', 'node', ['../scripts/bench-browser-atlas-v3.mjs', '--gate'], { cwd: frontendDir, env: distEnv });
}

if (!quick) {
  runStep('backend build', process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build'], { cwd: backendDir });
  runStep('backend runtime health contract', 'node', ['--test', 'scripts/runtime-health-contract.test.mjs'], { cwd: backendDir });
  runStep('frontend recipe benchmark', 'node', ['../scripts/bench-recipe-v3.mjs', '--gate'], { cwd: frontendDir, env: distEnv });
}

if (selfTestMode && quick && compileScope !== 'all') {
  runStep('restore full raw-export self-test runtime', cargoCommand, [
    'run', '--manifest-path', cargoToml, '--',
    'compile', '--input', rawExportInput, '--output', distDataDir, '--report', rustReport, '--scope', 'all', '--strict',
  ]);
}

writeSummary('ok');
console.log(`[rust-retirement-gate] OK ${reportPath}`);



