import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';

const materializerSource = fs.readFileSync(
  'E:/codex/ae2/NeoNEI/backend/src/services/publish-payload-materializer.service.ts',
  'utf8',
).replace(/\r\n/g, '\n');

const publishPayloadSource = fs.readFileSync(
  'E:/codex/ae2/NeoNEI/backend/src/services/publish-payload.service.ts',
  'utf8',
).replace(/\r\n/g, '\n');

test('recipe publish bundle bakes group indexes instead of full lead payloads', () => {
  assert.equal(
    publishPayloadSource.includes('recipeGroupIndexBasePath'),
    true,
    'publish bundle manifest should expose a recipe group index base path',
  );
  assert.equal(
    publishPayloadSource.includes("return 'recipes/groups/index';"),
    true,
    'recipe group publish assets should live under the index namespace',
  );
  assert.equal(
    materializerSource.includes('const RECIPE_GROUP_INDEX_ONLY_LIMIT = 0;'),
    true,
    'materializer should keep hot recipe group assets in ids-only mode to avoid bundle explosion',
  );
  assert.equal(
    materializerSource.includes("payload_type: 'recipe-machine-group-index'"),
    true,
    'materializer should emit machine-group index assets',
  );
  assert.equal(
    materializerSource.includes("payload_type: 'recipe-category-group-index'"),
    true,
    'materializer should emit category-group index assets',
  );
  assert.equal(
    materializerSource.includes('includeRecipeIds: true'),
    true,
    'materializer should request ordered recipe ids for hot group assets',
  );
});
