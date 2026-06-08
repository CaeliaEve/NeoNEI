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

test("native runtime loader consumes current API envelope and file endpoint", () => {
  const loader = readSource("src/native-surface/runtimeLoader.ts");

  assert.match(loader, /CurrentNativeRuntimeManifestEnvelope/);
  assert.match(loader, /"ok" in payload && "data" in payload/);
  assert.match(loader, /api\/runtime\/current\/manifest/);
  assert.match(loader, /api\/runtime\/current\/asset/);
  assert.match(loader, /api\/native-runtime\/current\/manifest/);
  assert.match(loader, /api\/native-runtime\/current\/files/);
  assert.match(loader, /encodeRuntimeFilePath/);
  assert.doesNotMatch(loader, /new URL\(`rust\//, "runtime packs must not hardcode static rust URLs in the loader");
});

test("homepage native runtime manifest defaults to current API", () => {
  const distRuntime = readSource("src/services/distDataRuntime.ts");

  assert.match(distRuntime, /VITE_NATIVE_RUNTIME_MANIFEST_URL/);
  assert.match(distRuntime, /VITE_ENABLE_NATIVE_RUNTIME_PACKS/);
  assert.match(distRuntime, /return "\/api\/runtime\/current\/manifest"/);
  assert.doesNotMatch(
    distRuntime,
    /return joinAssetPath\(getConfiguredBasePath\(\), "rust\/runtime-manifest\.json"\)/,
    "homepage native runtime should use the semantic current API, not a hardcoded static rust manifest",
  );
});


test("native runtime packs are on by default unless explicitly disabled", () => {
  const distRuntime = readSource("src/services/distDataRuntime.ts");

  assert.match(distRuntime, /runtimePacksEnabled === "0"/);
  assert.match(distRuntime, /runtimePacksEnabled === "false"/);
  assert.match(distRuntime, /runtimePacksEnabled === "off"/);
  assert.doesNotMatch(
    distRuntime,
    /runtimePacksEnabled !== "1" && runtimePacksEnabled !== "true"/,
    "native runtime packs must not require an opt-in env flag on the production homepage",
  );
});

test("recipe detail hydration uses the low-frequency current recipe page API", () => {
  const client = readSource("src/runtime/indexedRecipeClient.ts");
  const facade = readSource("src/services/api/runtimeFacade.ts");
  const hydrator = readSource("src/composables/useRecipeDetailHydrator.ts");

  assert.match(client, /getCurrentRecipePage/);
  assert.match(client, /\/recipes\/page\/\$\{encodeURIComponent\(normalizedRecipePageId\)\}/);
  assert.match(client, /CurrentApiEnvelope/);
  assert.match(facade, /getCurrentRecipePage\(recipePageId: string/);
  assert.match(hydrator, /hydrateFromCurrentRecipePageApi/);
  assert.match(hydrator, /api\.getCurrentRecipePage\(recipeId\)/);
  assert.match(hydrator, /convertIndexedRecipe\(page\.recipe\)/);
  assert.match(hydrator, /additionalData\.uiPayload = page\.uiPayload/);
});
