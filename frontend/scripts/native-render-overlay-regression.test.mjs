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

test("native surface command buffer carries GPU overlay flags", () => {
  const protocol = readSource("src/native-surface/NativeSurfaceEngineProtocol.ts");
  const worker = readSource("src/workers/nativeSurfaceEngine.worker.ts");
  const layout = readSource("src/workers/nativeSurfaceLayout.ts");

  assert.match(protocol, /NATIVE_SURFACE_LAYOUT_COMMAND_U32_STRIDE\s*=\s*9/);
  assert.match(layout, /values\[offset \+ 8\]\s*=\s*\(command\.kind === "group-collapsed" \? 1 : 0\)/);
  assert.match(layout, /command\.kind === "group-header" \? 2 : 0/);
  assert.match(layout, /hoverKey === command\.key \? 4 : 0/);
  assert.match(layout, /selectedItemId && command\.itemId === selectedItemId \? 8 : 0/);
  assert.match(worker, /buildLayoutCommandBuffer\(surface\.layoutCommands, surface\.lastHit\?\.key \?\? null, surface\.selectedItemId\)/);
});

test("WebGL2 renderer parses and consumes GPU overlay flags", () => {
  const source = readSource("src/renderers/native/WebGl2NativeRenderer.ts");

  assert.match(source, /flags:\s*number/);
  assert.match(source, /flags:\s*values\[offset \+ 8\] \?\? 0/);
  assert.match(source, /const isGroup = \(command\.flags & 1\) !== 0/);
  assert.match(source, /const isHovered = \(command\.flags & 4\) !== 0/);
  assert.match(source, /const isSelected = \(command\.flags & 8\) !== 0/);
  assert.match(source, /isHovered\s*\? \[0\.96, 0\.68, 0\.24, 0\.58\]/);
  assert.match(source, /isSelected\s*\?\s*\[0\.14, 0\.78, 0\.92, 0\.62\]/);
  assert.match(source, /const badge = Math\.max\(10, Math\.floor\(command\.size \* 0\.32\)\)/);
  assert.match(source, /pushQuad\(x2 - badge, y1, x2, y1 \+ strip, badgeColor\)/);
  assert.match(source, /pushQuad\(x2 - strip, y1, x2, y1 \+ badge, badgeColor\)/);
});

test("WebGPU renderer keeps overlay styling in GPU vertex data", () => {
  const source = readSource("src/renderers/native/WebGpuNativeRenderer.ts");

  assert.match(source, /const isGroup = \(command\.flags & 1\) !== 0/);
  assert.match(source, /const isHovered = \(command\.flags & 4\) !== 0/);
  assert.match(source, /const isSelected = \(command\.flags & 8\) !== 0/);
  assert.match(source, /const inset = isHovered \|\| isSelected \? 0 : Math\.max/);
  assert.match(source, /isGroup\s*\? \[0\.08, 0\.42, 0\.52, 0\.56\]/);
  assert.match(source, /const badge = Math\.max\(10, Math\.floor\(command\.size \* 0\.32\)\)/);
  assert.match(source, /pushChromeQuad\(values, cursor, x2 - badge, y1, x2, y1 \+ strip, badgeColor\)/);
  assert.match(source, /pushChromeQuad\(values, cursor, x2 - strip, y1, x2, y1 \+ badge, badgeColor\)/);
});
