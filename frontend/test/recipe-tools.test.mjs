import test from 'node:test';
import assert from 'node:assert/strict';
import { effectScope, nextTick, ref, shallowRef } from 'vue';

const choice = (id, amount = '1', consume = { kind: 'consume' }, returns = []) => ({ id, amount, consume, returns, rule: { kind: 'exact' } });
const input = (slot, choices, kind = 'item') => ({ slot, kind, choices });
const output = (id, amount = '1', rest = {}) => ({ id, amount, slot: 0, kind: 'item', role: 'result', chance: { numerator: '1', denominator: '1' }, ...rest });
const recipe = (inputs = [], outputs = []) => ({ id: 'recipe-a', category: 'category', order: 0, inputs, outputs, properties: {}, source: { mod: 'fixture', handler: 'fixture' } });
async function materials() {
  const module = await import('../src/recipe-tools/materials.ts').catch(() => null);
  assert.ok(module, 'materials calculator is not implemented');
  return module.calculateMaterials;
}

// A Number conversion or summing all candidates breaks these literal totals.
test('materials sum exact decimal amounts and preserve integers above Number precision', async () => {
  const calculate = await materials();
  const result = calculate(recipe([
    input(0, [choice('iron', '9007199254740993.125')]),
    input(1, [choice('iron', '0.625')]),
    input(0, [choice('iron', '0.1')], 'fluid'),
  ], [output('plate', '0.25')]), '3');
  assert.deepEqual(result.inputs.map(({ kind, id, amount }) => ({ kind, id, amount })), [
    { kind: 'item', id: 'iron', amount: '27021597764222981.25' },
    { kind: 'fluid', id: 'iron', amount: '0.3' },
  ]);
  assert.equal(result.outputs[0].amount, '0.75');
  assert.equal(calculate(recipe([input(0, [choice('iron', '2')])]), '9007199254740993').inputs[0].amount, '18014398509481986');
});

test('batch validation rejects zero, negative, fractional and non-decimal counts', async () => {
  const calculate = await materials();
  for (const batches of ['', '0', '-1', '1.5', '1e3', 'Infinity', '2x']) assert.throws(() => calculate(recipe(), batches), /正整数/);
});

test('only the selected candidate contributes materials and its returns', async () => {
  const calculate = await materials();
  const r = recipe([input(0, [choice('water-cell', '1', { kind: 'consume' }, [{ kind: 'item', id: 'cell', amount: '1' }]), choice('water-can', '2')])]);
  const result = calculate(r, '4', { inputitem0: 1 });
  assert.deepEqual(result.inputs.map(row => [row.id, row.amount]), [['water-can', '8']]);
  assert.deepEqual(result.returns, []);
  assert.throws(() => calculate(r, '1', { inputitem0: 7 }), /候选/);
  assert.throws(() => calculate(r, '1', { inputitem0: -1 }), /候选/);
});

test('kept tools are stocked once, durability is separate, and containers scale with batches', async () => {
  const calculate = await materials();
  const result = calculate(recipe([
    input(0, [choice('mold', '1', { kind: 'keep' })]),
    input(1, [choice('hammer', '1', { kind: 'damage', points: 2 })]),
    input(2, [choice('cell', '2', { kind: 'consume' }, [{ kind: 'item', id: 'empty-cell', amount: '2' }])]),
  ], [output('bottle', '1', { role: 'return' })]), '5');
  assert.deepEqual(result.inputs.map(row => row.id), ['cell']);
  assert.deepEqual(result.tools.map(row => [row.id, row.amount]), [['mold', '1'], ['hammer', '1']]);
  assert.match(result.tools[1].note, /10/);
  assert.deepEqual(result.returns.map(row => [row.id, row.amount]), [['empty-cell', '10'], ['bottle', '5']]);
});

test('chance, dynamic quantity and changed samples never become guaranteed outputs', async () => {
  const calculate = await materials();
  const r = recipe([input(0, [choice('a'), choice('b')])], [
    output('random', '4', { chance: { numerator: '1', denominator: '3' } }),
    output('dynamic', null, { slot: 1, quantity: { kind: 'potential', nominal: '8', stat: 'test' } }),
    output('sample-a', '1', { slot: 2, change: { input: 0, action: { kind: 'analyze' }, samples: [{ id: 'sample-a', amount: '1' }, { id: 'sample-b', amount: '2' }] } }),
  ]);
  const result = calculate(r, '3', { inputitem0: 1 });
  assert.deepEqual(result.outputs, []);
  assert.deepEqual(result.uncertain.map(row => row.id), ['random', 'dynamic', 'sample-b']);
  assert.ok(result.uncertain.every(row => row.amount === null));
  assert.match(result.uncertain[0].note, /1\/3/);
  assert.match(result.uncertain[2].note, /样本/);
});

test('identical damage tools keep each input slot and its batch durability cost', async () => {
  const calculate = await materials();
  const result = calculate(recipe([
    input(0, [choice('hammer', '1', { kind: 'damage', points: 2 })]),
    input(1, [choice('hammer', '1', { kind: 'damage', points: 2 })]),
  ]), '5');
  assert.deepEqual(result.tools.map(row => [row.id, row.amount]), [['hammer', '1'], ['hammer', '1']]);
  assert.match(result.tools[0].note, /槽 1.*本槽.*10/);
  assert.match(result.tools[1].note, /槽 2.*本槽.*10/);
});

test('special native consumption never becomes a fixed bill of materials', async () => {
  const calculate = await materials();
  const kinds = ['staged', 'upto', 'allocated', 'reserve', 'wear', 'stack', 'buffer', 'pedestals'];
  const result = calculate(recipe(kinds.map((kind, slot) => input(slot, [choice(kind, '2', { kind })]))), '7');
  assert.deepEqual(result.inputs, []);
  assert.deepEqual(result.tools.map(row => row.id), ['reserve', 'wear']);
  assert.deepEqual(result.uncertain.map(row => row.id), ['staged', 'upto', 'allocated', 'stack', 'buffer', 'pedestals']);
});

test('correlated candidates preserve optional empty inputs and paired output samples', async () => {
  const calculate = await materials();
  const r = recipe([input(0, [choice('base')]), input(1, [choice('chip')])], [output('bare', '1', {
    change: { input: 0, action: { kind: 'integration' }, bindings: [[0, null], [0, 0]], samples: [{ id: 'bare', amount: '1' }, { id: 'expanded', amount: '1' }] },
  })]);
  r.process = { kind: 'buildcraftIntegration' };
  const result = calculate(r, '2');
  assert.deepEqual(result.inputs, []);
  assert.deepEqual(result.uncertain.map(row => row.id), ['base', 'bare']);
});

// Deferred reads simulate Catalog I/O only; the reference state and cancellation are real.
test('comparison reference is Catalog scoped and stale reads cannot repopulate a closed panel', async () => {
  const module = await import('../src/recipe-tools/reference.ts').catch(() => null);
  assert.ok(module, 'reference loader is not implemented');
  const pending = [];
  const makeCatalog = id => ({ manifest: { id }, recipe: (id, signal) => new Promise(resolve => pending.push({ id, signal, resolve })) });
  const a = makeCatalog('catalog-a'), b = makeCatalog('catalog-b');
  const catalog = shallowRef(a), current = shallowRef({ recipe: recipe(), related: {} }), enabled = ref(false);
  const scope = effectScope();
  const state = scope.run(() => module.useRecipeReference(() => catalog.value, () => current.value, () => enabled.value));
  state.remember();
  current.value = { recipe: { ...recipe(), id: 'recipe-b' }, related: {} };
  enabled.value = true;
  await nextTick();
  assert.equal(state.id.value, 'recipe-a');
  assert.equal(pending[0].id, 'recipe-a');
  enabled.value = false;
  await nextTick();
  assert.equal(pending[0].signal.aborted, true);
  pending[0].resolve({ recipe: recipe(), related: {} });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(state.detail.value, null);
  catalog.value = b;
  await nextTick();
  assert.equal(state.id.value, '');
  state.remember();
  catalog.value = a;
  await nextTick();
  assert.equal(state.id.value, 'recipe-a');
  enabled.value = true;
  await nextTick();
  scope.stop();
  assert.equal(pending[1].signal.aborted, true);
});
