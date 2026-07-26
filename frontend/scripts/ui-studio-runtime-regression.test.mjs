import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { buildUiStudioReport } from '../src/services/uiStudioRuntime.ts';

const frontendRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const readSource = (relativePath) => readFileSync(resolve(frontendRoot, relativePath), 'utf8').replace(/\r\n/g, '\n');

const serviceSource = readSource('src/services/uiStudioRuntime.ts');
const viewSource = readSource('src/views/UiStudioView.vue');
const routerSource = readSource('src/router/index.ts');
const catalogSource = readSource('src/components/recipe-display/recipeComponentCatalog.ts');
const registrySource = readSource('src/components/recipe-display/recipeComponentRegistry.ts');

test('UI Studio is exposed as an internal route backed by the UI pack runtime', () => {
  assert.match(routerSource, /path:\s*'\/ui-studio'/);
  assert.match(routerSource, /name:\s*'ui-studio'/);
  assert.match(routerSource, /UiStudioView\.vue/);
  assert.match(serviceSource, /loadUiPackRuntime/);
  assert.match(serviceSource, /buildUiStudioReport/);
  assert.match(viewSource, /配方 UI Studio \/ 适配工作台/);
});

test('UI Studio audits family coverage without loading retired native NEI screenshot indexes', () => {
  assert.match(serviceSource, /UI_PACK_REPORT_PATH/);
  assert.match(serviceSource, /UI_ASSET_MANIFEST_PATH/);
  assert.match(serviceSource, /UI_FAMILY_CENSUS_PATH/);
  assert.doesNotMatch(serviceSource, /ui_template_binding_index\.json/);
  assert.doesNotMatch(serviceSource, /NativeNeiRecipeCanvas/);
  assert.doesNotMatch(viewSource, /NativeNeiRecipeCanvas/);
  assert.match(viewSource, /不加载 NEI 背景\/整帧截图/);
});

test('UI Studio surfaces actionable hand-written UI adaptation gaps', () => {
  for (const status of ['covered', 'partial', 'unmapped-family', 'unregistered-component', 'missing-template', 'unbound']) {
    assert.match(serviceSource, new RegExp(`'${status}'`));
  }
  assert.match(serviceSource, /sampleBoundRecipeIds/);
  assert.match(serviceSource, /sampleUnboundRecipeIds/);
  assert.match(serviceSource, /resolveRecipePresentationProfileFromBinding/);
  assert.match(serviceSource, /isRegisteredRecipeComponentName/);
  assert.match(viewSource, /下一步适配流程/);
  assert.match(viewSource, /复制 familyKey 和 sample recipeId/);
});

test('recipe component catalog is a pure source of component names shared by registry and diagnostics', () => {
  assert.match(catalogSource, /REGISTERED_RECIPE_COMPONENT_NAMES/);
  assert.match(catalogSource, /isRegisteredRecipeComponentName/);
  assert.match(registrySource, /satisfies Record<RegisteredRecipeComponentName, Component>/);
  assert.match(registrySource, /isRegisteredRecipeComponentName\(componentName\)/);
});


test('UI Studio summary builder classifies covered and unbound families from runtime packs', () => {
  const template = {
    templateKey: 'ui-template/test',
    templateSignature: 'sig',
    familyKey: 'crafting-table',
    canonicalMachineFamily: 'crafting-table',
    layoutKind: 'crafting-grid',
    width: 166,
    height: 66,
    yShift: 0,
    coordinateSpace: 'nei_pixels',
    scaleMode: 'uniform-scale',
    anchor: 'top-left',
    maxRecipesPerPage: 1,
    imageResource: '',
    handlerCount: 1,
    slots: [{
      role: 'input',
      startIndex: 0,
      columns: 3,
      rows: 3,
      x: 30,
      y: 10,
      coordinateSpace: 'nei_pixels',
      anchor: 'top-left',
      slotWidth: 18,
      slotHeight: 18,
      pitchX: 18,
      pitchY: 18,
    }],
    textOverlays: [],
    dynamicPrimitives: [],
    hotspots: [],
    viewports: [],
    nativeBackground: {},
    slotCount: 1,
  };
  const runtime = {
    status: 'ready',
    manifestUrl: 'http://localhost/api/runtime/current/manifest',
    templates: [template],
    bindings: [
      {
        recipeId: 'r1',
        path: 'recipes/ui-payload-shards/00.json',
        payloadKey: 'r1',
        familyKey: 'crafting-table',
        recipeType: 'rt~minecraft~crafting',
        machineType: 'Crafting Table',
        templateKey: 'ui-template/test',
        templateSignature: 'sig',
        canonicalMachineFamily: 'crafting-table',
        layoutKind: 'crafting-grid',
        presentationSurface: 'workbench',
        layoutId: 'standard-crafting',
        rendererId: 'standard_crafting',
        bound: true,
      },
      {
        recipeId: 'r2',
        path: 'recipes/ui-payload-shards/01.json',
        payloadKey: 'r2',
        familyKey: 'unknown-family',
        recipeType: 'rt~mod~unknown',
        machineType: 'Unknown Machine',
        templateKey: '',
        templateSignature: '',
        canonicalMachineFamily: '',
        layoutKind: '',
        presentationSurface: '',
        layoutId: '',
        rendererId: '',
        bound: false,
      },
    ],
    strings: [],
    templatesByKey: new Map(),
    templatesByFamilyKey: new Map(),
    bindingsByRecipeId: new Map(),
    summary: {
      templateCount: 1,
      bindingCount: 2,
      boundRecipeCount: 1,
      unboundRecipeCount: 1,
      stringCount: 0,
      slotCount: 1,
      textOverlayCount: 0,
      dynamicPrimitiveCount: 0,
      hotspotCount: 0,
      viewportCount: 0,
      assetCount: 0,
    },
  };

  const report = buildUiStudioReport({ runtime, sampleLimit: 2 });
  assert.equal(report.summary.familyCount, 2);
  assert.equal(report.summary.coveredFamilyCount, 1);
  assert.equal(report.summary.gapFamilyCount, 1);
  assert.equal(report.policy.assetPolicy, 'web-authored-ui-only');
  assert.equal(report.families.find((row) => row.familyKey === 'crafting-table')?.status, 'covered');
  const unbound = report.families.find((row) => row.familyKey === 'unknown-family');
  assert.equal(unbound?.status, 'unbound');
  assert.deepEqual(unbound?.sampleUnboundRecipeIds, ['r2']);
});

