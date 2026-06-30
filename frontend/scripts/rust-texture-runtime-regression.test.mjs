import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..", "..");

function readRepoSource(relativePath) {
  return readFileSync(resolve(repoRoot, relativePath), "utf8");
}

test("rust texture runtime gate blocks invalid atlas bounds", () => {
  const validator = readRepoSource("scripts/validate-rust-texture-runtime.mjs");
  const compilerClient = readRepoSource("backend/src/compiler-client/elysium-compiler-client.ts");

  assert.match(validator, /invalidAtlasBounds/);
  assert.match(validator, /RUST_TEXTURE_INVALID_ATLAS_BOUNDS/);
  assert.match(validator, /invalid atlas placement bounds/);
  assert.match(validator, /Number\(texturePack\?\.counts\?\.invalidAtlasBounds \?\? 0\) > 0/);
  assert.match(compilerClient, /class ElysiumCompilerClient/);
  assert.match(compilerClient, /const args = \['validate', '--input', options\.input, '--report', options\.report\]/);
  assert.doesNotMatch(validator, /tools\/neonei-compiler-rs/);
});
