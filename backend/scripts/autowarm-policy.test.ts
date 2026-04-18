import assert from 'node:assert/strict';
import test from 'node:test';
import { getAutowarmPolicy } from '../src/config/autowarm-policy';

test('autowarm defaults keep homepage atlas hot without blocking recipe startup', () => {
  const policy = getAutowarmPolicy({});

  assert.equal(policy.recipeBootstrap.enabled, false);
  assert.equal(policy.recipeBootstrap.limit, 1000);
  assert.equal(policy.pageAtlas.enabled, true);
  assert.equal(policy.pageAtlas.pages, 4);
  assert.equal(policy.pageAtlas.pageSize, 120);
  assert.equal(policy.pageAtlas.itemSize, 50);
});

test('autowarm can be enabled explicitly', () => {
  const policy = getAutowarmPolicy({
    RECIPE_BOOTSTRAP_AUTOWARM: '1',
    PAGE_ATLAS_AUTOWARM: '1',
    RECIPE_BOOTSTRAP_AUTOWARM_LIMIT: '250',
    PAGE_ATLAS_AUTOWARM_PAGES: '2',
    PAGE_ATLAS_AUTOWARM_PAGE_SIZE: '60',
    PAGE_ATLAS_AUTOWARM_ITEM_SIZE: '48',
  });

  assert.equal(policy.recipeBootstrap.enabled, true);
  assert.equal(policy.recipeBootstrap.limit, 250);
  assert.equal(policy.pageAtlas.enabled, true);
  assert.equal(policy.pageAtlas.pages, 2);
  assert.equal(policy.pageAtlas.pageSize, 60);
  assert.equal(policy.pageAtlas.itemSize, 48);
});
