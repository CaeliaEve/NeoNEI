import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';

const source = fs.readFileSync(
  'E:/codex/ae2/NeoNEI/frontend/src/services/api.ts',
  'utf8',
).replace(/\r\n/g, '\n');

test('recipe bootstrap API persists hot bootstrap packs behind runtime-signature keys', () => {
  assert.equal(
    source.includes("readPersistentRuntimePayload<RecipeBootstrapPayload>("),
    true,
    'recipe bootstrap should read a persisted runtime payload before refetching the bootstrap pack',
  );
  assert.equal(
    source.includes("persistRuntimePayload('recipe-bootstrap'"),
    true,
    'recipe bootstrap should persist freshly fetched bootstrap payloads for later reloads',
  );
  assert.equal(
    source.includes("persistRuntimePayload('recipe-bootstrap-shard'"),
    true,
    'full bootstrap shards should also be persisted for repeat detail hydration',
  );
  assert.equal(
    source.includes("persistRuntimePayload(\n      'recipe-bootstrap-produced-by-group'"),
    true,
    'machine-group recipe packs should persist so revisiting large GT pages does not refetch them from scratch',
  );
});
