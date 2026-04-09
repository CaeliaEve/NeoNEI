import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildOcPatternEntry,
  buildOcPatternExportDocument,
  toMinecraftItemId,
} from '../dist/services/pattern-export.service.js';

test('toMinecraftItemId converts NESQL item ids to minecraft-style ids', () => {
  assert.equal(toMinecraftItemId('i~minecraft~iron_ingot~0'), 'minecraft:iron_ingot');
  assert.equal(toMinecraftItemId('i~gregtech~gt.metaitem.01~32717'), 'gregtech:gt.metaitem.01');
  assert.equal(toMinecraftItemId('minecraft:redstone'), 'minecraft:redstone');
});

test('buildOcPatternEntry emits beSubstitute and minecraft-style ids', () => {
  const entry = buildOcPatternEntry({
    patternName: 'Refined Iron Plate',
    crafting: 1,
    substitute: 0,
    recipeId: 'recipe-1',
    inputs: [
      [
        {
          itemId: 'i~minecraft~iron_ingot~0',
          damage: 0,
          count: 3,
          nbt: null,
        },
      ],
    ],
    outputs: [
      {
        itemId: 'i~minecraft~iron_plate~0',
        damage: 0,
        count: 1,
        nbt: null,
      },
    ],
  });

  assert.equal(entry.crafting, true);
  assert.equal(entry.substitute, false);
  assert.equal(entry.beSubstitute, false);
  assert.equal(entry.author, 'NeoNEI');
  assert.equal('canBeSubstitute' in entry, false);
  assert.deepEqual(entry.inputs, [
    { id: 'minecraft:iron_ingot', meta: 0, count: 3, nbt: null },
  ]);
  assert.deepEqual(entry.outputs, [
    { id: 'minecraft:iron_plate', meta: 0, count: 1, nbt: null },
  ]);
});

test('buildOcPatternEntry flattens indexed input groups into oc item stacks', () => {
  const entry = buildOcPatternEntry({
    crafting: 0,
    substitute: 1,
    recipeId: 'recipe-2',
    inputs: [
      {
        slotIndex: 0,
        items: [
          {
            item: {
              itemId: 'i~minecraft~water_bucket~0',
              damage: 0,
              nbt: null,
            },
            stackSize: 1,
          },
        ],
      },
      {
        slotIndex: 1,
        items: [
          {
            item: {
              itemId: 'i~minecraft~lava_bucket~0',
              damage: 0,
              nbt: null,
            },
            stackSize: 1,
          },
        ],
      },
    ],
    outputs: [],
  });

  assert.deepEqual(entry.inputs, [
    { id: 'minecraft:water_bucket', meta: 0, count: 1, nbt: null },
    { id: 'minecraft:lava_bucket', meta: 0, count: 1, nbt: null },
  ]);
});

test('buildOcPatternEntry derives meta from NESQL item ids when damage is absent', () => {
  const entry = buildOcPatternEntry({
    crafting: 1,
    substitute: 0,
    recipeId: 'recipe-3',
    inputs: [
      [
        {
          itemId: 'i~gregtech~gt.metaitem.01~32717',
          count: 2,
          nbt: null,
        },
      ],
    ],
    outputs: [
      {
        itemId: 'i~OpenComputers~item~44',
        count: 1,
        nbt: null,
      },
    ],
  });

  assert.deepEqual(entry.inputs, [
    { id: 'gregtech:gt.metaitem.01', meta: 32717, count: 2, nbt: null },
  ]);
  assert.deepEqual(entry.outputs, [
    { id: 'OpenComputers:item', meta: 44, count: 1, nbt: null },
  ]);
});

test('buildOcPatternEntry preserves explicit metadata when provided', () => {
  const entry = buildOcPatternEntry({
    patternId: '#4621',
    author: 'CaeliaEve',
    crafterUUID: '123e4567-e89b-12d3-a456-426614174000',
    beSubstitute: true,
    crafting: 1,
    substitute: 1,
    recipeId: 'recipe-5',
    inputs: [],
    outputs: [],
  });

  assert.equal(entry.patternId, '#4621');
  assert.equal(entry.author, 'CaeliaEve');
  assert.equal(entry.crafterUUID, '123e4567-e89b-12d3-a456-426614174000');
  assert.equal(entry.beSubstitute, true);
});

test('buildOcPatternExportDocument includes compatibility metadata and warnings', () => {
  const document = buildOcPatternExportDocument([
    buildOcPatternEntry({
      crafting: 1,
      substitute: 0,
      recipeId: 'recipe-4',
      inputs: [],
      outputs: [],
    }),
  ]);

  assert.equal(document.version, 1);
  assert.equal(document.modVersion, '0.1');
  assert.equal(document.patternCount, 1);
  assert.equal(typeof document.exportedAt, 'string');
  assert.equal(document.compatibility.target, 'oc-pattern');
  assert.equal(document.compatibility.itemIdFormat, 'minecraft-registry');
  assert.equal(document.compatibility.beSubstitute, 'pattern-field');
  assert.equal(document.compatibility.crafterUUID, 'synthetic-pattern-id');
  assert.equal(document.compatibility.author, 'default-exporter');
  assert.equal(document.warnings.includes('beSubstitute is currently exported as false by default.'), false);
  assert.equal(document.warnings.includes('crafterUUID is synthesized from patternId when no source UUID exists.'), true);
  assert.equal(document.warnings.includes('author defaults to "NeoNEI" when no source author exists.'), true);
});
