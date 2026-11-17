import assert from 'node:assert/strict';
import test from 'node:test';
import { itemLocation, legacyWorkspaceLocation } from '../src/router/workspace.ts';

test('item navigation retains snapshot and use direction without stale recipe filters', () => {
  assert.deepEqual(itemLocation('item_one', { catalog: 'saved', offline: '1', machine: '99', page: '50' }, 'usedIn'), {
    name: 'home', query: { catalog: 'saved', offline: '1', item: 'item_one', direction: 'uses' },
  });
});
test('retired recipe links retain exact targets, snapshot, hash and inert filters', () => {
  const query = { catalog: 'saved', offline: '1', lang: 'en-US', q: 'recipe filter' };
  for (const path of ['/recipe/target', '/entry/target', '/oracle/target']) {
    assert.deepEqual(legacyWorkspaceLocation({ path, params: { itemId: 'fluid_exact/target ?' }, query, hash: '#native' }), {
      name: 'home', query: { ...query, item: 'fluid_exact/target ?', direction: 'recipes' }, hash: '#native',
    });
  }
  assert.deepEqual(legacyWorkspaceLocation({
    path: '/recipe-by-id/target', params: { recipeId: 'recipe_exact' }, query: { ...query, item: 'item_wrong' }, hash: '#source',
  }), { name: 'home', query: { ...query, recipe: 'recipe_exact', direction: 'recipes' }, hash: '#source' });
});
test('retired link direction has deterministic mode, tab and direction precedence', () => {
  const cases = [
    [{ mode: 'r', tab: 'usedIn', direction: 'uses' }, 'recipes'],
    [{ mode: 'u', tab: 'producedBy', direction: 'recipes' }, 'uses'],
    [{ mode: 'invalid', tab: 'usedIn', direction: 'recipes' }, 'uses'],
    [{ tab: 'producedBy', direction: 'uses' }, 'recipes'],
    [{ direction: 'uses' }, 'uses'],
    [{ direction: 'invalid' }, 'recipes'],
  ];
  for (const [query, direction] of cases) {
    const location = legacyWorkspaceLocation({ path: '/entry/target', params: { itemId: 'item_exact' }, query, hash: '' });
    assert.equal(location.query.direction, direction);
    assert.equal(location.query.item, 'item_exact');
  }
});
test('empty recipe entry remains a shell intent and canonical intent normalization is idempotent', () => {
  const location = legacyWorkspaceLocation({ path: '/recipe', params: {}, query: { catalog: 'saved' }, hash: '' });
  assert.deepEqual(location, { name: 'home', query: { catalog: 'saved', direction: 'recipes', presentation: 'recipe' }, hash: '' });
  const target = legacyWorkspaceLocation({ path: '/oracle/target', params: { itemId: 'item_exact' }, query: { mode: 'u', offline: '1' }, hash: '#slot' });
  assert.deepEqual(legacyWorkspaceLocation({ path: '/', query: target.query, hash: target.hash }), target);
});
test('old diagram and bee tree links retain their exact selection and snapshot', () => {
  const query = { catalog: 'saved', offline: '1', tab: 'materials', materialId: 'material_one' };
  assert.deepEqual(legacyWorkspaceLocation({ path: '/gt-diagrams', query, hash: '#parts' }), {
    name: 'material', params: { id: 'material_one' }, query: { ...query, legacy: 'material_one' }, hash: '#parts',
  });
  const tree = legacyWorkspaceLocation({ path: '/forestry-bee-tree', query: { catalog: 'saved', uid: 'forestry.speciesMeadows' }, hash: '#tree' });
  assert.equal(tree.name, 'bees');
  assert.equal(tree.query.legacy, 'forestry.speciesMeadows');
  assert.equal(tree.query.view, 'tree');
  assert.equal(tree.hash, '#tree');
});
