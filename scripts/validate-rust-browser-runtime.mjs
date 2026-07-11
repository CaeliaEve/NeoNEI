import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseNativeBrowserBin,
  parseNativeGroupsBin,
  parseNativeTexturesBin,
} from './native-runtime-pack-reader.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);

function readArg(name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
}

const distDataDir = resolve(
  readArg('--dist-data')
    ?? process.env.DIST_DATA_V3_DIR
    ?? join(repoRoot, 'backend', 'public', 'dist-data'),
);
const gate = args.includes('--gate');

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function fail(failures, code, message, details = {}) {
  failures.push({ code, message, details });
}

function runtimePath(manifest, runtimeManifest, rootKey, entrypointKey, fallback) {
  return `${manifest.files?.[rootKey] ?? runtimeManifest?.entrypoints?.[entrypointKey] ?? fallback}`.trim();
}

function parsePack(failures, label, path, parser) {
  if (!path) {
    fail(failures, `${label}_NOT_DECLARED`, `manifest does not declare ${label}`);
    return null;
  }
  if (!existsSync(join(distDataDir, path))) {
    fail(failures, `${label}_MISSING`, `${label} file is missing`, { path });
    return null;
  }
  try {
    return parser(distDataDir, path, { optional: false });
  } catch (error) {
    fail(failures, `${label}_PARSE_FAILED`, `${label} could not be parsed`, {
      path,
      message: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

function main() {
  const failures = [];
  const warnings = [];
  const manifestPath = join(distDataDir, 'manifest.json');
  if (!existsSync(manifestPath)) {
    throw new Error(`dist-data manifest not found: ${manifestPath}`);
  }
  const manifest = readJson(manifestPath);
  const runtimeManifestPath = join(distDataDir, `${manifest.files?.rustRuntimeManifest ?? 'rust/runtime-manifest.json'}`.trim());
  const runtimeManifest = existsSync(runtimeManifestPath) ? readJson(runtimeManifestPath) : null;

  const rustBrowserBin = runtimePath(manifest, runtimeManifest, 'rustBrowserBin', 'browser', 'rust/browser.bin');
  const rustGroupsBin = runtimePath(manifest, runtimeManifest, 'rustGroupsBin', 'groups', 'rust/groups.bin');
  const rustTextureBin = runtimePath(manifest, runtimeManifest, 'rustTextureBin', 'textures', 'rust/textures.bin');

  const browserPack = parsePack(failures, 'RUST_BROWSER_BIN', rustBrowserBin, parseNativeBrowserBin);
  const groupsPack = parsePack(failures, 'RUST_GROUPS_BIN', rustGroupsBin, parseNativeGroupsBin);
  const texturePack = parsePack(failures, 'RUST_TEXTURE_BIN', rustTextureBin, parseNativeTexturesBin);

  const items = Array.isArray(browserPack?.items) ? browserPack.items : [];
  const groups = Array.isArray(groupsPack?.groups) ? groupsPack.groups : [];
  const textureItems = Array.isArray(texturePack?.items) ? texturePack.items : [];
  if (items.length <= 0) fail(failures, 'RUST_BROWSER_ITEMS_EMPTY', 'rust browser items are empty');
  if (groups.length <= 0) fail(failures, 'RUST_BROWSER_GROUPS_EMPTY', 'rust browser groups are empty');
  if (Number(browserPack?.rowCount ?? items.length) !== items.length) {
    fail(failures, 'RUST_BROWSER_ITEM_COUNT_MISMATCH', 'rust browser item count differs from rows length', { itemCount: browserPack?.rowCount ?? null, actual: items.length });
  }
  if (Number(groupsPack?.rowCount ?? groups.length) !== groups.length) {
    fail(failures, 'RUST_BROWSER_GROUP_COUNT_MISMATCH', 'rust group count differs from rows length', { groupCount: groupsPack?.rowCount ?? null, actual: groups.length });
  }

  const itemIds = items.map((item) => `${item?.itemId ?? ''}`.trim()).filter(Boolean);
  const itemIdSet = new Set(itemIds);
  if (itemIds.length !== items.length) {
    fail(failures, 'RUST_BROWSER_ITEM_ID_MISSING', 'rust browser contains items without itemId', {
      missing: items.length - itemIds.length,
    });
  }
  if (itemIdSet.size !== itemIds.length) {
    const duplicates = itemIds.filter((id, index) => itemIds.indexOf(id) !== index).slice(0, 10);
    fail(failures, 'RUST_BROWSER_ITEM_ID_DUPLICATE', 'rust browser item ids are not unique', { sample: duplicates });
  }

  const groupKeys = groups.map((group) => `${group?.groupKey ?? ''}`.trim()).filter(Boolean);
  const groupKeySet = new Set(groupKeys);
  if (groupKeys.length !== groups.length) {
    fail(failures, 'RUST_BROWSER_GROUP_KEY_MISSING', 'rust browser contains groups without groupKey', {
      missing: groups.length - groupKeys.length,
    });
  }
  if (groupKeySet.size !== groupKeys.length) {
    const duplicates = groupKeys.filter((id, index) => groupKeys.indexOf(id) !== index).slice(0, 10);
    fail(failures, 'RUST_BROWSER_GROUP_KEY_DUPLICATE', 'rust browser group keys are not unique', { sample: duplicates });
  }

  const itemById = new Map(items.map((item) => [item.itemId, item]));
  const memberOwner = new Map();
  const groupSamples = [];
  for (const group of groups) {
    const groupKey = `${group?.groupKey ?? ''}`.trim();
    const representativeItemId = `${group?.representativeItemId ?? ''}`.trim();
    const members = Array.isArray(group?.memberItemIds) ? group.memberItemIds.map((id) => `${id ?? ''}`.trim()).filter(Boolean) : [];
    const groupSize = Number(group?.groupSize ?? members.length);
    if (!representativeItemId || !itemById.has(representativeItemId)) {
      fail(failures, 'RUST_BROWSER_GROUP_REPRESENTATIVE_MISSING', 'group representative does not exist in browser items', {
        groupKey,
        representativeItemId: representativeItemId || null,
      });
    }
    if (members.length <= 0) {
      fail(failures, 'RUST_BROWSER_GROUP_MEMBERS_EMPTY', 'group has no memberItemIds', { groupKey });
    }
    if (groupSize !== members.length) {
      fail(failures, 'RUST_BROWSER_GROUP_SIZE_MISMATCH', 'groupSize differs from memberItemIds length', {
        groupKey,
        groupSize,
        memberCount: members.length,
      });
    }
    if (representativeItemId && members.length > 0 && !members.includes(representativeItemId)) {
      fail(failures, 'RUST_BROWSER_GROUP_REPRESENTATIVE_NOT_MEMBER', 'group representative is not included in memberItemIds', {
        groupKey,
        representativeItemId,
      });
    }
    for (const memberItemId of members) {
      if (!itemById.has(memberItemId)) {
        fail(failures, 'RUST_BROWSER_GROUP_MEMBER_MISSING', 'group member does not exist in browser items', { groupKey, memberItemId });
        continue;
      }
      const previousGroupKey = memberOwner.get(memberItemId);
      if (previousGroupKey && previousGroupKey !== groupKey) {
        fail(failures, 'RUST_BROWSER_GROUP_MEMBER_DUPLICATE_ASSIGNMENT', 'item is assigned to multiple browser groups', {
          memberItemId,
          firstGroupKey: previousGroupKey,
          secondGroupKey: groupKey,
        });
      }
      memberOwner.set(memberItemId, groupKey);
      const item = itemById.get(memberItemId);
      if (item?.groupKey !== groupKey) {
        fail(failures, 'RUST_BROWSER_ITEM_GROUP_KEY_MISMATCH', 'grouped item groupKey differs from group record', {
          itemId: memberItemId,
          itemGroupKey: item?.groupKey ?? null,
          groupKey,
        });
      }
    }
    if (groupSamples.length < 8) {
      groupSamples.push({ groupKey, representativeItemId, groupSize, memberCount: members.length });
    }
  }

  const unknownGroupRefs = items
    .filter((item) => `${item?.groupKey ?? ''}`.trim() && !groupKeySet.has(item.groupKey))
    .slice(0, 10)
    .map((item) => ({ itemId: item.itemId, groupKey: item.groupKey }));
  if (unknownGroupRefs.length > 0) {
    fail(failures, 'RUST_BROWSER_ITEM_UNKNOWN_GROUP', 'items reference group keys that do not exist', { sample: unknownGroupRefs });
  }

  const textureByItemId = new Map(textureItems.filter((item) => `${item?.itemId ?? ''}`.trim()).map((item) => [item.itemId, item]));
  const browserMissingTexture = items
    .filter((item) => !textureByItemId.has(item.itemId))
    .slice(0, 20)
    .map((item) => ({ itemId: item.itemId, localizedName: item.localizedName ?? null }));
  if (browserMissingTexture.length > 0) {
    warnings.push({
      code: 'RUST_BROWSER_VISIBLE_TEXTURE_GAPS',
      message: 'some visible browser entries do not have a native texture row',
      details: { sample: browserMissingTexture },
    });
  }

  const staticAtlasItems = textureItems.filter((item) => item?.staticAtlas?.atlasFile).length;
  const animatedAtlasItems = textureItems.filter((item) => item?.animatedAtlas?.atlasFile).length;

  const report = {
    schemaVersion: 'neonei/rust-browser-runtime-validation/v1',
    generatedAt: new Date().toISOString(),
    distDataDir,
    source: manifest.source ?? null,
    sourceRepository: manifest.sourceRepository ?? null,
    rustBrowserBin,
    rustGroupsBin,
    rustTextureBin,
    itemCount: items.length,
    groupCount: groups.length,
    groupedMemberCount: memberOwner.size,
    atlasItems: textureItems.length,
    staticAtlasItems,
    animatedAtlasItems,
    failures,
    warnings,
    samples: {
      items: items.slice(0, 8).map((item) => ({ itemId: item.itemId, localizedName: item.localizedName, groupKey: item.groupKey ?? null })),
      groups: groupSamples,
    },
  };
  const outputDir = join(repoRoot, '.runtime-logs');
  mkdirSync(outputDir, { recursive: true });
  writeFileSync(join(outputDir, 'rust-browser-runtime-validation.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(report, null, 2));
  if (gate && failures.length > 0) {
    process.exit(1);
  }
}

main();
