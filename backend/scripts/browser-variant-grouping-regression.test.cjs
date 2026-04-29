require('ts-node/register/transpile-only');

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildSyntheticBrowserVariantAssignments,
  mergeBrowserGroupAssignments,
} = require('../src/services/browser-variant-grouping.service.ts');

test('synthetic browser variant grouping collapses damaged and NBT stack variants to one representative', () => {
  const candidates = [
    {
      itemId: 'i~minecraft~bow~184',
      modId: 'minecraft',
      internalName: 'bow',
      localizedName: '弓',
      damage: 184,
      sourceOrder: 20,
    },
    {
      itemId: 'i~minecraft~bow~0~hashed',
      modId: 'minecraft',
      internalName: 'bow',
      localizedName: '弓',
      damage: 0,
      sourceOrder: 21,
    },
    {
      itemId: 'i~minecraft~bow~0',
      modId: 'minecraft',
      internalName: 'bow',
      localizedName: '弓',
      damage: 0,
      sourceOrder: 22,
    },
    {
      itemId: 'i~minecraft~bow~29~digested',
      modId: 'minecraft',
      internalName: 'bow',
      localizedName: 'Partially Digested Bow',
      damage: 29,
      sourceOrder: 23,
    },
    {
      itemId: 'i~minecraft~bow~0~thief',
      modId: 'minecraft',
      internalName: 'bow',
      localizedName: "Thief's Bow",
      damage: 0,
      sourceOrder: 24,
    },
  ];

  const synthetic = buildSyntheticBrowserVariantAssignments(candidates);
  assert.equal(synthetic.size, 5);
  const representativeGroup = synthetic.get('i~minecraft~bow~0');
  assert.ok(representativeGroup, 'expected pristine bow to receive a synthetic browser group');
  assert.equal(representativeGroup.groupLabel, '弓');
  assert.equal(representativeGroup.groupSize, 5);

  const merged = mergeBrowserGroupAssignments(candidates, new Map(), synthetic);
  const first = merged.get('i~minecraft~bow~184');
  const second = merged.get('i~minecraft~bow~0~hashed');
  const third = merged.get('i~minecraft~bow~0');
  const fourth = merged.get('i~minecraft~bow~29~digested');
  const fifth = merged.get('i~minecraft~bow~0~thief');
  assert.ok(first && second && third && fourth && fifth, 'expected merged assignments for every variant');
  assert.equal(first.groupKey, second.groupKey);
  assert.equal(second.groupKey, third.groupKey);
  assert.equal(third.groupKey, fourth.groupKey);
  assert.equal(fourth.groupKey, fifth.groupKey);
  assert.equal(first.groupSize, 5);
});

test('blocked GTNH collapsible items do not get re-grouped into synthetic variant buckets', () => {
  const candidates = [
    {
      itemId: 'i~minecraft~arrow~0',
      modId: 'minecraft',
      internalName: 'arrow',
      localizedName: '箭',
      damage: 0,
      sourceOrder: 10,
    },
    {
      itemId: 'i~minecraft~arrow~0~spectral',
      modId: 'minecraft',
      internalName: 'arrow',
      localizedName: '箭',
      damage: 0,
      sourceOrder: 11,
    },
  ];

  const synthetic = buildSyntheticBrowserVariantAssignments(candidates, {
    blockedItemIds: new Set(['i~minecraft~arrow~0']),
  });

  assert.equal(synthetic.size, 0);
});

test('synthetic internal-name grouping does not collapse real subtype families that already expose multiple canonical names', () => {
  const candidates = [
    {
      itemId: 'i~minecraft~planks~0',
      modId: 'minecraft',
      internalName: 'planks',
      localizedName: '橡木木板',
      damage: 0,
      sourceOrder: 1,
    },
    {
      itemId: 'i~minecraft~planks~1',
      modId: 'minecraft',
      internalName: 'planks',
      localizedName: '云杉木板',
      damage: 1,
      sourceOrder: 2,
    },
    {
      itemId: 'i~minecraft~planks~0~crop',
      modId: 'minecraft',
      internalName: 'planks',
      localizedName: 'Crop Oak Planks',
      damage: 0,
      sourceOrder: 3,
    },
  ];

  const synthetic = buildSyntheticBrowserVariantAssignments(candidates);
  assert.equal(
    synthetic.has('i~minecraft~planks~0'),
    false,
    'canonical multi-name subtype families should stay separate',
  );
  assert.equal(
    synthetic.has('i~minecraft~planks~1'),
    false,
    'synthetic grouping should not swallow legitimate subtype entries',
  );
});
