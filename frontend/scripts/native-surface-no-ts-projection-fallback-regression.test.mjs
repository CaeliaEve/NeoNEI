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

test('native surface worker rejects JSON native runtime pack fallbacks', () => {
  const source = readFileSync(workerPath, 'utf8');
  assert.doesNotMatch(source, /parseJsonPayload/, 'worker must not parse JSON packs as a production fallback');
  assert.match(source, /native search pack must use compact NEISRC2 binary encoding/, 'search pack must fail loudly when compact encoding is missing');
  assert.match(source, /native group pack must use compact NEIGRP1 binary encoding/, 'group pack must fail loudly when compact encoding is missing');
  assert.match(source, /native string pack must use compact NEISTR1 binary encoding/, 'string pack must fail loudly when compact encoding is missing');
  assert.match(source, /native texture pack must use compact NEITEX1 binary encoding/, 'texture pack must fail loudly when compact encoding is missing');
  assert.match(source, /native animation pack must use compact NEIANM1 binary encoding/, 'animation pack must fail loudly when compact encoding is missing');
  assert.match(source, /neonei_engine_compact_texture_item_count/, 'texture pack must be installed into WASM memory for native validation/consumption');
  assert.match(source, /neonei_engine_compact_animation_item_count/, 'animation pack must be installed into WASM memory for native validation/consumption');
});
