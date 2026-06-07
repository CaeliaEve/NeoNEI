import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);

function readArg(name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
}

const distDataDir = resolve(readArg('--dist-data') ?? process.env.DIST_DATA_V3_DIR ?? join(repoRoot, 'backend', 'public', 'dist-data'));
const gate = args.includes('--gate');

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function fail(failures, code, message, details = {}) {
  failures.push({ code, message, details });
}

function fileExists(relativePath) {
  return typeof relativePath === 'string' && relativePath.trim() && existsSync(join(distDataDir, relativePath));
}

const manifestPath = join(distDataDir, 'manifest.json');
if (!existsSync(manifestPath)) throw new Error(`dist-data manifest not found: ${manifestPath}`);
const manifest = readJson(manifestPath);
const files = manifest.files ?? {};
const failures = [];
const warnings = [];

const requiredRustFiles = {
  rustRuntimeManifest: files.rustRuntimeManifest,
  rustBrowserPack: files.rustBrowserPack,
  rustSearchPack: files.rustSearchPack,
  rustRecipePack: files.rustRecipePack,
  rustTexturePack: files.rustTexturePack,
};
for (const [key, relativePath] of Object.entries(requiredRustFiles)) {
  if (!`${relativePath ?? ''}`.trim()) {
    fail(failures, 'RUST_RUNTIME_FILE_NOT_DECLARED', `manifest does not declare files.${key}`, { key });
  } else if (!fileExists(relativePath)) {
    fail(failures, 'RUST_RUNTIME_FILE_MISSING', `declared Rust runtime file is missing: ${key}`, { key, path: relativePath });
  }
}

const runtimeManifestPath = files.rustRuntimeManifest ? join(distDataDir, files.rustRuntimeManifest) : null;
const runtimeManifest = runtimeManifestPath && existsSync(runtimeManifestPath) ? readJson(runtimeManifestPath) : null;
const runtimeFiles = Array.isArray(runtimeManifest?.files) ? runtimeManifest.files : [];
for (const expected of ['browser-pack.json', 'search-pack.json', 'recipe-pack.json', 'texture-pack.json']) {
  if (!runtimeFiles.some((entry) => `${typeof entry === 'string' ? entry : entry?.path ?? ''}`.endsWith(expected))) {
    fail(failures, 'RUST_RUNTIME_MANIFEST_ARTIFACT_MISSING', `rust runtime manifest does not list ${expected}`, { expected });
  }
}

const productionCore = {
  browser: files.rustBrowserPack,
  search: files.rustSearchPack,
  recipes: files.rustRecipePack,
  textures: files.rustTexturePack,
};
for (const [domain, relativePath] of Object.entries(productionCore)) {
  if (!`${relativePath ?? ''}`.replaceAll('\\', '/').startsWith('rust/')) {
    fail(failures, 'PRODUCTION_CORE_NOT_RUST', `production ${domain} runtime is not Rust-backed`, { domain, path: relativePath ?? null });
  }
}

for (const legacyKey of ['browserCatalog', 'hiddenBrowserCatalog', 'browserGroups', 'recipeItemIndex', 'recipeUiPayloadIndex', 'browserAtlasIndex', 'searchAll']) {
  if (`${files[legacyKey] ?? ''}`.trim()) {
    warnings.push({ code: 'LEGACY_DIST_FILE_DECLARED_FOR_COMPAT', message: `legacy compatibility file still declared: ${legacyKey}`, details: { key: legacyKey, path: files[legacyKey] } });
  }
}

const report = {
  schemaVersion: 'neonei/rust-production-manifest-validation/v1',
  generatedAt: new Date().toISOString(),
  distDataDir,
  source: manifest.source ?? null,
  sourceRepository: manifest.sourceRepository ?? null,
  requiredRustFiles,
  runtimeManifestFiles: runtimeFiles,
  failures,
  warnings,
};
const outputDir = join(repoRoot, '.runtime-logs');
mkdirSync(outputDir, { recursive: true });
writeFileSync(join(outputDir, 'rust-production-manifest-validation.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(report, null, 2));
if (gate && failures.length > 0) process.exit(1);

