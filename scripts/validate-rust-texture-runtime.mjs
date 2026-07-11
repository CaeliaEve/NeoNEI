import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseNativeTexturesBin } from './native-runtime-pack-reader.mjs';

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

function placementKey(entry, placement) {
  return [
    placement?.atlasFile ?? '',
    placement?.x ?? 0,
    placement?.y ?? 0,
    placement?.width ?? 0,
    placement?.height ?? 0,
    entry.itemId ?? '',
  ].join('|');
}

function validateAnimatedPlacement(failures, entry, declaredFrameRows) {
  const animated = entry?.animatedAtlas;
  if (!animated) return;
  const frameStart = Number(animated.frameStart ?? 0);
  const frameCount = Number(animated.frameCount ?? 0);
  const frameDurationMs = Number(animated.frameDurationMs ?? 0);
  const frames = Array.isArray(animated.frames) ? animated.frames : [];
  if (!animated.atlasFile) {
    fail(failures, 'RUST_TEXTURE_ANIMATED_ATLAS_FILE_MISSING', 'animated atlas entry is missing atlasFile', { itemId: entry.itemId });
  }
  if (frameCount <= 0) {
    fail(failures, 'RUST_TEXTURE_ANIMATED_FRAME_COUNT_EMPTY', 'animated atlas entry has no frames', { itemId: entry.itemId });
  }
  if (frames.length !== frameCount) {
    fail(failures, 'RUST_TEXTURE_ANIMATED_FRAME_TABLE_MISMATCH', 'animated atlas frame table length differs from row frameCount', {
      itemId: entry.itemId,
      frameCount,
      frameTableRows: frames.length,
    });
  }
  const invalidFrame = frames.find((frame) => !(Number(frame?.width) > 0 && Number(frame?.height) > 0 && Number(frame?.durationMs) > 0));
  if (invalidFrame) {
    fail(failures, 'RUST_TEXTURE_ANIMATED_FRAME_INVALID', 'animated atlas frame row has invalid dimensions or duration', { itemId: entry.itemId, frame: invalidFrame });
  }
  if (frameDurationMs <= 0 && frames.length <= 0) {
    fail(failures, 'RUST_TEXTURE_ANIMATED_TIMELINE_DURATION_INVALID', 'animated atlas timing contains no positive duration source', { itemId: entry.itemId });
  }
  if (frameStart < 0 || frameCount <= 0 || frameStart + frameCount > declaredFrameRows) {
    fail(failures, 'RUST_TEXTURE_ANIMATED_FRAME_RANGE_INVALID', 'animated atlas frame range exceeds texture frame table', {
      itemId: entry.itemId,
      frameStart,
      frameCount,
      declaredFrameRows,
    });
  }
}

function main() {
  const failures = [];
  const warnings = [];
  const manifestPath = join(distDataDir, 'manifest.json');
  if (!existsSync(manifestPath)) throw new Error(`dist-data manifest not found: ${manifestPath}`);
  const manifest = readJson(manifestPath);

  const runtimeManifestRelativePath = `${manifest.files?.rustRuntimeManifest ?? 'rust/runtime-manifest.json'}`.trim();
  const runtimeManifestPath = join(distDataDir, runtimeManifestRelativePath);
  const runtimeManifest = existsSync(runtimeManifestPath) ? readJson(runtimeManifestPath) : null;
  const rustTextureBinRelativePath = `${manifest.files?.rustTextureBin ?? runtimeManifest?.entrypoints?.textures ?? ''}`.trim();
  if (!rustTextureBinRelativePath) {
    fail(failures, 'RUST_TEXTURE_BIN_NOT_DECLARED', 'manifest does not declare files.rustTextureBin or runtime entrypoints.textures');
  }

  const texturePackPath = join(distDataDir, rustTextureBinRelativePath || 'rust/textures.bin');
  if (!existsSync(texturePackPath)) {
    fail(failures, 'RUST_TEXTURE_BIN_MISSING', 'rust texture binary pack file is missing', { path: rustTextureBinRelativePath });
  }

  let texturePack = null;
  if (existsSync(texturePackPath)) {
    try {
      texturePack = parseNativeTexturesBin(distDataDir, rustTextureBinRelativePath, { optional: false });
    } catch (error) {
      fail(failures, 'RUST_TEXTURE_BIN_PARSE_FAILED', 'rust texture binary pack could not be parsed', {
        path: rustTextureBinRelativePath,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const atlasItems = Array.isArray(texturePack?.items) ? texturePack.items : [];
  const declaredFrameRows = Number(texturePack?.frameCount ?? 0);
  if (atlasItems.length <= 0) fail(failures, 'RUST_TEXTURE_ATLAS_EMPTY', 'rust texture atlas has no items');
  if (Number(texturePack?.rowCount ?? atlasItems.length) !== atlasItems.length) {
    fail(failures, 'RUST_TEXTURE_ATLAS_COUNT_MISMATCH', 'rust texture atlasItems count differs from texture row count', {
      declared: texturePack?.rowCount ?? null,
      actual: atlasItems.length,
    });
  }

  const itemIds = atlasItems.map((entry) => `${entry?.itemId ?? ''}`.trim()).filter(Boolean);
  const itemIdSet = new Set(itemIds);
  if (itemIds.length !== atlasItems.length) {
    fail(failures, 'RUST_TEXTURE_ITEM_ID_MISSING', 'rust texture atlas contains entries without itemId', { missing: atlasItems.length - itemIds.length });
  }
  if (itemIdSet.size !== itemIds.length) {
    const duplicates = itemIds.filter((id, index) => itemIds.indexOf(id) !== index).slice(0, 10);
    fail(failures, 'RUST_TEXTURE_ITEM_ID_DUPLICATE', 'rust texture atlas item ids are not unique', { sample: duplicates });
  }

  const placementKeys = new Set();
  let staticCount = 0;
  let animatedCount = 0;
  for (const entry of atlasItems) {
    const hasStatic = Boolean(entry?.staticAtlas?.atlasFile);
    const hasAnimated = Boolean(entry?.animatedAtlas?.atlasFile);
    if (!hasStatic && !hasAnimated) {
      fail(failures, 'RUST_TEXTURE_ATLAS_ENTRY_NOT_DRAWABLE', 'atlas entry has neither static nor animated placement', { itemId: entry?.itemId ?? null });
    }
    if (hasStatic) {
      staticCount += 1;
      const staticAtlas = entry.staticAtlas ?? {};
      if (!staticAtlas.atlasFile) fail(failures, 'RUST_TEXTURE_STATIC_ATLAS_FILE_MISSING', 'static atlas entry is missing atlasFile', { itemId: entry.itemId });
      if (!(Number(staticAtlas.width) > 0 && Number(staticAtlas.height) > 0)) {
        fail(failures, 'RUST_TEXTURE_STATIC_DIMENSIONS_INVALID', 'static atlas placement has invalid dimensions', { itemId: entry.itemId, staticAtlas });
      }
      const key = placementKey(entry, staticAtlas);
      if (placementKeys.has(key)) fail(failures, 'RUST_TEXTURE_STATIC_PLACEMENT_DUPLICATE', 'static atlas placement is duplicated', { itemId: entry.itemId, key });
      placementKeys.add(key);
    }
    if (hasAnimated) {
      animatedCount += 1;
      validateAnimatedPlacement(failures, entry, declaredFrameRows);
    }
  }

  const missingTextureReportPath = `${manifest.files?.rustMissingTextureReport ?? 'rust/missing-texture-report.json'}`.trim();
  const missingTextureReport = missingTextureReportPath && existsSync(join(distDataDir, missingTextureReportPath))
    ? readJson(join(distDataDir, missingTextureReportPath))
    : null;
  const invalidFrameBounds = Number(missingTextureReport?.counts?.invalidFrameBounds ?? 0);
  const invalidAtlasBounds = Number(missingTextureReport?.counts?.invalidAtlasBounds ?? 0);
  const missingAtlasFileRefs = Number(missingTextureReport?.counts?.missingAtlasFileRefs ?? 0);
  const missingAtlasAssetFiles = Number(missingTextureReport?.counts?.missingAtlasAssetFiles ?? 0);
  if (invalidFrameBounds > 0) {
    fail(failures, 'RUST_TEXTURE_INVALID_FRAME_BOUNDS', 'rust texture pack contains invalid animated frame bounds', { count: invalidFrameBounds });
  }
  if (invalidAtlasBounds > 0) {
    fail(failures, 'RUST_TEXTURE_INVALID_ATLAS_BOUNDS', 'rust texture pack contains invalid atlas placement bounds', { count: invalidAtlasBounds });
  }
  if (missingAtlasFileRefs > 0) {
    fail(failures, 'RUST_TEXTURE_MISSING_ATLAS_FILE_REFS', 'rust texture pack references missing atlas files', { count: missingAtlasFileRefs });
  }
  if (missingAtlasAssetFiles > 0) {
    fail(failures, 'RUST_TEXTURE_MISSING_ATLAS_ASSET_FILES', 'rust texture pack references atlas asset files that are missing on disk', { count: missingAtlasAssetFiles });
  }

  const report = {
    schemaVersion: 'neonei/rust-texture-runtime-validation/v1',
    generatedAt: new Date().toISOString(),
    distDataDir,
    source: manifest.source ?? null,
    sourceRepository: manifest.sourceRepository ?? null,
    rustTextureBin: rustTextureBinRelativePath || null,
    atlasItems: atlasItems.length,
    staticCount,
    animatedCount,
    animationRows: declaredFrameRows,
    invalidAtlasBounds,
    failures,
    warnings,
    samples: atlasItems.slice(0, 8).map((entry) => ({
      itemId: entry.itemId,
      hasStaticAtlas: Boolean(entry.staticAtlas?.atlasFile),
      hasAnimatedAtlas: Boolean(entry.animatedAtlas?.atlasFile),
    })),
  };
  const outputDir = join(repoRoot, '.runtime-logs');
  mkdirSync(outputDir, { recursive: true });
  writeFileSync(join(outputDir, 'rust-texture-runtime-validation.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(report, null, 2));
  if (gate && failures.length > 0) process.exit(1);
}

main();
