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

function readBinaryPackHeader(filePath) {
  const bytes = readFileSync(filePath);
  if (bytes.length < 24 || bytes.subarray(0, 8).toString('utf8') !== 'NNEIBIN\0') {
    throw new Error(`invalid NeoNEI binary pack header: ${filePath}`);
  }
  const schemaLength = bytes.readUInt32LE(12);
  const payloadLength = Number(bytes.readBigUInt64LE(16));
  const schemaStart = 24;
  const payloadStart = schemaStart + schemaLength;
  if (payloadStart + payloadLength > bytes.length) {
    throw new Error(`truncated NeoNEI binary pack payload: ${filePath}`);
  }
  return {
    schema: bytes.subarray(schemaStart, payloadStart).toString('utf8'),
    payloadOffset: payloadStart,
    payloadLength,
    bytes,
  };
}

function readUiTemplatePayloadHeader(filePath) {
  const pack = readBinaryPackHeader(filePath);
  const offset = pack.payloadOffset;
  if (pack.schema !== 'neonei/ui-template-pack/current') {
    throw new Error(`UI template binary pack schema mismatch: ${pack.schema}`);
  }
  if (pack.bytes.length < offset + 48) {
    throw new Error(`truncated UI template payload header: ${filePath}`);
  }
  const magic = pack.bytes.subarray(offset, offset + 8).toString('utf8');
  return {
    schema: pack.schema,
    magic,
    version: pack.bytes.readUInt32LE(offset + 8),
    templateCount: pack.bytes.readUInt32LE(offset + 12),
    slotCount: pack.bytes.readUInt32LE(offset + 16),
    textOverlayCount: pack.bytes.readUInt32LE(offset + 20),
    hotspotCount: pack.bytes.readUInt32LE(offset + 24),
    viewportCount: pack.bytes.readUInt32LE(offset + 28),
    templateStride: pack.bytes.readUInt32LE(offset + 32),
    slotStride: pack.bytes.readUInt32LE(offset + 36),
    textStride: pack.bytes.readUInt32LE(offset + 40),
    rectStride: pack.bytes.readUInt32LE(offset + 44),
    payloadBytes: pack.payloadLength,
  };
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
const compileScope = `${manifest.nativeRuntime?.compileScope ?? 'all'}`;
const textureRuntimeRequired = compileScope === 'all' || compileScope === 'textures';

const requiredRustFiles = {
  rustRuntimeManifest: files.rustRuntimeManifest,
  rustBrowserBin: files.rustBrowserBin,
  rustGroupsBin: files.rustGroupsBin,
  rustSearchBin: files.rustSearchBin,
  rustRecipeBin: files.rustRecipeBin,
  rustStringsZhCnBin: files.rustStringsZhCnBin,
  rustUiTemplatesBin: files.rustUiTemplatesBin,
  rustUiBindingsBin: files.rustUiBindingsBin,
  rustUiStringsBin: files.rustUiStringsBin,
  rustUiAssetsManifest: files.rustUiAssetsManifest,
  rustUiPackReport: files.rustUiPackReport,
  rustNativeUiLayoutReport: files.rustNativeUiLayoutReport,
};
if (textureRuntimeRequired) {
  requiredRustFiles.rustTextureBin = files.rustTextureBin;
  requiredRustFiles.rustAtlasMetaBin = files.rustAtlasMetaBin;
  requiredRustFiles.rustAnimationBin = files.rustAnimationBin;
}
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
const runtimeEntrypoints = runtimeManifest?.entrypoints && typeof runtimeManifest.entrypoints === 'object' ? runtimeManifest.entrypoints : {};
const runtimeCompileScope = `${runtimeManifest?.compileScope ?? compileScope}`;
const expectedRuntimeArtifacts = [
  'rust/browser.bin',
  'rust/groups.bin',
  'rust/search.bin',
  'rust/recipes.bin',
  'rust/strings.zh_cn.bin',
  'rust/ui-pack/ui_templates.bin',
  'rust/ui-pack/ui_bindings.bin',
  'rust/ui-pack/ui_strings.bin',
  'rust/native-ui-layout-report.json',
];
if (textureRuntimeRequired) {
  expectedRuntimeArtifacts.push('rust/textures.bin', 'rust/atlas.meta.bin', 'rust/animations.bin');
}
for (const expected of expectedRuntimeArtifacts) {
  if (!runtimeFiles.some((entry) => `${typeof entry === 'string' ? entry : entry?.path ?? ''}`.replaceAll('\\', '/') === expected)) {
    fail(failures, 'RUST_RUNTIME_MANIFEST_ARTIFACT_MISSING', `rust runtime manifest does not list ${expected}`, { expected });
  }
}
const expectedEntrypoints = {
  browser: 'rust/browser.bin',
  groups: 'rust/groups.bin',
  search: 'rust/search.bin',
  recipes: 'rust/recipes.bin',
  stringsZhCn: 'rust/strings.zh_cn.bin',
  uiTemplates: 'rust/ui-pack/ui_templates.bin',
  uiBindings: 'rust/ui-pack/ui_bindings.bin',
  uiStrings: 'rust/ui-pack/ui_strings.bin',
};
if (textureRuntimeRequired) {
  expectedEntrypoints.textures = 'rust/textures.bin';
  expectedEntrypoints.animations = 'rust/animations.bin';
}
for (const [entrypoint, expectedPath] of Object.entries(expectedEntrypoints)) {
  const actualPath = `${runtimeEntrypoints[entrypoint] ?? ''}`.replaceAll('\\', '/');
  if (actualPath !== expectedPath) {
    fail(failures, 'RUST_RUNTIME_BINARY_ENTRYPOINT_MISSING', `rust runtime manifest does not expose binary entrypoint ${entrypoint}`, {
      entrypoint,
      expectedPath,
      actualPath: actualPath || null,
    });
  } else if (!existsSync(join(distDataDir, expectedPath))) {
    fail(failures, 'RUST_RUNTIME_BINARY_ENTRYPOINT_FILE_MISSING', `rust binary entrypoint file is missing: ${entrypoint}`, {
      entrypoint,
      expectedPath,
    });
  }
}

const productionCore = {
  browser: files.rustBrowserBin,
  search: files.rustSearchBin,
  recipes: files.rustRecipeBin,
  uiTemplates: files.rustUiTemplatesBin,
  uiBindings: files.rustUiBindingsBin,
};
if (textureRuntimeRequired) {
  productionCore.textures = files.rustTextureBin;
  productionCore.atlasMeta = files.rustAtlasMetaBin;
}
for (const [domain, relativePath] of Object.entries(productionCore)) {
  const normalizedPath = `${relativePath ?? ''}`.replaceAll('\\', '/');
  if (!normalizedPath.startsWith('rust/') || !normalizedPath.endsWith('.bin')) {
    fail(failures, 'PRODUCTION_CORE_NOT_RUST_BINARY', `production ${domain} runtime is not Rust binary-backed`, { domain, path: relativePath ?? null });
  }
}

let uiTemplateHeader = null;
if (files.rustUiTemplatesBin && existsSync(join(distDataDir, files.rustUiTemplatesBin))) {
  try {
    uiTemplateHeader = readUiTemplatePayloadHeader(join(distDataDir, files.rustUiTemplatesBin));
  } catch (error) {
    fail(failures, 'UI_TEMPLATE_PACK_HEADER_INVALID', 'UI template binary pack header is invalid', {
      path: files.rustUiTemplatesBin,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
if (uiTemplateHeader) {
  if (uiTemplateHeader.magic !== 'NEIUIT1\0') {
    fail(failures, 'UI_TEMPLATE_PACK_MAGIC_MISMATCH', 'UI template pack has wrong native magic', { magic: uiTemplateHeader.magic });
  }
  if (uiTemplateHeader.version !== 8 || uiTemplateHeader.templateStride !== 23 || uiTemplateHeader.slotStride !== 12 || uiTemplateHeader.textStride !== 7 || uiTemplateHeader.rectStride !== 15) {
    fail(failures, 'UI_TEMPLATE_PACK_FORMAT_NOT_V8_TEMPLATE_BACKGROUND_ABI', 'UI template pack is not the v8 template-background ABI native format', uiTemplateHeader);
  }
}

const uiPackReportPath = files.rustUiPackReport ? join(distDataDir, files.rustUiPackReport) : null;
const uiPackReport = uiPackReportPath && existsSync(uiPackReportPath) ? readJson(uiPackReportPath) : null;
const uiPackFormat = uiPackReport?.format ?? {};
if (uiPackReport) {
  const surfaceContractFields = Array.isArray(uiPackFormat.surfaceContractFields) ? uiPackFormat.surfaceContractFields : [];
  const rectGeometryFields = Array.isArray(uiPackFormat.rectGeometryFields) ? uiPackFormat.rectGeometryFields : [];
  const interactionContractFields = Array.isArray(uiPackFormat.interactionContractFields) ? uiPackFormat.interactionContractFields : [];
  const backgroundContractFields = Array.isArray(uiPackFormat.backgroundContractFields)
    ? uiPackFormat.backgroundContractFields
    : [];
  if (
    uiPackFormat.templatePackVersion !== 8
    || uiPackFormat.templateStride !== 23
    || uiPackFormat.slotStride !== 12
    || uiPackFormat.textStride !== 7
    || uiPackFormat.rectStride !== 15
    || uiPackFormat.legacyRectActionFields !== false
    || !surfaceContractFields.includes('coordinateSpace')
    || !surfaceContractFields.includes('scaleMode')
    || !surfaceContractFields.includes('anchor')
    || !rectGeometryFields.includes('coordinateSpace')
    || !rectGeometryFields.includes('anchor')
    || !interactionContractFields.includes('interactionKind')
    || !interactionContractFields.includes('interactionTargetKind')
    || !interactionContractFields.includes('interactionTargetId')
    || !interactionContractFields.includes('interactionPayloadSchema')
    || !backgroundContractFields.includes('coordinateSpace')
    || !backgroundContractFields.includes('scaleMode')
    || !backgroundContractFields.includes('anchor')
    || !backgroundContractFields.includes('texture')
    || !backgroundContractFields.includes('recipeBackgroundOffset')
    || !backgroundContractFields.includes('recipeBackgroundSize')
    || uiPackFormat.templateBackgroundField !== 'nativeBackground'
  ) {
    fail(failures, 'UI_PACK_REPORT_MISSING_V8_TEMPLATE_BACKGROUND_ABI', 'UI pack report does not declare v8 template-background ABI capability', { format: uiPackFormat });
  }
}

for (const debugKey of ['rustBrowserPack', 'rustSearchPack', 'rustRecipePack', 'rustTexturePack']) {
  if (`${files[debugKey] ?? ''}`.trim()) {
    fail(failures, 'DEBUG_JSON_PACK_DECLARED_IN_PRODUCTION', `production manifest must not declare debug JSON pack ${debugKey}`, {
      key: debugKey,
      path: files[debugKey],
    });
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
  uiTemplatePack: uiTemplateHeader,
  uiPackReport: uiPackReport
    ? {
        status: uiPackReport.status ?? null,
        summary: uiPackReport.summary ?? null,
        format: uiPackFormat,
      }
    : null,
  failures,
  warnings,
};
const outputDir = join(repoRoot, '.runtime-logs');
mkdirSync(outputDir, { recursive: true });
writeFileSync(join(outputDir, 'rust-production-manifest-validation.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(report, null, 2));
if (gate && failures.length > 0) process.exit(1);

