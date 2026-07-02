import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import {
  UI_PRIMITIVE_ROW_STRIDE_U32,
  UI_RECT_ROW_STRIDE_U32,
  UI_SLOT_ROW_STRIDE_U32,
  NATIVE_UI_EXPORT_ABI_VALIDATION_REPORT_PATH,
  NATIVE_UI_EXPORT_ABI_VALIDATION_SCHEMA_VERSION,
  NATIVE_UI_EXPORT_RAW_REPORT_SCHEMA_VERSION,
  UI_PACK_ABI_VALIDATION_REPORT_PATH,
  UI_PACK_ABI_VALIDATION_SCHEMA_VERSION,
  UI_TEMPLATE_PACK_MAGIC,
  UI_TEMPLATE_PACK_SCHEMA,
  UI_TEMPLATE_PAYLOAD_VERSION,
  UI_TEMPLATE_ROW_STRIDE_U32,
  UI_TEXT_ROW_STRIDE_U32,
  uiPackFormatCatalog,
} from './native-ui-pack-abi.mjs';

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

function writeUiTemplatePackV9(path) {
  const primitiveRow = Buffer.concat(Array.from({ length: UI_PRIMITIVE_ROW_STRIDE_U32 }, () => u32(0)));
  const payload = Buffer.concat([
    Buffer.from(UI_TEMPLATE_PACK_MAGIC, 'utf8'),
    u32(UI_TEMPLATE_PAYLOAD_VERSION), // template pack version with template dynamic primitive ABI
    u32(0), // templateCount
    u32(0), // slotCount
    u32(0), // textCount
    u32(1), // dynamicPrimitiveCount
    u32(0), // hotspotCount
    u32(0), // viewportCount
    u32(UI_TEMPLATE_ROW_STRIDE_U32), // templateStride
    u32(UI_SLOT_ROW_STRIDE_U32), // slotStride
    u32(UI_TEXT_ROW_STRIDE_U32), // textStride
    u32(UI_PRIMITIVE_ROW_STRIDE_U32), // primitiveStride
    u32(UI_RECT_ROW_STRIDE_U32), // rectStride
    primitiveRow,
  ]);
  writeFileSync(path, wrapNativePack(UI_TEMPLATE_PACK_SCHEMA, payload));
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
  writeUiTemplatePackV9(join(uiPackDir, 'ui_templates.bin'));
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
      dynamicPrimitiveCount: 1,
      hotspotCount: 0,
      viewportCount: 0,
      hotspotInteractionCount: 0,
      viewportInteractionCount: 0,
    },
    format: uiPackFormatCatalog(),
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
      recipeUiPayloads: 1,
      gregtechRecipeUiPayloads: 1,
      gregtechRecipeUiPayloadsWithBackgroundRegions: 1,
      gregtechRecipeUiPayloadsWithNativeBackgrounds: 1,
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
      coordinateSpace: 'nei_pixels',
      scaleMode: 'uniform-scale',
      anchor: 'top-left',
      nativeBackground: {
        coordinateSpace: 'nei_pixels',
        scaleMode: 'uniform-scale',
        anchor: 'top-left',
        status: 'captured',
        kind: 'gt-modular-ui',
        assetRef: 'assets/ui-backgrounds/gregtech/nei_single_recipe.png',
        resource: 'gregtech:textures/gui/background/nei_single_recipe.png',
        scaling: 'nine-slice',
        texture: { width: 64, height: 64, borderU: 2, borderV: 2 },
        recipeBackgroundOffset: { x: 3, y: 3 },
        recipeBackgroundSize: { width: 170, height: 84 },
      },
    }],
  });
  writeJson(join(rustDir, 'native-ui-export-abi-validation-report.json'), {
    schemaVersion: NATIVE_UI_EXPORT_ABI_VALIDATION_SCHEMA_VERSION,
    status: 'ok',
    rawReportSchemaVersion: NATIVE_UI_EXPORT_RAW_REPORT_SCHEMA_VERSION,
    rawReportStatus: 'ok',
    missingReport: false,
    layoutCount: 1,
    slotCount: 1,
    rectCount: 0,
    primitiveCount: 1,
    missingSurfaceCount: 0,
    slotBoundsViolationCount: 0,
    rectBoundsViolationCount: 0,
    primitiveBoundsViolationCount: 0,
    backgroundBoundsViolationCount: 0,
    coordinateContractViolationCount: 0,
    interactionContractViolationCount: 0,
    schemaViolations: [],
    pathViolations: [],
    contractViolations: [],
    policy: { legacyFallback: 'forbidden' },
  });
  writeJson(join(rustDir, 'ui-pack-abi-validation-report.json'), {
    schemaVersion: UI_PACK_ABI_VALIDATION_SCHEMA_VERSION,
    status: 'ok',
    policy: { legacyFallback: 'forbidden' },
    missingRequiredArtifacts: [],
    sectionViolations: [],
    artifacts: [],
  });
  writeJson(join(recipeDir, 'ui-payload-index.json'), {
    schemaVersion: 'neonei/recipe-ui-payload-index/v1',
    recipes: [{
      recipeId: 'gt:test',
      familyKey: 'gregtech-machine|machine|176x90@0#1|gt-modular-ui:assets/ui-backgrounds/gregtech/nei_single_recipe.png',
      handlerKey: 'gt.recipe.test',
      nativeLayout: {
        canonicalMachineFamily: 'gregtech-machine',
        width: 176,
        height: 90,
        coordinateSpace: 'nei_pixels',
        scaleMode: 'uniform-scale',
        anchor: 'top-left',
        imageRegion: { x: 0, y: 0, width: 176, height: 90 },
        nativeBackground: {
          coordinateSpace: 'nei_pixels',
          scaleMode: 'uniform-scale',
          anchor: 'top-left',
          width: 176,
          height: 90,
          status: 'captured',
          kind: 'gt-modular-ui',
          assetRef: 'assets/ui-backgrounds/gregtech/nei_single_recipe.png',
          scaling: 'nine-slice',
          texture: { width: 64, height: 64, borderU: 2, borderV: 2 },
          recipeBackgroundOffset: { x: 3, y: 3 },
          recipeBackgroundSize: { width: 170, height: 84 },
        },
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
    UI_PACK_ABI_VALIDATION_REPORT_PATH,
    NATIVE_UI_EXPORT_ABI_VALIDATION_REPORT_PATH,
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
      rustUiPackAbiValidationReport: UI_PACK_ABI_VALIDATION_REPORT_PATH,
      rustNativeUiExportAbiValidationReport: NATIVE_UI_EXPORT_ABI_VALIDATION_REPORT_PATH,
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

test('native UI production gates require UI template pack v9 template-primitive ABI', () => {
  const distDataDir = createDistFixture();
  try {
    const manifestGate = runGate('scripts/validate-rust-production-manifest.mjs', distDataDir);
    assert.equal(manifestGate.uiTemplatePack.version, UI_TEMPLATE_PAYLOAD_VERSION);
    assert.equal(manifestGate.uiTemplatePack.primitiveStride, UI_PRIMITIVE_ROW_STRIDE_U32);
    assert.equal(manifestGate.uiTemplatePack.rectStride, UI_RECT_ROW_STRIDE_U32);
    assert.equal(manifestGate.uiPackReport.format.legacyRectActionFields, false);

    const layoutGate = runGate('scripts/validate-native-ui-layouts.mjs', distDataDir);
    assert.equal(layoutGate.uiPack.templateHeader.version, UI_TEMPLATE_PAYLOAD_VERSION);
    assert.equal(layoutGate.uiPack.templateHeader.primitiveStride, UI_PRIMITIVE_ROW_STRIDE_U32);
    assert.equal(layoutGate.uiPack.templateHeader.rectStride, UI_RECT_ROW_STRIDE_U32);
    assert.equal(layoutGate.report.backgroundStatus, 'captured');
    assert.equal(layoutGate.report.counts.gregtechRecipeUiPayloadsWithNativeBackgrounds, 1);
    assert.equal(layoutGate.failures.length, 0);
  } finally {
    rmSync(distDataDir, { recursive: true, force: true });
  }
});

test('native UI background contract uses materialized nine-slice ModularUI assets', () => {
  const uiAssets = JSON.parse(readFileSync(join(repoRoot, 'tools/elysium-compiler/fixtures/expected/raw-export-native-ui-gt/rust/ui-pack/ui_assets.manifest.json'), 'utf8'));
  const layoutReport = JSON.parse(readFileSync(join(repoRoot, 'tools/elysium-compiler/fixtures/expected/raw-export-native-ui-gt/rust/native-ui-layout-report.json'), 'utf8'));
  const canvas = readFileSync(join(repoRoot, 'frontend/src/components/NativeNeiRecipeCanvas.vue'), 'utf8');
  const backgroundLoader = readFileSync(join(repoRoot, 'frontend/src/services/nativeUiBackgroundResourceLoader.ts'), 'utf8');
  const renderCommands = readFileSync(join(repoRoot, 'frontend/src/services/nativeUiRenderCommandBuilder.ts'), 'utf8');
  assert.equal(uiAssets.assets.some((asset) => asset.assetRef === 'assets/ui-backgrounds/gregtech/nei_single_recipe.png'), true);
  assert.equal(uiAssets.assets.some((asset) => asset.kind === 'template-background'), true);
  assert.equal(layoutReport.backgroundStatus, 'captured');
  assert.equal(layoutReport.counts.gregtechRecipeUiPayloadsWithNativeBackgrounds, 1);
  assert.equal(canvas.includes('nativeBackgroundAssetRef'), true);
  assert.equal(backgroundLoader.includes('nativeUiNativeBackgroundTextureSpec'), true);
  assert.equal(backgroundLoader.includes('source.textureKey === options.nativeTextureKey ? "captured" : "error"'), true);
  assert.equal(backgroundLoader.includes('if (background?.status === "captured") return emptyBackgroundResult(visibleError);'), true);
  assert.equal(backgroundLoader.includes('if (nativeUiIsSemanticGtBackground(background) && semanticTextureKey)'), true);
  assert.equal(backgroundLoader.indexOf('if (background?.status === "captured") return emptyBackgroundResult(visibleError);')
    < backgroundLoader.indexOf('if (nativeUiIsSemanticGtBackground(background) && semanticTextureKey)'), true);
  assert.equal(renderCommands.includes('pushNativeUiBackgroundCommands'), true);
  assert.equal(renderCommands.includes('nineSlice'), true);
});
test('compiler extraction boundary uses pinned external elysium-compiler binary', () => {
  const finalizer = readFileSync(join(repoRoot, 'scripts/finalize-native-ui-export.mjs'), 'utf8');
  const decouplingGate = readFileSync(join(repoRoot, 'scripts/compiler-decoupling-gate.mjs'), 'utf8');
  const extractionGate = readFileSync(join(repoRoot, 'scripts/compiler-extraction-readiness-gate.mjs'), 'utf8');
  const ensureCompiler = readFileSync(join(repoRoot, 'scripts/ensure-elysium-compiler.mjs'), 'utf8');
  const runtimePaths = readFileSync(join(repoRoot, 'backend/src/config/runtime-paths.ts'), 'utf8');
  const bindingService = readFileSync(join(repoRoot, 'backend/src/services/ui-template-binding-index.service.ts'), 'utf8');
  const lock = JSON.parse(readFileSync(join(repoRoot, 'tools/elysium-compiler/elysium-compiler.lock.json'), 'utf8'));

  assert.equal(existsSync(join(repoRoot, 'tools/neonei-compiler-rs')), false);
  assert.equal(existsSync(join(repoRoot, 'tools/elysium-compiler/bin/elysium-compiler.exe')), true);
  assert.equal(existsSync(join(repoRoot, 'tools/elysium-compiler/fixtures/raw-export-native-ui-gt/manifest.json')), true);
  assert.equal(lock.compiler, 'elysium-compiler');
  assert.equal(lock.version, '0.1.0');
  assert.equal(lock.rawExportSchemaVersion, '1.0');
  assert.equal(lock.compiledDistSchemaVersion, '1.0');
  assert.equal(lock.binary, 'tools/elysium-compiler/bin/elysium-compiler.exe');
  assert.equal(typeof lock.sha256, 'string');
  assert.equal(lock.sha256.length, 64);

  assert.equal(finalizer.includes('scripts/ensure-elysium-compiler.mjs'), true);
  assert.equal(finalizer.includes("mode: 'pinned-external-binary'"), true);
  assert.equal(finalizer.includes("mode: 'explicit-external-binary'"), true);
  assert.equal(finalizer.includes('elysium compiler strict compile'), true);
  assert.equal(finalizer.includes("'compile', '--input'"), true);
  assert.equal(finalizer.includes('Cargo.toml'), false);
  assert.equal(finalizer.includes("mode: 'in-repo-cargo'"), false);
  assert.equal(finalizer.includes('--skip-cargo-test'), false);
  assert.equal(finalizer.includes('--compiler <path>'), true);
  assert.equal(finalizer.includes('compiler: compilerCommand'), true);

  assert.equal(ensureCompiler.includes('elysium-compiler.lock.json'), true);
  assert.equal(ensureCompiler.includes('sha256'), true);
  assert.equal(ensureCompiler.includes("['schemas']"), true);
  assert.equal(ensureCompiler.includes('rawExportSchemaVersion'), true);
  assert.equal(ensureCompiler.includes('compiledDistSchemaVersion'), true);

  assert.equal(extractionGate.includes("schemaVersion: 'neonei/compiler-extraction-readiness-gate/v2'"), true);
  assert.equal(extractionGate.includes('tools\', \'elysium-compiler\', \'fixtures'), true);
  assert.equal(extractionGate.includes('scripts/ensure-elysium-compiler.mjs'), true);
  assert.equal(extractionGate.includes('finalize-native-ui-export.mjs'), true);
  assert.equal(extractionGate.includes('--compiler'), true);
  assert.equal(extractionGate.includes("'cargo'"), false);
  assert.equal(extractionGate.includes("'--release'"), false);

  assert.equal(decouplingGate.includes("schemaVersion: 'neonei/compiler-decoupling-gate/v2'"), true);
  assert.equal(decouplingGate.includes('frontend/src'), true);
  assert.equal(decouplingGate.includes('backend/src'), true);
  assert.equal(decouplingGate.includes('IN_REPO_COMPILER_SOURCE_RECREATED'), true);
  assert.equal(decouplingGate.includes('tools/neonei-compiler-rs'), true);
  assert.equal(decouplingGate.includes("code: 'RAW_EXPORT_DIRECTORY_IN_RUNTIME'"), true);

  assert.equal(runtimePaths.includes('DIST_DATA_DIR'), true);
  assert.equal(runtimePaths.includes("'rust', 'ui-pack', 'ui_template_catalog.json'"), true);
  assert.equal(runtimePaths.includes("'rust', 'ui-pack', 'ui_template_binding_index.json'"), true);
  assert.equal(runtimePaths.includes("'rust', 'ui-pack', 'ui_family_census.json'"), true);
  assert.equal(bindingService.includes('readCompiledBindingIndex'), true);
  assert.equal(bindingService.includes('getCompiledBindingReport'), true);
});
