import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
const engineWorker = read('src/workers/nativeSurfaceEngine.worker.ts');
const renderConnection = read('src/workers/nativeSurfaceRenderConnection.ts');
const engineProtocol = read('src/native-surface/NativeSurfaceEngineProtocol.ts');
const pipelineProtocol = read('src/native-surface/NativeRenderPipelineProtocol.ts');
const pipelineClient = read('src/native-surface/NativeRenderPipelineClient.ts');
const rendererProtocol = read('src/renderers/native/NativeRendererCommandProtocol.ts');
const controller = read('src/native-surface/NativeSurfaceController.ts');
const surface = read('src/components/native-surface/NativeBrowserSurface.vue');
const renderPolicy = read('src/native-surface/NativeRenderWorkerClientPolicyCatalog.ts');
const renderWorker = read('src/workers/nativeRender.worker.ts');

test('engine transfers each command buffer directly to the render worker port', () => {
  assert.match(engineWorker, /new Map<NativeSurfaceId, NativeSurfaceRenderConnection>\(\)/);
  assert.match(renderConnection, /this\.port\.postMessage\(request, getNativeRenderPipelineTransferables\(request\)\)/);
  assert.match(pipelineProtocol, /ownershipPolicy: "engine-to-render-single-transfer"/);
  assert.match(pipelineProtocol, /mainThreadFramePolicy: "control-plane-only-no-frame-payload"/);
  assert.match(pipelineProtocol, /message\.type === "renderFrame" \? \[message\.commandBuffer\] : \[\]/);
  assert.match(renderWorker, /enginePort\.onmessage/);
  assert.doesNotMatch(engineWorker, /drawCommands:\s*surface\.layoutCommands/);
  assert.doesNotMatch(engineWorker, /self[^\n]*postMessage\([^\n]*commandBuffer/);
  assert.doesNotMatch(engineProtocol, /drawCommands:\s*NativeSurfaceEngineLayoutCommand\[\]/);
  assert.doesNotMatch(engineProtocol, /commandBuffer:\s*ArrayBuffer/);
  assert.doesNotMatch(controller, /drawCommands:\s*frame\.drawCommands/);
  assert.doesNotMatch(rendererProtocol, /result\.push\(/);
});

test('main thread only connects ports and never receives or forwards frame buffers', () => {
  assert.match(pipelineClient, /new MessageChannel\(\)/);
  assert.match(pipelineClient, /renderClient\.connectEnginePort\(sessionId, channel\.port2\)/);
  assert.match(pipelineClient, /connectNativeSurfaceEngineRenderPort/);
  assert.match(pipelineClient, /failurePolicy: "fail-closed-reset-surface-render-worker"/);
  assert.match(pipelineClient, /renderClient\.reset\(\)/);
  assert.doesNotMatch(pipelineClient, /resetNativeSurfaceEngineWorker/);
  assert.match(pipelineClient, /export function createNativeRenderPipelineClient/);
  assert.match(pipelineClient, /recreate: \(\) => Promise<void>/);
  assert.match(surface, /createNativeRenderWorkerClient\(props\.surfaceId\)/);
  assert.match(surface, /createNativeRenderPipelineClient\(props\.surfaceId, nativeRenderWorker\)/);
  assert.match(renderWorker, /self\.postMessage\(result\.response\);\s*postPipelineMessage\(\{\s*type: "frameRendered"/s);
  assert.match(engineWorker, /catch \(error\) \{\s*connection\.close\([\s\S]*?\);\s*renderConnections\.delete\(surfaceId\);/);
  assert.match(engineWorker, /rendered: renderResult\.status === "rendered"/);
  assert.match(engineWorker, /missingTextureKeys: renderResult\.missingTextureKeys/);
  assert.match(surface, /frame\.missingTextureKeys \?\? \[\]/);
  assert.doesNotMatch(engineProtocol, /spriteCommands:\s*NativeSurfaceEngineSpriteCommand\[\]/);
  assert.doesNotMatch(controller, /spriteCommands:\s*frame\.spriteCommands/);
  assert.doesNotMatch(surface, /frame\.spriteCommands/);
  assert.match(surface, /if \(!frame\.rendered\) return/);
  assert.doesNotMatch(controller, /drawCommandBuffer/);
  assert.doesNotMatch(surface, /commandBuffer:\s*frame\./);
  assert.doesNotMatch(surface, /postNativeRenderEvent\(\{\s*type:\s*"render"/s);
  assert.match(surface, /if \(!nativeRenderInitialized \|\| nativeRenderFaulted \|\| nativeSurfaceEngineFaulted \|\| nativeFrameScheduled\) return/);
  assert.doesNotMatch(renderPolicy, /transferableFields: Object\.freeze\(\["commandBuffer"\]/);
});
