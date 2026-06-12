import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const state = fs.readFileSync('src/workers/nativeSurfaceWorkerState.ts', 'utf8');
const worker = fs.readFileSync('src/workers/nativeSurfaceEngine.worker.ts', 'utf8');

test('native browser search stays on the WASM visible-entry hot path', () => {
  assert.equal(
    state.includes('runtimeVisibleCacheKey: string | null'),
    true,
    'native surface state should own a reusable visible-entry cache key',
  );
  assert.equal(
    state.includes('runtimeVisibleEntries: Uint32Array | null'),
    true,
    'native surface state should cache projected visible entries',
  );
  assert.equal(
    worker.includes('surface.runtimeVisibleCacheKey = null;'),
    true,
    'visible-entry cache must be invalidated when native runtime packs are rebuilt',
  );
  assert.equal(
    worker.includes('computeWasmRuntimeVisibleEntries(surface, browserPack.itemCount)'),
    true,
    'browser projection must be computed through the WASM native runtime',
  );
  assert.equal(
    worker.includes('`${surface.query ?? ""}`.trim().toLowerCase().replace(/\\s+/g, "")'),
    true,
    'search query must participate in the visible-entry cache key',
  );
  assert.equal(
    worker.includes('surface.lastProjectionSource = surface.lastProjectionQuery.trim().length > 0 ? "search" : "browser"'),
    true,
    'native metrics should still mark search projections on searched pages',
  );
  assert.equal(
    worker.includes('"wasm-visible-v2-no-ts-fallback"'),
    true,
    'surface projection must stay on the no-TypeScript-fallback WASM cache generation',
  );
});

test('legacy browser search worker stays retired from the hot path', () => {
  assert.equal(
    fs.existsSync('src/workers/browserSearch.worker.ts'),
    false,
    'legacy browserSearch.worker.ts should not be resurrected after the native runtime cutover',
  );
});
