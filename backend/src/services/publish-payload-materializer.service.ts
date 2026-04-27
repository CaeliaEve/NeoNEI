import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import type Database from 'better-sqlite3';
import { DATA_DIR, PUBLISH_OUTPUT_DIR, PUBLISH_PUBLIC_PATH } from '../config/runtime-paths';
import { getAccelerationDatabaseManager, type DatabaseManager } from '../models/database';
import { ItemsSearchService } from './items-search.service';
import { ItemsService, type BrowserPageEntry, type Item } from './items.service';
import { PageAtlasService } from './page-atlas.service';
import { attachRenderHintsToEntries, buildBrowserRichMediaManifest } from './browser-render-hints.service';
import { RecipeBootstrapService } from './recipe-bootstrap.service';
import {
  type IndexedRecipe,
  type ItemRecipeSummaryResponse,
  type MachineGroupSummary,
} from './recipes-indexed.service';
import type { RecipeCategorySummary } from './recipe-category-grouping.service';
import {
  buildPublishBrowserPageWindowRelativePath,
  buildPublishBrowserSearchPackRelativePath,
  buildPublishBrowserSearchShardRelativePath,
  buildPublishBundleBasePublicPath,
  buildPublishBundleManifestRelativePath,
  buildPublishBundlePublicAssetPath,
  buildPublishHomeBootstrapWindowRelativePath,
  buildPublishModsListRelativePath,
  buildPublishRecipeBootstrapBaseRelativePath,
  buildPublishRecipeCategoryGroupIndexRelativePath,
  buildPublishRecipeBootstrapRelativePath,
  buildPublishRecipeGroupIndexBaseRelativePath,
  buildPublishRecipeSearchBaseRelativePath,
  buildPublishRecipeSearchRelativePath,
  buildPublishRecipeMachineGroupIndexRelativePath,
  buildPublishRecipeBootstrapShardBaseRelativePath,
  buildPublishRecipeBootstrapShardRelativePath,
  type PublishStaticBundleManifest,
  buildBrowserPageWindowPayloadKey,
  buildBrowserSearchPackPayloadKey,
  buildHomeBootstrapWindowPayloadKey,
  buildModsListPayloadKey,
} from './publish-payload.service';

export const PUBLISH_PAYLOAD_REVISION = '2026-04-28-publish-static-bundle-v8';

export interface PublishPayloadHotOptions {
  enabled?: boolean;
  firstPageSize?: number;
  slotSizes?: number[];
  includeBrowserSearchPack?: boolean;
  windowCount?: number;
  windowStride?: number;
  searchHotShardSize?: number;
  recipeBootstrapHotItemLimit?: number;
}

export interface PublishPayloadMaterializerOptions {
  databaseManager?: DatabaseManager;
  imageRoot: string;
  atlasOutputDir?: string;
  publishOutputDir?: string;
  publishPublicPath?: string;
  publishHotPayloads?: PublishPayloadHotOptions;
}

export interface PublishPayloadMaterializeResult {
  count: number;
  bytes: number;
  revision: string;
  compiledAt: string;
}

type NormalizedPublishPayloadHotOptions = {
  enabled: boolean;
  firstPageSize: number;
  slotSizes: number[];
  includeBrowserSearchPack: boolean;
  windowCount: number;
  windowStride: number;
  searchHotShardSize: number;
  recipeBootstrapHotItemLimit: number;
};

type PublishPayloadRecord = {
  payload_key: string;
  payload_type: string;
  payload_json: string;
  signature: string;
  bundle_relative_path: string;
  prewritten?: boolean;
};

type CompilerStateRow = {
  state_key: string;
  state_value: string;
};

function collectDisplayItems(entries: BrowserPageEntry[]): Item[] {
  const ordered: Item[] = [];
  const seen = new Set<string>();

  for (const entry of entries) {
    const item = entry.kind === 'item' ? entry.item : entry.group.representative;
    if (!item?.itemId || seen.has(item.itemId)) continue;
    seen.add(item.itemId);
    ordered.push(item);
  }

  return ordered;
}

function normalizeSlotSizes(values: number[] | undefined): number[] {
  const normalized = Array.from(
    new Set(
      (values ?? [45])
        .map((value) => Math.max(24, Math.min(128, Math.floor(Number(value) || 0))))
        .filter((value) => Number.isFinite(value) && value > 0),
    ),
  ).sort((left, right) => left - right);
  return normalized.length > 0 ? normalized : [45];
}

const RECIPE_GROUP_INDEX_ONLY_LIMIT = 0;
const RECIPE_SEARCH_TEXT_MAX_LENGTH = Number(process.env.PUBLISHED_RECIPE_SEARCH_TEXT_MAX_LENGTH || 1024);
const PUBLISHED_RECIPE_SEARCH_PACK_MAX_BYTES = Number(process.env.PUBLISHED_RECIPE_SEARCH_PACK_MAX_BYTES || (768 * 1024));

const PUBLISH_BUNDLE_SIDECAR_VARIANTS = [
  {
    contentEncoding: 'br' as const,
    extension: '.br' as const,
    compress: (buffer: Buffer) => zlib.brotliCompressSync(buffer, {
      params: {
        [zlib.constants.BROTLI_PARAM_QUALITY]: 11,
      },
    }),
  },
  {
    contentEncoding: 'gzip' as const,
    extension: '.gz' as const,
    compress: (buffer: Buffer) => zlib.gzipSync(buffer, { level: 9 }),
  },
] as const;

function inferPublishContentType(relativePath: string): string {
  return relativePath.toLowerCase().endsWith('.json')
    ? 'application/json; charset=utf-8'
    : 'application/octet-stream';
}

function shouldParsePublishPayloadMetadata(payloadType: string): boolean {
  return payloadType === 'browser-search-pack-shard'
    || payloadType === 'browser-page-window'
    || payloadType === 'home-bootstrap-window';
}

function toPublishedRelationSegment(value: 'producedBy' | 'usedIn'): 'produced-by' | 'used-in' {
  return value === 'usedIn' ? 'used-in' : 'produced-by';
}

function collectMachineGroupSummaries(
  summary: ItemRecipeSummaryResponse | null | undefined,
  tab: 'producedBy' | 'usedIn',
): MachineGroupSummary[] {
  const groups = tab === 'usedIn'
    ? (summary?.usedInMachineGroups ?? [])
    : (summary?.producedByMachineGroups ?? summary?.machineGroups ?? []);
  const deduped = new Map<string, MachineGroupSummary>();
  for (const group of groups) {
    const machineType = `${group.machineType ?? ''}`.trim();
    const voltageTier = `${group.voltageTier ?? ''}`.trim() || null;
    const machineKey = `${group.machineKey ?? ''}`.trim() || `${machineType}::${voltageTier ?? ''}`;
    if (!machineType || !machineKey || deduped.has(machineKey)) {
      continue;
    }
    deduped.set(machineKey, {
      ...group,
      machineType,
      voltageTier,
      machineKey,
    });
  }
  return Array.from(deduped.values());
}

function collectCategoryGroupSummaries(
  summary: ItemRecipeSummaryResponse | null | undefined,
  tab: 'producedBy' | 'usedIn',
): RecipeCategorySummary[] {
  const groups = tab === 'usedIn'
    ? (summary?.usedInCategoryGroups ?? [])
    : (summary?.producedByCategoryGroups ?? []);
  const deduped = new Map<string, RecipeCategorySummary>();
  for (const group of groups) {
    const categoryKey = `${group.categoryKey ?? ''}`.trim();
    if (!categoryKey || deduped.has(categoryKey)) {
      continue;
    }
    deduped.set(categoryKey, {
      ...group,
      categoryKey,
    });
  }
  return Array.from(deduped.values());
}

type PublishedRecipeSearchEntry = {
  recipeId: string;
  machineType: string;
  referencedItemIds: string[];
  searchText: string;
};

function pushSearchToken(tokens: Set<string>, value: unknown): void {
  if (typeof value !== 'string') {
    return;
  }
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return;
  }
  tokens.add(normalized);
}

function collectSearchTokensFromItem(
  item: {
    itemId?: string | null;
    localizedName?: string | null;
    internalName?: string | null;
    modId?: string | null;
  } | null | undefined,
  tokens: Set<string>,
  referencedItemIds: Set<string>,
): void {
  if (!item) {
    return;
  }
  const itemId = `${item.itemId ?? ''}`.trim();
  if (itemId) {
    referencedItemIds.add(itemId);
    pushSearchToken(tokens, itemId);
  }
  pushSearchToken(tokens, item.localizedName);
  pushSearchToken(tokens, item.internalName);
  pushSearchToken(tokens, item.modId);
}

function collectSearchTokensFromFluid(
  fluid: {
    fluidId?: string | null;
    localizedName?: string | null;
    internalName?: string | null;
    modId?: string | null;
  } | null | undefined,
  tokens: Set<string>,
): void {
  if (!fluid) {
    return;
  }
  pushSearchToken(tokens, fluid.fluidId);
  pushSearchToken(tokens, fluid.localizedName);
  pushSearchToken(tokens, fluid.internalName);
  pushSearchToken(tokens, fluid.modId);
}

function buildPublishedRecipeSearchEntries(recipes: IndexedRecipe[]): PublishedRecipeSearchEntry[] {
  return recipes
    .map((recipe) => {
      const recipeId = `${recipe.id ?? ''}`.trim();
      if (!recipeId) {
        return null;
      }

      const tokens = new Set<string>();
      const referencedItemIds = new Set<string>();
      pushSearchToken(tokens, recipeId);
      pushSearchToken(tokens, recipe.recipeType);
      pushSearchToken(tokens, recipe.recipeTypeData?.id);
      pushSearchToken(tokens, recipe.recipeTypeData?.type);
      pushSearchToken(tokens, recipe.recipeTypeData?.category);
      pushSearchToken(tokens, recipe.machineInfo?.machineType);
      pushSearchToken(tokens, recipe.machineInfo?.category);
      pushSearchToken(tokens, recipe.metadata?.additionalInfo);
      pushSearchToken(tokens, recipe.additionalData?.uiFamilyKey);

      for (const output of recipe.outputs ?? []) {
        collectSearchTokensFromItem(output?.item, tokens, referencedItemIds);
      }

      const visitInputGroup = (group: IndexedRecipe['inputs'][number] | null | undefined) => {
        if (!group) {
          return;
        }
        if (Array.isArray(group)) {
          for (const nested of group) {
            visitInputGroup(nested as IndexedRecipe['inputs'][number]);
          }
          return;
        }
        pushSearchToken(tokens, group?.oreDictName);
        for (const stack of group.items ?? []) {
          collectSearchTokensFromItem(stack?.item, tokens, referencedItemIds);
        }
      };

      for (const input of recipe.inputs ?? []) {
        visitInputGroup(input as IndexedRecipe['inputs'][number]);
      }

      for (const fluidGroup of recipe.fluidInputs ?? []) {
        for (const fluidStack of fluidGroup.fluids ?? []) {
          collectSearchTokensFromFluid(fluidStack?.fluid, tokens);
        }
      }

      for (const fluidStack of recipe.fluidOutputs ?? []) {
        collectSearchTokensFromFluid(fluidStack?.fluid, tokens);
      }

      for (const specialItem of recipe.metadata?.specialItems ?? []) {
        collectSearchTokensFromItem(specialItem, tokens, referencedItemIds);
      }

      if (recipe.machineInfo?.machineIcon) {
        collectSearchTokensFromItem(recipe.machineInfo.machineIcon, tokens, referencedItemIds);
      }

      return {
        recipeId,
        machineType: `${recipe.machineInfo?.machineType ?? ''}`.trim(),
        referencedItemIds: Array.from(referencedItemIds),
        searchText: Array.from(tokens).join('\n').slice(0, RECIPE_SEARCH_TEXT_MAX_LENGTH),
      } satisfies PublishedRecipeSearchEntry;
    })
    .filter((entry): entry is PublishedRecipeSearchEntry => Boolean(entry));
}

export class PublishPayloadMaterializerService {
  private readonly databaseManager: DatabaseManager;
  private readonly imageRoot: string;
  private readonly atlasOutputDir: string;
  private readonly publishOutputDir: string;
  private readonly publishPublicPath: string;
  private readonly options: NormalizedPublishPayloadHotOptions;

  constructor(options: PublishPayloadMaterializerOptions) {
    this.databaseManager = options.databaseManager ?? getAccelerationDatabaseManager();
    this.imageRoot = options.imageRoot;
    this.atlasOutputDir = options.atlasOutputDir ?? path.join(DATA_DIR, 'page-atlas-cache');
    this.publishOutputDir = options.publishOutputDir ?? PUBLISH_OUTPUT_DIR;
    this.publishPublicPath = options.publishPublicPath ?? PUBLISH_PUBLIC_PATH;
    this.options = {
      enabled: options.publishHotPayloads?.enabled ?? true,
      firstPageSize: Math.max(1, Math.floor(options.publishHotPayloads?.firstPageSize ?? 256)),
      slotSizes: normalizeSlotSizes(options.publishHotPayloads?.slotSizes),
      includeBrowserSearchPack: options.publishHotPayloads?.includeBrowserSearchPack ?? true,
      windowCount: Math.max(1, Math.floor(options.publishHotPayloads?.windowCount ?? 10)),
      windowStride: Math.max(
        1,
        Math.floor(
          options.publishHotPayloads?.windowStride
          ?? Math.max(48, Math.floor((options.publishHotPayloads?.firstPageSize ?? 256) / 4)),
        ),
      ),
      searchHotShardSize: Math.max(512, Math.floor(options.publishHotPayloads?.searchHotShardSize ?? 8192)),
      recipeBootstrapHotItemLimit: Math.max(0, Math.floor(options.publishHotPayloads?.recipeBootstrapHotItemLimit ?? 256)),
    };
  }

  private getAccelerationDatabase(): Database.Database {
    return this.databaseManager.getDatabase();
  }

  private getStateMap(db: Database.Database): Map<string, string> {
    const rows = db.prepare(`
      SELECT state_key, state_value
      FROM compiler_state
      WHERE state_key IN (
        'publish_payload_revision',
        'publish_payload_signature',
        'publish_payload_slot_sizes',
        'publish_payload_first_page_size',
        'publish_payload_include_search_pack',
        'publish_payload_window_count',
        'publish_payload_window_stride',
        'publish_payload_search_hot_shard_size',
        'publish_payload_recipe_bootstrap_hot_limit',
        'publish_payload_compiled_at',
        'publish_payloads_count'
      )
    `).all() as CompilerStateRow[];

    return new Map(rows.map((row) => [row.state_key, `${row.state_value ?? ''}`]));
  }

  isFresh(sourceSignature: string): boolean {
    const db = this.getAccelerationDatabase();
    const state = this.getStateMap(db);
    const payloadCount = Number(state.get('publish_payloads_count') ?? 0);
    const bundleManifestPath = path.join(this.publishOutputDir, sourceSignature, buildPublishBundleManifestRelativePath());

    if (!this.options.enabled) {
      return payloadCount === 0 && !fs.existsSync(bundleManifestPath);
    }

    return (
      payloadCount > 0
      && (state.get('publish_payload_revision') ?? '') === PUBLISH_PAYLOAD_REVISION
      && (state.get('publish_payload_signature') ?? '') === sourceSignature
      && (state.get('publish_payload_slot_sizes') ?? '') === JSON.stringify(this.options.slotSizes)
      && (state.get('publish_payload_first_page_size') ?? '') === String(this.options.firstPageSize)
      && (state.get('publish_payload_include_search_pack') ?? '') === (this.options.includeBrowserSearchPack ? '1' : '0')
      && (state.get('publish_payload_window_count') ?? '') === String(this.options.windowCount)
      && (state.get('publish_payload_window_stride') ?? '') === String(this.options.windowStride)
      && (state.get('publish_payload_search_hot_shard_size') ?? '') === String(this.options.searchHotShardSize)
      && (state.get('publish_payload_recipe_bootstrap_hot_limit') ?? '') === String(this.options.recipeBootstrapHotItemLimit)
      && Boolean((state.get('publish_payload_compiled_at') ?? '').trim())
      && fs.existsSync(bundleManifestPath)
    );
  }

  private canUseHotItems(db: Database.Database): boolean {
    try {
      const row = db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'hot_items'")
        .get() as { name?: string } | undefined;
      return row?.name === 'hot_items';
    } catch {
      return false;
    }
  }

  private selectHotRecipeBootstrapItemIds(db: Database.Database): string[] {
    if (this.options.recipeBootstrapHotItemLimit <= 0 || !this.canUseHotItems(db)) {
      return [];
    }

    const primaryRows = db.prepare(`
      SELECT item_id
      FROM hot_items
      WHERE COALESCE(recipe_rank, 0) > 0
      ORDER BY
        COALESCE(recipe_rank, 0) DESC,
        COALESCE(popularity_score, 0) DESC,
        COALESCE(search_rank, 999999) ASC,
        item_id ASC
      LIMIT @limit
    `).all({
      limit: this.options.recipeBootstrapHotItemLimit,
    }) as Array<{ item_id?: string | null }>;

    const normalizedPrimary = primaryRows
      .map((row) => `${row.item_id ?? ''}`.trim())
      .filter(Boolean);
    if (normalizedPrimary.length >= this.options.recipeBootstrapHotItemLimit) {
      return normalizedPrimary;
    }

    const fallbackRows = db.prepare(`
      SELECT item_id
      FROM hot_items
      ORDER BY
        COALESCE(popularity_score, 0) DESC,
        COALESCE(search_rank, 999999) ASC,
        item_id ASC
      LIMIT @limit
    `).all({
      limit: this.options.recipeBootstrapHotItemLimit,
    }) as Array<{ item_id?: string | null }>;

    return Array.from(
      new Set(
        [...normalizedPrimary, ...fallbackRows.map((row) => `${row.item_id ?? ''}`.trim())]
          .filter(Boolean),
      ),
    ).slice(0, this.options.recipeBootstrapHotItemLimit);
  }

  private writeStaticBundle(
    sourceSignature: string,
    compiledAt: string,
    rows: PublishPayloadRecord[],
  ): PublishStaticBundleManifest {
    const bundleOutputDir = path.join(this.publishOutputDir, sourceSignature);
    fs.mkdirSync(bundleOutputDir, { recursive: true });

    const basePublicPath = buildPublishBundleBasePublicPath(this.publishPublicPath, sourceSignature);
    const bundleManifest: PublishStaticBundleManifest = {
      version: 1,
      sourceSignature,
      revision: PUBLISH_PAYLOAD_REVISION,
      compiledAt,
      publicBasePath: basePublicPath,
      firstPageSize: this.options.firstPageSize,
      slotSizes: [...this.options.slotSizes],
      includeBrowserSearchPack: this.options.includeBrowserSearchPack,
      files: {
        manifest: buildPublishBundlePublicAssetPath(basePublicPath, buildPublishBundleManifestRelativePath()),
        modsList: null,
        browserSearchPack: null,
        browserSearchShards: [],
        recipeBootstrapBasePath: null,
        recipeBootstrapShardBasePath: null,
        recipeBootstrapItems: [],
        recipeGroupIndexBasePath: null,
        recipeSearchBasePath: null,
        recipeSearchItems: [],
        browserPageWindows: [],
        homeBootstrapWindows: [],
      },
      compression: {
        sidecars: PUBLISH_BUNDLE_SIDECAR_VARIANTS.map((variant) => variant.contentEncoding),
        assets: {},
      },
    };

    const registerCompressedAsset = (relativePath: string, absolutePath: string, publicPath: string) => {
      const sourceBuffer = fs.readFileSync(absolutePath);
      const compressedVariants = PUBLISH_BUNDLE_SIDECAR_VARIANTS.map((variant) => {
        const compressedBuffer = variant.compress(sourceBuffer);
        fs.writeFileSync(`${absolutePath}${variant.extension}`, compressedBuffer);
        return {
          path: `${publicPath}${variant.extension}`,
          contentEncoding: variant.contentEncoding,
          extension: variant.extension,
          sizeBytes: compressedBuffer.byteLength,
        };
      });

      bundleManifest.compression.assets[relativePath] = {
        path: publicPath,
        relativePath,
        contentType: inferPublishContentType(relativePath),
        sizeBytes: sourceBuffer.byteLength,
        compressedVariants,
      };
    };

    for (const row of rows) {
      if (row.payload_type === 'browser-search-pack') {
        continue;
      }
      const absolutePath = path.join(bundleOutputDir, row.bundle_relative_path);
      if (!row.prewritten) {
        fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
        fs.writeFileSync(absolutePath, row.payload_json, 'utf8');
      }
      const publicPath = buildPublishBundlePublicAssetPath(basePublicPath, row.bundle_relative_path);
      const payload = shouldParsePublishPayloadMetadata(row.payload_type)
        ? JSON.parse((row.prewritten ? fs.readFileSync(absolutePath, 'utf8') : row.payload_json)) as {
            items?: unknown[];
            windowOffset?: number;
            windowLength?: number;
            pagePack?: {
              windowOffset?: number;
              windowLength?: number;
            };
          }
        : null;
      const resolvedWindowOffset = Math.max(0, Math.floor(payload?.windowOffset ?? payload?.pagePack?.windowOffset ?? 0));
      const resolvedWindowLength = Math.max(0, Math.floor(payload?.windowLength ?? payload?.pagePack?.windowLength ?? 0));
      switch (row.payload_type) {
        case 'mods-list':
          bundleManifest.files.modsList = publicPath;
          break;
        case 'browser-search-pack':
          bundleManifest.files.browserSearchPack = publicPath;
          break;
        case 'browser-search-pack-shard': {
          const match = row.bundle_relative_path.match(/search\/shards\/([^/]+)\/([^/]+)\.json$/i);
          const shardId = match?.[2] ? decodeURIComponent(match[2]) : 'default';
          const total = Array.isArray(payload?.items) ? payload?.items.length ?? 0 : 0;
          bundleManifest.files.browserSearchShards.push({
            scope: match?.[1] ? decodeURIComponent(match[1]) : 'all',
            shardId,
            path: publicPath,
            total,
          });
          break;
        }
        case 'recipe-bootstrap': {
          const match = row.bundle_relative_path.match(/recipes\/bootstrap\/([^/]+)\.json$/i);
          const itemId = match?.[1] ? decodeURIComponent(match[1]) : '';
          if (!bundleManifest.files.recipeBootstrapBasePath) {
            bundleManifest.files.recipeBootstrapBasePath = buildPublishBundlePublicAssetPath(
              basePublicPath,
              buildPublishRecipeBootstrapBaseRelativePath(),
            );
          }
          if (itemId && !bundleManifest.files.recipeBootstrapItems.includes(itemId)) {
            bundleManifest.files.recipeBootstrapItems.push(itemId);
          }
          break;
        }
        case 'recipe-bootstrap-shard':
          if (!bundleManifest.files.recipeBootstrapShardBasePath) {
            bundleManifest.files.recipeBootstrapShardBasePath = buildPublishBundlePublicAssetPath(
              basePublicPath,
              buildPublishRecipeBootstrapShardBaseRelativePath(),
            );
          }
          break;
        case 'recipe-machine-group-index':
        case 'recipe-category-group-index':
          if (!bundleManifest.files.recipeGroupIndexBasePath) {
            bundleManifest.files.recipeGroupIndexBasePath = buildPublishBundlePublicAssetPath(
              basePublicPath,
              buildPublishRecipeGroupIndexBaseRelativePath(),
            );
          }
          break;
        case 'recipe-search-index': {
          const match = row.bundle_relative_path.match(/recipes\/search\/([^/]+)\/(?:produced-by|used-in)\.json$/i);
          const itemId = match?.[1] ? decodeURIComponent(match[1]) : '';
          if (itemId && !bundleManifest.files.recipeSearchItems.includes(itemId)) {
            bundleManifest.files.recipeSearchItems.push(itemId);
          }
          if (!bundleManifest.files.recipeSearchBasePath) {
            bundleManifest.files.recipeSearchBasePath = buildPublishBundlePublicAssetPath(
              basePublicPath,
              buildPublishRecipeSearchBaseRelativePath(),
            );
          }
          break;
        }
        case 'browser-page-window': {
          const match = row.bundle_relative_path.match(/slot-(\d+)(?:-offset-\d+)?\.json$/i);
          bundleManifest.files.browserPageWindows.push({
            scope: 'all',
            slotSize: match ? Number(match[1]) : 0,
            path: publicPath,
            offset: resolvedWindowOffset,
            length: resolvedWindowLength,
          });
          break;
        }
        case 'home-bootstrap-window': {
          const match = row.bundle_relative_path.match(/slot-(\d+)(?:-offset-\d+)?\.json$/i);
          bundleManifest.files.homeBootstrapWindows.push({
            scope: 'all',
            slotSize: match ? Number(match[1]) : 0,
            path: publicPath,
            offset: resolvedWindowOffset,
            length: resolvedWindowLength,
          });
          break;
        }
        default:
          break;
      }

      registerCompressedAsset(row.bundle_relative_path, absolutePath, publicPath);
    }

    bundleManifest.files.browserSearchShards.sort((left, right) => {
      if (left.scope !== right.scope) {
        return left.scope.localeCompare(right.scope);
      }
      if (left.shardId === 'hot' && right.shardId !== 'hot') return -1;
      if (left.shardId !== 'hot' && right.shardId === 'hot') return 1;
      return left.shardId.localeCompare(right.shardId);
    });
    bundleManifest.files.browserPageWindows.sort((left, right) => (left.slotSize - right.slotSize) || (left.offset - right.offset));
    bundleManifest.files.homeBootstrapWindows.sort((left, right) => (left.slotSize - right.slotSize) || (left.offset - right.offset));

    const manifestAbsolutePath = path.join(bundleOutputDir, buildPublishBundleManifestRelativePath());
    fs.writeFileSync(
      manifestAbsolutePath,
      JSON.stringify(bundleManifest, null, 2),
      'utf8',
    );
    for (const variant of PUBLISH_BUNDLE_SIDECAR_VARIANTS) {
      const compressedBuffer = variant.compress(fs.readFileSync(manifestAbsolutePath));
      fs.writeFileSync(`${manifestAbsolutePath}${variant.extension}`, compressedBuffer);
    }
    return bundleManifest;
  }

  async materialize(sourceSignature: string): Promise<PublishPayloadMaterializeResult> {
    const db = this.getAccelerationDatabase();
    const compiledAt = new Date().toISOString();
    const bundleOutputDir = path.join(this.publishOutputDir, sourceSignature);
    const upsertState = db.prepare(`
      INSERT INTO compiler_state (state_key, state_value, updated_at)
      VALUES (@state_key, @state_value, CURRENT_TIMESTAMP)
      ON CONFLICT(state_key) DO UPDATE SET
        state_value = excluded.state_value,
        updated_at = CURRENT_TIMESTAMP
    `);

    let rows: PublishPayloadRecord[] = [];
    let prewrittenPayloadBytes = 0;

    if (this.options.enabled) {
      fs.rmSync(bundleOutputDir, { recursive: true, force: true });
      fs.mkdirSync(bundleOutputDir, { recursive: true });
      const writeBundleJson = (relativePath: string, payloadJson: string) => {
        const absolutePath = path.join(bundleOutputDir, relativePath);
        fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
        fs.writeFileSync(absolutePath, payloadJson, 'utf8');
      };

      const itemsService = new ItemsService({
        databaseManager: this.databaseManager,
        splitExportFallback: false,
      });
      const pageAtlasService = new PageAtlasService({
        databaseManager: this.databaseManager,
        itemsService,
        imageRoot: this.imageRoot,
        atlasDir: this.atlasOutputDir,
      });
      const recipeBootstrapService = new RecipeBootstrapService({
        databaseManager: this.databaseManager,
        splitExportFallback: false,
      });
      const mods = await itemsService.getMods();
      const firstPageWindow = await itemsService.getBrowserItemsWindow({
        offset: 0,
        limit: this.options.firstPageSize,
      });
      attachRenderHintsToEntries(firstPageWindow.data);

      rows.push({
        payload_key: buildModsListPayloadKey(),
        payload_type: 'mods-list',
        payload_json: JSON.stringify(mods),
        signature: sourceSignature,
        bundle_relative_path: buildPublishModsListRelativePath(),
      });

      if (this.options.includeBrowserSearchPack) {
        const searchService = new ItemsSearchService({
          databaseProvider: () => this.databaseManager.getDatabase(),
          splitExportFallback: false,
        });
        const searchPack = await searchService.getBrowserSearchPack();
        const hotItems = searchPack.slice(0, this.options.searchHotShardSize);
        const tailItems = searchPack.slice(hotItems.length);
        rows.push({
          payload_key: buildBrowserSearchPackPayloadKey(),
          payload_type: 'browser-search-pack',
          payload_json: JSON.stringify({
            version: 1,
            signature: sourceSignature,
            total: searchPack.length,
            items: searchPack,
          }),
          signature: sourceSignature,
          bundle_relative_path: buildPublishBrowserSearchPackRelativePath(),
        });
        rows.push({
          payload_key: 'bundle-only:browser-search-pack-shard::mod=all::shard=hot',
          payload_type: 'browser-search-pack-shard',
          payload_json: JSON.stringify({
            version: 1,
            signature: sourceSignature,
            total: hotItems.length,
            items: hotItems,
          }),
          signature: sourceSignature,
          bundle_relative_path: buildPublishBrowserSearchShardRelativePath({
            shardId: 'hot',
          }),
        });
        if (tailItems.length > 0) {
          rows.push({
            payload_key: 'bundle-only:browser-search-pack-shard::mod=all::shard=tail',
            payload_type: 'browser-search-pack-shard',
            payload_json: JSON.stringify({
              version: 1,
              signature: sourceSignature,
              total: tailItems.length,
              items: tailItems,
            }),
            signature: sourceSignature,
            bundle_relative_path: buildPublishBrowserSearchShardRelativePath({
              shardId: 'tail',
            }),
          });
        }
      }

      const hotRecipeBootstrapItemIds = this.selectHotRecipeBootstrapItemIds(db);
      for (const itemId of hotRecipeBootstrapItemIds) {
        // eslint-disable-next-line no-await-in-loop
        const bootstrap = await recipeBootstrapService.getBootstrap(itemId);
        if (!bootstrap) {
          continue;
        }

        const bootstrapJson = JSON.stringify(bootstrap);
        prewrittenPayloadBytes += Buffer.byteLength(bootstrapJson, 'utf8');
        const bootstrapRelativePath = buildPublishRecipeBootstrapRelativePath(itemId);
        writeBundleJson(bootstrapRelativePath, bootstrapJson);

        rows.push({
          payload_key: `bundle-only:recipe-bootstrap::item=${itemId}`,
          payload_type: 'recipe-bootstrap',
          payload_json: '{}',
          signature: sourceSignature,
          bundle_relative_path: bootstrapRelativePath,
          prewritten: true,
        });

        // eslint-disable-next-line no-await-in-loop
        const fullBootstrap = await recipeBootstrapService.getBootstrapShard(itemId);
        if (fullBootstrap) {
          for (const [tab, relation, sourceRecipes] of [
            ['producedBy', 'produced-by', fullBootstrap.indexedCrafting],
            ['usedIn', 'used-in', fullBootstrap.indexedUsage],
          ] as const) {
            if (sourceRecipes.length <= 0) {
              continue;
            }
            const searchPayloadJson = JSON.stringify({
              version: 1,
              sourceSignature,
              itemId,
              tab,
              relation,
              recipeCount: sourceRecipes.length,
              entries: buildPublishedRecipeSearchEntries(sourceRecipes),
            });
            if (Buffer.byteLength(searchPayloadJson, 'utf8') > PUBLISHED_RECIPE_SEARCH_PACK_MAX_BYTES) {
              continue;
            }
            const searchRelativePath = buildPublishRecipeSearchRelativePath({
              itemId,
              relation,
            });
            prewrittenPayloadBytes += Buffer.byteLength(searchPayloadJson, 'utf8');
            writeBundleJson(searchRelativePath, searchPayloadJson);
            rows.push({
              payload_key: `bundle-only:recipe-search-index::item=${itemId}::relation=${relation}`,
              payload_type: 'recipe-search-index',
              payload_json: '{}',
              signature: sourceSignature,
              bundle_relative_path: searchRelativePath,
              prewritten: true,
            });
          }
        }

        for (const tab of ['producedBy', 'usedIn'] as const) {
          const relationSegment = toPublishedRelationSegment(tab);
          const machineGroups = collectMachineGroupSummaries(bootstrap.indexedSummary, tab);
          for (const machineGroup of machineGroups) {
            const machineKey = `${machineGroup.machineKey ?? ''}`.trim()
              || `${machineGroup.machineType}::${machineGroup.voltageTier ?? ''}`;
            if (!machineKey || !`${machineGroup.machineType ?? ''}`.trim()) {
              continue;
            }

            const machinePayload = tab === 'usedIn'
              // eslint-disable-next-line no-await-in-loop
              ? await recipeBootstrapService.getUsedInGroup(itemId, machineGroup.machineType, machineGroup.voltageTier ?? null, {
                  offset: 0,
                  limit: RECIPE_GROUP_INDEX_ONLY_LIMIT,
                  includeRecipeIds: true,
                })
              // eslint-disable-next-line no-await-in-loop
              : await recipeBootstrapService.getProducedByGroup(itemId, machineGroup.machineType, machineGroup.voltageTier ?? null, {
                  offset: 0,
                  limit: RECIPE_GROUP_INDEX_ONLY_LIMIT,
                  includeRecipeIds: true,
                });
            const machineRelativePath = buildPublishRecipeMachineGroupIndexRelativePath({
              itemId,
              relation: relationSegment,
              machineKey,
            });
            const machinePayloadJson = JSON.stringify({
              itemId,
              machineType: machineGroup.machineType,
              voltageTier: machineGroup.voltageTier ?? null,
              recipeCount: machinePayload.recipeCount,
              recipes: machinePayload.recipes,
              recipeIds: machinePayload.recipeIds,
              offset: machinePayload.offset,
              limit: machinePayload.limit,
              hasMore: machinePayload.hasMore,
            });
            prewrittenPayloadBytes += Buffer.byteLength(machinePayloadJson, 'utf8');
            writeBundleJson(machineRelativePath, machinePayloadJson);
            rows.push({
              payload_key: `bundle-only:recipe-machine-group-index::item=${itemId}::relation=${relationSegment}::machine=${machineKey}`,
              payload_type: 'recipe-machine-group-index',
              payload_json: '{}',
              signature: sourceSignature,
              bundle_relative_path: machineRelativePath,
              prewritten: true,
            });
          }

          const categoryGroups = collectCategoryGroupSummaries(bootstrap.indexedSummary, tab);
          for (const categoryGroup of categoryGroups) {
            const categoryKey = `${categoryGroup.categoryKey ?? ''}`.trim();
            if (!categoryKey) {
              continue;
            }

            // eslint-disable-next-line no-await-in-loop
            const categoryPayload = await recipeBootstrapService.getCategoryGroup(
              itemId,
              tab,
              categoryKey,
              {
                offset: 0,
                limit: RECIPE_GROUP_INDEX_ONLY_LIMIT,
                includeRecipeIds: true,
              },
            );
            const categoryRelativePath = buildPublishRecipeCategoryGroupIndexRelativePath({
              itemId,
              relation: relationSegment,
              categoryKey,
            });
            const categoryPayloadJson = JSON.stringify({
              itemId,
              categoryKey,
              tab,
              recipeCount: categoryPayload.recipeCount,
              recipes: categoryPayload.recipes,
              recipeIds: categoryPayload.recipeIds,
              offset: categoryPayload.offset,
              limit: categoryPayload.limit,
              hasMore: categoryPayload.hasMore,
            });
            prewrittenPayloadBytes += Buffer.byteLength(categoryPayloadJson, 'utf8');
            writeBundleJson(categoryRelativePath, categoryPayloadJson);
            rows.push({
              payload_key: `bundle-only:recipe-category-group-index::item=${itemId}::relation=${relationSegment}::category=${categoryKey}`,
              payload_type: 'recipe-category-group-index',
              payload_json: '{}',
              signature: sourceSignature,
              bundle_relative_path: categoryRelativePath,
              prewritten: true,
            });
          }
        }

        const recipeBootstrapCacheHolder = recipeBootstrapService as unknown as {
          cache?: Map<string, unknown>;
          fullCache?: Map<string, unknown>;
        };
        recipeBootstrapCacheHolder.cache?.clear();
        recipeBootstrapCacheHolder.fullCache?.clear();
      }

      const displayItems = collectDisplayItems(firstPageWindow.data);
      const firstPageMediaManifest = buildBrowserRichMediaManifest(displayItems);
      for (const slotSize of this.options.slotSizes) {
        // eslint-disable-next-line no-await-in-loop
        const atlas = await pageAtlasService.buildAtlas(displayItems, slotSize);
        const pagePackPayload = {
          ...firstPageWindow,
          page: 1,
          pageSize: this.options.firstPageSize,
          totalPages: Math.max(1, Math.ceil(firstPageWindow.total / this.options.firstPageSize)),
          atlas,
          mediaManifest: firstPageMediaManifest,
          windowOffset: firstPageWindow.offset,
          windowLength: firstPageWindow.data.length,
        };

        rows.push({
          payload_key: buildBrowserPageWindowPayloadKey({ slotSize }),
          payload_type: 'browser-page-window',
          payload_json: JSON.stringify(pagePackPayload),
          signature: sourceSignature,
          bundle_relative_path: buildPublishBrowserPageWindowRelativePath({ slotSize }),
        });
        rows.push({
          payload_key: buildHomeBootstrapWindowPayloadKey({ slotSize }),
          payload_type: 'home-bootstrap-window',
          payload_json: JSON.stringify({
            mods,
            pagePack: pagePackPayload,
          }),
          signature: sourceSignature,
          bundle_relative_path: buildPublishHomeBootstrapWindowRelativePath({ slotSize }),
        });

        for (let windowIndex = 1; windowIndex < this.options.windowCount; windowIndex += 1) {
          const offset = windowIndex * this.options.windowStride;
          // eslint-disable-next-line no-await-in-loop
          const extraWindow = await itemsService.getBrowserItemsWindow({
            offset,
            limit: this.options.firstPageSize,
          });
          if (!extraWindow.data.length) {
            break;
          }
          attachRenderHintsToEntries(extraWindow.data);
          const extraDisplayItems = collectDisplayItems(extraWindow.data);
          const extraMediaManifest = buildBrowserRichMediaManifest(extraDisplayItems);
          // eslint-disable-next-line no-await-in-loop
          const extraAtlas = await pageAtlasService.buildAtlas(extraDisplayItems, slotSize);
          rows.push({
            payload_key: `bundle-only:${buildBrowserPageWindowPayloadKey({ slotSize })}:offset=${offset}`,
            payload_type: 'browser-page-window',
            payload_json: JSON.stringify({
              ...extraWindow,
              page: Math.floor(offset / this.options.firstPageSize) + 1,
              pageSize: this.options.firstPageSize,
              totalPages: Math.max(1, Math.ceil(extraWindow.total / this.options.firstPageSize)),
              atlas: extraAtlas,
              mediaManifest: extraMediaManifest,
              windowOffset: extraWindow.offset,
              windowLength: extraWindow.data.length,
            }),
            signature: sourceSignature,
            bundle_relative_path: buildPublishBrowserPageWindowRelativePath({ slotSize }).replace(/\.json$/i, `-offset-${offset}.json`),
          });
        }
      }
    }

    if (this.options.enabled) {
      this.writeStaticBundle(sourceSignature, compiledAt, rows);
    } else {
      fs.rmSync(bundleOutputDir, { recursive: true, force: true });
    }

    const payloadBytes = rows.reduce(
      (sum, row) => sum + Buffer.byteLength(row.payload_json, 'utf8'),
      0,
    ) + prewrittenPayloadBytes;

    const materializeTransaction = db.transaction(() => {
      db.exec('DELETE FROM publish_payloads');
      const insertPublishPayload = db.prepare(`
        INSERT OR REPLACE INTO publish_payloads (
          payload_key,
          payload_type,
          payload_json,
          signature,
          updated_at
        ) VALUES (
          @payload_key,
          @payload_type,
          @payload_json,
          @signature,
          CURRENT_TIMESTAMP
        )
      `);

      for (const row of rows.filter((entry) => !entry.payload_key.startsWith('bundle-only:'))) {
        insertPublishPayload.run(row);
      }

      upsertState.run({ state_key: 'publish_payload_revision', state_value: PUBLISH_PAYLOAD_REVISION });
      upsertState.run({ state_key: 'publish_payload_signature', state_value: sourceSignature });
      upsertState.run({ state_key: 'publish_payload_slot_sizes', state_value: JSON.stringify(this.options.slotSizes) });
      upsertState.run({ state_key: 'publish_payload_first_page_size', state_value: String(this.options.firstPageSize) });
      upsertState.run({ state_key: 'publish_payload_include_search_pack', state_value: this.options.includeBrowserSearchPack ? '1' : '0' });
      upsertState.run({ state_key: 'publish_payload_window_count', state_value: String(this.options.windowCount) });
      upsertState.run({ state_key: 'publish_payload_window_stride', state_value: String(this.options.windowStride) });
      upsertState.run({ state_key: 'publish_payload_search_hot_shard_size', state_value: String(this.options.searchHotShardSize) });
      upsertState.run({ state_key: 'publish_payload_recipe_bootstrap_hot_limit', state_value: String(this.options.recipeBootstrapHotItemLimit) });
      upsertState.run({ state_key: 'publish_payload_compiled_at', state_value: compiledAt });
      upsertState.run({
        state_key: 'publish_payloads_count',
        state_value: String(rows.filter((entry) => !entry.payload_key.startsWith('bundle-only:')).length),
      });
      upsertState.run({ state_key: 'publish_payload_bytes', state_value: String(payloadBytes) });
    });

    materializeTransaction();
    db.pragma('wal_checkpoint(PASSIVE)');

    return {
      count: rows.length,
      bytes: payloadBytes,
      revision: PUBLISH_PAYLOAD_REVISION,
      compiledAt,
    };
  }
}
