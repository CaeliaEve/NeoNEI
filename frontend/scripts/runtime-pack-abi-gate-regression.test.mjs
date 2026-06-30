import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PACK_ABI_VALIDATION_REPORT_PATH,
  RUNTIME_PACK_CONTRACTS,
  resolveNativePackPath,
  resolvePackValidationReportPath,
  validatePackAbiReport,
} from '../src/services/distDataRuntimePackAbi.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const frontendRoot = resolve(__dirname, '..');
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

test('runtime pack ABI gate resolves compiler-declared report and native entrypoints', () => {
  const manifest = {
    files: {
      rustRuntimeManifest: 'rust/runtime-manifest.json',
    },
  };
  const runtimeManifest = {
    entrypoints: {
      recipes: 'rust/recipes.bin',
    },
    files: [
      { path: 'rust/recipes.bin', bytes: 410 },
      { path: PACK_ABI_VALIDATION_REPORT_PATH, bytes: 8062 },
    ],
  };

  assert.equal(resolveNativePackPath(manifest, runtimeManifest, RUNTIME_PACK_CONTRACTS.recipes), 'rust/recipes.bin');
  assert.equal(resolvePackValidationReportPath(manifest, runtimeManifest), PACK_ABI_VALIDATION_REPORT_PATH);
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
  assert.match(runtimeSource, /resolvePackValidationReportPath\(manifest, runtimeManifest\)/);
  assert.match(runtimeSource, /validatePackAbiReport\(report, contract, binaryPath\)/);
  assert.match(runtimeSource, /RUNTIME_PACK_CONTRACTS\.browser/);
  assert.match(runtimeSource, /RUNTIME_PACK_CONTRACTS\.groups/);
  assert.match(runtimeSource, /RUNTIME_PACK_CONTRACTS\.search/);
  assert.match(runtimeSource, /RUNTIME_PACK_CONTRACTS\.recipes/);
  assert.match(renderSource, /RUNTIME_PACK_CONTRACTS\.textures\.schema/);

  assert.doesNotMatch(runtimeSource, /manifest\?\.files\?\.rustBrowserPack \?\? manifest\?\.files\?\.rustBrowserBin/);
  assert.doesNotMatch(runtimeSource, /\.then\(parseNativeBrowserPackPayload\)\s*\.catch\(\(\) => null\)/);
  assert.doesNotMatch(runtimeSource, /parseNativeBinaryPackEnvelope\(buffer, "neonei\/search-pack\/current"\)[\s\S]*?\.catch\(\(error\)/);
});
