import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';

const source = fs.readFileSync(
  'E:/codex/ae2/NeoNEI/frontend/src/services/api.ts',
  'utf8',
);

test('mods list and recipe ui payload hot paths use runtime-signature persistent cache', () => {
  assert.equal(
    source.includes("readPersistentRuntimePayload<Mod[]>("),
    true,
    'mods list should use persistent runtime cache so the home filter shell can restore instantly after reload',
  );
  assert.equal(
    source.includes("persistRuntimePayload('mods-list'"),
    true,
    'mods list should be written back to persistent runtime cache after network fetch',
  );
  assert.equal(
    source.includes("readPersistentRuntimePayload<RecipeUiPayload>("),
    true,
    'recipe ui payload fetches should use persistent runtime cache for revisited special recipe pages',
  );
  assert.equal(
    source.includes("persistRuntimePayload('recipe-ui-payload'"),
    true,
    'recipe ui payloads should persist after first fetch to reduce repeat special-page latency',
  );
});
