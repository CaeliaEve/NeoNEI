import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const frontendRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const workerSource = readFileSync(resolve(frontendRoot, 'src/workers/nativeRender.worker.ts'), 'utf8');

function sourceSection(startNeedle, endNeedle) {
  const start = workerSource.indexOf(startNeedle);
  assert.notEqual(start, -1, `missing source section start: ${startNeedle}`);
  const end = workerSource.indexOf(endNeedle, start);
  assert.notEqual(end, -1, `missing source section end: ${endNeedle}`);
  return workerSource.slice(start, end);
}

test('native render worker resource operations have a fail-closed boundary', () => {
  assert.match(workerSource, /NATIVE_RENDER_WORKER_RESOURCE_POLICY = Object\.freeze/);
  assert.match(workerSource, /failurePolicy: "fail-closed"/);
  assert.match(workerSource, /class NativeRenderWorkerResourceError extends Error/);
  assert.match(workerSource, /function requireNativeRenderer/);
  assert.match(workerSource, /throw nativeRenderWorkerResourceFailed\(operation, "native renderer is not initialized"/);
});

test('native render texture upload failures throw worker resource errors instead of being counted and ignored', () => {
  const uploadTexture = sourceSection('async function uploadTexture', 'async function uploadTexturesInBatches');
  const uploadBatches = sourceSection('async function uploadTexturesInBatches', 'async function handleRequest');

  assert.match(uploadTexture, /const renderer = requireNativeRenderer\("loadTextures"\)/);
  assert.doesNotMatch(uploadTexture, /if \(!nativeRenderer \|\| uploadedTextureKeys\.has\(key\)\) return/);
  assert.match(uploadTexture, /throw nativeRenderWorkerResourceFailed\("loadTextures", "renderer rejected texture registration"/);
  assert.match(uploadBatches, /textureErrors \+= 1;\s*throw error;/s);
  assert.doesNotMatch(uploadBatches, /catch \{\s*textureErrors \+= 1;\s*\}/s);
});

test('native render requests require an initialized renderer instead of returning zero stats', () => {
  const renderCase = sourceSection('case "render":', 'case "setAnimationEnabled":');

  assert.match(renderCase, /requireNativeRenderer\("render"\)\.render/);
  assert.doesNotMatch(renderCase, /nativeRenderer\?\.render/);
  assert.doesNotMatch(renderCase, /\?\? \{ drawCalls: 0, vertexCount: 0, spriteDrawCalls: 0, spriteVertexCount: 0 \}/);
});
