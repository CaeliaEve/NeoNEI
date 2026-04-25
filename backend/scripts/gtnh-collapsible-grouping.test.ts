import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { buildCollapsibleItemAssignments, type CollapsibleItemCandidate } from '../src/services/gtnh-collapsible-items.service';

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'neonei-collapsible-'));
const configPath = path.join(tempDir, 'collapsibleitems.cfg');

fs.writeFileSync(
  configPath,
  [
    '# test config',
    '$ingot',
    'minecraft:potion 16000-17000,!16386',
    '; {"displayName":"Spawn Eggs"}',
    'minecraft:spawn_egg',
  ].join('\n'),
  'utf8',
);

const candidates: CollapsibleItemCandidate[] = [
  {
    itemId: 'i~gregtech~ingotIron~0',
    modId: 'gregtech',
    internalName: 'ingotIron',
    localizedName: 'Iron Ingot',
    damage: 0,
    oreDictionaryNames: ['ingotIron'],
  },
  {
    itemId: 'i~gregtech~ingotGold~0',
    modId: 'gregtech',
    internalName: 'ingotGold',
    localizedName: 'Gold Ingot',
    damage: 0,
    oreDictionaryNames: ['ingotGold'],
  },
  {
    itemId: 'i~minecraft~potion~16384',
    modId: 'minecraft',
    internalName: 'potion',
    localizedName: 'Splash Potion',
    damage: 16384,
  },
  {
    itemId: 'i~minecraft~potion~16386',
    modId: 'minecraft',
    internalName: 'potion',
    localizedName: 'Filtered Potion',
    damage: 16386,
  },
  {
    itemId: 'i~minecraft~spawn_egg~0',
    modId: 'minecraft',
    internalName: 'spawn_egg',
    localizedName: 'Spawn Egg',
    damage: 0,
  },
];

const assignments = buildCollapsibleItemAssignments(candidates, { configPath });

assert.equal(assignments.get('i~gregtech~ingotIron~0')?.groupKey, assignments.get('i~gregtech~ingotGold~0')?.groupKey);
assert.equal(assignments.get('i~gregtech~ingotIron~0')?.groupSize, 2);
assert.notEqual(assignments.get('i~minecraft~potion~16384')?.groupKey, null);
assert.equal(assignments.get('i~minecraft~potion~16386')?.groupKey, null);
assert.equal(assignments.get('i~minecraft~spawn_egg~0')?.groupLabel, 'Spawn Eggs');

console.log('gtnh-collapsible-grouping.test.ts passed');

