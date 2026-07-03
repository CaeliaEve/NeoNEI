import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  NATIVE_RUNTIME_CAPABILITIES,
  NATIVE_RUNTIME_PACK_NAMES,
  NATIVE_RUNTIME_PACK_SCHEMAS,
  NATIVE_RUNTIME_REQUIRED_CAPABILITIES,
  NATIVE_RUNTIME_UI_PACK_SCHEMAS,
  NATIVE_UI_RUNTIME_REQUIRED_ENTRYPOINTS,
} from '../src/native-surface/NativeRuntimeAbi.ts';
import {
  assertNativeRuntimeProfilePolicy,
  getNativeRuntimePackNamesForProfile,
  resolveNativeRuntimeProfilePolicy,
} from '../src/native-surface/NativeRuntimeProfilePolicy.ts';
import {
  NATIVE_RUNTIME_CATALOG_ABI,
  NATIVE_RUNTIME_CAPABILITY_DESCRIPTOR_LIST,
  NATIVE_RUNTIME_PACK_DESCRIPTOR_LIST,
  NATIVE_RUNTIME_PROFILE_POLICY_DESCRIPTOR_LIST,
  NATIVE_RUNTIME_UI_PACK_DESCRIPTOR_LIST,
} from '../src/native-surface/NativeRuntimeCatalog.ts';
import {
  clearNativeRuntimePackCache,
  loadNativeRuntimeBuffersForProfile,
} from '../src/native-surface/runtimePackCache.ts';

const frontendRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function readSource(relativePath) {
  return readFileSync(resolve(frontendRoot, relativePath), 'utf8').replace(/\r\n/g, '\n');
}

test('native runtime catalog owns ABI pack, UI entrypoint, capability, and profile descriptors', () => {
  assert.equal(NATIVE_RUNTIME_CATALOG_ABI.schema, 'neonei/native-runtime-catalog/current');
  assert.equal(NATIVE_RUNTIME_CATALOG_ABI.buildPolicy, 'descriptor-table-runtime-abi-projection');
  assert.equal(NATIVE_RUNTIME_CATALOG_ABI.failurePolicy, 'fail-closed-native-runtime-abi');
  assert.equal(NATIVE_RUNTIME_CATALOG_ABI.snapshotPolicy, 'rcu-immutable-catalog-snapshot');

  assert.deepEqual(
    NATIVE_RUNTIME_PACK_NAMES,
    NATIVE_RUNTIME_PACK_DESCRIPTOR_LIST.map((descriptor) => descriptor.name),
  );
  assert.deepEqual(
    NATIVE_RUNTIME_PACK_SCHEMAS,
    Object.fromEntries(NATIVE_RUNTIME_PACK_DESCRIPTOR_LIST.map((descriptor) => [descriptor.name, descriptor.schema])),
  );
  assert.deepEqual(
    NATIVE_RUNTIME_UI_PACK_SCHEMAS,
    Object.fromEntries(NATIVE_RUNTIME_UI_PACK_DESCRIPTOR_LIST.map((descriptor) => [descriptor.name, descriptor.schema])),
  );
  assert.deepEqual(NATIVE_UI_RUNTIME_REQUIRED_ENTRYPOINTS, ['uiTemplates', 'uiBindings', 'uiStrings']);
  assert.deepEqual(
    NATIVE_RUNTIME_CAPABILITIES,
    NATIVE_RUNTIME_CAPABILITY_DESCRIPTOR_LIST.map((descriptor) => descriptor.name),
  );
  assert.deepEqual(NATIVE_RUNTIME_REQUIRED_CAPABILITIES, [
    'recipes.native-ui-layout',
    'recipes.ui-pack',
    'native-render.webgl2',
  ]);
  assert.deepEqual(
    NATIVE_RUNTIME_PROFILE_POLICY_DESCRIPTOR_LIST.map((descriptor) => descriptor.profile),
    ['browser-surface', 'history-surface', 'search', 'recipe', 'full'],
  );
});

test('native runtime profile policies expose profile pack lists and capabilities from the catalog', () => {
  assert.deepEqual(getNativeRuntimePackNamesForProfile('browser-surface'), [
    'browser',
    'groups',
    'search',
    'textures',
    'animations',
    'stringsZhCn',
  ]);
  assert.deepEqual(getNativeRuntimePackNamesForProfile('history-surface'), [
    'browser',
    'textures',
    'animations',
    'stringsZhCn',
  ]);
  assert.deepEqual(getNativeRuntimePackNamesForProfile('recipe'), [
    'recipes',
    'textures',
    'animations',
    'stringsZhCn',
  ]);

  assert.deepEqual(resolveNativeRuntimeProfilePolicy('browser-surface').capabilities, [
    'groups.collapse',
    'search.zh-cn',
    'strings.zh-cn',
    'native-render.webgl2',
  ]);
  assert.deepEqual(resolveNativeRuntimeProfilePolicy('full').capabilities, [
    'groups.collapse',
    'recipes.lookup',
    'search.zh-cn',
    'strings.zh-cn',
    'native-render.webgl2',
  ]);
});

test('native runtime profile policy fails on missing declared capabilities', () => {
  assert.throws(
    () => assertNativeRuntimeProfilePolicy({
      schema: 'neonei/runtime/current',
      runtimeId: 'profile-policy-test',
      capabilities: ['groups.collapse', 'strings.zh-cn'],
      entrypoints: {},
    }, 'browser-surface'),
    /native runtime profile browser-surface manifest is missing required capabilities: search\.zh-cn, native-render\.webgl2/,
  );
});

test('native runtime profile policy rejects unknown profiles instead of falling back', () => {
  assert.throws(
    () => resolveNativeRuntimeProfilePolicy('legacy-browser' /** @type {never} */),
    /Unknown native runtime pack profile: legacy-browser/,
  );
});

test('native runtime catalog is the only owner of runtime ABI/profile tables', () => {
  const catalogSource = readSource('src/native-surface/NativeRuntimeCatalog.ts');
  const policySource = readSource('src/native-surface/NativeRuntimeProfilePolicy.ts');
  const abiSource = readSource('src/native-surface/NativeRuntimeAbi.ts');
  const manifestSource = readSource('src/native-surface/NativeRuntimeManifest.ts');
  const runtimeLoaderSource = readSource('src/native-surface/runtimeLoader.ts');
  const nativeBinaryPackSource = readSource('src/services/distDataNativeBinaryPack.ts');
  const capabilityGateSource = readSource('src/native-surface/NativeRuntimeCapabilityGate.ts');
  const cacheSource = readSource('src/native-surface/runtimePackCache.ts');
  const controllerSource = readSource('src/native-surface/NativeSurfaceController.ts');
  const browserSurfaceSource = readSource('src/components/native-surface/NativeBrowserSurface.vue');

  assert.match(catalogSource, /NATIVE_RUNTIME_CATALOG_ABI/);
  assert.match(catalogSource, /schema: "neonei\/native-runtime-catalog\/current"/);
  assert.match(catalogSource, /buildPolicy: "descriptor-table-runtime-abi-projection"/);
  assert.match(catalogSource, /failurePolicy: "fail-closed-native-runtime-abi"/);
  assert.match(catalogSource, /snapshotPolicy: "rcu-immutable-catalog-snapshot"/);
  assert.match(catalogSource, /NATIVE_RUNTIME_PACK_DESCRIPTOR_LIST/);
  assert.match(catalogSource, /NATIVE_RUNTIME_UI_PACK_DESCRIPTOR_LIST/);
  assert.match(catalogSource, /NATIVE_RUNTIME_CAPABILITY_DESCRIPTOR_LIST/);
  assert.match(catalogSource, /NATIVE_RUNTIME_PROFILE_POLICY_DESCRIPTOR_LIST/);
  assert.match(catalogSource, /validateRuntimeProfileDescriptors/);
  assert.match(catalogSource, /projectProfileMap/);

  assert.match(abiSource, /from "\.\/NativeRuntimeCatalog\.ts"/);
  assert.match(abiSource, /NATIVE_RUNTIME_CATALOG_PACK_NAMES/);
  assert.match(abiSource, /NATIVE_RUNTIME_CATALOG_PACK_SCHEMAS/);
  assert.match(abiSource, /NATIVE_RUNTIME_CATALOG_UI_PACK_SCHEMAS/);
  assert.match(abiSource, /NATIVE_RUNTIME_CATALOG_REQUIRED_CAPABILITIES/);
  assert.match(abiSource, /NATIVE_RUNTIME_CATALOG_REQUIRED_ENTRYPOINTS/);
  assert.doesNotMatch(abiSource, /browser: "neonei\/browser-pack\/current"/);
  assert.doesNotMatch(abiSource, /uiTemplates: "neonei\/ui-template-pack\/current"/);
  assert.doesNotMatch(abiSource, /"groups\.semantic-nbt"/);

  assert.match(abiSource, /NATIVE_RUNTIME_MANIFEST_SCHEMA = "neonei\/runtime\/current"/);
  assert.match(abiSource, /NATIVE_RUNTIME_PACK_MAGIC = "NNEIBIN\\0"/);
  assert.match(abiSource, /NATIVE_RUNTIME_PACK_VERSION = 1/);
  assert.match(abiSource, /NATIVE_RUNTIME_PACK_HEADER_BYTES = 24/);
  assert.match(abiSource, /NATIVE_RUNTIME_PAYLOAD_ENCODINGS/);
  assert.match(abiSource, /NATIVE_RUNTIME_CAPABILITIES/);
  assert.match(abiSource, /NATIVE_RUNTIME_PACK_SCHEMAS/);
  assert.match(abiSource, /NATIVE_UI_RUNTIME_REQUIRED_ENTRYPOINTS/);
  assert.match(abiSource, /NATIVE_RUNTIME_CURRENT_MANIFEST_PATH = "\/api\/runtime\/current\/manifest"/);
  assert.match(abiSource, /NATIVE_RUNTIME_CURRENT_ASSET_BASE_PATH = "\/api\/runtime\/current\/asset\/"/);
  assert.match(abiSource, /NATIVE_RUNTIME_DEFAULT_BASE_URL = "http:\/\/localhost\/"/);
  assert.match(abiSource, /NATIVE_RUNTIME_FETCH_CACHE/);
  assert.match(abiSource, /NATIVE_RUNTIME_REVISION/);

  assert.match(policySource, /NATIVE_RUNTIME_PROFILE_POLICY_MAP/);
  assert.match(policySource, /from "\.\/NativeRuntimeCatalog\.ts"/);
  assert.doesNotMatch(policySource, /"browser-surface": \{/);
  assert.doesNotMatch(policySource, /packs: \["browser", "groups", "search"/);
  assert.match(manifestSource, /from "\.\/NativeRuntimeAbi\.ts"/);
  assert.match(manifestSource, /schema\?: typeof NATIVE_RUNTIME_MANIFEST_SCHEMA/);
  assert.doesNotMatch(manifestSource, /export type NativeRuntimeCapability =/);
  assert.match(runtimeLoaderSource, /from "\.\/NativeRuntimeAbi\.ts"/);
  assert.doesNotMatch(runtimeLoaderSource, /const NATIVE_PACK_MAGIC|const NATIVE_PACK_HEADER_BYTES/);
  assert.doesNotMatch(runtimeLoaderSource, /version !== 1/);
  assert.doesNotMatch(runtimeLoaderSource, /"\/api\/runtime\/current\/manifest"/);
  assert.doesNotMatch(runtimeLoaderSource, /"\/api\/runtime\/current\/asset\/"/);
  assert.doesNotMatch(runtimeLoaderSource, /"http:\/\/localhost\/"/);
  assert.doesNotMatch(runtimeLoaderSource, /cache: "no-cache"/);
  assert.doesNotMatch(runtimeLoaderSource, /cache: "force-cache"/);
  assert.doesNotMatch(runtimeLoaderSource, /"neoneiRuntime"/);
  assert.doesNotMatch(runtimeLoaderSource, /\|current/);
  assert.match(runtimeLoaderSource, /NATIVE_RUNTIME_PAYLOAD_ENCODINGS\.compactBrowserTable/);
  assert.match(nativeBinaryPackSource, /from "\.\.\/native-surface\/NativeRuntimeAbi\.ts"/);
  assert.doesNotMatch(nativeBinaryPackSource, /const NATIVE_BINARY_PACK_MAGIC|const NATIVE_BINARY_PACK_HEADER_BYTES/);
  assert.doesNotMatch(nativeBinaryPackSource, /version !== 1/);
  assert.match(capabilityGateSource, /from "\.\/NativeRuntimeAbi\.ts"/);
  assert.doesNotMatch(cacheSource, /PROFILE_PACKS|Record<NativeRuntimePackProfile, readonly NativeRuntimePackName\[]>/);
  assert.doesNotMatch(cacheSource, /\?\? PROFILE_PACKS\.full/, 'runtime pack cache must not fallback to full profile');
  assert.match(cacheSource, /assertNativeRuntimeProfilePolicy\(manifest, profile\)/);
  assert.match(controllerSource, /from "\.\/NativeRuntimeProfilePolicy"/);
  assert.match(browserSurfaceSource, /from "\.\.\/\.\.\/native-surface\/NativeRuntimeProfilePolicy"/);
});

test('profile loader gates manifest capabilities before fetching runtime pack artifacts', async () => {
  clearNativeRuntimePackCache();
  const manifest = {
    schema: 'neonei/runtime/current',
    runtimeId: 'profile-loader-test',
    capabilities: ['groups.collapse', 'strings.zh-cn'],
    entrypoints: {
      browser: 'rust/browser.bin',
      groups: 'rust/groups.bin',
      search: 'rust/search.bin',
      textures: 'rust/textures.bin',
      animations: 'rust/animations.bin',
      stringsZhCn: 'rust/strings.zh_cn.bin',
    },
  };
  const originalFetch = globalThis.fetch;
  let artifactFetches = 0;
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.endsWith('/api/runtime/current/manifest?case=profile-gate')) {
      return new Response(JSON.stringify(manifest), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    artifactFetches += 1;
    throw new Error(`profile policy should reject before fetching artifact: ${url}`);
  };
  try {
    await assert.rejects(
      () => loadNativeRuntimeBuffersForProfile('/api/runtime/current/manifest?case=profile-gate', 'browser-surface'),
      /native runtime profile browser-surface manifest is missing required capabilities: search\.zh-cn, native-render\.webgl2/,
    );
    assert.equal(artifactFetches, 0);
  } finally {
    globalThis.fetch = originalFetch;
    clearNativeRuntimePackCache();
  }
});
