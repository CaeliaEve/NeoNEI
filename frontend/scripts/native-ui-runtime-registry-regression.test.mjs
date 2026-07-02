import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildNativeUiSlotCells,
  collectNativeUiDynamicPrimitives,
  createNativeUiFitMatrix,
  normalizeNativeUiLayoutSurface,
  resolveNativeUiRuntimeSurface,
} from '../src/services/nativeUiRuntimeRegistry.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const frontendRoot = resolve(__dirname, '..');

function gtBackground(overrides = {}) {
  return {
    kind: 'gt-modular-ui',
    status: 'captured',
    coordinateSpace: 'nei_pixels',
    scaleMode: 'uniform-scale',
    anchor: 'top-left',
    width: 176,
    height: 90,
    yShift: 0,
    assetRef: 'rust/ui-assets/gt_furnace_captured.png',
    resource: 'gregtech:textures/gui/background/nei_single_recipe.png',
    source: 'GTNEIDefaultHandler.drawUI(ModularWindow.getBackground)',
    drawable: 'GTUITextures.BACKGROUND_NEI_SINGLE_RECIPE',
    scaling: 'nine-slice',
    texture: { width: 64, height: 64, borderU: 2, borderV: 2 },
    recipeBackgroundOffset: { x: 3, y: 3 },
    recipeBackgroundSize: { width: 170, height: 84 },
    ...overrides,
  };
}


function noInteraction() {
  return {
    interactionKind: 'none',
    interactionTargetKind: 'none',
    interactionTargetId: '',
    interactionPayloadSchema: 'neonei/native-ui-interaction/v1',
  };
}

function itemClickInteraction(itemId) {
  return {
    interactionKind: 'item-click',
    interactionTargetKind: 'item',
    interactionTargetId: itemId,
    interactionPayloadSchema: 'neonei/native-ui-interaction/v1',
  };
}

function runtimeFixture(template, binding) {
  return {
    status: 'ready',
    manifestUrl: 'http://localhost/api/runtime/current/manifest',
    templates: [template],
    bindings: [binding],
    strings: [],
    templatesByKey: new Map([[template.templateKey, template]]),
    templatesByFamilyKey: new Map([[template.familyKey, template]]),
    bindingsByRecipeId: new Map([[binding.recipeId, binding]]),
    summary: {
      templateCount: 1,
      bindingCount: 1,
      boundRecipeCount: 1,
      unboundRecipeCount: 0,
      stringCount: 0,
      slotCount: template.slots.length,
      textOverlayCount: template.textOverlays.length,
      dynamicPrimitiveCount: template.dynamicPrimitives?.length ?? 0,
      hotspotCount: template.hotspots.length,
      viewportCount: template.viewports.length,
      assetCount: 1,
    },
  };
}

test('native UI registry resolves UI-pack template authority with template dynamic primitives', () => {
  const template = {
    templateKey: 'gt-furnace@default',
    templateSignature: 'sig-template',
    familyKey: 'gt-furnace',
    canonicalMachineFamily: 'gt-furnace',
    layoutKind: 'gt-modular-ui',
    width: 176,
    height: 90,
    yShift: 0,
    coordinateSpace: 'nei_pixels',
    scaleMode: 'uniform-scale',
    anchor: 'top-left',
    maxRecipesPerPage: 1,
    imageResource: 'rust/ui-assets/gt_furnace.png',
    handlerCount: 1,
    slotCount: 1,
    nativeBackground: gtBackground({ assetRef: 'rust/ui-assets/template_background.png' }),
    slots: [{
      role: 'item-input',
      startIndex: 0,
      columns: 2,
      rows: 1,
      x: 45,
      y: 24,
      coordinateSpace: 'nei_pixels',
      anchor: 'top-left',
      slotWidth: 20,
      slotHeight: 18,
      pitchX: 24,
      pitchY: 18,
    }],
    textOverlays: [{ text: 'EU/t', x: 80, y: 10, width: 24, height: 8, coordinateSpace: 'nei_pixels', anchor: 'top-left' }],
    dynamicPrimitives: [{ kind: 'progress-bar', role: 'template-progress', x: 78, y: 24, width: 20, height: 18, coordinateSpace: 'nei_pixels', anchor: 'top-left', orientation: 'horizontal', source: 'template-pack-v9', trackColor: '', fillColor: '', borderColor: '' }],
    hotspots: [{ id: 'template-hotspot', kind: 'info', role: 'nei-info', label: 'Template', tooltip: '', ...noInteraction(), x: 1, y: 2, width: 3, height: 4, coordinateSpace: 'nei_pixels', anchor: 'top-left' }],
    viewports: [{ id: 'template-viewport', kind: 'viewport', role: 'progress', label: 'Progress', tooltip: '', ...noInteraction(), x: 70, y: 30, width: 22, height: 16, coordinateSpace: 'nei_pixels', anchor: 'top-left' }],
  };
  const binding = {
    recipeId: 'recipe-1',
    path: 'recipes/ui-payload-shards/1.json',
    payloadKey: 'recipe-1',
    familyKey: 'gt-furnace',
    recipeType: 'gt.recipe',
    machineType: 'Furnace',
    templateKey: 'gt-furnace@default',
    templateSignature: 'sig-template',
    canonicalMachineFamily: 'gt-furnace',
    layoutKind: 'gt-modular-ui',
    bound: true,
  };
  const inlineLayout = normalizeNativeUiLayoutSurface({
    coordinateSpace: 'nei_pixels',
    scaleMode: 'uniform-scale',
    anchor: 'top-left',
    imageRegion: { x: 8, y: 9, width: 176, height: 90 },
    nativeBackground: gtBackground({ assetRef: 'rust/ui-assets/inline_background_should_not_win.png' }),
    dynamicPrimitives: [{ kind: 'progress-bar', role: 'inline-progress-should-not-win', x: 72, y: 34, width: 24, height: 16, coordinateSpace: 'nei_pixels', anchor: 'top-left', fill: 0.5 }],
    hotspots: [{ id: 'inline-hotspot', kind: 'item-click', role: 'output', label: 'Output', tooltip: '', ...itemClickInteraction('minecraft:iron_ingot'), x: 115, y: 24, width: 18, height: 18, coordinateSpace: 'nei_pixels', anchor: 'top-left' }],
  });

  const surface = resolveNativeUiRuntimeSurface({
    runtime: runtimeFixture(template, binding),
    recipeId: 'recipe-1',
    inlineLayout,
  });

  assert.equal(surface.source, 'ui-pack-template');
  assert.equal(surface.width, 176);
  assert.equal(surface.height, 90);
  assert.equal(surface.layout?.imageResource, 'rust/ui-assets/gt_furnace.png');
  assert.deepEqual(surface.layout?.imageRegion, { x: 8, y: 9, width: 176, height: 90 });
  assert.equal(surface.layout?.nativeBackground?.assetRef, 'rust/ui-assets/template_background.png');
  assert.equal(surface.slots.length, 1);
  assert.equal(surface.textOverlays[0]?.text, 'EU/t');
  assert.equal(surface.hotspots[0]?.id, 'template-hotspot');
  assert.equal(surface.viewports[0]?.id, 'template-viewport');
  assert.equal(surface.dynamicPrimitives.length, 1);
  assert.equal(surface.dynamicPrimitives[0]?.kind, 'progress-bar');
  assert.equal(surface.dynamicPrimitives[0]?.role, 'template-progress');
  assert.equal(surface.dynamicPrimitives[0]?.coordinateSpace, 'nei_pixels');
  assert.equal(surface.hotspots[0]?.coordinateSpace, 'nei_pixels');
  assert.equal(surface.textOverlays[0]?.anchor, 'top-left');
});

test('native UI registry requires UI-pack template authority and keeps missing layouts explicit', () => {
  const inline = resolveNativeUiRuntimeSurface({
    runtime: null,
    recipeId: 'recipe-inline',
    inlineLayout: normalizeNativeUiLayoutSurface({
      width: 80,
      height: 40,
      coordinateSpace: 'nei_pixels',
      scaleMode: 'uniform-scale',
      anchor: 'top-left',
      slots: [{
        role: 'item-output',
        startIndex: 0,
        columns: 1,
        rows: 1,
        x: 3,
        y: 4,
        coordinateSpace: 'nei_pixels',
        anchor: 'top-left',
        slotWidth: 18,
        slotHeight: 18,
        pitchX: 18,
        pitchY: 18,
      }],
    }),
  });
  assert.equal(inline.source, 'missing');
  assert.equal(inline.width, 0);
  assert.equal(inline.height, 0);
  assert.deepEqual(inline.slots, []);

  const missing = resolveNativeUiRuntimeSurface({ runtime: null, recipeId: 'missing', inlineLayout: null });
  assert.equal(missing.source, 'missing');
  assert.equal(missing.width, 0);
  assert.equal(missing.height, 0);
  assert.deepEqual(missing.slots, []);
});

test('native UI registry rejects incomplete background ABI on resolved surfaces', () => {
  const template = {
    templateKey: 'bad-background-template',
    templateSignature: 'sig-bad-background',
    familyKey: 'bad-background-family',
    canonicalMachineFamily: 'bad-background-family',
    layoutKind: 'gt-modular-ui',
    width: 176,
    height: 90,
    yShift: 0,
    coordinateSpace: 'nei_pixels',
    scaleMode: 'uniform-scale',
    anchor: 'top-left',
    maxRecipesPerPage: 1,
    imageResource: 'rust/ui-assets/gt_furnace.png',
    handlerCount: 1,
    slotCount: 0,
    nativeBackground: { kind: 'gt-modular-ui', status: 'captured', assetRef: 'ui/captured.png' },
    slots: [],
    textOverlays: [],
    dynamicPrimitives: [],
    hotspots: [],
    viewports: [],
  };
  const binding = {
    recipeId: 'bad-background',
    path: 'recipes/ui-payload-shards/bad.json',
    payloadKey: 'bad-background',
    familyKey: 'bad-background-family',
    recipeType: 'gt.recipe',
    machineType: 'Furnace',
    templateKey: 'bad-background-template',
    templateSignature: 'sig-bad-background',
    canonicalMachineFamily: 'bad-background-family',
    layoutKind: 'gt-modular-ui',
    bound: true,
  };
  assert.throws(
    () => resolveNativeUiRuntimeSurface({
      runtime: runtimeFixture(template, binding),
      recipeId: 'bad-background',
      inlineLayout: null,
    }),
    /coordinateSpace/,
  );
});

test('native UI registry builds exact design-space slot cells and fit matrix', () => {
  const entriesByRole = new Map([
    ['item-input', ['a', 'b', 'c']],
    ['item-output', ['out']],
  ]);
  const cells = buildNativeUiSlotCells({
    slots: [
      {
        role: 'item-input',
        startIndex: 1,
        columns: 2,
        rows: 1,
        x: 45,
        y: 24,
        coordinateSpace: 'nei_pixels',
        anchor: 'top-left',
        slotWidth: 20,
        slotHeight: 18,
        pitchX: 24,
        pitchY: 18,
      },
      {
        role: 'item-output',
        startIndex: 10,
        columns: 1,
        rows: 1,
        x: 115,
        y: 24,
        coordinateSpace: 'nei_pixels',
        anchor: 'top-left',
        slotWidth: 18,
        slotHeight: 18,
        pitchX: 18,
        pitchY: 18,
      },
    ],
    resolveRoleEntries: (role) => entriesByRole.get(role) ?? [],
  });

  assert.deepEqual(cells.map((cell) => [cell.key, cell.x, cell.y, cell.width, cell.height, cell.iconX, cell.iconY, cell.entry]), [
    ['item-input:0:0', 45, 24, 20, 18, 47, 25, 'b'],
    ['item-input:0:1', 69, 24, 20, 18, 71, 25, 'c'],
    ['item-output:1:0', 115, 24, 18, 18, 116, 25, 'out'],
  ]);

  const fit = createNativeUiFitMatrix({ sourceWidth: 176, sourceHeight: 90, availableWidth: 352, availableHeight: 120, scaleMode: 'uniform-scale' });
  assert.equal(fit.scale, 120 / 90);
  assert.equal(fit.fittedWidth, 235);
  assert.equal(fit.fittedHeight, 120);
});

test('native UI registry owns component runtime layout contract', () => {
  const componentSource = readFileSync(resolve(frontendRoot, 'src/components/NativeNeiRecipeCanvas.vue'), 'utf8').replace(/\r\n/g, '\n');
  const registrySource = readFileSync(resolve(frontendRoot, 'src/services/nativeUiRuntimeRegistry.ts'), 'utf8').replace(/\r\n/g, '\n');

  assert.match(componentSource, /nativeUiRuntimeRegistry/);
  assert.match(componentSource, /resolveNativeUiRuntimeSurface/);
  assert.match(componentSource, /buildNativeUiSlotCells/);
  assert.match(componentSource, /createNativeUiFitMatrix/);
  assert.doesNotMatch(componentSource, /interface NativeSlotFact/);
  assert.doesNotMatch(componentSource, /interface NativeLayoutSurface/);
  assert.doesNotMatch(componentSource, /const resolvedTemplate/);
  assert.doesNotMatch(componentSource, /slots\.value\.forEach/);

  assert.match(registrySource, /export function resolveNativeUiRuntimeSurface/);
  assert.match(registrySource, /export function buildNativeUiSlotCells/);
  assert.match(registrySource, /export function createNativeUiFitMatrix/);
  assert.match(registrySource, /NativeUiSurfaceSource = "ui-pack-template" \| "missing"/);

  assert.deepEqual(collectNativeUiDynamicPrimitives({
    dynamicPrimitives: [
      { kind: 'progress-bar', x: 1, y: 2, width: 3, height: 4, coordinateSpace: 'nei_pixels', anchor: 'top-left' },
      { kind: 'fluid-bar', x: 2, y: 3, width: 4, height: 5, coordinateSpace: 'nei_pixels', anchor: 'top-left' },
      { kind: 'energy-bar', x: 3, y: 4, width: 5, height: 6, coordinateSpace: 'nei_pixels', anchor: 'top-left' },
    ],
  }).map((row) => row.kind), [
    'progress-bar',
    'fluid-bar',
    'energy-bar',
  ]);
});

test('native UI registry fails closed on rect-like geometry ABI violations', () => {
  const template = {
    templateKey: 'bad-hotspot-template',
    templateSignature: 'sig-bad-hotspot',
    familyKey: 'bad-hotspot-family',
    canonicalMachineFamily: 'bad-hotspot-family',
    layoutKind: 'gt-modular-ui',
    width: 80,
    height: 40,
    yShift: 0,
    coordinateSpace: 'nei_pixels',
    scaleMode: 'uniform-scale',
    anchor: 'top-left',
    maxRecipesPerPage: 1,
    imageResource: 'rust/ui-assets/gt_furnace.png',
    handlerCount: 1,
    slotCount: 0,
    nativeBackground: gtBackground({
      width: 80,
      height: 40,
      recipeBackgroundOffset: { x: 0, y: 0 },
      recipeBackgroundSize: { width: 80, height: 40 },
    }),
    slots: [],
    textOverlays: [],
    dynamicPrimitives: [],
    hotspots: [{ id: 'bad-hotspot', kind: 'info', role: 'bad', label: 'Bad', tooltip: '', ...noInteraction(), x: 1, y: 2, width: 3, height: 4, anchor: 'top-left' }],
    viewports: [],
  };
  const binding = {
    recipeId: 'bad-hotspot',
    path: 'recipes/ui-payload-shards/bad-hotspot.json',
    payloadKey: 'bad-hotspot',
    familyKey: 'bad-hotspot-family',
    recipeType: 'gt.recipe',
    machineType: 'Furnace',
    templateKey: 'bad-hotspot-template',
    templateSignature: 'sig-bad-hotspot',
    canonicalMachineFamily: 'bad-hotspot-family',
    layoutKind: 'gt-modular-ui',
    bound: true,
  };
  assert.throws(() => resolveNativeUiRuntimeSurface({
    runtime: runtimeFixture(template, binding),
    recipeId: 'bad-hotspot',
    inlineLayout: null,
  }), /missing required Native UI geometry field: coordinateSpace/);

  assert.throws(() => collectNativeUiDynamicPrimitives({
    dynamicPrimitives: [{ kind: 'progress-bar', x: 1, y: 2, width: 3, height: 4, coordinateSpace: 'screen_pixels', anchor: 'top-left' }],
  }), /unsupported Native UI coordinateSpace/);
});
