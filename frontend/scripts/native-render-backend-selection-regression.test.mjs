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

test("native render backend selection uses an explicit probe plan", () => {
  const source = readSource("src/workers/nativeRender.worker.ts");
  const probeSource = readSource("src/renderers/native/NativeRendererProbe.ts");
  const sessionSource = readSource("src/services/nativeUiRendererSession.ts");

  assert.match(source, /function nativeRendererProbePlan\(requested: "auto" \| "webgpu" \| "webgl2"\)/);
  assert.match(source, /if \(requested === "webgpu"\) return \["webgpu"\]/);
  assert.match(source, /return \["webgl2"\]/);
  assert.match(source, /function probeRequestedNativeRenderer/);
  assert.match(source, /assertNativeRendererProbeSupported/);
  assert.match(source, /NativeRendererProbeError/);
  assert.doesNotMatch(source, /function chooseBackend/);
  assert.doesNotMatch(source, /WebGl2NativeRenderer\.create/);
  assert.doesNotMatch(source, /WebGpuNativeRenderer\.create/);
  assert.match(probeSource, /NATIVE_RENDERER_PROBE_POLICY/);
  assert.match(probeSource, /requestedBackendPolicy:\s*"exact-probe-no-fallback"/);
  assert.match(sessionSource, /NATIVE_UI_RENDERER_SESSION_POLICY/);
  assert.match(sessionSource, /WebGl2NativeRenderer\.probe/);
});

test("requested WebGPU readiness does not silently fall back to WebGL2", () => {
  const source = readSource("src/workers/nativeRender.worker.ts");

  assert.match(source, /backend === "webgpu" \? \{ maxTextureSize: 0, maxTextureUnits: 0 \} : detectWebglLimits\(canvas\)/);
  assert.match(source, /backend = null/);
  assert.match(source, /backendFallbackReason = error instanceof Error \? error\.message : String\(error\)/);
  assert.doesNotMatch(source, /backend = "webgl2"/);
  assert.doesNotMatch(source, /webgpu renderer initialization failed/);
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
