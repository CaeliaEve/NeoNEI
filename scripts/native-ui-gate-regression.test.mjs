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
  const compiler = readFileSync(join(repoRoot, 'tools/neonei-compiler-rs/src/main.rs'), 'utf8');
  const canvas = readFileSync(join(repoRoot, 'frontend/src/components/NativeNeiRecipeCanvas.vue'), 'utf8');
  assert.equal(compiler.includes('materialize_ui_background_assets(input, output, &assets_manifest)'), true);
  assert.equal(compiler.includes('nativeBackground'), true);
  assert.equal(compiler.includes('assetRef'), true);
  assert.equal(compiler.includes('assets/ui-backgrounds/'), true);
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
  const main = readFileSync(join(repoRoot, 'tools/neonei-compiler-rs/src/main.rs'), 'utf8');
  const cli = readFileSync(join(repoRoot, 'tools/neonei-compiler-rs/src/cli.rs'), 'utf8');
  const binary = readFileSync(join(repoRoot, 'tools/neonei-compiler-rs/src/binary.rs'), 'utf8');
  const io = readFileSync(join(repoRoot, 'tools/neonei-compiler-rs/src/io.rs'), 'utf8');
  const jsonExt = readFileSync(join(repoRoot, 'tools/neonei-compiler-rs/src/json_ext.rs'), 'utf8');
  const manifest = readFileSync(join(repoRoot, 'tools/neonei-compiler-rs/src/manifest.rs'), 'utf8');
  const nativeUiReport = readFileSync(join(repoRoot, 'tools/neonei-compiler-rs/src/native_ui_report.rs'), 'utf8');
  const rawExport = readFileSync(join(repoRoot, 'tools/neonei-compiler-rs/src/raw_export.rs'), 'utf8');
  const reports = readFileSync(join(repoRoot, 'tools/neonei-compiler-rs/src/reports.rs'), 'utf8');
  const runtime = readFileSync(join(repoRoot, 'tools/neonei-compiler-rs/src/runtime.rs'), 'utf8');
  assert.equal(finalizer.includes("readArg('--compiler') ?? process.env.NEONEI_COMPILER_BIN"), true);
  assert.equal(finalizer.includes("mode: 'external-binary'"), true);
  assert.equal(finalizer.includes('elysium compiler strict compile'), true);
  assert.equal(finalizer.includes("mode: 'in-repo-cargo'"), true);
  assert.equal(finalizer.includes('--compiler <path>'), true);
  assert.equal(finalizer.includes('compiler: compilerCommand'), true);
  assert.equal(main.includes('mod cli;'), true);
  assert.equal(main.includes('use cli::{Cli, Command, CompileScope};'), true);
  assert.equal(main.includes('#[derive(Parser, Debug)]'), false);
  assert.equal(cli.includes('pub struct Cli'), true);
  assert.equal(cli.includes('pub enum Command'), true);
  assert.equal(cli.includes('pub enum CompileScope'), true);
  assert.equal(cli.includes('impl CompileScope'), true);
  assert.equal(cli.includes('pub fn as_str'), true);
  assert.equal(cli.includes('NeoNEI/Elysium runtime data compiler'), true);
  assert.equal(main.includes('mod binary;'), true);
  assert.equal(main.includes('use binary::{push_i32, push_u32, write_binary_pack, write_binary_pack_payload};'), true);
  assert.equal(main.includes('fn write_binary_pack('), false);
  assert.equal(binary.includes('pub fn write_binary_pack('), true);
  assert.equal(binary.includes('pub fn write_binary_pack_payload('), true);
  assert.equal(binary.includes('pub fn push_u32('), true);
  assert.equal(binary.includes('pub fn push_i32('), true);
  assert.equal(main.includes('mod io;'), true);
  assert.equal(main.includes('use io::{normalize_path, sha256_file, write_json_value};'), true);
  assert.equal(main.includes('fn sha256_file('), false);
  assert.equal(main.includes('fn write_json_value('), false);
  assert.equal(main.includes('fn normalize_path('), false);
  assert.equal(io.includes('pub fn sha256_file('), true);
  assert.equal(io.includes('pub fn write_json_value('), true);
  assert.equal(io.includes('pub fn normalize_path('), true);
  assert.equal(main.includes('mod json_ext;'), true);
  assert.equal(main.includes('use json_ext::{'), true);
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
  assert.equal(main.includes('mod native_ui_report;'), true);
  assert.equal(main.includes('use native_ui_report::compile_native_ui_layout_report;'), false);
  assert.equal(main.includes('compile_runtime_reports(&output, scope, strict, debug_json, captured_ui_family_key)?'), true);
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
  assert.equal(main.includes('mod manifest;'), true);
  assert.equal(main.includes('use manifest::{'), true);
  assert.equal(main.includes('struct RawManifest'), false);
  assert.equal(main.includes('fn read_manifest('), false);
  assert.equal(main.includes('fn read_json_collection('), false);
  assert.equal(main.includes('fn portable_relative_path('), false);
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
  assert.equal(main.includes('mod reports;'), true);
  assert.equal(main.includes('use reports::{'), true);
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
  assert.equal(main.includes('mod runtime;'), true);
  assert.equal(main.includes('use runtime::compile_runtime_reports;'), true);
  assert.equal(main.includes('compile_runtime_reports(&output, scope, strict, debug_json, captured_ui_family_key)?'), true);
  assert.equal(main.includes('fn compile_runtime_reports('), false);
  assert.equal(main.includes('fn update_dist_manifest_with_rust_runtime('), false);
  assert.equal(main.includes('fn is_text_runtime_artifact('), false);
  assert.equal(main.includes('fn rust_manifest_file_entries('), false);
  assert.equal(main.includes('fn runtime_id_from_integrity('), false);
  assert.equal(main.includes('fn rust_entrypoints_from_integrity('), false);
  assert.equal(main.includes('fn rust_capabilities('), false);
  assert.equal(main.includes('sha1_hex_prefix('), true);
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
  assert.equal(main.includes('mod raw_export;'), true);
  assert.equal(main.includes('use raw_export::summarize_raw_export;'), true);
  assert.equal(main.includes('fn summarize_raw_export('), false);
  assert.equal(main.includes('fn read_zero_recipe_diagnostics('), false);
  assert.equal(main.includes('fn zero_recipe_diagnostics_from_value('), false);
  assert.equal(main.includes('fn object_u64('), false);
  assert.equal(rawExport.includes('pub fn summarize_raw_export('), true);
  assert.equal(rawExport.includes('fn read_zero_recipe_diagnostics('), true);
  assert.equal(rawExport.includes('pub fn zero_recipe_diagnostics_from_value('), true);
  assert.equal(rawExport.includes('use crate::manifest::{count_jsonl_rows, resolve_manifest_path, RawManifest};'), true);
});
