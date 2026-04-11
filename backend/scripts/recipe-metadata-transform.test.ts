import assert from 'node:assert/strict';
import test from 'node:test';
import { transformRecipeMetadata } from '../src/services/recipe-metadata';

test('preserves Thaumcraft exported metadata fields', () => {
  const metadata = transformRecipeMetadata({
    voltageTier: null,
    voltage: null,
    amperage: null,
    duration: null,
    totalEU: null,
    requiresCleanroom: null,
    requiresLowGravity: null,
    additionalInfo: null,
    aspects: { Aer: 64, Ordo: 32 },
    specialRecipeType: 'ThaumcraftInfusion',
    research: 'INFUSION',
    centralItemId: 'i~Thaumcraft~ItemChestplateThaumium~0',
    centerInputSlotIndex: 5050,
    instability: 3,
    componentSlotOrder: [0, 1, 2, 3],
  });

  assert.equal(metadata?.specialRecipeType, 'ThaumcraftInfusion');
  assert.deepEqual(metadata?.aspects, { Aer: 64, Ordo: 32 });
  assert.equal(metadata?.research, 'INFUSION');
  assert.equal(metadata?.centralItemId, 'i~Thaumcraft~ItemChestplateThaumium~0');
  assert.equal(metadata?.centerInputSlotIndex, 5050);
  assert.equal(metadata?.instability, 3);
  assert.deepEqual(metadata?.componentSlotOrder, [0, 1, 2, 3]);
});
