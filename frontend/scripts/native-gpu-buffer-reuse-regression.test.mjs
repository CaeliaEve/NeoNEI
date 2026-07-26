import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
const webgpu = read('src/renderers/native/WebGpuNativeRenderer.ts');
const webgl = read('src/renderers/native/WebGl2NativeRenderer.ts');

test('WebGPU grows persistent vertex buffers instead of creating and destroying them every frame', () => {
  assert.match(webgpu, /function ensureReusableGpuBuffer\(/);
  assert.match(webgpu, /private chromeVertexBuffer: ReusableGpuBuffer \| null = null/);
  assert.match(webgpu, /private readonly spriteVertexBuffers = new Map<string, ReusableGpuBuffer>\(\)/);
  assert.match(webgpu, /device\.queue\.writeBuffer\(this\.chromeVertexBuffer\.buffer, 0, chrome\.vertices\)/);
  assert.match(webgpu, /device\.queue\.writeBuffer\(bufferState\.buffer, 0, vertices\)/);
  assert.doesNotMatch(webgpu, /const transientBuffers:/);
  assert.doesNotMatch(webgpu, /mappedAtCreation:\s*true/);
});

test('WebGL2 reuses CPU staging arrays and persistent GL buffers after warmup', () => {
  assert.match(webgl, /function ensureFloat32Capacity\(/);
  assert.match(webgl, /private chromePositions = new Float32Array\(0\)/);
  assert.match(webgl, /private spriteTexcoords = new Float32Array\(0\)/);
  assert.match(webgl, /this\.chromePositions = ensureFloat32Capacity\(this\.chromePositions, chromeQuadCount \* 12\)/);
  assert.match(webgl, /this\.spritePositions = ensureFloat32Capacity\(this\.spritePositions, list\.length \* 12\)/);
  assert.doesNotMatch(webgl, /const positions = new Float32Array\(chromeQuadCount/);
  assert.doesNotMatch(webgl, /const positions = new Float32Array\(list\.length/);
});
