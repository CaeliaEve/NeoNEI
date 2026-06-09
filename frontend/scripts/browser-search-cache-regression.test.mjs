import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const projection = fs.readFileSync('src/workers/nativeSurfaceProjection.ts', 'utf8');
const state = fs.readFileSync('src/workers/nativeSurfaceWorkerState.ts', 'utf8');
const worker = fs.readFileSync('src/workers/nativeSurfaceEngine.worker.ts', 'utf8');

test('native browser search keeps bounded prefix candidates on the native hot path', () => {
  assert.equal(
    state.includes('runtimeSearchPrefixCache: Map<string, Uint32Array>'),
    true,
    'native surface state should own a reusable prefix candidate cache',
  );
  assert.equal(
    state.includes('runtimeSearchPrefixCache: new Map()'),
    true,
    'prefix candidate cache should initialize with the native surface state',
  );
  assert.equal(
    worker.includes('surface.runtimeSearchPrefixCache = new Map();'),
    true,
    'prefix candidate cache must be invalidated when native runtime packs are rebuilt',
  );
  assert.equal(
    projection.includes('function lowerBoundRuntimeSearchKey'),
    true,
    'prefix searches should binary-search the sorted native search keys',
  );
  assert.equal(
    projection.includes('export function getRuntimeSearchPrefixCandidates'),
    true,
    'native search paging should reuse indexed prefix candidate sets',
  );
  assert.equal(
    projection.includes('surface.runtimeSearchPrefixCache.set(normalizedQuery, compact)'),
    true,
    'prefix candidate sets should be cached after first materialization',
  );
  assert.equal(
    worker.includes('getRuntimeSearchPrefixCandidates(surface, normalizedQuery)'),
    true,
    'surface projection must use the native prefix cache instead of the retired browserSearch worker',
  );
});

test('legacy browser search worker stays retired from the hot path', () => {
  assert.equal(
    fs.existsSync('src/workers/browserSearch.worker.ts'),
    false,
    'legacy browserSearch.worker.ts should not be resurrected after the native runtime cutover',
  );
});
