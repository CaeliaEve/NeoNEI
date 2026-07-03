import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const frontendRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const renderClientSource = readFileSync(resolve(frontendRoot, 'src/native-surface/NativeRenderWorkerClient.ts'), 'utf8');
const renderClientPolicySource = readFileSync(resolve(frontendRoot, 'src/native-surface/NativeRenderWorkerClientPolicyCatalog.ts'), 'utf8');
const engineClientSource = readFileSync(resolve(frontendRoot, 'src/native-surface/NativeSurfaceEngineClient.ts'), 'utf8');
const engineClientPolicySource = readFileSync(resolve(frontendRoot, 'src/native-surface/NativeSurfaceEngineClientPolicyCatalog.ts'), 'utf8');
const workerClientOpsSource = readFileSync(resolve(frontendRoot, 'src/native-surface/NativeWorkerClientOpsCatalog.ts'), 'utf8');
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
  assert.match(renderClientPolicySource, /NATIVE_RENDER_WORKER_CLIENT_POLICY = Object\.freeze/);
  assert.match(renderClientPolicySource, /schema: "neonei\/native-render-worker-client\/current"/);
  assert.match(renderClientPolicySource, /failurePolicy: "fail-closed"/);
  assert.match(renderClientPolicySource, /legacyNullFallback: false/);
  assert.match(renderClientPolicySource, /transferPolicy: "descriptor-owned-transfer-list"/);
  assert.match(renderClientPolicySource, /class NativeRenderWorkerClientError extends Error/);
  assert.match(renderClientPolicySource, /NATIVE_RENDER_WORKER_CLIENT_ERROR_DESCRIPTORS/);
  assert.match(renderClientPolicySource, /NATIVE_RENDER_WORKER_TRANSFER_DESCRIPTOR_MAP/);
  assert.match(renderClientSource, /from "\.\/NativeRenderWorkerClientPolicyCatalog"/);
  assert.match(renderClientSource, /createNativeWorkerClientSession/);
  assert.match(renderClientSource, /NATIVE_RENDER_WORKER_CLIENT_POLICY/);
  assert.match(renderClientSource, /unavailableCode: NATIVE_RENDER_WORKER_CLIENT_ERROR_CODES\.workerUnavailable/);
  assert.match(renderClientSource, /constructionFailedCode: NATIVE_RENDER_WORKER_CLIENT_ERROR_CODES\.workerConstructionFailed/);
  assert.match(workerClientOpsSource, /function createNativeWorkerClientSession/);
  assert.match(workerClientOpsSource, /const requireWorker = \(\): Worker/);
  assert.doesNotMatch(renderClientSource, /class NativeRenderWorkerClientError extends Error/);
});

test('native render worker client rejects worker error responses and post failures instead of returning null', () => {
  const postEvent = sourceSection(renderClientSource, 'export function postNativeRenderEvent', 'export function resetNativeRenderWorker');
  const messageHandler = sourceSection(workerClientOpsSource, 'worker.onmessage =', 'worker.onerror =');

  assert.match(postEvent, /Promise<NativeRenderResponse>/);
  assert.match(postEvent, /nativeRenderWorkerClient\.post\(request\)/);
  assert.match(renderClientSource, /postFailedCode: NATIVE_RENDER_WORKER_CLIENT_ERROR_CODES\.workerPostFailed/);
  assert.match(renderClientSource, /responseFailure: \(response\) => response\.type === "error"/);
  assert.match(renderClientSource, /code: NATIVE_RENDER_WORKER_CLIENT_ERROR_CODES\.workerErrorResponse/);
  assert.match(messageHandler, /descriptor\.responseFailure/);
  assert.match(messageHandler, /request\.reject\(fail\(responseFailure\.code/);
  assert.doesNotMatch(postEvent, /Promise\.resolve\(null\)/);
  assert.doesNotMatch(postEvent, /\.catch\(\(\) => null\)/);
  assert.doesNotMatch(renderClientSource, /Worker \| null\) \{/);
  assert.match(renderClientPolicySource, /initialize: Object\.freeze\(\{/);
  assert.match(renderClientPolicySource, /transferableFields: Object\.freeze\(\["canvas"\] as const\)/);
  assert.match(renderClientPolicySource, /render: Object\.freeze\(\{/);
  assert.match(renderClientPolicySource, /transferableFields: Object\.freeze\(\["commandBuffer"\] as const\)/);
});

test('native surface engine worker client exposes the same fail-closed no-null boundary', () => {
  const postEvent = sourceSection(engineClientSource, 'export function postNativeSurfaceEngineEvent', 'export function resetNativeSurfaceEngineWorker');

  assert.match(engineClientPolicySource, /NATIVE_SURFACE_ENGINE_CLIENT_POLICY = Object\.freeze/);
  assert.match(engineClientPolicySource, /schema: "neonei\/native-surface-engine-client\/current"/);
  assert.match(engineClientPolicySource, /failurePolicy: "fail-closed"/);
  assert.match(engineClientPolicySource, /legacyNullFallback: false/);
  assert.match(engineClientPolicySource, /transferPolicy: "descriptor-owned-transfer-list"/);
  assert.match(engineClientPolicySource, /class NativeSurfaceEngineClientError extends Error/);
  assert.match(engineClientPolicySource, /NATIVE_SURFACE_ENGINE_CLIENT_ERROR_DESCRIPTORS/);
  assert.match(engineClientPolicySource, /NATIVE_SURFACE_ENGINE_TRANSFER_DESCRIPTOR_MAP/);
  assert.match(engineClientSource, /from "\.\/NativeSurfaceEngineClientPolicyCatalog"/);
  assert.match(engineClientSource, /createNativeWorkerClientSession/);
  assert.match(engineClientSource, /NATIVE_SURFACE_ENGINE_CLIENT_POLICY/);
  assert.doesNotMatch(engineClientSource, /class NativeSurfaceEngineClientError extends Error/);
  assert.match(postEvent, /Promise<NativeSurfaceEngineResponse>/);
  assert.match(postEvent, /nativeSurfaceEngineClient\.post\(request\)/);
  assert.match(engineClientSource, /postFailedCode: NATIVE_SURFACE_ENGINE_CLIENT_ERROR_CODES\.workerPostFailed/);
  assert.match(workerClientOpsSource, /activeWorker\.postMessage\(message, descriptor\.transferables\(message\)\)/);
  assert.doesNotMatch(postEvent, /Promise\.resolve\(null\)/);
  assert.doesNotMatch(postEvent, /\.catch\(\(\) => null\)/);
  assert.match(engineClientPolicySource, /runtimePacks: Object\.freeze\(\{/);
  assert.match(engineClientPolicySource, /transferableFields: Object\.freeze\(\["packs\[\]\.buffer"\] as const\)/);
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
