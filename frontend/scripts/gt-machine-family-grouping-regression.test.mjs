import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';

const helpersSource = fs.readFileSync(
  'E:/codex/ae2/NeoNEI/frontend/src/composables/recipe-browser/helpers.ts',
  'utf8',
);

test('recipe browser defines gt machine family aliases for merged category tabs', () => {
  assert.equal(
    helpersSource.includes('GT_MACHINE_CATEGORY_ALIAS_GROUPS'),
    true,
    'helpers should declare a gt machine family alias table',
  );
  assert.equal(
    helpersSource.includes('凛冰冷冻机') && helpersSource.includes('真空冷冻机'),
    true,
    'cryo freezer and vacuum freezer should be merged into the same category family',
  );
});
