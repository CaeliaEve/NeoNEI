import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

const workerPath = resolve('src/workers/nativeSurfaceEngine.worker.ts');

test('native surface worker does not fall back to TypeScript browser projection', () => {
  const source = readFileSync(workerPath, 'utf8');
  assert.doesNotMatch(source, /getCachedNativeRuntimeProjectionIndices/, 'runtime projection must stay in WASM, not TS cache fallback');
  assert.doesNotMatch(source, /NativeRuntimeProjection/, 'worker must not import the old TypeScript projection module');
  assert.match(source, /wasm-visible-v2-no-ts-fallback/, 'visible projection cache key should document the no-fallback WASM path');
});
