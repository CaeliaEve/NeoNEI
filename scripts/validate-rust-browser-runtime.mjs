import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

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

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function main() {
  const failures = [];
  const warnings = [];
  const manifestPath = join(distDataDir, 'manifest.json');
  if (!existsSync(manifestPath)) {
    throw new Error(`dist-data manifest not found: ${manifestPath}`);
  }
  const manifest = readJson(manifestPath);
  const rustBrowserPackRelativePath = `${manifest.files?.rustBrowserPack ?? ''}`.trim();
  if (!rustBrowserPackRelativePath) {
    fail(failures, 'RUST_BROWSER_PACK_NOT_DECLARED', 'manifest does not declare files.rustBrowserPack');
  }

  const rustBrowserPackPath = join(distDataDir, rustBrowserPackRelativePath || 'rust/browser-pack.json');
  if (!existsSync(rustBrowserPackPath)) {
    fail(failures, 'RUST_BROWSER_PACK_MISSING', 'rust browser pack file is missing', { path: rustBrowserPackRelativePath });
  }

  const browserPack = existsSync(rustBrowserPackPath) ? readJson(rustBrowserPackPath) : null;
  if (browserPack?.schemaVersion !== 'neonei/rust-browser-pack/current') {
    fail(failures, 'RUST_BROWSER_SCHEMA_MISMATCH', 'rust browser pack schemaVersion is wrong', {
      schemaVersion: browserPack?.schemaVersion ?? null,
    });
  }

  const items = Array.isArray(browserPack?.items) ? browserPack.items : [];
  const groups = Array.isArray(browserPack?.groups) ? browserPack.groups : [];
  const itemCount = Number(browserPack?.counts?.items ?? 0);
  const groupCount = Number(browserPack?.counts?.groups ?? 0);
  if (items.length <= 0) fail(failures, 'RUST_BROWSER_ITEMS_EMPTY', 'rust browser items are empty');
  if (itemCount !== items.length) {
    fail(failures, 'RUST_BROWSER_ITEM_COUNT_MISMATCH', 'rust browser item count differs from items length', { itemCount, actual: items.length });
  }
  if (groupCount !== groups.length) {
    fail(failures, 'RUST_BROWSER_GROUP_COUNT_MISMATCH', 'rust browser group count differs from groups length', { groupCount, actual: groups.length });
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
      if (item?.representativeItemId !== representativeItemId) {
        fail(failures, 'RUST_BROWSER_ITEM_REPRESENTATIVE_MISMATCH', 'grouped item representative differs from group record', {
          itemId: memberItemId,
          itemRepresentativeItemId: item?.representativeItemId ?? null,
          representativeItemId,
        });
      }
      if (Number(item?.groupSize ?? 0) !== groupSize) {
        fail(failures, 'RUST_BROWSER_ITEM_GROUP_SIZE_MISMATCH', 'grouped item groupSize differs from group record', {
          itemId: memberItemId,
          itemGroupSize: item?.groupSize ?? null,
          groupSize,
        });
      }
    }
    if (groupSamples.length < 8) {
      groupSamples.push({ groupKey, representativeItemId, groupSize, memberCount: members.length });
    }
  }

  const ungroupedInNamedGroup = items
    .filter((item) => isNonEmptyString(item?.groupKey) && !groupKeySet.has(item.groupKey))
    .slice(0, 10)
    .map((item) => ({ itemId: item.itemId, groupKey: item.groupKey }));
  if (ungroupedInNamedGroup.length > 0) {
    fail(failures, 'RUST_BROWSER_ITEM_UNKNOWN_GROUP', 'items reference group keys that do not exist', { sample: ungroupedInNamedGroup });
  }

  const orderedItems = Number(browserPack?.counts?.orderedItems ?? items.length);
  if (orderedItems !== items.length) {
    warnings.push({ code: 'RUST_BROWSER_ORDERED_ITEM_COUNT_DIFFERS', message: 'orderedItems differs from items length', details: { orderedItems, itemCount: items.length } });
  }
  const atlasItems = items.filter((item) => item?.atlas && (item.atlas.hasStaticAtlas || item.atlas.hasAnimatedAtlas)).length;
  const declaredAtlasItems = Number(browserPack?.counts?.atlasItems ?? atlasItems);
  if (declaredAtlasItems !== atlasItems) {
    fail(failures, 'RUST_BROWSER_ATLAS_COUNT_MISMATCH', 'atlasItems count differs from drawable item count', { declaredAtlasItems, atlasItems });
  }
  const animatedAtlasItems = items.filter((item) => item?.atlas?.hasAnimatedAtlas || item?.atlas?.animatedAtlas).length;
  const staticAtlasItems = items.filter((item) => item?.atlas?.hasStaticAtlas || item?.atlas?.staticAtlas).length;

  const report = {
    schemaVersion: 'neonei/rust-browser-runtime-validation/v1',
    generatedAt: new Date().toISOString(),
    distDataDir,
    source: manifest.source ?? null,
    sourceRepository: manifest.sourceRepository ?? null,
    rustBrowserPack: rustBrowserPackRelativePath || null,
    itemCount: items.length,
    groupCount: groups.length,
    groupedMemberCount: memberOwner.size,
    atlasItems,
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
