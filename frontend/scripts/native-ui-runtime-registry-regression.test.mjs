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
      hotspotCount: template.hotspots.length,
      viewportCount: template.viewports.length,
      assetCount: 1,
    },
  };
}

test('native UI registry resolves UI-pack template authority with inline dynamic overlays', () => {
  const template = {
    templateKey: 'gt-furnace@default',
    templateSignature: 'sig-template',
    familyKey: 'gt-furnace',
    canonicalMachineFamily: 'gt-furnace',
    layoutKind: 'gt-modular-ui',
    width: 176,
    height: 90,
    yShift: 0,
    maxRecipesPerPage: 1,
    imageResource: 'rust/ui-assets/gt_furnace.png',
    handlerCount: 1,
    slotCount: 1,
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
    textOverlays: [{ text: 'EU/t', x: 80, y: 10, width: 24, height: 8 }],
    hotspots: [{ id: 'template-hotspot', kind: 'info', role: 'nei-info', label: 'Template', tooltip: '', action: '', itemId: '', payloadKey: '', x: 1, y: 2, width: 3, height: 4 }],
    viewports: [{ id: 'template-viewport', kind: 'viewport', role: 'progress', label: 'Progress', tooltip: '', action: '', itemId: '', payloadKey: '', x: 70, y: 30, width: 22, height: 16 }],
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
    imageRegion: { x: 8, y: 9, width: 176, height: 90 },
    nativeBackground: { kind: 'gt-modular-ui', status: 'captured', assetRef: 'rust/ui-assets/gt_furnace_captured.png' },
    progressBars: [{ role: 'progress', x: 72, y: 34, width: 24, height: 16, fill: 0.5 }],
    hotspots: [{ id: 'inline-hotspot', kind: 'item-click', role: 'output', label: 'Output', tooltip: '', action: 'item-click', itemId: 'minecraft:iron_ingot', payloadKey: '', x: 115, y: 24, width: 18, height: 18 }],
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
  assert.equal(surface.layout?.nativeBackground?.assetRef, 'rust/ui-assets/gt_furnace_captured.png');
  assert.equal(surface.slots.length, 1);
  assert.equal(surface.textOverlays[0]?.text, 'EU/t');
  assert.equal(surface.hotspots[0]?.id, 'inline-hotspot');
  assert.equal(surface.viewports[0]?.id, 'template-viewport');
  assert.equal(surface.dynamicPrimitives.length, 1);
  assert.equal(surface.dynamicPrimitives[0]?.kind, 'progress-bar');
});

test('native UI registry keeps inline and missing layouts explicit', () => {
  const inline = resolveNativeUiRuntimeSurface({
    runtime: null,
    recipeId: 'recipe-inline',
    inlineLayout: normalizeNativeUiLayoutSurface({
      width: 80,
      height: 40,
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
  assert.equal(inline.source, 'inline-native-layout');
  assert.equal(inline.width, 80);
  assert.equal(inline.height, 40);
  assert.equal(inline.slots[0]?.role, 'item-output');

  const missing = resolveNativeUiRuntimeSurface({ runtime: null, recipeId: 'missing', inlineLayout: null });
  assert.equal(missing.source, 'missing');
  assert.equal(missing.width, 166);
  assert.equal(missing.height, 65);
  assert.deepEqual(missing.slots, []);
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

  const fit = createNativeUiFitMatrix({ sourceWidth: 176, sourceHeight: 90, availableWidth: 352, availableHeight: 120 });
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
  assert.match(registrySource, /NativeUiSurfaceSource = "ui-pack-template" \| "inline-native-layout" \| "missing"/);

  assert.deepEqual(collectNativeUiDynamicPrimitives({ progressBars: [{ x: 1 }], fluidBars: [{ x: 2 }], energyBars: [{ x: 3 }] }).map((row) => row.kind), [
    'progress-bar',
    'fluid-bar',
    'energy-bar',
  ]);
});
