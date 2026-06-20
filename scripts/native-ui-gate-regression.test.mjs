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
    counts: {
      handlerLayouts: 1,
      handlerLayoutsWithHotspots: 0,
      handlerLayoutsWithViewports: 0,
      gregtechHandlerLayouts: 1,
      gregtechHandlerLayoutsWithProgressBars: 1,
      recipeUiPayloads: 1,
      gregtechRecipeUiPayloads: 1,
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
      progressBars: [{ x: 78, y: 24, width: 20, height: 18 }],
    }],
  });
  writeJson(join(recipeDir, 'ui-payload-index.json'), {
    schemaVersion: 'neonei/recipe-ui-payload-index/v1',
    recipes: [{
      recipeId: 'gt:test',
      familyKey: 'gregtech-machine|machine|176x90@0#1|textures/gui/test.png',
      handlerKey: 'gt.recipe.test',
      nativeLayout: {
        canonicalMachineFamily: 'gregtech-machine',
        imageRegion: { x: 0, y: 0, width: 176, height: 90 },
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
    assert.equal(layoutGate.failures.length, 0);
  } finally {
    rmSync(distDataDir, { recursive: true, force: true });
  }
});
