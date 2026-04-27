import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';

const publishPayloadSource = fs.readFileSync(
  'E:/codex/ae2/NeoNEI/backend/src/services/publish-payload.service.ts',
  'utf8',
).replace(/\r\n/g, '\n');

const materializerSource = fs.readFileSync(
  'E:/codex/ae2/NeoNEI/backend/src/services/publish-payload-materializer.service.ts',
  'utf8',
).replace(/\r\n/g, '\n');

test('recipe publish bundle exposes static search packs for hot recipe items', () => {
  assert.equal(
    publishPayloadSource.includes('recipeSearchBasePath: string | null;'),
    true,
    'publish bundle manifest should expose a recipe search base path',
  );
  assert.equal(
    publishPayloadSource.includes("return 'recipes/search';"),
    true,
    'recipe search publish assets should live under the recipes/search namespace',
  );
  assert.equal(
    materializerSource.includes("payload_type: 'recipe-search-index'"),
    true,
    'materializer should emit recipe search index assets',
  );
  assert.equal(
    materializerSource.includes('buildPublishRecipeSearchRelativePath({'),
    true,
    'materializer should write recipe search assets to predictable static paths',
  );
  assert.equal(
    materializerSource.includes('buildPublishedRecipeSearchEntries(sourceRecipes)'),
    true,
    'materializer should compile compact client-searchable recipe entries',
  );
  assert.equal(
    materializerSource.includes('await recipeBootstrapService.getBootstrapShard(itemId);'),
    true,
    'materializer should derive search packs from full hot bootstrap shards instead of partial seed payloads',
  );
});
