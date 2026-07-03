import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PACK_ABI_VALIDATION_REPORT_PATH,
  RUNTIME_PACK_CONTRACTS,
  runtimeManifestEntrypoints,
  resolveNativePackPath,
  resolvePackValidationReportPath,
  validatePackAbiReport,
} from '../src/services/distDataRuntimePackAbi.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const frontendRoot = resolve(__dirname, '..');
const packAbiSource = readFileSync(resolve(frontendRoot, 'src/services/distDataRuntimePackAbi.ts'), 'utf8').replace(/\r\n/g, '\n');
const runtimeSource = readFileSync(resolve(frontendRoot, 'src/services/distDataRuntime.ts'), 'utf8').replace(/\r\n/g, '\n');
const renderSource = readFileSync(resolve(frontendRoot, 'src/services/distDataRuntimeRender.ts'), 'utf8').replace(/\r\n/g, '\n');

function okReport(overrides = {}) {
  return {
    schemaVersion: 'elysium-compiler/pack-abi-validation/v1',
    packAbiVersion: 'elysium.pack.v1',
    status: 'ok',
    missingRequiredArtifacts: [],
    pathViolations: [],
    policy: { legacyFallback: 'forbidden' },
    artifacts: [
      {
        logicalName: 'rustRecipeBin',
        path: 'rust/recipes.bin',
        kind: 'binary-pack',
        status: 'present',
        required: true,
      },
    ],
    ...overrides,
  };
}

test('runtime pack ABI gate resolves compiler-declared runtime-manifest entrypoints only', () => {
  const runtimeManifest = {
    entrypoints: {
      recipes: 'rust/recipes.bin',
    },
    files: [
      { path: 'rust/recipes.bin', bytes: 410 },
      { path: PACK_ABI_VALIDATION_REPORT_PATH, bytes: 8062 },
    ],
  };

  assert.equal(resolveNativePackPath(runtimeManifest, RUNTIME_PACK_CONTRACTS.recipes), 'rust/recipes.bin');
  assert.equal(resolvePackValidationReportPath(runtimeManifest), PACK_ABI_VALIDATION_REPORT_PATH);
});

test('runtime pack ABI gate rejects legacy manifest-file and files-to-entrypoint fallbacks', () => {
  assert.equal(resolveNativePackPath(null, RUNTIME_PACK_CONTRACTS.recipes), null);
  assert.deepEqual(runtimeManifestEntrypoints({
    files: [
      { path: 'rust/recipes.bin', bytes: 410 },
    ],
  }), {});
  assert.equal(resolveNativePackPath({
    files: [
      { path: 'rust/recipes.bin', bytes: 410 },
    ],
  }, RUNTIME_PACK_CONTRACTS.recipes), null);
  assert.equal(resolvePackValidationReportPath({
    entrypoints: {
      packValidationReport: PACK_ABI_VALIDATION_REPORT_PATH,
      packAbiValidationReport: PACK_ABI_VALIDATION_REPORT_PATH,
    },
    files: [],
  }), null);
  assert.doesNotMatch(packAbiSource, /manifestFile/);
  assert.doesNotMatch(packAbiSource, /runtimeManifestFileRecord/);
  assert.doesNotMatch(packAbiSource, /manifest\\.files\\?\\.\\[contract\\.manifestFile\\]/);
});

test('runtime pack ABI gate validates report policy and artifact contract before binary parse', () => {
  const success = validatePackAbiReport(okReport(), RUNTIME_PACK_CONTRACTS.recipes, 'rust/recipes.bin');
  assert.equal(success.ok, true);
  assert.deepEqual(success.violations, []);

  const blocked = validatePackAbiReport(okReport({ status: 'blocked' }), RUNTIME_PACK_CONTRACTS.recipes, 'rust/recipes.bin');
  assert.equal(blocked.ok, false);
  assert.match(blocked.violations.join('\n'), /status must be ok/);

  const fallbackAllowed = validatePackAbiReport(
    okReport({ policy: { legacyFallback: 'allowed' } }),
    RUNTIME_PACK_CONTRACTS.recipes,
    'rust/recipes.bin',
  );
  assert.equal(fallbackAllowed.ok, false);
  assert.match(fallbackAllowed.violations.join('\n'), /legacyFallback must be forbidden/);

  const pathMismatch = validatePackAbiReport(okReport(), RUNTIME_PACK_CONTRACTS.recipes, 'rust/other-recipes.bin');
  assert.equal(pathMismatch.ok, false);
  assert.match(pathMismatch.violations.join('\n'), /artifact path mismatch for rustRecipeBin/);
});

test('dist-data runtime does not derive binary packs from legacy JSON filenames', () => {
  const recipePathBody = runtimeSource.slice(
    runtimeSource.indexOf('async function getRustRecipeBinaryPath'),
    runtimeSource.indexOf('async function getRustTextureBinaryPath'),
  );
  const texturePathBody = runtimeSource.slice(
    runtimeSource.indexOf('async function getRustTextureBinaryPath'),
    runtimeSource.indexOf('async function getRustRecipePack'),
  );

  assert.doesNotMatch(recipePathBody, /recipe-pack\.json/);
  assert.doesNotMatch(recipePathBody, /replace\(/);
  assert.doesNotMatch(texturePathBody, /texture-pack\.json/);
  assert.doesNotMatch(texturePathBody, /replace\(/);
});

test('native browser/search/recipe/texture readers are gated by pack ABI report before binary parse', () => {
  assert.match(runtimeSource, /resolvePackValidationReportPath\(runtimeManifest\)/);
  assert.match(runtimeSource, /validatePackAbiReport\(report, contract, binaryPath\)/);
  assert.match(runtimeSource, /RUNTIME_PACK_CONTRACTS\.browser/);
  assert.match(runtimeSource, /RUNTIME_PACK_CONTRACTS\.groups/);
  assert.match(runtimeSource, /RUNTIME_PACK_CONTRACTS\.search/);
  assert.match(runtimeSource, /RUNTIME_PACK_CONTRACTS\.recipes/);
  assert.match(renderSource, /RUNTIME_PACK_CONTRACTS\.textures\.schema/);

  assert.doesNotMatch(runtimeSource, /manifest\?\.files\?\.rustBrowserPack \?\? manifest\?\.files\?\.rustBrowserBin/);
  assert.doesNotMatch(runtimeSource, /resolveNativePackPath\(manifest, runtimeManifest, contract\)/);
  assert.doesNotMatch(runtimeSource, /\.then\(parseNativeBrowserPackPayload\)\s*\.catch\(\(\) => null\)/);
  assert.doesNotMatch(runtimeSource, /parseNativeBinaryPackEnvelope\(buffer, "neonei\/search-pack\/current"\)[\s\S]*?\.catch\(\(error\)/);
});
