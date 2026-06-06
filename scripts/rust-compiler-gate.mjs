import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const crateDir = join(repoRoot, 'tools', 'neonei-compiler-rs');
const cargoToml = join(crateDir, 'Cargo.toml');
const mainRs = join(crateDir, 'src', 'main.rs');
const tmpRoot = join(repoRoot, '.tmp-runtime', 'rust-compiler-gate');
const rawExportSelfTest = join(repoRoot, '.tmp-runtime', 'raw-export-self-test');
const nodeSelfTestOutput = join(repoRoot, '.tmp-runtime', 'dist-data-v3-self-test');
const rustReport = join(tmpRoot, 'rust-baseline.json');
const rustCompileReport = join(tmpRoot, 'rust-compile-report.json');

const strict = process.argv.includes('--strict');
const runCargo = process.argv.includes('--run-cargo') || strict;

function fail(message) {
  console.error(`[rust-compiler-gate] ${message}`);
  process.exit(1);
}

function read(path) {
  return readFileSync(path, 'utf8');
}

function requireFile(path) {
  if (!existsSync(path)) fail(`missing required file: ${path}`);
}

function commandExists(command, args = ['--version']) {
  const result = spawnSync(command, args, { stdio: 'ignore', shell: false });
  return (result.status ?? 1) === 0;
}

function run(command, args, options = {}) {
  console.log(`[rust-compiler-gate] ${command} ${args.join(' ')}`);
  const result = process.platform === 'win32' && /\.cmd$/i.test(command)
    ? spawnSync('cmd.exe', ['/d', '/s', '/c', command, ...args], {
        cwd: options.cwd ?? repoRoot,
        stdio: 'inherit',
        shell: false,
      })
    : spawnSync(command, args, {
        cwd: options.cwd ?? repoRoot,
        stdio: 'inherit',
        shell: false,
      });
  if ((result.status ?? 1) !== 0) {
    fail(`${command} ${args.join(' ')} failed with exit code ${result.status ?? 1}`);
  }
}

function assertIncludes(text, needle, label) {
  if (!text.includes(needle)) fail(`${label} does not include ${needle}`);
}

function readJson(path) {
  return JSON.parse(read(path));
}

function assertEqual(left, right, label) {
  if (left !== right) fail(`${label} mismatch: ${left} !== ${right}`);
}

function compareCounts({ nodeCounts, rustRawCounts, rustRuntimeCounts }) {
  const rawCountPairs = [
    ['items', 'items'],
    ['fluids', 'fluids'],
    ['groups', 'groups'],
    ['neiOrderEntries', 'neiOrder'],
    ['textures', 'textures'],
    ['animations', 'animations'],
    ['nativeSprites', 'nativeSprites'],
    ['renderedGifs', 'renderedGifs'],
    ['renderTextureSprites', 'renderTextureSprites'],
    ['renderItemRenderers', 'renderItemRenderers'],
    ['renderShaderItems', 'renderShaderItems'],
    ['renderFramebufferCaptures', 'renderFramebufferCaptures'],
    ['entities', 'entities'],
  ];
  for (const [nodeKey, rustKey] of rawCountPairs) {
    assertEqual(nodeCounts[nodeKey], rustRawCounts[rustKey], `raw count ${nodeKey}/${rustKey}`);
  }

  const runtimeCountKeys = [
    'items',
    'fluids',
    'recipes',
    'groups',
    'browserAtlasItems',
    'animatedBrowserAtlasItems',
    'recipeItemIndexItems',
    'recipeUiPayloads',
    'recipeFragmentationDisplaySplits',
    'recipeFragmentationHandlerSplits',
    'browserContractCountMismatches',
    'semanticRepresentativeMissingAtlas',
    'semanticMemberMissingAtlas',
    'staticWhenExpectedAnimated',
  ];
  for (const key of runtimeCountKeys) {
    assertEqual(nodeCounts[key], rustRuntimeCounts[key], `runtime count ${key}`);
  }
}

requireFile(cargoToml);
requireFile(mainRs);
const cargoText = read(cargoToml);
const mainText = read(mainRs);
assertIncludes(cargoText, 'name = "neonei-compiler"', 'Cargo.toml');
assertIncludes(cargoText, 'serde_json', 'Cargo.toml');
assertIncludes(cargoText, 'flate2', 'Cargo.toml');
assertIncludes(mainText, 'enum Command', 'main.rs');
assertIncludes(mainText, 'Baseline', 'main.rs');
assertIncludes(mainText, 'Compile', 'main.rs');
assertIncludes(mainText, 'count_jsonl_rows', 'main.rs');
assertIncludes(mainText, 'summarize_runtime_output', 'main.rs');

if (!runCargo) {
  console.log(JSON.stringify({
    schemaVersion: 'neonei/rust-compiler-gate/current',
    status: 'scaffold-ok',
    cargoAvailable: commandExists('cargo'),
    note: 'Use --run-cargo or --strict to execute the Rust compiler when Cargo is installed.',
  }, null, 2));
  process.exit(0);
}

if (!commandExists('cargo')) {
  fail('cargo is not available; install Rust toolchain or run without --run-cargo for scaffold-only validation');
}

rmSync(tmpRoot, { recursive: true, force: true });
mkdirSync(tmpRoot, { recursive: true });

run('cargo', ['test', '--manifest-path', cargoToml]);

// Reuse the existing Node compiler self-test to generate a complete Raw Export fixture.
run(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'test:raw-export'], { cwd: join(repoRoot, 'frontend') });

if (!existsSync(rawExportSelfTest)) fail(`Node self-test raw export was not generated: ${rawExportSelfTest}`);
run('cargo', [
  'run', '--manifest-path', cargoToml, '--',
  'baseline', '--input', rawExportSelfTest, '--report', rustReport, '--strict',
]);
run('cargo', [
  'run', '--manifest-path', cargoToml, '--',
  'compile', '--input', rawExportSelfTest, '--output', nodeSelfTestOutput, '--report', rustCompileReport, '--strict',
]);

const report = readJson(rustReport);
const counts = report?.raw_export?.file_counts ?? {};
if (counts.items !== 3 || counts.fluids !== 1 || counts.groups !== 1 || counts.neiOrder !== 3) {
  fail(`unexpected Rust baseline counts: ${JSON.stringify(counts)}`);
}
if ((report?.blocked ?? []).length > 0) {
  fail(`Rust baseline reported blockers: ${JSON.stringify(report.blocked)}`);
}
const compileReport = readJson(rustCompileReport);
const nodeValidation = readJson(join(nodeSelfTestOutput, 'validation', 'report.json'));
compareCounts({
  nodeCounts: nodeValidation?.counts ?? {},
  rustRawCounts: compileReport?.raw_export?.file_counts ?? {},
  rustRuntimeCounts: compileReport?.runtime?.counts ?? {},
});

writeFileSync(join(tmpRoot, 'gate-summary.json'), JSON.stringify({
  schemaVersion: 'neonei/rust-compiler-gate/current',
  status: 'ok',
  report: rustReport.replaceAll('\\', '/'),
  compileReport: rustCompileReport.replaceAll('\\', '/'),
  nodeSelfTestOutput: nodeSelfTestOutput.replaceAll('\\', '/'),
}, null, 2));

console.log('[rust-compiler-gate] OK');

