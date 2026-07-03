import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const frontendRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const renderRuntimeSource = readFileSync(resolve(frontendRoot, 'src/services/distDataRuntimeRender.ts'), 'utf8');

function sourceSection(startNeedle, endNeedle) {
  const start = renderRuntimeSource.indexOf(startNeedle);
  assert.notEqual(start, -1, `missing source section start: ${startNeedle}`);
  const end = renderRuntimeSource.indexOf(endNeedle, start);
  assert.notEqual(end, -1, `missing source section end: ${endNeedle}`);
  return renderRuntimeSource.slice(start, end);
}

test('native render index loader exposes a fail-closed ABI error boundary', () => {
  assert.match(renderRuntimeSource, /export const NATIVE_RENDER_INDEX_LOAD_POLICY = Object\.freeze/);
  assert.match(renderRuntimeSource, /failurePolicy: "fail-closed"/);
  assert.match(renderRuntimeSource, /export class NativeRenderIndexLoadError extends Error/);
  assert.match(renderRuntimeSource, /Native render index load failed:/);
  assert.match(renderRuntimeSource, /function requireNativeRenderIndexTarget/);
  assert.match(renderRuntimeSource, /function assertNativeRenderIndexPayload/);
});

test('native render index loader does not swallow load failures into null', () => {
  const nativeIndexLoader = sourceSection(
    'async function getDistDataNativeRenderIndex',
    'function getItemAssetId',
  );

  assert.match(nativeIndexLoader, /Promise<NativeRenderIndex>/);
  assert.match(nativeIndexLoader, /requireNativeRenderIndexTarget\(await deps\.getDistDataManifest\(\)\)/);
  assert.match(nativeIndexLoader, /fetchDistDataJson<unknown>/);
  assert.match(nativeIndexLoader, /throw nativeRenderIndexLoadFailed\("native render index request failed"/);
  assert.match(nativeIndexLoader, /assertNativeRenderIndexPayload/);
  assert.doesNotMatch(nativeIndexLoader, /\.catch\(\(\) => null\)/);
  assert.doesNotMatch(nativeIndexLoader, /return null/);
});

test('native render fact lookup depends on authoritative index loading instead of treating index failure as absent item data', () => {
  const factLookup = sourceSection(
    'async function getNativeRenderFactsForItem',
    '  function reset',
  );

  assert.match(factLookup, /const index = await getDistDataNativeRenderIndex\(\)/);
  assert.doesNotMatch(factLookup, /if \(!index\) return null/);
});
