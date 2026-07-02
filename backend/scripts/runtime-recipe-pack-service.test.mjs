import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);

const repoRoot = resolve(import.meta.dirname, '..', '..');
const backendRoot = resolve(import.meta.dirname, '..');
const compiler = resolve(repoRoot, '..', 'elysium-compiler', 'target', 'release', 'elysium-compiler.exe');
const fixture = resolve(repoRoot, '..', 'elysium-compiler', 'crates', 'elysium-compiler-core', 'fixtures', 'raw-export-minimal');

function tempRoot(prefix) {
  return join(tmpdir(), `${prefix}-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`);
}

function runCompiler(args, label) {
  const result = spawnSync(compiler, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: 'pipe',
  });
  assert.equal(result.status, 0, `${label} failed: ${result.stderr || result.stdout}`);
}

test('runtime recipe pack service reads produced-by and used-in refs from compiler pack', () => {
  assert.equal(existsSync(compiler), true, 'elysium-compiler release binary must exist for recipe pack service smoke');
  const workDir = tempRoot('neonei-runtime-recipe-pack');
  const distDataDir = join(workDir, 'dist-data');
  mkdirSync(distDataDir, { recursive: true });
  try {
    runCompiler(['compile', '--input', fixture, '--output', distDataDir, '--report', join(workDir, 'compile-report.json'), '--scope', 'native-ui'], 'compile fixture');
    assert.equal(existsSync(join(distDataDir, 'rust', 'recipes.bin')), true, 'fixture compile should produce recipes.bin');

    process.env.DIST_DATA_DIR = distDataDir;
    process.env.TS_NODE_PROJECT = resolve(backendRoot, 'tsconfig.json');
    require('ts-node/register');
    const { RuntimeRecipePackService, RUNTIME_RECIPE_PACK_SCHEMA } = require(resolve(
      backendRoot,
      'src/services/runtime-recipe-pack.service.ts',
    ));
    assert.equal(RUNTIME_RECIPE_PACK_SCHEMA, 'neonei/recipe-pack/current');
    const service = new RuntimeRecipePackService();
    const manifest = JSON.parse(readFileSync(join(distDataDir, 'manifest.json'), 'utf8'));
    const runtimeManifest = JSON.parse(readFileSync(join(distDataDir, 'rust', 'runtime-manifest.json'), 'utf8'));
    assert.equal(runtimeManifest.entrypoints.recipes, 'rust/recipes.bin');
    assert.equal(manifest.files.rustRuntimeManifest, 'rust/runtime-manifest.json');

    const queryItemId = 'i~minecraft~iron_ingot~0';
    const produced = service.getItemProducedBy(queryItemId);
    const used = service.getItemUsedIn(queryItemId);
    assert.equal(produced?.itemId, queryItemId);
    assert.equal(used?.itemId, queryItemId);
    assert.equal(Array.isArray(produced?.recipes), true);
    assert.equal(Array.isArray(used?.recipes), true);
    assert.equal(typeof produced?.summary.counts.producedBy, 'number');
    assert.equal(typeof used?.summary.counts.usedIn, 'number');
    const page = service.getRecipePage('r_fixture_gt');
    assert.equal(page?.recipePageId, 'r_fixture_gt');
    assert.equal(page?.recipe.id, 'r_fixture_gt');
    assert.equal(page?.recipe.additionalData.runtimePackBacked, true);
    assert.equal(page?.recipe.additionalData.uiPayloadPath, 'recipes/ui-payload-shards/91.json');
    assert.equal(page?.uiPayload?.recipeId, 'r_fixture_gt');
    assert.equal(page?.uiPayload?.schemaVersion, 'neonei/recipe-ui-payload/v1');
  } finally {
    delete process.env.DIST_DATA_DIR;
    delete process.env.TS_NODE_PROJECT;
    rmSync(workDir, { recursive: true, force: true });
  }
});


test('runtime recipe pack service builds map-backed query indexes', () => {
  const source = readFileSync(join(backendRoot, 'src/services/runtime-recipe-pack.service.ts'), 'utf8').replace(/\r\n/g, '\n');
  const abiSource = readFileSync(join(backendRoot, 'src/services/native-runtime-pack-abi.ts'), 'utf8').replace(/\r\n/g, '\n');
  assert.match(abiSource, /NATIVE_RUNTIME_PACK_MAGIC = 'NNEIBIN\\0'/);
  assert.match(abiSource, /NATIVE_RUNTIME_PACK_HEADER_BYTES = 24/);
  assert.match(abiSource, /RUNTIME_RECIPE_PACK_SCHEMA = 'neonei\/recipe-pack\/current'/);
  assert.match(abiSource, /RUNTIME_RECIPE_PACK_PAYLOAD_MAGIC = 'NEIRCP1\\0'/);
  assert.match(source, /from '\.\/native-runtime-pack-abi'/);
  assert.match(source, /unwrapNativeRuntimePackEnvelope/);
  assert.doesNotMatch(source, /const NATIVE_BINARY_PACK_MAGIC|const COMPACT_RECIPE_MAGIC|const RECIPE_PACK_SCHEMA/);
  assert.doesNotMatch(source, /magic !== NATIVE_BINARY_PACK_MAGIC[\s\S]*return buffer/);
  assert.match(source, /itemById: Map<string, RuntimeRecipeItemIndexEntry>/);
  assert.match(source, /uiPayloadByRecipeId: Map<string, RuntimeRecipeUiPayloadIndexEntry>/);
  assert.match(source, /categoriesById: Map<string, RuntimeRecipeCategory>/);
  assert.match(source, /itemById: new Map\(parsed\.itemIndex\.map/);
  assert.match(source, /uiPayloadByRecipeId: new Map\(parsed\.uiPayloadIndex\.map/);
  assert.match(source, /categoriesById: new Map\(parsed\.categoryIndex\.map/);
  assert.match(source, /pack\.itemById\.get\(normalizedItemId\)/);
  assert.match(source, /pack\.uiPayloadByRecipeId\.get\(normalizedRecipePageId\)/);
  assert.doesNotMatch(source, /pack\.itemIndex\.find/);
  assert.doesNotMatch(source, /pack\.uiPayloadIndex\.find/);
  assert.doesNotMatch(source, /pack\.categoryIndex\.filter/);
});
