import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const workerSource = readFileSync(new URL('../src/workers/nativeSurfaceEngine.worker.ts', import.meta.url), 'utf8');
const controllerSource = readFileSync(new URL('../src/native-surface/NativeSurfaceController.ts', import.meta.url), 'utf8');
const surfaceSource = readFileSync(new URL('../src/components/native-surface/NativeBrowserSurface.vue', import.meta.url), 'utf8');

test('native surface tooltip uses strings.zh_cn runtime pack as primary payload', () => {
  assert.match(
    workerSource,
    /function parseNativeStringPack\(payloadBuffer: ArrayBuffer\): Map<string, NativeRuntimeStringItem>/,
    'worker must parse the native string pack payload',
  );
  assert.match(
    workerSource,
    /COMPACT_STRING_MAGIC = "NEISTR1\\0"/,
    'worker must support the compact binary strings.zh_cn payload',
  );
  assert.match(
    workerSource,
    /COMPACT_GROUP_MAGIC = "NEIGRP1\\0"/,
    'worker must support the compact binary groups payload',
  );
  assert.match(
    workerSource,
    /COMPACT_SEARCH_MAGIC = "NEISRC2\\0"/,
    'worker must support the compact binary search payload',
  );
  assert.match(
    workerSource,
    /function parseCompactStringPack\(payloadBuffer: ArrayBuffer\): Map<string, NativeRuntimeStringItem> \| null/,
    'worker must parse string metadata without requiring JSON payloads',
  );
  assert.match(
    workerSource,
    /COMPACT_TEXTURE_MAGIC = "NEITEX1\\0"/,
    'worker must support the compact binary textures payload',
  );
  assert.match(
    workerSource,
    /COMPACT_ANIMATION_MAGIC = "NEIANM1\\0"/,
    'worker must support the compact binary animations payload',
  );
  assert.match(
    workerSource,
    /function parseCompactTexturePack\(payloadBuffer: ArrayBuffer\): Map<string, NativeRuntimeTextureItem> \| null/,
    'worker must parse texture atlas metadata without requiring JSON payloads',
  );
  assert.match(
    workerSource,
    /function parseCompactSearchPack\(payloadBuffer: ArrayBuffer\): Map<string, NativeRuntimeSearchItem> \| null/,
    'worker must parse search metadata without requiring JSON payloads',
  );
  assert.match(
    workerSource,
    /message\.packs\.find\(\(pack\) => pack\.name === "search"\)/,
    'worker must load the native search pack from runtime packs',
  );
  assert.match(
    workerSource,
    /message\.packs\.find\(\(pack\) => pack\.name === "stringsZhCn"\)/,
    'worker must load the stringsZhCn pack from runtime packs',
  );
  assert.match(
    workerSource,
    /tooltip:\s*\{[\s\S]*surface\.stringByItemId\.get\(hit\.itemId\)[\s\S]*groupLabel[\s\S]*groupSize[\s\S]*\}/,
    'hit-test result must carry native tooltip string metadata',
  );
  assert.match(
    controllerSource,
    /nativeTooltip\s*=\s*response\.hit\.tooltip/,
    'controller must convert worker string metadata into native tooltip payload',
  );
  assert.match(
    surfaceSource,
    /if \(hit\.nativeTooltip\?\.title\) return hit\.nativeTooltip\.title;/,
    'Vue surface must prefer native tooltip title over compat entry text',
  );
});

test('native surface tooltip hit-test is frame-coalesced and does not rematerialize grid entries', () => {
  assert.match(
    surfaceSource,
    /let nativeHitScheduled = false;/,
    'native surface should track a single scheduled hover hit-test',
  );
  assert.match(
    surfaceSource,
    /let nativePendingHitPointer: NativeSurfacePointer \| null = null;/,
    'native surface should keep only the latest pending pointer before hit-test',
  );
  assert.match(
    surfaceSource,
    /function scheduleNativeHitTest\(pointer: NativeSurfacePointer\)[\s\S]*requestAnimationFrame\(run\)/,
    'mousemove hit-tests should be coalesced to animation frames',
  );
  assert.match(
    surfaceSource,
    /function handlePointerMove\(event: MouseEvent\)[\s\S]*nativeHoveredPointer\.value[\s\S]*scheduleNativeHitTest\(pointer\);/,
    'pointer move should update tooltip position and schedule worker hit-test only',
  );
  assert.doesNotMatch(
    surfaceSource,
    /function handlePointerMove\(event: MouseEvent\)[\s\S]*props\.entries\.find/,
    'pointer move must not scan/materialize browser entries on the hot hover path',
  );
  assert.match(
    controllerSource,
    /type:\s*"hitTest"[\s\S]*x: pointer\.x[\s\S]*y: pointer\.y/,
    'tooltip hover should use the native worker hit-test request',
  );
});




