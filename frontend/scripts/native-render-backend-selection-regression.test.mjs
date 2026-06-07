import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const frontendRoot = resolve(__dirname, "..");

function readSource(relativePath) {
  return readFileSync(resolve(frontendRoot, relativePath), "utf8");
}

function readRepoSource(relativePath) {
  return readFileSync(resolve(frontendRoot, "..", relativePath), "utf8");
}

test("native render auto prefers WebGPU when available", () => {
  const source = readSource("src/workers/nativeRender.worker.ts");

  assert.match(source, /function chooseBackend\(requested: "auto" \| "webgpu" \| "webgl2", activeCanvas: OffscreenCanvas\)/);
  assert.match(source, /if \(requested === "webgl2"\) return "webgl2"/);
  assert.match(source, /return "gpu" in navigator \? "webgpu" : "webgl2"/);
  assert.doesNotMatch(source, /Keep auto on the completed compatible pipeline/);
});

test("webgpu readiness does not probe a second WebGL context on the same canvas", () => {
  const source = readSource("src/workers/nativeRender.worker.ts");

  assert.match(source, /backend === "webgpu" \? \{ maxTextureSize: 0, maxTextureUnits: 0 \} : detectWebglLimits\(canvas\)/);
  assert.match(source, /if \(!nativeRenderer && backend === "webgpu"\)/);
  assert.match(source, /backend = "webgl2"/);
});

test("native surface WebGPU gate launches a real Chrome WebGPU-capable browser first", () => {
  const source = readRepoSource("scripts/native-surface-baseline.mjs");

  assert.match(source, /const webgpuLaunchArgs = \[/);
  assert.match(source, /"--enable-unsafe-webgpu"/);
  assert.match(source, /"--ignore-gpu-blocklist"/);
  assert.match(source, /channel: wantsWebgpuProbe \? "chrome" : undefined/);
});
