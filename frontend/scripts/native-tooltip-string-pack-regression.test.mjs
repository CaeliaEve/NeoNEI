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




