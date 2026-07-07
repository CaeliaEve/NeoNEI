import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';

const runtimeSessionSource = fs.readFileSync(
  'src/services/api/runtimeSession.ts',
  'utf8',
);
const distDataRuntimeSource = fs.readFileSync(
  'src/services/distDataRuntime.ts',
  'utf8',
);

test('mods list hot path uses dist-data first and runtime-signature persistent cache', () => {
  assert.equal(
    runtimeSessionSource.includes("readPersistentRuntimePayload<Mod[]>("),
    true,
    'mods list should use persistent runtime cache so the home filter shell can restore instantly after reload',
  );
  assert.equal(
    runtimeSessionSource.includes("getDistDataMods()"),
    true,
    'mods list should be sourced from the active dist-data runtime before requiring a publish bundle',
  );
  assert.equal(
    runtimeSessionSource.includes("persistRuntimePayload('mods-list'"),
    true,
    'mods list should be written back to persistent runtime cache after network fetch',
  );
  assert.equal(
    distDataRuntimeSource.includes("export async function getDistDataMods()"),
    true,
    'dist-data runtime should expose its derived mod catalog directly',
  );
  assert.equal(
    distDataRuntimeSource.includes('const cachedRecipeUiPayloads = new Map<string, RecipeUiPayload>()'),
    true,
    'recipe UI payloads should retain the in-session dist-data cache for revisited special recipe pages',
  );
});
