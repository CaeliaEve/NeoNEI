import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const frontendRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const renderClientSource = readFileSync(resolve(frontendRoot, 'src/native-surface/NativeRenderWorkerClient.ts'), 'utf8');
const engineClientSource = readFileSync(resolve(frontendRoot, 'src/native-surface/NativeSurfaceEngineClient.ts'), 'utf8');
const controllerSource = readFileSync(resolve(frontendRoot, 'src/native-surface/NativeSurfaceController.ts'), 'utf8');
const browserSurfaceSource = readFileSync(resolve(frontendRoot, 'src/components/native-surface/NativeBrowserSurface.vue'), 'utf8');

function sourceSection(source, startNeedle, endNeedle) {
  const start = source.indexOf(startNeedle);
  assert.notEqual(start, -1, `missing source section start: ${startNeedle}`);
  const end = source.indexOf(endNeedle, start);
  assert.notEqual(end, -1, `missing source section end: ${endNeedle}`);
  return source.slice(start, end);
}

test('native render worker client exposes a fail-closed client ABI boundary', () => {
  assert.match(renderClientSource, /NATIVE_RENDER_WORKER_CLIENT_POLICY = Object\.freeze/);
  assert.match(renderClientSource, /failurePolicy: "fail-closed"/);
  assert.match(renderClientSource, /legacyNullFallback: false/);
  assert.match(renderClientSource, /class NativeRenderWorkerClientError extends Error/);
  assert.match(renderClientSource, /function requireWorker\(\): Worker/);
  assert.match(renderClientSource, /throw nativeRenderWorkerClientFailed\("worker-unavailable"/);
  assert.match(renderClientSource, /throw nativeRenderWorkerClientFailed\("worker-construction-failed"/);
});

test('native render worker client rejects worker error responses and post failures instead of returning null', () => {
  const postEvent = sourceSection(renderClientSource, 'export function postNativeRenderEvent', 'export function resetNativeRenderWorker');
  const messageHandler = sourceSection(renderClientSource, 'worker.onmessage =', 'worker.onerror =');

  assert.match(postEvent, /Promise<NativeRenderResponse>/);
  assert.match(postEvent, /activeWorker\.postMessage\(message, getTransferables\(message\)\)/);
  assert.match(postEvent, /reject\(nativeRenderWorkerClientFailed\("worker-post-failed"/);
  assert.match(messageHandler, /response\.type === "error"/);
  assert.match(messageHandler, /request\.reject\(nativeRenderWorkerClientFailed\(\s*"worker-error-response"/s);
  assert.doesNotMatch(postEvent, /Promise\.resolve\(null\)/);
  assert.doesNotMatch(postEvent, /\.catch\(\(\) => null\)/);
  assert.doesNotMatch(renderClientSource, /Worker \| null\) \{/);
});

test('native surface engine worker client exposes the same fail-closed no-null boundary', () => {
  const postEvent = sourceSection(engineClientSource, 'export function postNativeSurfaceEngineEvent', 'export function resetNativeSurfaceEngineWorker');

  assert.match(engineClientSource, /NATIVE_SURFACE_ENGINE_CLIENT_POLICY = Object\.freeze/);
  assert.match(engineClientSource, /failurePolicy: "fail-closed"/);
  assert.match(engineClientSource, /legacyNullFallback: false/);
  assert.match(engineClientSource, /class NativeSurfaceEngineClientError extends Error/);
  assert.match(engineClientSource, /function requireWorker\(\): Worker/);
  assert.match(postEvent, /Promise<NativeSurfaceEngineResponse>/);
  assert.match(postEvent, /reject\(nativeSurfaceEngineClientFailed\("worker-post-failed"/);
  assert.doesNotMatch(postEvent, /Promise\.resolve\(null\)/);
  assert.doesNotMatch(postEvent, /\.catch\(\(\) => null\)/);
});

test('native surface controller treats wrong worker responses as protocol violations', () => {
  assert.match(controllerSource, /class NativeSurfaceControllerProtocolError extends Error/);
  assert.match(controllerSource, /function requireEngineResponse/);
  assert.match(controllerSource, /requireEngineResponse\(response, "ack", "initialize"\)/);
  assert.match(controllerSource, /requireEngineResponse\(response, "frame", "requestFrame"\)/);
  assert.match(controllerSource, /requireEngineResponse\(response, "hitTest", "hitTest"\)/);
  assert.doesNotMatch(controllerSource, /if \(!response \|\| response\.type !== "frame"\) return null/);
  assert.doesNotMatch(controllerSource, /if \(!response \|\| response\.type !== "hitTest"/);
});

test('native browser surface explicitly records client failures at the component boundary', () => {
  assert.match(browserSurfaceSource, /function reportNativeRenderFailure/);
  assert.match(browserSurfaceSource, /function reportNativeSurfaceEngineFailure/);
  assert.match(browserSurfaceSource, /nativeRenderFaulted = true/);
  assert.match(browserSurfaceSource, /nativeSurfaceEngineFaulted = true/);
  assert.match(browserSurfaceSource, /postNativeRenderEvent\(\{ type: "resize", viewport \}\)\.catch/);
  assert.match(browserSurfaceSource, /controller\.requestFrame\(nowMs\)/);
  assert.match(browserSurfaceSource, /catch \(error\) \{\s*reportNativeSurfaceEngineFailure\("requestFrame", error\);/s);
  assert.doesNotMatch(browserSurfaceSource, /response\?\.type/);
});
