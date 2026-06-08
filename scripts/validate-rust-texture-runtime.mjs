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

function validateAnimatedPlacement(failures, entry) {
  const animated = entry?.animatedAtlas;
  if (!animated) return;
  const frames = Array.isArray(animated.frames) ? animated.frames : [];
  const timeline = Array.isArray(animated.timeline) ? animated.timeline : [];
  const frameCount = Number(animated.frameCount ?? frames.length);
  if (!animated.atlasFile) {
    fail(failures, 'RUST_TEXTURE_ANIMATED_ATLAS_FILE_MISSING', 'animated atlas entry is missing atlasFile', { itemId: entry.itemId });
  }
  if (frameCount <= 0) {
    fail(failures, 'RUST_TEXTURE_ANIMATED_FRAME_COUNT_EMPTY', 'animated atlas entry has no frames', { itemId: entry.itemId });
  }
  if (frames.length <= 0) {
    fail(failures, 'RUST_TEXTURE_ANIMATED_FRAMES_EMPTY', 'animated atlas entry has empty frames[]', { itemId: entry.itemId });
  }
  if (timeline.length <= 0) {
    fail(failures, 'RUST_TEXTURE_ANIMATED_TIMELINE_EMPTY', 'animated atlas entry has empty timeline[]', { itemId: entry.itemId });
  }
  const invalidTimeline = timeline.find((frame) => {
    const duration = Array.isArray(frame) ? Number(frame[1] ?? 0) : Number(frame?.durationMs ?? 0);
    return !(duration > 0);
  });
  if (invalidTimeline) {
    fail(failures, 'RUST_TEXTURE_ANIMATED_TIMELINE_DURATION_INVALID', 'animated atlas timeline contains non-positive duration', { itemId: entry.itemId });
  }
}

function main() {
  const failures = [];
  const warnings = [];
  const manifestPath = join(distDataDir, 'manifest.json');
  if (!existsSync(manifestPath)) throw new Error(`dist-data manifest not found: ${manifestPath}`);
  const manifest = readJson(manifestPath);
  const rustTexturePackRelativePath = `${manifest.files?.rustTexturePack ?? ''}`.trim();
  if (!rustTexturePackRelativePath) {
    fail(failures, 'RUST_TEXTURE_PACK_NOT_DECLARED', 'manifest does not declare files.rustTexturePack');
  }
  const texturePackPath = join(distDataDir, rustTexturePackRelativePath || 'rust/texture-pack.json');
  if (!existsSync(texturePackPath)) {
    fail(failures, 'RUST_TEXTURE_PACK_MISSING', 'rust texture pack file is missing', { path: rustTexturePackRelativePath });
  }
  const texturePack = existsSync(texturePackPath) ? readJson(texturePackPath) : null;
  if (texturePack?.schemaVersion !== 'neonei/rust-texture-pack/current') {
    fail(failures, 'RUST_TEXTURE_SCHEMA_MISMATCH', 'rust texture pack schemaVersion is wrong', { schemaVersion: texturePack?.schemaVersion ?? null });
  }

  const atlas = texturePack?.atlas ?? null;
  const atlasItems = Array.isArray(atlas?.items) ? atlas.items : [];
  const animationTable = Array.isArray(texturePack?.animationTable) ? texturePack.animationTable : [];
  const atlasMap = texturePack?.atlasMap && typeof texturePack.atlasMap === 'object' ? texturePack.atlasMap : {};
  if (atlasItems.length <= 0) fail(failures, 'RUST_TEXTURE_ATLAS_EMPTY', 'rust texture atlas has no items');
  if (Number(texturePack?.counts?.atlasItems ?? atlasItems.length) !== atlasItems.length) {
    fail(failures, 'RUST_TEXTURE_ATLAS_COUNT_MISMATCH', 'rust texture atlasItems count differs from atlas.items length', {
      declared: texturePack?.counts?.atlasItems ?? null,
      actual: atlasItems.length,
    });
  }
  if (Number(texturePack?.counts?.atlasMapItems ?? Object.keys(atlasMap).length) !== Object.keys(atlasMap).length) {
    fail(failures, 'RUST_TEXTURE_ATLAS_MAP_COUNT_MISMATCH', 'rust texture atlasMapItems count differs from atlasMap size', {
      declared: texturePack?.counts?.atlasMapItems ?? null,
      actual: Object.keys(atlasMap).length,
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
    const hasStatic = Boolean(entry?.hasStaticAtlas || entry?.staticAtlas);
    const hasAnimated = Boolean(entry?.hasAnimatedAtlas || entry?.animatedAtlas);
    if (!hasStatic && !hasAnimated) {
      fail(failures, 'RUST_TEXTURE_ATLAS_ENTRY_NOT_DRAWABLE', 'atlas entry has neither static nor animated placement', { itemId: entry?.itemId ?? null });
    }
    if (hasStatic) {
      staticCount += 1;
      const staticAtlas = entry.staticAtlas ?? {};
      if (!staticAtlas.atlasFile) fail(failures, 'RUST_TEXTURE_STATIC_ATLAS_FILE_MISSING', 'static atlas entry is missing atlasFile', { itemId: entry.itemId });
      const key = placementKey(entry, staticAtlas);
      if (placementKeys.has(key)) fail(failures, 'RUST_TEXTURE_STATIC_PLACEMENT_DUPLICATE', 'static atlas placement is duplicated', { itemId: entry.itemId, key });
      placementKeys.add(key);
    }
    if (hasAnimated) {
      animatedCount += 1;
      validateAnimatedPlacement(failures, entry);
    }
  }

  const declaredStatic = Number(texturePack?.counts?.staticAtlasItems ?? staticCount);
  const declaredAnimated = Number(texturePack?.counts?.animatedAtlasItems ?? animatedCount);
  if (declaredStatic !== staticCount) fail(failures, 'RUST_TEXTURE_STATIC_COUNT_MISMATCH', 'staticAtlasItems count differs from atlas entries', { declaredStatic, staticCount });
  if (declaredAnimated !== animatedCount) fail(failures, 'RUST_TEXTURE_ANIMATED_COUNT_MISMATCH', 'animatedAtlasItems count differs from atlas entries', { declaredAnimated, animatedCount });
  if (Number(texturePack?.counts?.animationRows ?? animationTable.length) !== animationTable.length) {
    fail(failures, 'RUST_TEXTURE_ANIMATION_TABLE_COUNT_MISMATCH', 'animationRows count differs from animationTable length', {
      declared: texturePack?.counts?.animationRows ?? null,
      actual: animationTable.length,
    });
  }

  const animatedAtlasIds = new Set(atlasItems.filter((entry) => entry?.hasAnimatedAtlas || entry?.animatedAtlas).map((entry) => entry.itemId));
  const animationTableIds = new Set(animationTable.map((row) => `${row?.itemId ?? ''}`.trim()).filter(Boolean));
  const animatedWithoutTiming = [...animatedAtlasIds].filter((id) => !animationTableIds.has(id));
  if (animatedWithoutTiming.length > 0) {
    fail(failures, 'RUST_TEXTURE_ANIMATED_TIMING_MISSING', 'animated atlas items are missing animationTable timing rows', { sample: animatedWithoutTiming.slice(0, 10) });
  }

  const staticWhenExpectedAnimated = Number(texturePack?.counts?.staticWhenExpectedAnimated ?? 0);
  if (staticWhenExpectedAnimated > 0) {
    fail(failures, 'RUST_TEXTURE_STATIC_WHEN_EXPECTED_ANIMATED', 'items expected to animate were exported as static', { staticWhenExpectedAnimated });
  }
  const invalidFrameBounds = Array.isArray(texturePack?.validation?.invalidFrameBounds) ? texturePack.validation.invalidFrameBounds : [];
  const invalidAtlasBounds = Array.isArray(texturePack?.validation?.invalidAtlasBounds) ? texturePack.validation.invalidAtlasBounds : [];
  const missingAtlasFileRefs = Array.isArray(texturePack?.validation?.missingAtlasFileRefs) ? texturePack.validation.missingAtlasFileRefs : [];
  if (invalidFrameBounds.length > 0 || Number(texturePack?.counts?.invalidFrameBounds ?? 0) > 0) {
    fail(failures, 'RUST_TEXTURE_INVALID_FRAME_BOUNDS', 'rust texture pack contains invalid animated frame bounds', { count: invalidFrameBounds.length });
  }
  if (invalidAtlasBounds.length > 0 || Number(texturePack?.counts?.invalidAtlasBounds ?? 0) > 0) {
    fail(failures, 'RUST_TEXTURE_INVALID_ATLAS_BOUNDS', 'rust texture pack contains invalid atlas placement bounds', { count: invalidAtlasBounds.length });
  }
  if (missingAtlasFileRefs.length > 0 || Number(texturePack?.counts?.missingAtlasFileRefs ?? 0) > 0) {
    fail(failures, 'RUST_TEXTURE_MISSING_ATLAS_FILE_REFS', 'rust texture pack references missing atlas files', { count: missingAtlasFileRefs.length });
  }

  const report = {
    schemaVersion: 'neonei/rust-texture-runtime-validation/v1',
    generatedAt: new Date().toISOString(),
    distDataDir,
    source: manifest.source ?? null,
    sourceRepository: manifest.sourceRepository ?? null,
    rustTexturePack: rustTexturePackRelativePath || null,
    atlasItems: atlasItems.length,
    staticCount,
    animatedCount,
    animationRows: animationTable.length,
    atlasMapItems: Object.keys(atlasMap).length,
    invalidAtlasBounds: invalidAtlasBounds.length,
    failures,
    warnings,
    samples: atlasItems.slice(0, 8).map((entry) => ({ itemId: entry.itemId, hasStaticAtlas: Boolean(entry.hasStaticAtlas), hasAnimatedAtlas: Boolean(entry.hasAnimatedAtlas) })),
  };
  const outputDir = join(repoRoot, '.runtime-logs');
  mkdirSync(outputDir, { recursive: true });
  writeFileSync(join(outputDir, 'rust-texture-runtime-validation.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(report, null, 2));
  if (gate && failures.length > 0) process.exit(1);
}

main();
