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
  assert.match(source, /nativeRenderVisible\.value = nativeRenderInitialized/);
  assert.match(source, /nativeRenderVisible\.value = false/);
});

