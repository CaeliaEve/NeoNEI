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

test("native render auto stays on pixel-validated WebGL2 unless WebGPU is explicit", () => {
  const source = readSource("src/workers/nativeRender.worker.ts");

  assert.match(source, /function chooseBackend\(requested: "auto" \| "webgpu" \| "webgl2", activeCanvas: OffscreenCanvas\)/);
  assert.match(source, /if \(requested === "webgl2"\) return "webgl2"/);
  assert.match(source, /if \(requested === "auto"\) return "webgl2"/);
  assert.match(source, /return "gpu" in navigator \? "webgpu" : "webgl2"/);
});

test("webgpu readiness does not probe a second WebGL context on the same canvas", () => {
  const source = readSource("src/workers/nativeRender.worker.ts");

  assert.match(source, /backend === "webgpu" \? \{ maxTextureSize: 0, maxTextureUnits: 0 \} : detectWebglLimits\(canvas\)/);
  assert.match(source, /if \(!nativeRenderer && backend === "webgpu"\)/);
  assert.match(source, /backend = "webgl2"/);
});

test("native browser surface defaults to WebGL2 and retires stale browser WebGPU overrides", () => {
  const source = readSource("src/components/native-surface/NativeBrowserSurface.vue");

  assert.match(source, /return "webgl2";\s*\n}/);
  assert.match(source, /if \(envBackend === "webgpu"\) return "webgpu"/);
  assert.match(source, /const explicitBackend = normalizeNativeRenderBackend\(window\.localStorage\.getItem\("neonei:native-render-backend"\)\)/);
  assert.match(source, /if \(explicitBackend === "webgpu"\)/);
  assert.match(source, /window\.localStorage\.removeItem\("neonei:native-render-backend"\)/);
});

test("native surface WebGPU gate launches a real Chrome WebGPU-capable browser first", () => {
  const source = readRepoSource("scripts/native-surface-baseline.mjs");

  assert.match(source, /const webgpuLaunchArgs = \[/);
  assert.match(source, /"--enable-unsafe-webgpu"/);
  assert.match(source, /"--ignore-gpu-blocklist"/);
  assert.match(source, /channel: wantsWebgpuProbe \? "chrome" : undefined/);
});
