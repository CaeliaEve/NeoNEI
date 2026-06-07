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
  assert.match(source, /neonei_engine_compact_group_count/, 'group pack must be installed into WASM memory for native validation/consumption');
  assert.match(source, /neonei_engine_compact_string_item_count/, 'string pack must be installed into WASM memory for native validation/consumption');
  assert.match(source, /neonei_engine_compact_texture_item_count/, 'texture pack must be installed into WASM memory for native validation/consumption');
  assert.match(source, /neonei_engine_compact_animation_item_count/, 'animation pack must be installed into WASM memory for native validation/consumption');
  assert.match(source, /neonei_engine_compact_texture_select_frame_index/, 'texture animation frame selection must use WASM compact timeline');
  assert.match(source, /neonei_engine_compact_animation_select_frame_index/, 'animation timeline frame selection must use WASM compact timeline');
  assert.doesNotMatch(source, /totalDuration = timeline\.reduce/, 'worker must not calculate animation timelines in TypeScript');
});

test('native surface worker keeps hover hit-test in WASM', () => {
  const source = readFileSync(workerPath, 'utf8');
  assert.match(source, /neonei_engine_hit_test_index/, 'hover hit-test must call the WASM grid hit-test ABI');
  assert.doesNotMatch(source, /layoutCommands\.find\(\(command\) =>/, 'worker must not scan layout commands in TypeScript for hover hit-test');
});

test('native surface worker writes layout positions through WASM', () => {
  const source = readFileSync(workerPath, 'utf8');
  assert.match(source, /neonei_engine_write_layout_commands/, 'layout command positions must call the WASM layout writer ABI');
  assert.doesNotMatch(source, /const col = index % columns/, 'worker must not hand-roll grid columns in TypeScript');
  assert.doesNotMatch(source, /const row = Math\.floor\(index \/ columns\)/, 'worker must not hand-roll grid rows in TypeScript');
});

