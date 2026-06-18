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
const rustBrowserPack = join(nodeSelfTestOutput, 'rust', 'browser.bin');
const rustSearchPack = join(nodeSelfTestOutput, 'rust', 'search.bin');
const rustRecipePack = join(nodeSelfTestOutput, 'rust', 'recipes.bin');
const rustTexturePack = join(nodeSelfTestOutput, 'rust', 'textures.bin');
const rustUiTemplatesPack = join(nodeSelfTestOutput, 'rust', 'ui-pack', 'ui_templates.bin');
const rustUiBindingsPack = join(nodeSelfTestOutput, 'rust', 'ui-pack', 'ui_bindings.bin');
const rustUiStringsPack = join(nodeSelfTestOutput, 'rust', 'ui-pack', 'ui_strings.bin');
const rustRuntimeManifest = join(nodeSelfTestOutput, 'rust', 'runtime-manifest.json');
const rustIntegrity = join(nodeSelfTestOutput, 'rust', 'integrity.json');
const rustSizeReport = join(nodeSelfTestOutput, 'rust', 'size-report.json');
const rustMissingReport = join(nodeSelfTestOutput, 'rust', 'missing-data-report.json');
const rustMigrationReadiness = join(nodeSelfTestOutput, 'rust', 'migration-readiness.json');
const rustDeploymentReport = join(nodeSelfTestOutput, 'rust', 'deployment-report.json');

const strict = process.argv.includes('--strict');
const runCargo = process.argv.includes('--run-cargo') || strict;
const cargoCommand = resolveCargoCommand();

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
  const isWindowsCmd = process.platform === 'win32' && /\.cmd$/i.test(command);
  const result = isWindowsCmd
    ? spawnSync(process.env.ComSpec ?? 'cmd.exe', ['/d', '/c', command, ...args], {
        stdio: 'ignore',
        shell: false,
      })
    : spawnSync(command, args, {
        stdio: 'ignore',
        shell: false,
      });
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

function run(command, args, options = {}) {
  console.log(`[rust-compiler-gate] ${command} ${args.join(' ')}`);
  const isWindowsCmd = process.platform === 'win32' && /\.cmd$/i.test(command);
  const result = isWindowsCmd
    ? spawnSync(process.env.ComSpec ?? 'cmd.exe', ['/d', '/c', command, ...args], {
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
    cargoAvailable: commandExists(cargoCommand),
    cargoCommand,
    note: 'Use --run-cargo or --strict to execute the Rust compiler when Cargo is installed.',
  }, null, 2));
  process.exit(0);
}

if (!commandExists(cargoCommand)) {
  fail('cargo is not available; install Rust toolchain or run without --run-cargo for scaffold-only validation');
}

rmSync(tmpRoot, { recursive: true, force: true });
mkdirSync(tmpRoot, { recursive: true });

run(cargoCommand, ['test', '--manifest-path', cargoToml]);

// Reuse the existing Node compiler self-test to generate a complete Raw Export fixture.
run(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'test:raw-export'], { cwd: join(repoRoot, 'frontend') });

if (!existsSync(rawExportSelfTest)) fail(`Node self-test raw export was not generated: ${rawExportSelfTest}`);
run(cargoCommand, [
  'run', '--manifest-path', cargoToml, '--',
  'baseline', '--input', rawExportSelfTest, '--report', rustReport, '--strict',
]);
run(cargoCommand, [
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
const runtimeManifest = readJson(rustRuntimeManifest);
const integrity = readJson(rustIntegrity);
const sizeReport = readJson(rustSizeReport);
const missingReport = readJson(rustMissingReport);
const migrationReadiness = readJson(rustMigrationReadiness);
const deploymentReport = readJson(rustDeploymentReport);
if (runtimeManifest?.schema !== 'neonei/runtime/current') fail(`rust runtime manifest has wrong schema: ${runtimeManifest?.schema}`);
if (!Number.isInteger(runtimeManifest?.schemaRevision) || runtimeManifest.schemaRevision < 1) fail('rust runtime manifest is missing schemaRevision');
if (!/^rust-[a-f0-9]{16}$/.test(`${runtimeManifest?.runtimeId ?? ''}`)) fail(`rust runtime manifest has invalid runtimeId: ${runtimeManifest?.runtimeId}`);
for (const capability of ['atlas.static', 'atlas.animated', 'groups.collapse', 'groups.semantic-nbt', 'recipes.lookup', 'recipes.ui-pack', 'search.zh-cn', 'strings.zh-cn', 'native-render.webgl2']) {
  if (!(runtimeManifest?.capabilities ?? []).includes(capability)) fail(`rust runtime manifest is missing capability: ${capability}`);
}
compareCounts({
  nodeCounts: nodeValidation?.counts ?? {},
  rustRawCounts: compileReport?.raw_export?.file_counts ?? {},
  rustRuntimeCounts: compileReport?.runtime?.counts ?? {},
});
const runtimeCounts = compileReport?.runtime?.counts ?? {};
assertEqual(runtimeCounts.items, nodeValidation?.counts?.items, 'rust runtime items');
assertEqual(runtimeCounts.groups, nodeValidation?.counts?.groups, 'rust runtime groups');
assertEqual(runtimeCounts.neiOrderEntries, nodeValidation?.counts?.neiOrderEntries, 'rust runtime orderedItems');
assertEqual(runtimeCounts.browserAtlasItems, nodeValidation?.counts?.browserAtlasItems, 'rust runtime atlasItems');
assertEqual(runtimeCounts.recipes, nodeValidation?.counts?.recipes, 'rust runtime recipes');
assertEqual(runtimeCounts.neiHandlers, nodeValidation?.counts?.neiHandlers, 'rust runtime handlers');
assertEqual(runtimeCounts.recipeItemIndexItems, nodeValidation?.counts?.recipeItemIndexItems, 'rust runtime recipe item index');
assertEqual(runtimeCounts.animatedBrowserAtlasItems, 2, 'rust runtime animatedBrowserAtlasItems');
assertEqual(runtimeCounts.animations, nodeValidation?.counts?.animations, 'rust runtime animations');
assertEqual(runtimeCounts.nativeSprites, nodeValidation?.counts?.nativeSprites, 'rust runtime nativeSprites');
assertEqual(runtimeCounts.textures, nodeValidation?.counts?.textures, 'rust runtime textures');
for (const requiredPath of [
  'rust/browser.bin',
  'rust/search.bin',
  'rust/recipes.bin',
  'rust/textures.bin',
  'rust/animations.bin',
  'rust/groups.bin',
  'rust/strings.zh_cn.bin',
  'rust/ui-pack/ui_templates.bin',
  'rust/ui-pack/ui_bindings.bin',
  'rust/ui-pack/ui_strings.bin',
  'rust/ui-pack/ui_assets.manifest.json',
  'rust/ui-pack/ui_pack_report.json',
]) {
  requireFile(join(nodeSelfTestOutput, requiredPath));
  const manifestHasPath = (runtimeManifest?.files ?? []).some((entry) => entry.path === requiredPath);
  if (!manifestHasPath) fail(`rust runtime manifest is missing ${requiredPath}`);
  if (!integrity?.files?.[requiredPath]) fail(`rust integrity report is missing ${requiredPath}`);
  if (!Number.isFinite(sizeReport?.files?.[requiredPath])) fail(`rust size report is missing ${requiredPath}`);
}
for (const retiredDebugPath of ['rust/browser-pack.json', 'rust/search-pack.json', 'rust/recipe-pack.json', 'rust/texture-pack.json']) {
  if ((runtimeManifest?.files ?? []).some((entry) => entry.path === retiredDebugPath)) {
    fail(`rust runtime manifest still exposes retired debug pack: ${retiredDebugPath}`);
  }
}
for (const [entrypoint, expectedPath] of Object.entries({
  uiTemplates: 'rust/ui-pack/ui_templates.bin',
  uiBindings: 'rust/ui-pack/ui_bindings.bin',
  uiStrings: 'rust/ui-pack/ui_strings.bin',
})) {
  if (runtimeManifest?.entrypoints?.[entrypoint] !== expectedPath) {
    fail(`rust runtime manifest is missing ${entrypoint} UI entrypoint`);
  }
}
const uiPackReport = readJson(join(nodeSelfTestOutput, 'rust', 'ui-pack', 'ui_pack_report.json'));
if (uiPackReport?.status !== 'ready') fail(`ui pack report is not ready: ${JSON.stringify(uiPackReport)}`);
assertEqual(uiPackReport?.summary?.templateCount, 1, 'ui pack template count');
assertEqual(uiPackReport?.summary?.boundRecipeCount, 1, 'ui pack bound recipe count');
if ((missingReport?.missingFiles ?? []).length !== 0) fail(`rust missing data report has missing files: ${JSON.stringify(missingReport.missingFiles)}`);
if (migrationReadiness?.ready !== true) fail(`rust migration readiness is not ready: ${JSON.stringify(migrationReadiness)}`);
if (deploymentReport?.schemaVersion !== 'neonei/rust-deployment-report/current') fail('rust deployment report has wrong schemaVersion');
assertEqual(deploymentReport?.runtimeId, runtimeManifest?.runtimeId, 'rust deployment report runtimeId');
assertEqual(deploymentReport?.runtimeSize?.totalBytes, sizeReport?.totalBytes, 'rust deployment report totalBytes');
assertEqual(deploymentReport?.missingData?.missingFileCount, 0, 'rust deployment report missingFileCount');
for (const capability of ['atlas.static', 'atlas.animated', 'groups.collapse', 'recipes.lookup', 'strings.zh-cn']) {
  if (!(deploymentReport?.schema?.capabilities ?? []).includes(capability)) fail(`rust deployment report is missing capability: ${capability}`);
}
const runtimeManifestText = JSON.stringify(runtimeManifest);
const windowsPathSeparator = String.fromCharCode(92);
const windowsDrivePathPrefixes = ['C', 'E'].map((drive) => `${drive}:${windowsPathSeparator}`);
const windowsUncPathPrefix = windowsPathSeparator.repeat(2);
if (
  runtimeManifestText.includes('file://') ||
  windowsDrivePathPrefixes.some((prefix) => runtimeManifestText.includes(prefix)) ||
  runtimeManifestText.includes(windowsUncPathPrefix)
) {
  fail('rust runtime manifest leaked an absolute Windows/file path');
}

writeFileSync(join(tmpRoot, 'gate-summary.json'), JSON.stringify({
  schemaVersion: 'neonei/rust-compiler-gate/current',
  status: 'ok',
  report: rustReport.replaceAll('\\', '/'),
  compileReport: rustCompileReport.replaceAll('\\', '/'),
  browserPack: rustBrowserPack.replaceAll('\\', '/'),
  searchPack: rustSearchPack.replaceAll('\\', '/'),
  recipePack: rustRecipePack.replaceAll('\\', '/'),
  texturePack: rustTexturePack.replaceAll('\\', '/'),
  uiTemplatesPack: rustUiTemplatesPack.replaceAll('\\', '/'),
  uiBindingsPack: rustUiBindingsPack.replaceAll('\\', '/'),
  uiStringsPack: rustUiStringsPack.replaceAll('\\', '/'),
  runtimeManifest: rustRuntimeManifest.replaceAll('\\', '/'),
  deploymentReport: rustDeploymentReport.replaceAll('\\', '/'),
  nodeSelfTestOutput: nodeSelfTestOutput.replaceAll('\\', '/'),
}, null, 2));

console.log('[rust-compiler-gate] OK');
