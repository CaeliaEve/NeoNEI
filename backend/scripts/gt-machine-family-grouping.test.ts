import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeMachineFamilyName } from '../src/services/recipes-indexed.service';

test('normalizeMachineFamilyName merges gt cryogenic and vacuum freezer machine names', () => {
  const cryo = normalizeMachineFamilyName('凛冰冷冻机 (UIV)');
  const vacuum = normalizeMachineFamilyName('真空冷冻机 (UIV)');

  assert.equal(cryo, vacuum);
  assert.equal(cryo, '真空冷冻机');
});

test('normalizeMachineFamilyName merges other gt machine family variants', () => {
  assert.equal(normalizeMachineFamilyName('工业电解机 (MV)'), '电解机');
  assert.equal(normalizeMachineFamilyName('工业离心机 (ULV)'), '离心机');
  assert.equal(normalizeMachineFamilyName('大型化学反应釜 (LV)'), '化学反应釜');
  assert.equal(normalizeMachineFamilyName('工业高炉 (EV)'), '高炉');
  assert.equal(normalizeMachineFamilyName('工业搅拌机 (MV)'), '搅拌机');
});
