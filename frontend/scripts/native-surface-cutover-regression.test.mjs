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

test("native browser surface retires the DOM grid on the production native path", () => {
  const source = readSource("src/components/native-surface/NativeBrowserSurface.vue");

  assert.doesNotMatch(source, /HomeCanvasGrid/);
  assert.match(source, /Browser grid DOM fallback is retired on this path\./);
  assert.match(source, /nativeRenderVisible\.value\s*=\s*nativeRenderInitialized\s*&&\s*nativeFirstFrameReady/);
  assert.doesNotMatch(source, /nativeRenderVisible\.value\s*=\s*nativeRenderInitialized\s*&&\s*nativeTexturesReady\s*&&\s*nativeFirstFrameReady/);
  assert.match(source, /nativeTexturesReady\s*=\s*response\?\.type\s*===\s*"textureLoaded"\s*&&\s*response\.loaded\s*>\s*0/);
  assert.match(source, /nativeFirstFrameReady\s*=\s*response\?\.type\s*===\s*"frame"/);
  assert.match(source, /resetNativeRenderReadiness\(\)/);
});
