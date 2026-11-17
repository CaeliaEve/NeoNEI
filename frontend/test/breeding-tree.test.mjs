import assert from 'node:assert/strict';
import test from 'node:test';
import { breedingTree } from '../src/catalog/breeding-tree.ts';
const mutation = (id, result, parents, numerator = '1') => ({ id, result, parents, chance: { numerator, denominator: '10' }, conditions: [], secret: false });

test('breeding tree preserves both parent branches, chooses a recorded path and stops cycles', async () => {
  let reads = 0;
  const sources = {
    child: [mutation('low', 'child', ['other', 'other']), mutation('best', 'child', ['parent', 'parent'], '9')],
    parent: [mutation('cycle', 'parent', ['child', 'base'])], base: [],
  };
  const result = await breedingTree('child', async id => { reads++; return { rows: sources[id], total: sources[id].length, related: {}, species: [] }; });
  assert.equal(result.mutation.id, 'best');
  assert.deepEqual(result.parents.map(node => node.id), ['parent', 'parent']);
  assert.equal(result.parents[0].parents[0].stop, 'cycle');
  assert.equal(reads, 3);
});
test('tree is bounded and reports partial mutation lists and depth limits', async () => {
  const result = await breedingTree('a', async id => ({ rows: [mutation(id, id, [id + 'x', id + 'y'])], total: 51, related: {}, species: [] }), 1);
  assert.equal(result.partial, true);
  assert.equal(result.parents.length, 2);
  assert.equal(result.parents[0].stop, 'depth');
});
