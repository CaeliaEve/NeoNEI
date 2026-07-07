import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildNativeRuntimeRevision } from "../src/native-surface/NativeRuntimeRequestPolicy.ts";
import { loadNativeRuntimeManifest } from "../src/native-surface/runtimeLoader.ts";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const frontendRoot = resolve(__dirname, "..");

function readSource(relativePath) {
  return readFileSync(resolve(frontendRoot, relativePath), "utf8");
}

test("native runtime loader consumes current API envelope and file endpoint", () => {
  const loader = readSource("src/native-surface/runtimeLoader.ts");
  const requestPolicy = readSource("src/native-surface/NativeRuntimeRequestPolicy.ts");
  const abi = readSource("src/native-surface/NativeRuntimeAbi.ts");

  assert.match(loader, /CurrentRuntimeManifestEnvelope/);
  assert.match(loader, /unwrapCurrentRuntimeManifestPayload/);
  assert.match(loader, /"ok" in payload \|\| "data" in payload/);
  assert.match(loader, /Native runtime current manifest envelope is missing data/);
  assert.doesNotMatch(loader, /data \?\? \{\}/);
  assert.match(requestPolicy, /NATIVE_RUNTIME_REQUEST_POLICY_MODULE/);
  assert.match(requestPolicy, /NATIVE_RUNTIME_CURRENT_MANIFEST_PATH/);
  assert.match(requestPolicy, /NATIVE_RUNTIME_CURRENT_ASSET_BASE_PATH/);
  assert.match(abi, /api\/runtime\/current\/manifest/);
  assert.match(abi, /api\/runtime\/current\/asset/);
  assert.doesNotMatch(loader, /api\/native-runtime\/current/);
  assert.match(requestPolicy, /encodeRuntimeFilePath/);
  assert.match(requestPolicy, /buildNativeRuntimeRevision/);
  assert.match(requestPolicy, /appendNativeRuntimeRevision/);
  assert.match(requestPolicy, /missing authoritative revision identity/);
  assert.doesNotMatch(requestPolicy, /currentFallback/);
  assert.match(requestPolicy, /NATIVE_RUNTIME_REVISION\.queryParam/);
  assert.match(abi, /neoneiRuntime/);
  assert.doesNotMatch(abi, /currentFallback/);
  assert.match(loader, /resolveManifestRelativeUrl/);
  assert.doesNotMatch(loader, /new URL\(`rust\//, "runtime packs must not hardcode static rust URLs in the loader");
});

test("native runtime pack fetches are versioned before using browser cache", () => {
  const loader = readSource("src/native-surface/runtimeLoader.ts");
  const requestPolicy = readSource("src/native-surface/NativeRuntimeRequestPolicy.ts");
  const abi = readSource("src/native-surface/NativeRuntimeAbi.ts");

  assert.match(requestPolicy, /getManifestRuntimeFileBytes/);
  assert.match(requestPolicy, /manifest\.runtimeId/);
  assert.match(requestPolicy, /manifest\.generatedAt/);
  assert.match(requestPolicy, /manifest\.sourceSignature/);
  assert.match(requestPolicy, /createNativeRuntimePackCacheKey/);
  assert.match(loader, /getNativeRuntimeFetchCache\("pack"\)/);
  assert.match(abi, /pack:\s*"force-cache"/);
  assert.doesNotMatch(
    loader,
    /const cacheKey = `\$\{normalizedManifestUrl\}::\$\{name\}::\$\{url\}`/,
    "native runtime pack cache key must include manifest revision, not only the static URL",
  );
});

test("native runtime request policy is the shared URL and cache boundary", () => {
  const requestPolicy = readSource("src/native-surface/NativeRuntimeRequestPolicy.ts");
  const uiPackRuntime = readSource("src/services/uiPackRuntime.ts");
  const backgroundLoader = readSource("src/services/nativeUiBackgroundResourceLoader.ts");
  const loader = readSource("src/native-surface/runtimeLoader.ts");

  assert.match(requestPolicy, /NATIVE_RUNTIME_REQUEST_POLICY_MODULE/);
  assert.match(requestPolicy, /isPortableRuntimePath/);
  assert.match(requestPolicy, /resolveManifestRelativeUrl/);
  assert.match(requestPolicy, /getNativeRuntimeFetchCache/);
  assert.match(requestPolicy, /NATIVE_RUNTIME_REVISION_FIELDS/);
  assert.match(requestPolicy, /NATIVE_RUNTIME_AUTHORITATIVE_REVISION_FIELDS/);
  assert.match(requestPolicy, /NATIVE_RUNTIME_PACK_CACHE_KEY_FIELDS/);

  assert.match(loader, /from "\.\/NativeRuntimeRequestPolicy\.ts"/);
  assert.match(uiPackRuntime, /from "\.\.\/native-surface\/NativeRuntimeRequestPolicy\.ts"/);
  assert.match(backgroundLoader, /from "\.\.\/native-surface\/NativeRuntimeRequestPolicy\.ts"/);
  assert.match(uiPackRuntime, /getNativeRuntimeFetchCache\("report"\)/);
  assert.match(uiPackRuntime, /getNativeRuntimeFetchCache\("pack"\)/);
  assert.match(uiPackRuntime, /normalizeNativeRuntimeManifestUrl/);

  assert.doesNotMatch(uiPackRuntime, /function isPortableRelativePath/);
  assert.doesNotMatch(uiPackRuntime, /function isCurrentRuntimeManifestUrl/);
  assert.doesNotMatch(uiPackRuntime, /function encodeRuntimeFilePath/);
  assert.doesNotMatch(uiPackRuntime, /function resolveCurrentRuntimeAssetUrl/);
  assert.doesNotMatch(uiPackRuntime, /function resolveManifestRelativeUrl/);
  assert.doesNotMatch(uiPackRuntime, /cache:\s*"force-cache"/);
  assert.doesNotMatch(uiPackRuntime, /cache:\s*"no-cache"/);
});

test("homepage native runtime manifest defaults to current API", () => {
  const assetResolver = readSource("src/services/distDataRuntimeAssetResolver.ts");

  assert.match(assetResolver, /VITE_NATIVE_RUNTIME_MANIFEST_URL/);
  assert.match(assetResolver, /VITE_ENABLE_NATIVE_RUNTIME_PACKS/);
  assert.match(assetResolver, /return "\/api\/runtime\/current\/manifest"/);
  assert.doesNotMatch(
    assetResolver,
    /return joinAssetPath\(getConfiguredBasePath\(\), "rust\/runtime-manifest\.json"\)/,
    "homepage native runtime should use the semantic current API, not a hardcoded static rust manifest",
  );
});

test("dist-data static runtime assets revalidate when the active export changes", () => {
  const assetResolver = readSource("src/services/distDataRuntimeAssetResolver.ts");

  assert.match(assetResolver, /cache:\s*"no-cache"/);
  assert.doesNotMatch(
    assetResolver,
    /cache:\s*"force-cache"/,
    "dist-data URLs are stable across exports, so browser cache must revalidate instead of pinning stale packs",
  );
});


test("native runtime packs are on by default unless explicitly disabled", () => {
  const assetResolver = readSource("src/services/distDataRuntimeAssetResolver.ts");

  assert.match(assetResolver, /runtimePacksEnabled === "0"/);
  assert.match(assetResolver, /runtimePacksEnabled === "false"/);
  assert.match(assetResolver, /runtimePacksEnabled === "off"/);
  assert.doesNotMatch(
    assetResolver,
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


test("native runtime current API envelope fails closed before pack loading", async () => {
  const previousFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => ({
      ok: true,
      json: async () => ({ ok: true }),
    });
    await assert.rejects(
      () => loadNativeRuntimeManifest("http://neonei.test/runtime/missing-data-manifest.json"),
      /current manifest envelope is missing data/,
    );

    globalThis.fetch = async () => ({
      ok: true,
      json: async () => ({ ok: false, data: { entrypoints: {} } }),
    });
    await assert.rejects(
      () => loadNativeRuntimeManifest("http://neonei.test/runtime/blocked-manifest.json"),
      /current manifest envelope reported ok=false/,
    );
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("native runtime pack revision requires manifest-owned identity", () => {
  assert.throws(
    () => buildNativeRuntimeRevision({}, "rust/browser.bin"),
    /missing authoritative revision identity/,
  );
  assert.throws(
    () => buildNativeRuntimeRevision({ runtimeId: "runtime-a" }, "../browser.bin"),
    /revision path is not portable/,
  );
  assert.equal(
    buildNativeRuntimeRevision({ runtimeId: "runtime-a" }, "rust/browser.bin"),
    "runtime-a|rust/browser.bin",
  );
  assert.equal(
    buildNativeRuntimeRevision({ files: [{ path: "rust/browser.bin", bytes: 410 }] }, "rust/browser.bin"),
    "rust/browser.bin|410",
  );
});
