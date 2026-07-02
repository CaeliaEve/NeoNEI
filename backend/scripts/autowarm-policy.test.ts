import assert from 'node:assert/strict';
import test from 'node:test';
import { getAutowarmPolicy } from '../src/config/autowarm-policy';

test('autowarm defaults keep recipe warmups explicit without page atlas work', () => {
  const policy = getAutowarmPolicy({});

  assert.equal(policy.recipeBootstrap.enabled, false);
  assert.equal(policy.recipeBootstrap.limit, 1000);
  assert.equal(policy.recipeShard.enabled, false);
  assert.equal(policy.recipeShard.limit, 16);
  assert.equal(Object.prototype.hasOwnProperty.call(policy, 'pageAtlas'), false);
});

test('autowarm can be enabled explicitly', () => {
  const policy = getAutowarmPolicy({
    RECIPE_BOOTSTRAP_AUTOWARM: '1',
    RECIPE_SHARD_AUTOWARM: '1',
    RECIPE_BOOTSTRAP_AUTOWARM_LIMIT: '250',
    RECIPE_SHARD_AUTOWARM_LIMIT: '24',
  });

  assert.equal(policy.recipeBootstrap.enabled, true);
  assert.equal(policy.recipeBootstrap.limit, 250);
  assert.equal(policy.recipeShard.enabled, true);
  assert.equal(policy.recipeShard.limit, 24);
  assert.equal(Object.prototype.hasOwnProperty.call(policy, 'pageAtlas'), false);
});
