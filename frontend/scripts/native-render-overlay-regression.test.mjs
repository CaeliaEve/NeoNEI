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
  assert.match(
    worker,
    /buildLayoutCommandBuffer\(\s*surface\.layoutCommands,\s*surface\.lastHit\?\.key \?\? null,\s*surface\.selectedItemId,?\s*\)/s,
  );
});

test("WebGL2 renderer parses and consumes GPU overlay flags", () => {
  const source = readSource("src/renderers/native/WebGl2NativeRenderer.ts");

  assert.match(source, /const flags = commandValues\[offset \+ fieldOffsets\.flags\] \?\? 0/);
  assert.match(source, /const isGroup = \(flags & 1\) !== 0/);
  assert.match(source, /const isHovered = \(flags & 4\) !== 0/);
  assert.match(source, /const isSelected = \(flags & 8\) !== 0/);
  assert.match(source, /cTL = \[0\.96, 0\.62, 0\.04, 0\.08\]/);
  assert.match(source, /cTL = \[0\.96, 0\.62, 0\.04, 0\.15\]/);
  assert.match(source, /const bx2 = x \+ size/);
  assert.match(source, /pushQuad\(bx2 - 17, by1 \+ 12\.25, bx2 - 9, by1 \+ 13\.75, plusColor\)/);
});

test("WebGPU renderer keeps overlay styling in GPU vertex data", () => {
  const source = readSource("src/renderers/native/WebGpuNativeRenderer.ts");

  assert.match(source, /const flags = commandValues\[offset \+ fieldOffsets\.flags\] \?\? 0/);
  assert.match(source, /const isGroup = \(flags & 1\) !== 0/);
  assert.match(source, /const isHovered = \(flags & 4\) !== 0/);
  assert.match(source, /const isSelected = \(flags & 8\) !== 0/);
  assert.match(source, /const inset = isHovered \|\| isSelected \? 0 : Math\.max/);
  assert.match(source, /cTL = \[0\.0, 0\.0, 0\.0, 0\.0\]/);
  assert.match(source, /const bx2 = x \+ size/);
  assert.match(source, /cursor = pushChromeQuad\(values, cursor, bx2 - 17, by1 \+ 12\.25, bx2 - 9, by1 \+ 13\.75, plusColor\)/);
});
