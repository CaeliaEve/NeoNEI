import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function u32(value) {
  const bytes = Buffer.alloc(4);
  bytes.writeUInt32LE(value, 0);
  return bytes;
}

function u64(value) {
  const bytes = Buffer.alloc(8);
  bytes.writeBigUInt64LE(BigInt(value), 0);
  return bytes;
}

function wrapNativePack(schema, payload) {
  const schemaBytes = Buffer.from(schema, 'utf8');
  return Buffer.concat([
    Buffer.from('NNEIBIN\0', 'utf8'),
    u32(1),
    u32(schemaBytes.length),
    u64(payload.length),
    schemaBytes,
    payload,
  ]);
}

function writeUiTemplatePackV3(path) {
  const payload = Buffer.concat([
    Buffer.from('NEIUIT1\0', 'utf8'),
    u32(3), // template pack version with action/itemId/payloadKey rect fields
    u32(0), // templateCount
    u32(0), // slotCount
    u32(0), // textCount
    u32(0), // hotspotCount
    u32(0), // viewportCount
    u32(19), // templateStride
    u32(6), // slotStride
    u32(5), // textStride
    u32(12), // rectStride
  ]);
  writeFileSync(path, wrapNativePack('neonei/ui-template-pack/current', payload));
}

function createDistFixture() {
  const root = mkdtempSync(join(tmpdir(), 'neonei-native-ui-gate-'));
  const rustDir = join(root, 'rust');
  const uiPackDir = join(rustDir, 'ui-pack');
  const recipeDir = join(root, 'recipes');
  mkdirSync(uiPackDir, { recursive: true });
  mkdirSync(recipeDir, { recursive: true });

  const requiredBinaryFiles = [
    'browser.bin',
    'groups.bin',
    'search.bin',
    'recipes.bin',
    'textures.bin',
    'atlas.meta.bin',
    'animations.bin',
    'strings.zh_cn.bin',
  ];
  for (const name of requiredBinaryFiles) {
    writeFileSync(join(rustDir, name), Buffer.from([0]));
  }
  writeUiTemplatePackV3(join(uiPackDir, 'ui_templates.bin'));
  writeFileSync(join(uiPackDir, 'ui_bindings.bin'), Buffer.from([0]));
  writeFileSync(join(uiPackDir, 'ui_strings.bin'), Buffer.from([0]));
  writeJson(join(uiPackDir, 'ui_assets.manifest.json'), { schemaVersion: 'neonei/ui-assets-manifest/current', assets: [] });
  writeJson(join(uiPackDir, 'ui_pack_report.json'), {
    schemaVersion: 'neonei/ui-pack-report/current',
    status: 'ready',
    summary: {
      templateCount: 1,
      bindingCount: 1,
      boundRecipeCount: 1,
      unboundRecipeCount: 0,
      hotspotCount: 0,
      viewportCount: 0,
      hotspotActionCount: 0,
      viewportActionCount: 0,
    },
    format: {
      templatePackMagic: 'NEIUIT1\\u0000',
      templatePackVersion: 3,
      templateStride: 19,
      slotStride: 6,
      textStride: 5,
      rectStride: 12,
      hotspotActionFields: true,
      hotspotActionFieldNames: ['action', 'itemId', 'payloadKey'],
    },
  });

  writeJson(join(rustDir, 'native-ui-layout-report.json'), {
    schemaVersion: 'neonei/native-ui-layout-report/current',
    status: 'ready',
    geometryStatus: 'ready',
    backgroundStatus: 'captured',
    counts: {
      handlerLayouts: 1,
      handlerLayoutsWithHotspots: 0,
      handlerLayoutsWithViewports: 0,
      gregtechHandlerLayouts: 1,
      gregtechHandlerLayoutsWithProgressBars: 1,
      recipeUiPayloads: 1,
      gregtechRecipeUiPayloads: 1,
      gregtechRecipeUiPayloadsWithBackgroundRegions: 1,
      gregtechRecipeUiPayloadsWithNativeBackgrounds: 1,
      gregtechRecipeUiPayloadsWithProgressBars: 1,
      gregtechRecipeUiPayloadsWithHotspots: 0,
      gregtechRecipeUiPayloadsWithViewports: 0,
    },
  });
  writeJson(join(recipeDir, 'handler-layout-index.json'), {
    schemaVersion: 'neonei/recipe-handler-layout-index/v1',
    layouts: [{
      handlerKey: 'gt.recipe.test',
      handlerClass: 'gregtech.nei.GTNEIDefaultHandler',
      canonicalMachineFamily: 'gregtech-machine',
      layoutKind: 'machine',
      width: 176,
      height: 90,
      maxRecipesPerPage: 1,
      nativeBackground: {
        status: 'captured',
        kind: 'gt-modular-ui',
        assetRef: 'assets/ui-backgrounds/gregtech/nei_single_recipe.png',
        resource: 'gregtech:textures/gui/background/nei_single_recipe.png',
        scaling: 'nine-slice',
        texture: { width: 64, height: 64, borderU: 2, borderV: 2 },
      },
      progressBars: [{ x: 78, y: 24, width: 20, height: 18 }],
    }],
  });
  writeJson(join(recipeDir, 'ui-payload-index.json'), {
    schemaVersion: 'neonei/recipe-ui-payload-index/v1',
    recipes: [{
      recipeId: 'gt:test',
      familyKey: 'gregtech-machine|machine|176x90@0#1|gt-modular-ui:assets/ui-backgrounds/gregtech/nei_single_recipe.png',
      handlerKey: 'gt.recipe.test',
      nativeLayout: {
        canonicalMachineFamily: 'gregtech-machine',
        imageRegion: { x: 0, y: 0, width: 176, height: 90 },
        nativeBackground: {
          status: 'captured',
          kind: 'gt-modular-ui',
          assetRef: 'assets/ui-backgrounds/gregtech/nei_single_recipe.png',
          scaling: 'nine-slice',
          texture: { width: 64, height: 64, borderU: 2, borderV: 2 },
        },
        progressBars: [{ x: 78, y: 24, width: 20, height: 18 }],
      },
    }],
  });

  const runtimeFiles = [
    'rust/browser.bin',
    'rust/groups.bin',
    'rust/search.bin',
    'rust/recipes.bin',
    'rust/textures.bin',
    'rust/atlas.meta.bin',
    'rust/animations.bin',
    'rust/strings.zh_cn.bin',
    'rust/ui-pack/ui_templates.bin',
    'rust/ui-pack/ui_bindings.bin',
    'rust/ui-pack/ui_strings.bin',
    'rust/native-ui-layout-report.json',
  ];
  writeJson(join(rustDir, 'runtime-manifest.json'), {
    schemaVersion: 'neonei/rust-runtime-manifest/current',
    files: runtimeFiles.map((path) => ({ path })),
    entrypoints: {
      browser: 'rust/browser.bin',
      groups: 'rust/groups.bin',
      search: 'rust/search.bin',
      recipes: 'rust/recipes.bin',
      textures: 'rust/textures.bin',
      animations: 'rust/animations.bin',
      stringsZhCn: 'rust/strings.zh_cn.bin',
      uiTemplates: 'rust/ui-pack/ui_templates.bin',
      uiBindings: 'rust/ui-pack/ui_bindings.bin',
      uiStrings: 'rust/ui-pack/ui_strings.bin',
    },
  });

  writeJson(join(root, 'manifest.json'), {
    schemaVersion: 'neonei/dist-data/current',
    files: {
      rustRuntimeManifest: 'rust/runtime-manifest.json',
      rustBrowserBin: 'rust/browser.bin',
      rustGroupsBin: 'rust/groups.bin',
      rustSearchBin: 'rust/search.bin',
      rustRecipeBin: 'rust/recipes.bin',
      rustTextureBin: 'rust/textures.bin',
      rustAtlasMetaBin: 'rust/atlas.meta.bin',
      rustAnimationBin: 'rust/animations.bin',
      rustStringsZhCnBin: 'rust/strings.zh_cn.bin',
      rustUiTemplatesBin: 'rust/ui-pack/ui_templates.bin',
      rustUiBindingsBin: 'rust/ui-pack/ui_bindings.bin',
      rustUiStringsBin: 'rust/ui-pack/ui_strings.bin',
      rustUiAssetsManifest: 'rust/ui-pack/ui_assets.manifest.json',
      rustUiPackReport: 'rust/ui-pack/ui_pack_report.json',
      rustNativeUiLayoutReport: 'rust/native-ui-layout-report.json',
    },
  });

  return root;
}

function runGate(script, distDataDir) {
  const result = spawnSync('node', [script, '--gate', '--dist-data', distDataDir], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, `${script} failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  return JSON.parse(result.stdout);
}

test('native UI production gates require UI template pack v3 action-rect IR', () => {
  const distDataDir = createDistFixture();
  try {
    const manifestGate = runGate('scripts/validate-rust-production-manifest.mjs', distDataDir);
    assert.equal(manifestGate.uiTemplatePack.version, 3);
    assert.equal(manifestGate.uiTemplatePack.rectStride, 12);
    assert.equal(manifestGate.uiPackReport.format.hotspotActionFields, true);

    const layoutGate = runGate('scripts/validate-native-ui-layouts.mjs', distDataDir);
    assert.equal(layoutGate.uiPack.templateHeader.version, 3);
    assert.equal(layoutGate.uiPack.templateHeader.rectStride, 12);
    assert.equal(layoutGate.report.backgroundStatus, 'captured');
    assert.equal(layoutGate.report.counts.gregtechRecipeUiPayloadsWithNativeBackgrounds, 1);
    assert.equal(layoutGate.failures.length, 0);
  } finally {
    rmSync(distDataDir, { recursive: true, force: true });
  }
});

test('native UI background contract uses materialized nine-slice ModularUI assets', () => {
  const compiler = readFileSync(join(repoRoot, 'tools/neonei-compiler-rs/src/packs/ui.rs'), 'utf8');
  const uiTemplates = readFileSync(join(repoRoot, 'tools/neonei-compiler-rs/src/ui_templates.rs'), 'utf8');
  const canvas = readFileSync(join(repoRoot, 'frontend/src/components/NativeNeiRecipeCanvas.vue'), 'utf8');
  assert.equal(compiler.includes('materialize_ui_background_assets(input, output, &assets_manifest)'), true);
  assert.equal(uiTemplates.includes('nativeBackground'), true);
  assert.equal(uiTemplates.includes('assetRef'), true);
  assert.equal(uiTemplates.includes('assets/ui-backgrounds/'), true);
  assert.equal(canvas.includes('nativeBackgroundAssetRef'), true);
  assert.equal(canvas.includes('nativeBackgroundTextureSpec'), true);
  assert.equal(canvas.includes('pushBackgroundCommands'), true);
  assert.equal(canvas.includes('nineSlice'), true);
  assert.equal(canvas.includes("backgroundSource.value.textureKey === nativeBackgroundTextureKey.value ? 'captured' : 'error'"), true);
  assert.equal(canvas.includes("if (`${nativeBackground.value?.status ?? ''}` === 'captured')"), true);
  assert.equal(canvas.includes('Semantic GT backgrounds without a captured asset may use the procedural fallback.'), true);
  assert.equal(canvas.includes('Fall through to semantic GT fallback when the raw-export did not carry the asset.'), false);
});

test('compiler extraction boundary supports external elysium-compiler binary', () => {
  const finalizer = readFileSync(join(repoRoot, 'scripts/finalize-native-ui-export.mjs'), 'utf8');
  const decouplingGate = readFileSync(join(repoRoot, 'scripts/compiler-decoupling-gate.mjs'), 'utf8');
  const runtimePaths = readFileSync(join(repoRoot, 'backend/src/config/runtime-paths.ts'), 'utf8');
  const bindingService = readFileSync(join(repoRoot, 'backend/src/services/ui-template-binding-index.service.ts'), 'utf8');
  const main = readFileSync(join(repoRoot, 'tools/neonei-compiler-rs/src/main.rs'), 'utf8');
  const lib = readFileSync(join(repoRoot, 'tools/neonei-compiler-rs/src/lib.rs'), 'utf8');
  const compilerTests = readFileSync(join(repoRoot, 'tools/neonei-compiler-rs/src/tests.rs'), 'utf8');
  const diagnostics = readFileSync(join(repoRoot, 'tools/neonei-compiler-rs/src/diagnostics.rs'), 'utf8');
  const schemas = readFileSync(join(repoRoot, 'tools/neonei-compiler-rs/src/schemas.rs'), 'utf8');
  const commands = readFileSync(join(repoRoot, 'tools/neonei-compiler-rs/src/commands.rs'), 'utf8');
  const cli = readFileSync(join(repoRoot, 'tools/neonei-compiler-rs/src/cli.rs'), 'utf8');
  const atlasRepair = readFileSync(join(repoRoot, 'tools/neonei-compiler-rs/src/atlas_repair.rs'), 'utf8');
  const binary = readFileSync(join(repoRoot, 'tools/neonei-compiler-rs/src/binary.rs'), 'utf8');
  const io = readFileSync(join(repoRoot, 'tools/neonei-compiler-rs/src/io.rs'), 'utf8');
  const jsonExt = readFileSync(join(repoRoot, 'tools/neonei-compiler-rs/src/json_ext.rs'), 'utf8');
  const manifest = readFileSync(join(repoRoot, 'tools/neonei-compiler-rs/src/manifest.rs'), 'utf8');
  const nativeUiReport = readFileSync(join(repoRoot, 'tools/neonei-compiler-rs/src/native_ui_report.rs'), 'utf8');
  const recipeUiPayload = readFileSync(join(repoRoot, 'tools/neonei-compiler-rs/src/recipe_ui_payload.rs'), 'utf8');
  const recipeDomain = readFileSync(join(repoRoot, 'tools/neonei-compiler-rs/src/recipe_domain.rs'), 'utf8');
  const rawExport = readFileSync(join(repoRoot, 'tools/neonei-compiler-rs/src/raw_export.rs'), 'utf8');
  const validation = readFileSync(join(repoRoot, 'tools/neonei-compiler-rs/src/validation.rs'), 'utf8');
  const reports = readFileSync(join(repoRoot, 'tools/neonei-compiler-rs/src/reports.rs'), 'utf8');
  const runtime = readFileSync(join(repoRoot, 'tools/neonei-compiler-rs/src/runtime.rs'), 'utf8');
  const text = readFileSync(join(repoRoot, 'tools/neonei-compiler-rs/src/text.rs'), 'utf8');
  const textureAnimation = readFileSync(join(repoRoot, 'tools/neonei-compiler-rs/src/texture_animation.rs'), 'utf8');
  const uiTemplates = readFileSync(join(repoRoot, 'tools/neonei-compiler-rs/src/ui_templates.rs'), 'utf8');
  const packsMod = readFileSync(join(repoRoot, 'tools/neonei-compiler-rs/src/packs.rs'), 'utf8');
  const searchPack = readFileSync(join(repoRoot, 'tools/neonei-compiler-rs/src/packs/search.rs'), 'utf8');
  const browserPack = readFileSync(join(repoRoot, 'tools/neonei-compiler-rs/src/packs/browser.rs'), 'utf8');
  const texturePack = readFileSync(join(repoRoot, 'tools/neonei-compiler-rs/src/packs/texture.rs'), 'utf8');
  const recipePack = readFileSync(join(repoRoot, 'tools/neonei-compiler-rs/src/packs/recipe.rs'), 'utf8');
  const uiPack = readFileSync(join(repoRoot, 'tools/neonei-compiler-rs/src/packs/ui.rs'), 'utf8');
  assert.equal(finalizer.includes("readArg('--compiler') ?? process.env.NEONEI_COMPILER_BIN"), true);
  assert.equal(finalizer.includes("mode: 'external-binary'"), true);
  assert.equal(finalizer.includes('elysium compiler strict compile'), true);
  assert.equal(finalizer.includes("mode: 'in-repo-cargo'"), true);
  assert.equal(finalizer.includes('--compiler <path>'), true);
  assert.equal(finalizer.includes('compiler: compilerCommand'), true);
  assert.equal(main.includes('use neonei_compiler::cli::Cli;'), true);
  assert.equal(main.includes('use neonei_compiler::commands::run_command;'), true);
  assert.equal(main.includes('run_command(Cli::parse())'), true);
  assert.equal(main.includes('mod baseline;'), false);
  assert.equal(main.includes('mod commands;'), false);
  assert.equal(lib.includes('mod baseline;'), false);
  assert.equal(lib.includes('mod diagnostics;'), true);
  assert.equal(lib.includes('mod schemas;'), true);
  assert.equal(lib.includes('pub mod commands;'), true);
  assert.equal(lib.includes('#[cfg(test)]'), true);
  assert.equal(lib.includes('mod tests;'), true);
  assert.equal(compilerTests.includes('minimal_native_ui_fixture_compiles_through_stable_cli_boundary'), true);
  assert.equal(compilerTests.includes('stable_cli_inspect_validate_and_schemas_cover_fixture_contracts'), true);
  assert.equal(compilerTests.includes('missing_captured_ui_background_fixture_fails_strict_compile'), true);
  assert.equal(compilerTests.includes('compiler_fixture_path("raw-export-minimal")'), true);
  assert.equal(compilerTests.includes('compiler_fixture_path("raw-export-missing-background-should-fail")'), true);
  assert.equal(compilerTests.includes('raw-export-native-ui-gt'), true);
  assert.equal(compilerTests.includes('raw-export-semantic-background-only'), true);
  assert.equal(compilerTests.includes('raw-export-sharded-recipes'), true);
  assert.equal(compilerTests.includes('raw-export-texture-atlas'), true);
  assert.equal(compilerTests.includes('rust/ui-pack/ui_template_catalog.json'), true);
  assert.equal(compilerTests.includes('rust/ui-pack/ui_template_binding_index.json'), true);
  assert.equal(compilerTests.includes('rust/ui-pack/ui_family_census.json'), true);
  assert.equal(compilerTests.includes('assert_expected_json_matches'), true);
  assert.equal(decouplingGate.includes('schemaVersion: \'neonei/compiler-decoupling-gate/v1\''), true);
  assert.equal(decouplingGate.includes('frontend/src'), true);
  assert.equal(decouplingGate.includes('backend/src'), true);
  assert.equal(decouplingGate.includes('tools[\\\\/]neonei-compiler-rs|neonei-compiler-rs'), true);
  assert.equal(decouplingGate.includes('raw-export[\\\\/]'), true);
  assert.equal(runtimePaths.includes('DIST_DATA_DIR'), true);
  assert.equal(runtimePaths.includes("'rust', 'ui-pack', 'ui_template_catalog.json'"), true);
  assert.equal(runtimePaths.includes("'rust', 'ui-pack', 'ui_template_binding_index.json'"), true);
  assert.equal(runtimePaths.includes("'rust', 'ui-pack', 'ui_family_census.json'"), true);
  assert.equal(bindingService.includes('readCompiledBindingIndex'), true);
  assert.equal(bindingService.includes('getCompiledBindingReport'), true);
  assert.equal(compilerTests.includes('write_minimal_native_ui_fixture'), false);
  assert.equal(compilerTests.includes('run_command(Cli {'), true);
  assert.equal(main.includes('use commands::run_command;'), false);
  assert.equal(main.includes('use baseline::run_baseline;'), false);
  assert.equal(main.includes('fn run_baseline('), false);
  assert.equal(commands.includes('use crate::baseline::run_baseline;'), false);
  assert.equal(diagnostics.includes('pub fn run_diagnostics_report('), true);
  assert.equal(diagnostics.includes('DiagnosticsMode::Inspect'), true);
  assert.equal(diagnostics.includes('DiagnosticsMode::Validate'), true);
  assert.equal(commands.includes('use crate::diagnostics::{run_diagnostics_report, DiagnosticsMode};'), true);
  assert.equal(commands.includes('Command::Inspect'), true);
  assert.equal(commands.includes('Command::Validate'), true);
  assert.equal(commands.includes('Command::Schemas'), true);
  assert.equal(schemas.includes('pub fn schema_catalog()'), true);
  assert.equal(schemas.includes('elysium-compiler/schema-catalog/v1'), true);
  assert.equal(commands.includes('pub fn run_command('), true);
  assert.equal(commands.includes('fn configure_threads('), true);
  assert.equal(main.includes('mod atlas_repair;'), false);
  assert.equal(lib.includes('mod atlas_repair;'), true);
  assert.equal(main.includes('use atlas_repair::select_group_representative;'), false);
  assert.equal(lib.includes('use atlas_repair::select_group_representative;'), false);
  assert.equal(compilerTests.includes('use crate::atlas_repair::select_group_representative;'), true);
  assert.equal(main.includes('fn repaired_browser_atlas('), false);
  assert.equal(main.includes('fn select_group_representative('), false);
  assert.equal(main.includes('fn atlas_drawable_score('), false);
  assert.equal(atlasRepair.includes('pub fn repaired_browser_atlas('), true);
  assert.equal(atlasRepair.includes('pub fn select_group_representative('), true);
  assert.equal(atlasRepair.includes('fn atlas_drawable_score('), true);
  assert.equal(main.includes('mod cli;'), false);
  assert.equal(lib.includes('pub mod cli;'), true);
  assert.equal(main.includes('use cli::Cli;'), false);
  assert.equal(commands.includes('use crate::cli::{Cli, Command, CompileScope};'), true);
  assert.equal(main.includes('#[derive(Parser, Debug)]'), false);
  assert.equal(cli.includes('pub struct Cli'), true);
  assert.equal(cli.includes('pub enum Command'), true);
  assert.equal(cli.includes('pub enum CompileScope'), true);
  assert.equal(cli.includes('Inspect {'), true);
  assert.equal(cli.includes('Validate {'), true);
  assert.equal(cli.includes('Schemas {'), true);
  assert.equal(cli.includes('Baseline'), false);
  assert.equal(cli.includes('impl CompileScope'), true);
  assert.equal(cli.includes('pub fn as_str'), true);
  assert.equal(cli.includes('NeoNEI/Elysium runtime data compiler'), true);
  assert.equal(main.includes('mod binary;'), false);
  assert.equal(lib.includes('mod binary;'), true);
  assert.equal(main.includes('use binary::write_binary_pack_payload;'), false);
  assert.equal(main.includes('intern_compact_string'), false);
  assert.equal(main.includes('fn write_binary_pack('), false);
  assert.equal(main.includes('fn intern_compact_string('), false);
  assert.equal(binary.includes('pub fn write_binary_pack('), true);
  assert.equal(binary.includes('pub fn write_binary_pack_payload('), true);
  assert.equal(binary.includes('pub fn push_u32('), true);
  assert.equal(binary.includes('pub fn push_i32('), true);
  assert.equal(binary.includes('pub fn intern_compact_string('), true);
  assert.equal(main.includes('mod io;'), false);
  assert.equal(lib.includes('mod io;'), true);
  assert.equal(main.includes('use io::{normalize_path, write_json_value};'), false);
  assert.equal(lib.includes('use io::{normalize_path, write_json_value};'), false);
  assert.equal(compilerTests.includes('use crate::io::{normalize_path, write_json_value};'), true);
  assert.equal(main.includes('fn sha256_file('), false);
  assert.equal(main.includes('fn write_json_value('), false);
  assert.equal(main.includes('fn normalize_path('), false);
  assert.equal(io.includes('pub fn sha256_file('), true);
  assert.equal(io.includes('pub fn write_json_value('), true);
  assert.equal(io.includes('pub fn normalize_path('), true);
  assert.equal(main.includes('mod json_ext;'), false);
  assert.equal(lib.includes('mod json_ext;'), true);
  assert.equal(main.includes('use json_ext::{'), false);
  assert.equal(lib.includes('use json_ext::{'), false);
  assert.equal(compilerTests.includes('use crate::json_ext::{'), true);
  assert.equal(main.includes('fn first_non_empty('), false);
  assert.equal(main.includes('fn nested_value_string('), false);
  assert.equal(main.includes('fn read_json_file('), false);
  assert.equal(main.includes('fn json_array('), false);
  assert.equal(main.includes('fn value_string('), false);
  assert.equal(main.includes('fn value_i64('), false);
  assert.equal(main.includes('fn value_u64('), false);
  assert.equal(main.includes('fn optional_value_string('), false);
  assert.equal(main.includes('fn optional_value_u64('), false);
  assert.equal(main.includes('fn numeric_value_u64('), false);
  assert.equal(main.includes('fn numeric_value_u64_lossy('), false);
  assert.equal(jsonExt.includes('pub fn first_non_empty('), true);
  assert.equal(jsonExt.includes('pub fn nested_value_string('), true);
  assert.equal(jsonExt.includes('pub fn read_json_file('), true);
  assert.equal(jsonExt.includes('pub fn json_array('), true);
  assert.equal(jsonExt.includes('pub fn value_string('), true);
  assert.equal(jsonExt.includes('pub fn value_i64('), true);
  assert.equal(jsonExt.includes('pub fn value_u64('), true);
  assert.equal(jsonExt.includes('pub fn optional_value_string('), true);
  assert.equal(jsonExt.includes('pub fn optional_value_u64('), true);
  assert.equal(jsonExt.includes('pub fn numeric_value_u64('), true);
  assert.equal(jsonExt.includes('pub fn numeric_value_u64_lossy('), true);
  assert.equal(main.includes('mod native_ui_report;'), false);
  assert.equal(lib.includes('mod native_ui_report;'), true);
  assert.equal(main.includes('use native_ui_report::compile_native_ui_layout_report;'), false);
  assert.equal(main.includes('compile_runtime_reports(&output, scope, strict, debug_json, captured_ui_family_key)?'), false);
  assert.equal(commands.includes('compile_runtime_reports(&output, scope, strict, debug_json, captured_ui_family_key)?'), true);
  assert.equal(main.includes('fn compile_native_ui_layout_report('), false);
  assert.equal(main.includes('fn is_gregtech_native_layout('), false);
  assert.equal(main.includes('fn is_gregtech_recipe_ui_entry('), false);
  assert.equal(main.includes('fn primitive_count('), false);
  assert.equal(main.includes('fn has_drawable_rect('), false);
  assert.equal(main.includes('fn has_image_region('), false);
  assert.equal(main.includes('fn has_native_background('), false);
  assert.equal(nativeUiReport.includes('pub type CapturedUiFamilyKeyFn'), true);
  assert.equal(nativeUiReport.includes('pub fn compile_native_ui_layout_report('), true);
  assert.equal(nativeUiReport.includes('captured_ui_family_key: CapturedUiFamilyKeyFn'), true);
  assert.equal(nativeUiReport.includes('fn is_gregtech_native_layout('), true);
  assert.equal(nativeUiReport.includes('fn has_native_background('), true);
  assert.equal(main.includes('mod manifest;'), false);
  assert.equal(lib.includes('mod manifest;'), true);
  assert.equal(main.includes('use manifest::read_manifest;'), false);
  assert.equal(diagnostics.includes('use crate::manifest::read_manifest;'), true);
  assert.equal(main.includes('struct RawManifest'), false);
  assert.equal(main.includes('fn read_manifest('), false);
  assert.equal(main.includes('fn read_json_collection('), false);
  assert.equal(main.includes('fn portable_relative_path('), false);
  assert.equal(main.includes('fn runtime_file_descriptors('), false);
  assert.equal(manifest.includes('pub struct RawManifest'), true);
  assert.equal(manifest.includes('pub fn read_manifest('), true);
  assert.equal(manifest.includes('pub fn read_manifest_json('), true);
  assert.equal(manifest.includes('pub fn read_optional_manifest_json('), true);
  assert.equal(manifest.includes('pub fn read_json_collection('), true);
  assert.equal(manifest.includes('pub fn read_jsonl_values('), true);
  assert.equal(manifest.includes('pub fn read_jsonl_file_values('), true);
  assert.equal(manifest.includes('pub fn count_jsonl_rows('), true);
  assert.equal(manifest.includes('pub fn resolve_manifest_path('), true);
  assert.equal(manifest.includes('pub fn portable_relative_path('), true);
  assert.equal(manifest.includes('pub fn runtime_file_descriptors('), true);
  assert.equal(manifest.includes('crate::io::sha256_file'), true);
  assert.equal(main.includes('mod reports;'), false);
  assert.equal(lib.includes('mod reports;'), true);
  assert.equal(main.includes('use reports::{'), false);
  assert.equal(diagnostics.includes('use crate::reports::{summarize_runtime_output, write_report, CompilerReport};'), true);
  assert.equal(main.includes('struct CompilerReport'), false);
  assert.equal(main.includes('struct RuntimeSummary'), false);
  assert.equal(main.includes('struct RawExportSummary'), false);
  assert.equal(main.includes('struct ZeroRecipeDiagnostics'), false);
  assert.equal(main.includes('fn summarize_runtime_output('), false);
  assert.equal(main.includes('fn write_report('), false);
  assert.equal(reports.includes('pub struct CompilerReport'), true);
  assert.equal(reports.includes('pub struct RuntimeSummary'), true);
  assert.equal(reports.includes('pub struct RawExportSummary'), true);
  assert.equal(reports.includes('pub struct ZeroRecipeDiagnostics'), true);
  assert.equal(reports.includes('pub fn summarize_runtime_output('), true);
  assert.equal(reports.includes('pub fn write_report('), true);
  assert.equal(main.includes('mod runtime;'), false);
  assert.equal(lib.includes('mod runtime;'), true);
  assert.equal(main.includes('use runtime::{compile_runtime_reports, purge_debug_json_artifacts};'), false);
  assert.equal(commands.includes('use crate::runtime::{compile_runtime_reports, purge_debug_json_artifacts};'), true);
  assert.equal(commands.includes('compile_runtime_reports(&output, scope, strict, debug_json, captured_ui_family_key)?'), true);
  assert.equal(main.includes('fn purge_debug_json_artifacts('), false);
  assert.equal(main.includes('fn compile_runtime_reports('), false);
  assert.equal(main.includes('fn update_dist_manifest_with_rust_runtime('), false);
  assert.equal(main.includes('fn is_text_runtime_artifact('), false);
  assert.equal(main.includes('fn rust_manifest_file_entries('), false);
  assert.equal(main.includes('fn runtime_id_from_integrity('), false);
  assert.equal(main.includes('fn rust_entrypoints_from_integrity('), false);
  assert.equal(main.includes('fn rust_capabilities('), false);
  assert.equal(runtime.includes('pub fn purge_debug_json_artifacts('), true);
  assert.equal(main.includes('mod recipe_ui_payload;'), false);
  assert.equal(lib.includes('mod recipe_ui_payload;'), true);
  assert.equal(main.includes('use recipe_ui_payload::rust_recipe_ui_payload_relative_path;'), false);
  assert.equal(lib.includes('use recipe_ui_payload::rust_recipe_ui_payload_relative_path;'), false);
  assert.equal(compilerTests.includes('use crate::recipe_ui_payload::rust_recipe_ui_payload_relative_path;'), true);
  assert.equal(main.includes('fn read_compiled_recipe_ui_payload_index('), false);
  assert.equal(main.includes('fn build_raw_recipe_ui_payload_index('), false);
  assert.equal(main.includes('fn rust_recipe_ui_payload_relative_path('), false);
  assert.equal(main.includes('fn sha1_hex_prefix('), false);
  assert.equal(main.includes('struct RecipeUiPayloadShardWriters'), false);
  assert.equal(recipeUiPayload.includes('pub fn read_compiled_recipe_ui_payload_index('), true);
  assert.equal(recipeUiPayload.includes('pub fn build_raw_recipe_ui_payload_index('), true);
  assert.equal(recipeUiPayload.includes('pub fn rust_recipe_ui_payload_relative_path('), true);
  assert.equal(recipeUiPayload.includes('pub fn sha1_hex_prefix('), true);
  assert.equal(recipeUiPayload.includes('pub struct RecipeUiPayloadShardWriters'), true);
  assert.equal(main.includes('mod recipe_domain;'), false);
  assert.equal(lib.includes('mod recipe_domain;'), true);
  assert.equal(main.includes('use recipe_domain::{'), false);
  assert.equal(lib.includes('use recipe_domain::{'), false);
  assert.equal(compilerTests.includes('use crate::recipe_domain::{'), true);
  assert.equal(main.includes('struct RecipeHandlerContext'), false);
  assert.equal(main.includes('fn public_recipe_handler('), false);
  assert.equal(main.includes('fn public_recipe_layout('), false);
  assert.equal(main.includes('fn captured_ui_family_key('), false);
  assert.equal(main.includes('fn classify_recipe_family_key('), false);
  assert.equal(main.includes('fn collect_recipe_item_ids('), false);
  assert.equal(main.includes('fn compact_fact_object('), false);
  assert.equal(recipeDomain.includes('pub struct RecipeHandlerContext'), true);
  assert.equal(recipeDomain.includes('pub fn public_recipe_handler('), true);
  assert.equal(recipeDomain.includes('pub fn public_recipe_layout('), true);
  assert.equal(recipeDomain.includes('pub fn captured_ui_family_key('), true);
  assert.equal(recipeDomain.includes('pub fn classify_recipe_family_key('), true);
  assert.equal(recipeDomain.includes('pub fn collect_recipe_item_ids('), true);
  assert.equal(recipeDomain.includes('pub fn compact_fact_object('), true);
  assert.equal(runtime.includes('pub fn is_text_runtime_artifact('), true);
  assert.equal(runtime.includes('pub fn rust_manifest_file_entries('), true);
  assert.equal(runtime.includes('pub fn runtime_id_from_integrity('), true);
  assert.equal(runtime.includes('pub fn rust_entrypoints_from_integrity('), true);
  assert.equal(runtime.includes('pub fn rust_capabilities('), true);
  assert.equal(runtime.includes('pub fn compile_runtime_reports('), true);
  assert.equal(runtime.includes('fn update_dist_manifest_with_rust_runtime('), true);
  assert.equal(runtime.includes('captured_ui_family_key: CapturedUiFamilyKeyFn'), true);
  assert.equal(runtime.includes('use crate::cli::CompileScope;'), true);
  assert.equal(runtime.includes('use crate::native_ui_report::{compile_native_ui_layout_report, CapturedUiFamilyKeyFn};'), true);
  assert.equal(main.includes('mod text;'), false);
  assert.equal(lib.includes('mod text;'), true);
  assert.equal(main.includes('use text::{build_pinyin_fields, normalize_search_terms, normalize_text};'), false);
  assert.equal(browserPack.includes('use crate::text::{build_pinyin_fields, normalize_search_terms, normalize_text};'), true);
  assert.equal(main.includes('fn normalize_text('), false);
  assert.equal(main.includes('fn normalize_search_terms'), false);
  assert.equal(main.includes('fn build_pinyin_fields('), false);
  assert.equal(text.includes('pub fn normalize_text('), true);
  assert.equal(text.includes('pub fn normalize_search_terms'), true);
  assert.equal(text.includes('pub fn build_pinyin_fields('), true);
  assert.equal(text.includes('use pinyin::ToPinyin;'), true);
  assert.equal(main.includes('mod texture_animation;'), false);
  assert.equal(lib.includes('mod texture_animation;'), true);
  assert.equal(main.includes('use texture_animation::{'), false);
  assert.equal(lib.includes('use texture_animation::{'), false);
  assert.equal(compilerTests.includes('use crate::texture_animation::{'), true);
  assert.equal(main.includes('fn expected_animated_item('), false);
  assert.equal(main.includes('fn promote_animation_facts_to_animated_atlas('), false);
  assert.equal(main.includes('fn normalize_animation_fact_timeline('), false);
  assert.equal(main.includes('fn expected_animation_reason('), false);
  assert.equal(textureAnimation.includes('pub fn expected_animated_item('), true);
  assert.equal(textureAnimation.includes('pub fn promote_animation_facts_to_animated_atlas('), true);
  assert.equal(textureAnimation.includes('fn normalize_animation_fact_timeline('), true);
  assert.equal(textureAnimation.includes('pub fn expected_animation_reason('), true);
  assert.equal(main.includes('mod ui_templates;'), false);
  assert.equal(lib.includes('mod ui_templates;'), true);
  assert.equal(main.includes('use ui_templates::{'), false);
  assert.equal(lib.includes('use ui_templates::{'), false);
  assert.equal(compilerTests.includes('use crate::ui_templates::{'), true);
  assert.equal(main.includes('fn ui_template_catalog_templates('), false);
  assert.equal(main.includes('fn build_ui_template_bindings('), false);
  assert.equal(main.includes('fn build_ui_assets_manifest('), false);
  assert.equal(main.includes('fn materialize_ui_background_assets('), false);
  assert.equal(uiTemplates.includes('pub fn ui_template_catalog_templates('), true);
  assert.equal(uiTemplates.includes('pub fn build_ui_template_bindings('), true);
  assert.equal(uiTemplates.includes('pub fn build_ui_assets_manifest('), true);
  assert.equal(uiTemplates.includes('pub fn materialize_ui_background_assets('), true);
  assert.equal(main.includes('mod packs;'), false);
  assert.equal(lib.includes('mod packs;'), true);
  assert.equal(main.includes('use packs::search::{'), false);
  assert.equal(lib.includes('use packs::search::{'), false);
  assert.equal(compilerTests.includes('use crate::packs::search::{'), true);
  assert.equal(main.includes('fn compile_search_pack('), false);
  assert.equal(main.includes('fn build_compact_search_payload_from_items('), false);
  assert.equal(main.includes('fn build_compact_string_payload_from_items('), false);
  assert.equal(packsMod.includes('pub mod search;'), true);
  assert.equal(searchPack.includes('pub fn compile_search_pack('), true);
  assert.equal(searchPack.includes('pub fn build_compact_search_payload_from_items('), true);
  assert.equal(searchPack.includes('pub fn build_compact_string_payload_from_items('), true);
  assert.equal(searchPack.includes('fn compile_recipe_pack('), false);
  assert.equal(searchPack.includes('fn compile_ui_pack('), false);
  assert.equal(searchPack.includes('fn compile_dist_browser_pack('), false);
  assert.equal(main.includes('fn compile_browser_pack('), false);
  assert.equal(main.includes('fn compile_dist_browser_pack('), false);
  assert.equal(main.includes('fn build_compact_browser_payload_from_items('), false);
  assert.equal(main.includes('fn build_compact_group_payload_from_groups('), false);
  assert.equal(packsMod.includes('pub mod browser;'), true);
  assert.equal(browserPack.includes('pub fn compile_browser_pack('), true);
  assert.equal(browserPack.includes('pub fn compile_dist_browser_pack('), true);
  assert.equal(browserPack.includes('pub fn build_compact_browser_payload_from_items('), true);
  assert.equal(browserPack.includes('pub fn build_compact_group_payload_from_groups('), true);
  assert.equal(browserPack.includes('fn compile_recipe_pack('), false);
  assert.equal(browserPack.includes('fn compile_ui_pack('), false);
  assert.equal(main.includes('fn compile_texture_pack('), false);
  assert.equal(main.includes('fn compile_dist_texture_pack('), false);
  assert.equal(main.includes('fn build_compact_texture_payload_from_atlas_items('), false);
  assert.equal(main.includes('fn build_compact_animation_payload_from_table('), false);
  assert.equal(main.includes('fn build_compact_atlas_meta_payload_from_atlas_items('), false);
  assert.equal(main.includes('fn copy_runtime_atlas_assets('), false);
  assert.equal(main.includes('fn normalize_runtime_atlas_file_path('), false);
  assert.equal(main.includes('fn normalize_timeline('), false);
  assert.equal(packsMod.includes('pub mod texture;'), true);
  assert.equal(texturePack.includes('pub fn build_compact_texture_payload_from_atlas_items('), true);
  assert.equal(texturePack.includes('pub fn build_compact_animation_payload_from_table('), true);
  assert.equal(texturePack.includes('pub fn build_compact_atlas_meta_payload_from_atlas_items('), true);
  assert.equal(texturePack.includes('pub fn compile_texture_pack('), true);
  assert.equal(texturePack.includes('pub fn compile_dist_texture_pack('), true);
  assert.equal(texturePack.includes('pub fn copy_runtime_atlas_assets('), true);
  assert.equal(texturePack.includes('pub fn normalize_runtime_atlas_file_path('), true);
  assert.equal(texturePack.includes('pub fn normalize_timeline('), true);
  assert.equal(texturePack.includes('fn compile_recipe_pack('), false);
  assert.equal(texturePack.includes('fn compile_ui_pack('), false);
  assert.equal(main.includes('fn compile_dist_recipe_pack('), false);
  assert.equal(main.includes('fn compile_recipe_pack('), false);
  assert.equal(main.includes('fn build_compact_recipe_payload_from_pack('), false);
  assert.equal(packsMod.includes('pub mod recipe;'), true);
  assert.equal(recipePack.includes('pub fn compile_recipe_pack('), true);
  assert.equal(recipePack.includes('pub fn compile_dist_recipe_pack('), true);
  assert.equal(recipePack.includes('pub fn build_compact_recipe_payload_from_pack('), true);
  assert.equal(recipePack.includes('fn compile_ui_pack('), false);
  assert.equal(main.includes('fn compile_ui_pack('), false);
  assert.equal(main.includes('fn build_compact_ui_template_payload('), false);
  assert.equal(main.includes('fn build_compact_ui_binding_payload('), false);
  assert.equal(main.includes('fn build_compact_ui_string_payload('), false);
  assert.equal(main.includes('fn push_compact_ui_rect('), false);
  assert.equal(packsMod.includes('pub mod ui;'), true);
  assert.equal(uiPack.includes('pub fn compile_ui_pack('), true);
  assert.equal(uiPack.includes('pub fn build_compact_ui_template_payload('), true);
  assert.equal(uiPack.includes('pub fn build_compact_ui_binding_payload('), true);
  assert.equal(uiPack.includes('pub fn build_compact_ui_string_payload('), true);
  assert.equal(uiPack.includes('fn push_compact_ui_rect('), true);
  assert.equal(uiPack.includes('fn compile_recipe_pack('), false);
  assert.equal(main.includes('mod raw_export;'), false);
  assert.equal(lib.includes('mod raw_export;'), true);
  assert.equal(main.includes('use raw_export::summarize_raw_export;'), false);
  assert.equal(diagnostics.includes('use crate::raw_export::summarize_raw_export;'), true);
  assert.equal(main.includes('fn summarize_raw_export('), false);
  assert.equal(main.includes('fn read_zero_recipe_diagnostics('), false);
  assert.equal(main.includes('fn zero_recipe_diagnostics_from_value('), false);
  assert.equal(main.includes('fn object_u64('), false);
  assert.equal(rawExport.includes('pub fn summarize_raw_export('), true);
  assert.equal(rawExport.includes('fn read_zero_recipe_diagnostics('), true);
  assert.equal(rawExport.includes('pub fn zero_recipe_diagnostics_from_value('), true);
  assert.equal(main.includes('mod validation;'), false);
  assert.equal(lib.includes('mod validation;'), true);
  assert.equal(main.includes('use validation::{'), false);
  assert.equal(lib.includes('use validation::{'), false);
  assert.equal(compilerTests.includes('use crate::validation::{'), true);
  assert.equal(main.includes('fn compile_semantic_validation_report('), false);
  assert.equal(main.includes('fn validate_atlas_ref('), false);
  assert.equal(main.includes('fn validate_atlas_bounds('), false);
  assert.equal(main.includes('fn validate_frame_bounds('), false);
  assert.equal(validation.includes('pub fn compile_semantic_validation_report('), true);
  assert.equal(validation.includes('pub fn validate_atlas_ref('), true);
  assert.equal(validation.includes('pub fn validate_atlas_bounds('), true);
  assert.equal(validation.includes('pub fn validate_frame_bounds('), true);
  assert.equal(rawExport.includes('use crate::manifest::{count_jsonl_rows, resolve_manifest_path, RawManifest};'), true);
});
