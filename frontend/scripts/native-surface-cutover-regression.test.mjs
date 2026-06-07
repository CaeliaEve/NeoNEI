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

test("native browser surface unmounts the fallback grid after the native renderer is visible", () => {
  const source = readSource("src/components/native-surface/NativeBrowserSurface.vue");

  assert.match(source, /<HomeCanvasGrid\s+v-if="!nativeRenderVisible"/);
  assert.match(source, /nativeRenderVisible\.value\s*=\s*nativeRenderInitialized\s*&&\s*nativeTexturesReady\s*&&\s*nativeFirstFrameReady/);
  assert.match(source, /nativeTexturesReady\s*=\s*response\?\.type\s*===\s*"textureLoaded"\s*&&\s*response\.loaded\s*>\s*0/);
  assert.match(source, /nativeFirstFrameReady\s*=\s*response\?\.type\s*===\s*"frame"/);
  assert.match(source, /resetNativeRenderReadiness\(\)/);
});
