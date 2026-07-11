import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  nativeUiAtlasLookupId,
  nativeUiRenderAssetLookupId,
  projectNativeUiRecipeRenderables,
  resolveNativeUiRenderablesForRole,
  toNativeUiFluidRenderable,
  toNativeUiItemRenderable,
} from '../src/services/nativeUiRecipeRenderableProjection.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const frontendRoot = resolve(__dirname, '..');

test('native UI recipe renderable projection resolves atlas lookup ids from direct ids and render assets', () => {
  assert.equal(nativeUiRenderAssetLookupId('nesqlpp:item/gregtech:plate_iron'), 'gregtech:plate_iron');
  assert.equal(nativeUiRenderAssetLookupId('nesqlpp:fluid/molten_iron'), 'molten_iron');
  assert.equal(nativeUiRenderAssetLookupId('minecraft:stone'), null);
  assert.equal(nativeUiAtlasLookupId('minecraft:iron_ingot', 'nesqlpp:item/ignored'), 'minecraft:iron_ingot');
  assert.equal(nativeUiAtlasLookupId('', 'nesqlpp:item/gregtech:plate_iron'), 'gregtech:plate_iron');
});

test('native UI recipe renderable projection normalizes item and fluid renderables', () => {
  assert.deepEqual(toNativeUiItemRenderable({
    itemId: 'minecraft:iron_ingot',
    count: 3,
    localizedName: 'Iron Ingot',
    renderAssetRef: ' nesqlpp:item/minecraft:iron_ingot ',
    imageFileName: 'iron.png',
  }), {
    kind: 'item',
    itemId: 'minecraft:iron_ingot',
    atlasLookupId: 'minecraft:iron_ingot',
    count: 3,
    localizedName: 'Iron Ingot',
    renderAssetRef: 'nesqlpp:item/minecraft:iron_ingot',
    imageFileName: 'iron.png',
  });

  assert.deepEqual(toNativeUiFluidRenderable({
    amount: 144,
    fluid: {
      fluidId: 'molten.iron',
      internalName: 'molten.iron',
      localizedName: 'Molten Iron',
      renderAssetRef: 'nesqlpp:fluid/gregtech:molten_iron',
    },
  }), {
    kind: 'fluid',
    itemId: 'gregtech:molten_iron',
    atlasLookupId: 'gregtech:molten_iron',
    count: 144,
    localizedName: 'Molten Iron',
    renderAssetRef: 'nesqlpp:fluid/gregtech:molten_iron',
    imageFileName: null,
    extraLines: ['144 mB'],
  });
});

test('native UI recipe renderable projection projects recipe sets and role dispatch', () => {
  const recipe = {
    inputs: [
      [
        { itemId: 'input:a', count: 2, localizedName: 'Input A' },
        [{ itemId: 'input:b', count: 1, localizedName: 'Input B' }],
      ],
      null,
    ],
    outputs: [
      { itemId: 'output:a', count: 4, localizedName: 'Output A' },
      null,
    ],
    fluidInputs: [
      { slotIndex: 2, fluids: [{ amount: 20, fluid: { fluidId: 'fluid:second', localizedName: 'Second Fluid' } }] },
      { slotIndex: 1, fluids: [{ amount: 10, fluid: { fluidId: 'fluid:first', localizedName: 'First Fluid' } }] },
    ],
    fluidOutputs: [
      { amount: 30, fluid: { fluidId: 'fluid:out', localizedName: 'Out Fluid' } },
    ],
  };

  const sets = projectNativeUiRecipeRenderables(recipe);
  assert.deepEqual(sets.inputItems.map((entry) => entry.itemId), ['input:a', 'input:b']);
  assert.deepEqual(sets.outputItems.map((entry) => entry.itemId), ['output:a']);
  assert.deepEqual(sets.inputFluids.map((entry) => entry.itemId), ['fluid:first', 'fluid:second']);
  assert.deepEqual(sets.outputFluids.map((entry) => entry.itemId), ['fluid:out']);

  assert.equal(resolveNativeUiRenderablesForRole('item-input', sets), sets.inputItems);
  assert.equal(resolveNativeUiRenderablesForRole('item-output', sets), sets.outputItems);
  assert.equal(resolveNativeUiRenderablesForRole('fluid-input', sets), sets.inputFluids);
  assert.equal(resolveNativeUiRenderablesForRole('fluid-output', sets), sets.outputFluids);
  assert.deepEqual(resolveNativeUiRenderablesForRole('fuel', sets), []);
  assert.deepEqual(resolveNativeUiRenderablesForRole('item-fuel', sets), []);
});

test('native UI recipe renderable projection remains reusable reference logic after screenshot canvas retirement', () => {
  const projectionSource = readFileSync(resolve(frontendRoot, 'src/services/nativeUiRecipeRenderableProjection.ts'), 'utf8').replace(/\r\n/g, '\n');

  assert.equal(existsSync(resolve(frontendRoot, 'src/components/NativeNeiRecipeCanvas.vue')), false);
  assert.match(projectionSource, /export function nativeUiRenderAssetLookupId/);
  assert.match(projectionSource, /export function nativeUiAtlasLookupId/);
  assert.match(projectionSource, /export function projectNativeUiRecipeRenderables/);
  assert.match(projectionSource, /export function resolveNativeUiRenderablesForRole/);
});
