import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import crypto from 'crypto';
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
  buildPublishRecipeCategoryGroupWindowRelativePath,
  buildPublishRecipeBootstrapRelativePath,
  buildPublishRecipeGroupIndexBaseRelativePath,
  buildPublishRecipeGroupWindowBaseRelativePath,
  buildPublishRecipeSearchBaseRelativePath,
  buildPublishRecipeSearchRelativePath,
  buildPublishRecipeMachineGroupIndexRelativePath,
  buildPublishRecipeMachineGroupWindowRelativePath,
  buildPublishRecipeBootstrapShardBaseRelativePath,
  buildPublishRecipeBootstrapShardRelativePath,
  buildPublishItemRecipeBundleBaseRelativePath,
  buildPublishItemRecipeBundleRelativePath,
  buildPublishRecipeUiBundleBaseRelativePath,
  buildPublishRecipeUiBundleRelativePath,
  type PublishStaticBundleManifest,
  type PublishBundleAssetMetadata,
  buildBrowserPageWindowPayloadKey,
  buildBrowserSearchPackPayloadKey,
  buildBrowserPageResourceManifest,
  buildHomeBootstrapWindowPayloadKey,
  buildModsListPayloadKey,
} from './publish-payload.service';

export const PUBLISH_PAYLOAD_REVISION = '2026-05-23-publish-static-bundle-v12-recipe-group-windows';

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


type IncrementalWriteStats = {
  written: number;
  skipped: number;
  bytesWritten: number;
};

function createIncrementalWriteStats(): IncrementalWriteStats {
  return { written: 0, skipped: 0, bytesWritten: 0 };
}

function writeUtf8IfChanged(filePath: string, content: string, stats?: IncrementalWriteStats): boolean {
  const next = Buffer.from(content, 'utf8');
  if (fs.existsSync(filePath)) {
    try {
      const current = fs.readFileSync(filePath);
      if (current.length === next.length && current.equals(next)) {
        if (stats) stats.skipped += 1;
        return false;
      }
    } catch {
      // Fall through and rewrite the file.
    }
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, next);
  if (stats) {
    stats.written += 1;
    stats.bytesWritten += next.byteLength;
  }
  return true;
}

function writeBufferIfChanged(filePath: string, content: Buffer, stats?: IncrementalWriteStats): boolean {
  if (fs.existsSync(filePath)) {
    try {
      const current = fs.readFileSync(filePath);
      if (current.length === content.length && current.equals(content)) {
        if (stats) stats.skipped += 1;
        return false;
      }
    } catch {
      // Fall through and rewrite the file.
    }
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
  if (stats) {
    stats.written += 1;
    stats.bytesWritten += content.byteLength;
  }
  return true;
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
const RECIPE_GROUP_WINDOW_SIZE = 8;
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

function escapeHtml(value: unknown): string {
  return `${value ?? ''}`
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function sha256Hex(buffer: Buffer | string): string {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function buildContentAddressedRelativePath(relativePath: string, sha256: string): string {
  const extension = path.extname(relativePath) || '.bin';
  const stem = path.basename(relativePath, extension).replace(/[^a-z0-9._-]+/gi, '-').slice(0, 48) || 'asset';
  const prefix = sha256.slice(0, 2);
  return `cas/${prefix}/${sha256}-${stem}${extension}`;
}

function classifyPublishAsset(relativePath: string): string {
  if (relativePath === 'build-report.json' || relativePath === 'build-report.html') return 'build-report';
  if (relativePath.startsWith('mods/')) return 'mods';
  if (relativePath.startsWith('search/')) return 'search';
  if (relativePath.startsWith('browser/pages/')) return 'browser-pages';
  if (relativePath.startsWith('home/')) return 'home-bootstrap';
  if (relativePath.startsWith('recipes/bootstrap/')) return 'recipe-bootstrap';
  if (relativePath.startsWith('recipes/groups/')) return 'recipe-groups';
  if (relativePath.startsWith('recipes/search/')) return 'recipe-search';
  return 'other';
}

function buildPublishIdentity(assets: Record<string, PublishBundleAssetMetadata>) {
  const entries = Object.values(assets).sort((left, right) => left.relativePath.localeCompare(right.relativePath));
  const categoryInputs = new Map<string, string[]>();
  const allInputs: string[] = [];
  let totalBytes = 0;

  for (const asset of entries) {
    totalBytes += asset.sizeBytes;
    const line = `${asset.relativePath}:${asset.sizeBytes}:${asset.sha256}`;
    allInputs.push(line);
    const category = classifyPublishAsset(asset.relativePath);
    const categoryLines = categoryInputs.get(category) ?? [];
    categoryLines.push(line);
    categoryInputs.set(category, categoryLines);
  }

  const categories: Record<string, string> = {};
  for (const [category, lines] of Array.from(categoryInputs.entries()).sort(([left], [right]) => left.localeCompare(right))) {
    categories[category] = sha256Hex(lines.sort().join('\n'));
  }

  return {
    algorithm: 'sha256' as const,
    assetCount: entries.length,
    totalBytes,
    contentHash: sha256Hex(allInputs.join('\n')),
    categories,
  };
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

function collectRenderAssetRefsFromUnknown(value: unknown, refs: Set<string>): void {
  if (!value || typeof value !== 'object') {
    return;
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      collectRenderAssetRefsFromUnknown(entry, refs);
    }
    return;
  }
  const record = value as Record<string, unknown>;
  const renderAssetRef = record.renderAssetRef;
  if (typeof renderAssetRef === 'string' && renderAssetRef.trim()) {
    refs.add(renderAssetRef.trim());
  }
  for (const child of Object.values(record)) {
    if (child && typeof child === 'object') {
      collectRenderAssetRefsFromUnknown(child, refs);
    }
  }
}

function collectRecipeIds(recipes: IndexedRecipe[]): string[] {
  return recipes
    .map((recipe) => `${recipe.id ?? ''}`.trim())
    .filter(Boolean);
}

function buildPublishedItemRecipeBundle(params: {
  sourceSignature: string;
  itemId: string;
  bootstrap: Awaited<ReturnType<RecipeBootstrapService['getBootstrap']>>;
  fullBootstrap: Awaited<ReturnType<RecipeBootstrapService['getBootstrapShard']>>;
}) {
  const producedBy = params.fullBootstrap?.recipeIndex?.producedByRecipes
    ?? params.bootstrap?.recipeIndex?.producedByRecipes
    ?? [];
  const usedIn = params.fullBootstrap?.recipeIndex?.usedInRecipes
    ?? params.bootstrap?.recipeIndex?.usedInRecipes
    ?? [];
  const firstPageProducedBy = params.fullBootstrap?.indexedCrafting ?? params.bootstrap?.indexedCrafting ?? [];
  const firstPageUsedIn = params.fullBootstrap?.indexedUsage ?? params.bootstrap?.indexedUsage ?? [];
  const assetRefs = new Set<string>();
  collectRenderAssetRefsFromUnknown(params.bootstrap?.item, assetRefs);
  collectRenderAssetRefsFromUnknown(firstPageProducedBy, assetRefs);
  collectRenderAssetRefsFromUnknown(firstPageUsedIn, assetRefs);
  const uiPayloadRefs = Array.from(new Set([...collectRecipeIds(firstPageProducedBy), ...collectRecipeIds(firstPageUsedIn)]));

  return {
    version: 1,
    sourceSignature: params.sourceSignature,
    itemId: params.itemId,
    item: params.bootstrap?.item ?? null,
    producedBy,
    usedIn,
    summaryGroups: {
      producedByMachineGroups: params.bootstrap?.indexedSummary?.producedByMachineGroups ?? params.bootstrap?.indexedSummary?.machineGroups ?? [],
      usedInMachineGroups: params.bootstrap?.indexedSummary?.usedInMachineGroups ?? [],
      producedByCategoryGroups: params.bootstrap?.indexedSummary?.producedByCategoryGroups ?? [],
      usedInCategoryGroups: params.bootstrap?.indexedSummary?.usedInCategoryGroups ?? [],
    },
    machineGroups: params.bootstrap?.indexedSummary?.machineGroups ?? [],
    firstPageRecipes: {
      producedBy: firstPageProducedBy,
      usedIn: firstPageUsedIn,
    },
    uiPayloadRefs,
    assetRefs: Array.from(assetRefs).sort(),
    bootstrap: params.bootstrap,
  };
}

function buildPublishedRecipeUiBundle(params: {
  sourceSignature: string;
  itemId: string;
  recipeIds: string[];
  assetRefs: string[];
}) {
  return {
    version: 1,
    sourceSignature: params.sourceSignature,
    itemId: params.itemId,
    recipeIds: Array.from(new Set(params.recipeIds)).sort(),
    uiPayloadRefs: Array.from(new Set(params.recipeIds)).sort(),
    assetRefs: Array.from(new Set(params.assetRefs)).sort(),
  };
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
      windowCount: Math.max(1, Math.floor(options.publishHotPayloads?.windowCount ?? 48)),
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
        'publish_payloads_count',
        'publish_payload_browser_layout_key',
        'browser_layout_source',
        'item_browser_groups_count',
        'browser_default_entries_count'
      )
    `).all() as CompilerStateRow[];

    return new Map(rows.map((row) => [row.state_key, `${row.state_value ?? ''}`]));
  }

  private getBrowserLayoutKey(state: Map<string, string>): string {
    return [
      (state.get('browser_layout_source') ?? '').trim() || 'browser-layout-missing',
      (state.get('item_browser_groups_count') ?? '').trim() || 'groups-count-missing',
      (state.get('browser_default_entries_count') ?? '').trim() || 'entries-count-missing',
    ].join('::');
  }

  isFresh(sourceSignature: string): boolean {
    const db = this.getAccelerationDatabase();
    const state = this.getStateMap(db);
    const payloadCount = Number(state.get('publish_payloads_count') ?? 0);
    const browserLayoutKey = this.getBrowserLayoutKey(state);
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
      && (state.get('publish_payload_browser_layout_key') ?? '') === browserLayoutKey
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
    incrementalWriteStats: IncrementalWriteStats,
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
      identity: {
        algorithm: 'sha256',
        assetCount: 0,
        totalBytes: 0,
        contentHash: '',
        categories: {},
      },
      files: {
        manifest: buildPublishBundlePublicAssetPath(basePublicPath, buildPublishBundleManifestRelativePath()),
        buildReport: null,
        buildReportHtml: null,
        modsList: null,
        browserSearchPack: null,
        browserSearchShards: [],
        recipeBootstrapBasePath: null,
        recipeBootstrapShardBasePath: null,
        recipeBootstrapItems: [],
        recipeGroupIndexBasePath: null,
        recipeGroupWindowBasePath: null,
        recipeSearchBasePath: null,
        recipeSearchItems: [],
        itemRecipeBundleBasePath: null,
        itemRecipeBundleItems: [],
        recipeUiBundleBasePath: null,
        recipeUiBundleItems: [],
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
      const sourceHash = sha256Hex(sourceBuffer);
      const contentAddressedRelativePath = buildContentAddressedRelativePath(relativePath, sourceHash);
      const contentAddressedAbsolutePath = path.join(bundleOutputDir, contentAddressedRelativePath);
      const contentAddressedPublicPath = buildPublishBundlePublicAssetPath(basePublicPath, contentAddressedRelativePath);
      writeBufferIfChanged(contentAddressedAbsolutePath, sourceBuffer, incrementalWriteStats);
      const compressedVariants = PUBLISH_BUNDLE_SIDECAR_VARIANTS.map((variant) => {
        const compressedBuffer = variant.compress(sourceBuffer);
        writeBufferIfChanged(`${absolutePath}${variant.extension}`, compressedBuffer, incrementalWriteStats);
        writeBufferIfChanged(`${contentAddressedAbsolutePath}${variant.extension}`, compressedBuffer, incrementalWriteStats);
        return {
          path: `${contentAddressedPublicPath}${variant.extension}`,
          contentEncoding: variant.contentEncoding,
          extension: variant.extension,
          sizeBytes: compressedBuffer.byteLength,
        };
      });

      bundleManifest.compression.assets[relativePath] = {
        path: publicPath,
        contentAddressedPath: contentAddressedPublicPath,
        relativePath,
        contentType: inferPublishContentType(relativePath),
        sizeBytes: sourceBuffer.byteLength,
        sha256: sourceHash,
        compressedVariants,
      };
    };

    for (const row of rows) {
      if (row.payload_type === 'browser-search-pack') {
        continue;
      }
      const absolutePath = path.join(bundleOutputDir, row.bundle_relative_path);
      if (!row.prewritten) {
        writeUtf8IfChanged(absolutePath, row.payload_json, incrementalWriteStats);
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
        case 'recipe-machine-group-window':
        case 'recipe-category-group-window':
          if (!bundleManifest.files.recipeGroupWindowBasePath) {
            bundleManifest.files.recipeGroupWindowBasePath = buildPublishBundlePublicAssetPath(
              basePublicPath,
              buildPublishRecipeGroupWindowBaseRelativePath(),
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
        case 'item-recipe-bundle': {
          const match = row.bundle_relative_path.match(/recipes\/item-bundles\/shard\/([^/]+)\.json$/i);
          const itemId = match?.[1] ? decodeURIComponent(match[1]) : '';
          if (itemId && !bundleManifest.files.itemRecipeBundleItems.includes(itemId)) {
            bundleManifest.files.itemRecipeBundleItems.push(itemId);
          }
          if (!bundleManifest.files.itemRecipeBundleBasePath) {
            bundleManifest.files.itemRecipeBundleBasePath = buildPublishBundlePublicAssetPath(
              basePublicPath,
              buildPublishItemRecipeBundleBaseRelativePath(),
            );
          }
          break;
        }
        case 'recipe-ui-bundle': {
          const match = row.bundle_relative_path.match(/recipes\/ui-bundles\/shard\/([^/]+)\.json$/i);
          const itemId = match?.[1] ? decodeURIComponent(match[1]) : '';
          if (itemId && !bundleManifest.files.recipeUiBundleItems.includes(itemId)) {
            bundleManifest.files.recipeUiBundleItems.push(itemId);
          }
          if (!bundleManifest.files.recipeUiBundleBasePath) {
            bundleManifest.files.recipeUiBundleBasePath = buildPublishBundlePublicAssetPath(
              basePublicPath,
              buildPublishRecipeUiBundleBaseRelativePath(),
            );
          }
          break;
        }        case 'browser-page-window': {
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
    bundleManifest.identity = buildPublishIdentity(bundleManifest.compression.assets);
    const buildReportPaths = this.writeBuildReport(bundleOutputDir, basePublicPath, bundleManifest, rows, incrementalWriteStats);
    bundleManifest.files.buildReport = buildReportPaths.jsonPublicPath;
    bundleManifest.files.buildReportHtml = buildReportPaths.htmlPublicPath;
    registerCompressedAsset(buildReportPaths.jsonRelativePath, buildReportPaths.jsonAbsolutePath, buildReportPaths.jsonPublicPath);
    registerCompressedAsset(buildReportPaths.htmlRelativePath, buildReportPaths.htmlAbsolutePath, buildReportPaths.htmlPublicPath);
    bundleManifest.identity = buildPublishIdentity(bundleManifest.compression.assets);
    writeUtf8IfChanged(
      manifestAbsolutePath,
      JSON.stringify(bundleManifest, null, 2),
      incrementalWriteStats,
    );
    for (const variant of PUBLISH_BUNDLE_SIDECAR_VARIANTS) {
      const compressedBuffer = variant.compress(fs.readFileSync(manifestAbsolutePath));
      writeBufferIfChanged(`${manifestAbsolutePath}${variant.extension}`, compressedBuffer, incrementalWriteStats);
    }
    return bundleManifest;
  }

  private writeBuildReport(
    bundleOutputDir: string,
    basePublicPath: string,
    bundleManifest: PublishStaticBundleManifest,
    rows: PublishPayloadRecord[],
    incrementalWriteStats: IncrementalWriteStats,
  ): {
    jsonRelativePath: string;
    jsonAbsolutePath: string;
    jsonPublicPath: string;
    htmlRelativePath: string;
    htmlAbsolutePath: string;
    htmlPublicPath: string;
  } {
    const rowCounts = rows.reduce<Record<string, number>>((acc, row) => {
      acc[row.payload_type] = (acc[row.payload_type] ?? 0) + 1;
      return acc;
    }, {});
    const assetEntries = Object.values(bundleManifest.compression.assets);
    const totalBytes = assetEntries.reduce((sum, asset) => sum + asset.sizeBytes, 0);
    const compressedBytes = assetEntries.reduce((sum, asset) => {
      const best = asset.compressedVariants.reduce<number | null>((current, variant) => {
        if (current === null || variant.sizeBytes < current) return variant.sizeBytes;
        return current;
      }, null);
      return sum + (best ?? asset.sizeBytes);
    }, 0);
    const warnings: string[] = [];
    if (!bundleManifest.files.modsList) warnings.push('Missing mods list publish payload.');
    if (!bundleManifest.files.browserSearchPack && bundleManifest.files.browserSearchShards.length <= 0) {
      warnings.push('Missing browser search pack/shards.');
    }
    if (bundleManifest.files.browserPageWindows.length <= 0) warnings.push('Missing browser page windows.');
    if (bundleManifest.files.homeBootstrapWindows.length <= 0) warnings.push('Missing home bootstrap windows.');
    if (assetEntries.length <= 0) warnings.push('No compressed publish assets registered.');
    const integrity = {
      sourceSignaturePresent: Boolean(bundleManifest.sourceSignature),
      identityPresent: Boolean(bundleManifest.identity.contentHash),
      manifestMatchesAssets: bundleManifest.identity.assetCount === assetEntries.length
        && bundleManifest.identity.totalBytes === totalBytes,
      browserLayoutPresent: bundleManifest.files.browserPageWindows.length > 0
        && bundleManifest.files.homeBootstrapWindows.length > 0,
      searchPackPresent: Boolean(bundleManifest.files.browserSearchPack)
        || bundleManifest.files.browserSearchShards.length > 0,
      recipeBundlePresent: Boolean(bundleManifest.files.recipeBootstrapBasePath)
        || Boolean(bundleManifest.files.itemRecipeBundleBasePath)
        || Boolean(bundleManifest.files.recipeUiBundleBasePath),
      contentAddressedAssets: assetEntries.length > 0
        && assetEntries.every((asset) => asset.contentAddressedPath.includes(`/cas/${asset.sha256.slice(0, 2)}/`)),
    };
    for (const [key, value] of Object.entries(integrity)) {
      if (!value) warnings.push(`Integrity check failed: ${key}.`);
    }

    const report = {
      schemaVersion: 'neonei/publish-build-report/v1',
      generatedAt: new Date().toISOString(),
      sourceSignature: bundleManifest.sourceSignature,
      revision: bundleManifest.revision,
      compiledAt: bundleManifest.compiledAt,
      firstPageSize: bundleManifest.firstPageSize,
      slotSizes: bundleManifest.slotSizes,
      rowCounts,
      files: {
        assetCount: assetEntries.length,
        browserSearchShardCount: bundleManifest.files.browserSearchShards.length,
        recipeBootstrapItemCount: bundleManifest.files.recipeBootstrapItems.length,
        recipeSearchItemCount: bundleManifest.files.recipeSearchItems.length,
        browserPageWindowCount: bundleManifest.files.browserPageWindows.length,
        homeBootstrapWindowCount: bundleManifest.files.homeBootstrapWindows.length,
      },
      bytes: {
        uncompressed: totalBytes,
        bestCompressed: compressedBytes,
        compressionRatio: totalBytes > 0 ? Number((compressedBytes / totalBytes).toFixed(4)) : null,
      },
      incremental: { ...incrementalWriteStats },
      integrity,
      warnings,
    };

    const jsonRelativePath = 'build-report.json';
    const htmlRelativePath = 'build-report.html';
    const jsonAbsolutePath = path.join(bundleOutputDir, jsonRelativePath);
    const htmlAbsolutePath = path.join(bundleOutputDir, htmlRelativePath);
    writeUtf8IfChanged(jsonAbsolutePath, JSON.stringify(report, null, 2), incrementalWriteStats);
    writeUtf8IfChanged(htmlAbsolutePath, this.renderBuildReportHtml(report), incrementalWriteStats);
    return {
      jsonRelativePath,
      jsonAbsolutePath,
      jsonPublicPath: buildPublishBundlePublicAssetPath(basePublicPath, jsonRelativePath),
      htmlRelativePath,
      htmlAbsolutePath,
      htmlPublicPath: buildPublishBundlePublicAssetPath(basePublicPath, htmlRelativePath),
    };
  }

  private renderBuildReportHtml(report: {
    schemaVersion: string;
    generatedAt: string;
    sourceSignature: string;
    revision: string;
    compiledAt: string;
    rowCounts: Record<string, number>;
    files: Record<string, number>;
    bytes: { uncompressed: number; bestCompressed: number; compressionRatio: number | null };
    incremental?: IncrementalWriteStats;
    integrity?: Record<string, boolean>;
    warnings: string[];
  }): string {
    const rows = Object.entries(report.rowCounts)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => `<tr><td>${escapeHtml(key)}</td><td>${value}</td></tr>`)
      .join('');
    const fileRows = Object.entries(report.files)
      .map(([key, value]) => `<tr><td>${escapeHtml(key)}</td><td>${value}</td></tr>`)
      .join('');
    const incrementalRows = report.incremental
      ? `<tr><td>写入文件</td><td>${report.incremental.written}</td></tr><tr><td>跳过未变化文件</td><td>${report.incremental.skipped}</td></tr><tr><td>写入字节</td><td>${report.incremental.bytesWritten}</td></tr>` : '';
    const integrityRows = Object.entries(report.integrity ?? {})
      .map(([key, value]) => `<tr><td>${escapeHtml(key)}</td><td>${value ? '通过' : '失败'}</td></tr>`)
      .join('');
    const warnings = report.warnings.length > 0
      ? report.warnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join('')
      : '<li>无警告</li>';
    return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <title>NeoNEI Publish Build Report</title>
  <style>
    body{margin:0;padding:32px;background:#071014;color:#d8f7ff;font-family:Inter,Segoe UI,Arial,sans-serif}
    main{max-width:1120px;margin:0 auto}
    section{margin:18px 0;padding:18px;border:1px solid rgba(83,219,255,.24);border-radius:16px;background:rgba(8,24,31,.72)}
    h1,h2{margin:0 0 12px}
    table{width:100%;border-collapse:collapse}
    td{padding:8px 10px;border-bottom:1px solid rgba(255,255,255,.08)}
    td:first-child{color:#8ed9ef}
    code{color:#ffc66d}
  </style>
</head>
<body>
<main>
  <h1>NeoNEI Publish Build Report</h1>
  <section>
    <h2>构建身份</h2>
    <p>Source: <code>${escapeHtml(report.sourceSignature)}</code></p>
    <p>Revision: <code>${escapeHtml(report.revision)}</code></p>
    <p>Compiled: <code>${escapeHtml(report.compiledAt)}</code></p>
    <p>Generated: <code>${escapeHtml(report.generatedAt)}</code></p>
  </section>
  <section><h2>产物数量</h2><table>${fileRows}</table></section>
  <section><h2>Payload 类型</h2><table>${rows}</table></section>
  <section><h2>源契约匹配</h2><table>${integrityRows}</table></section>
  <section>
    <h2>体积</h2>
    <table>
      <tr><td>uncompressed</td><td>${report.bytes.uncompressed}</td></tr>
      <tr><td>bestCompressed</td><td>${report.bytes.bestCompressed}</td></tr>
      <tr><td>compressionRatio</td><td>${report.bytes.compressionRatio ?? 'n/a'}</td></tr>
    </table>
  </section>
  <section><h2>警告</h2><ul>${warnings}</ul></section>
</main>
</body>
</html>`;
  }

  async materialize(sourceSignature: string): Promise<PublishPayloadMaterializeResult> {
    const db = this.getAccelerationDatabase();
    const browserLayoutKey = this.getBrowserLayoutKey(this.getStateMap(db));
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
    const incrementalWriteStats = createIncrementalWriteStats();

    if (this.options.enabled) {
      fs.mkdirSync(bundleOutputDir, { recursive: true });
      const writeBundleJson = (relativePath: string, payloadJson: string) => {
        const absolutePath = path.join(bundleOutputDir, relativePath);
        writeUtf8IfChanged(absolutePath, payloadJson, incrementalWriteStats);
      };
      const registerPayloadRow = (
        payload_key: string,
        payload_type: string,
        payload_json: string,
        bundle_relative_path: string,
        options?: { prewrite?: boolean },
      ) => {
        const prewrite = options?.prewrite ?? true;
        if (prewrite) {
          prewrittenPayloadBytes += Buffer.byteLength(payload_json, 'utf8');
          writeBundleJson(bundle_relative_path, payload_json);
        }
        rows.push({
          payload_key,
          payload_type,
          payload_json: prewrite ? '{}' : payload_json,
          signature: sourceSignature,
          bundle_relative_path,
          prewritten: prewrite || undefined,
        });
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

      registerPayloadRow(
        buildModsListPayloadKey(),
        'mods-list',
        JSON.stringify(mods),
        buildPublishModsListRelativePath(),
      );

      if (this.options.includeBrowserSearchPack) {
        const searchService = new ItemsSearchService({
          databaseProvider: () => this.databaseManager.getDatabase(),
          splitExportFallback: false,
        });
        const searchPack = await searchService.getBrowserSearchPack();
        const hotItems = searchPack.slice(0, this.options.searchHotShardSize);
        const tailItems = searchPack.slice(hotItems.length);
        registerPayloadRow(
          buildBrowserSearchPackPayloadKey(),
          'browser-search-pack',
          JSON.stringify({
            version: 1,
            signature: sourceSignature,
            total: searchPack.length,
            items: searchPack,
          }),
          buildPublishBrowserSearchPackRelativePath(),
        );
        registerPayloadRow(
          'bundle-only:browser-search-pack-shard::mod=all::shard=hot',
          'browser-search-pack-shard',
          JSON.stringify({
            version: 1,
            signature: sourceSignature,
            total: hotItems.length,
            items: hotItems,
          }),
          buildPublishBrowserSearchShardRelativePath({
            shardId: 'hot',
          }),
        );
        if (tailItems.length > 0) {
          registerPayloadRow(
            'bundle-only:browser-search-pack-shard::mod=all::shard=tail',
            'browser-search-pack-shard',
            JSON.stringify({
              version: 1,
              signature: sourceSignature,
              total: tailItems.length,
              items: tailItems,
            }),
            buildPublishBrowserSearchShardRelativePath({
              shardId: 'tail',
            }),
          );
        }
        const searchServiceCacheHolder = searchService as unknown as {
          allItemsCache?: Item[] | null;
          searchIndexCache?: unknown[] | null;
          browserSearchPackCache?: unknown[] | null;
        };
        searchServiceCacheHolder.allItemsCache = null;
        searchServiceCacheHolder.searchIndexCache = null;
        searchServiceCacheHolder.browserSearchPackCache = null;
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
        const itemRecipeBundle = buildPublishedItemRecipeBundle({
          sourceSignature,
          itemId,
          bootstrap,
          fullBootstrap,
        });
        const itemRecipeBundleJson = JSON.stringify(itemRecipeBundle);
        const itemRecipeBundleRelativePath = buildPublishItemRecipeBundleRelativePath(itemId);
        prewrittenPayloadBytes += Buffer.byteLength(itemRecipeBundleJson, 'utf8');
        writeBundleJson(itemRecipeBundleRelativePath, itemRecipeBundleJson);
        rows.push({
          payload_key: `bundle-only:item-recipe-bundle::item=${itemId}`,
          payload_type: 'item-recipe-bundle',
          payload_json: '{}',
          signature: sourceSignature,
          bundle_relative_path: itemRecipeBundleRelativePath,
          prewritten: true,
        });

        const recipeUiBundle = buildPublishedRecipeUiBundle({
          sourceSignature,
          itemId,
          recipeIds: itemRecipeBundle.uiPayloadRefs,
          assetRefs: itemRecipeBundle.assetRefs,
        });
        const recipeUiBundleJson = JSON.stringify(recipeUiBundle);
        const recipeUiBundleRelativePath = buildPublishRecipeUiBundleRelativePath(itemId);
        prewrittenPayloadBytes += Buffer.byteLength(recipeUiBundleJson, 'utf8');
        writeBundleJson(recipeUiBundleRelativePath, recipeUiBundleJson);
        rows.push({
          payload_key: `bundle-only:recipe-ui-bundle::item=${itemId}`,
          payload_type: 'recipe-ui-bundle',
          payload_json: '{}',
          signature: sourceSignature,
          bundle_relative_path: recipeUiBundleRelativePath,
          prewritten: true,
        });
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

            for (let offset = 0; offset < machinePayload.recipeCount; offset += RECIPE_GROUP_WINDOW_SIZE) {
              const windowPayload = tab === 'usedIn'
                // eslint-disable-next-line no-await-in-loop
                ? await recipeBootstrapService.getUsedInGroup(itemId, machineGroup.machineType, machineGroup.voltageTier ?? null, {
                    offset,
                    limit: RECIPE_GROUP_WINDOW_SIZE,
                    includeRecipeIds: false,
                  })
                // eslint-disable-next-line no-await-in-loop
                : await recipeBootstrapService.getProducedByGroup(itemId, machineGroup.machineType, machineGroup.voltageTier ?? null, {
                    offset,
                    limit: RECIPE_GROUP_WINDOW_SIZE,
                    includeRecipeIds: false,
                  });
              const windowPayloadJson = JSON.stringify({
                itemId,
                machineType: machineGroup.machineType,
                voltageTier: machineGroup.voltageTier ?? null,
                recipeCount: windowPayload.recipeCount,
                recipes: windowPayload.recipes,
                recipeIds: machinePayload.recipeIds,
                offset: windowPayload.offset,
                limit: windowPayload.limit,
                hasMore: windowPayload.hasMore,
                mediaManifest: windowPayload.mediaManifest ?? null,
              });
              const windowRelativePath = buildPublishRecipeMachineGroupWindowRelativePath({
                itemId,
                relation: relationSegment,
                machineKey,
                offset,
                limit: RECIPE_GROUP_WINDOW_SIZE,
              });
              prewrittenPayloadBytes += Buffer.byteLength(windowPayloadJson, 'utf8');
              writeBundleJson(windowRelativePath, windowPayloadJson);
              rows.push({
                payload_key: `bundle-only:recipe-machine-group-window::item=${itemId}::relation=${relationSegment}::machine=${machineKey}::offset=${offset}::limit=${RECIPE_GROUP_WINDOW_SIZE}`,
                payload_type: 'recipe-machine-group-window',
                payload_json: '{}',
                signature: sourceSignature,
                bundle_relative_path: windowRelativePath,
                prewritten: true,
              });
            }
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

            for (let offset = 0; offset < categoryPayload.recipeCount; offset += RECIPE_GROUP_WINDOW_SIZE) {
              // eslint-disable-next-line no-await-in-loop
              const windowPayload = await recipeBootstrapService.getCategoryGroup(
                itemId,
                tab,
                categoryKey,
                {
                  offset,
                  limit: RECIPE_GROUP_WINDOW_SIZE,
                  includeRecipeIds: false,
                },
              );
              const windowPayloadJson = JSON.stringify({
                itemId,
                categoryKey,
                tab,
                recipeCount: windowPayload.recipeCount,
                recipes: windowPayload.recipes,
                recipeIds: categoryPayload.recipeIds,
                offset: windowPayload.offset,
                limit: windowPayload.limit,
                hasMore: windowPayload.hasMore,
                mediaManifest: windowPayload.mediaManifest ?? null,
              });
              const windowRelativePath = buildPublishRecipeCategoryGroupWindowRelativePath({
                itemId,
                relation: relationSegment,
                categoryKey,
                offset,
                limit: RECIPE_GROUP_WINDOW_SIZE,
              });
              prewrittenPayloadBytes += Buffer.byteLength(windowPayloadJson, 'utf8');
              writeBundleJson(windowRelativePath, windowPayloadJson);
              rows.push({
                payload_key: `bundle-only:recipe-category-group-window::item=${itemId}::relation=${relationSegment}::category=${categoryKey}::offset=${offset}::limit=${RECIPE_GROUP_WINDOW_SIZE}`,
                payload_type: 'recipe-category-group-window',
                payload_json: '{}',
                signature: sourceSignature,
                bundle_relative_path: windowRelativePath,
                prewritten: true,
              });
            }
          }
        }

        const recipeBootstrapCacheHolder = recipeBootstrapService as unknown as {
          cache?: Map<string, unknown>;
          fullCache?: Map<string, unknown>;
          indexedRecipesService?: {
            recipeIndexCache?: Map<string, unknown>;
            recipeSummaryCache?: Map<string, unknown>;
            transformedRecipeCache?: Map<string, unknown>;
            recipeCollectionCache?: Map<string, unknown>;
            relationDescriptorCache?: Map<string, unknown>;
            machineTypesCache?: unknown;
          };
        };
        recipeBootstrapCacheHolder.cache?.clear();
        recipeBootstrapCacheHolder.fullCache?.clear();
        recipeBootstrapCacheHolder.indexedRecipesService?.recipeIndexCache?.clear();
        recipeBootstrapCacheHolder.indexedRecipesService?.recipeSummaryCache?.clear();
        recipeBootstrapCacheHolder.indexedRecipesService?.transformedRecipeCache?.clear();
        recipeBootstrapCacheHolder.indexedRecipesService?.recipeCollectionCache?.clear();
        recipeBootstrapCacheHolder.indexedRecipesService?.relationDescriptorCache?.clear();
        if (recipeBootstrapCacheHolder.indexedRecipesService) {
          recipeBootstrapCacheHolder.indexedRecipesService.machineTypesCache = null;
        }
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
          resourceManifest: buildBrowserPageResourceManifest(firstPageWindow.data, atlas, firstPageMediaManifest),
          windowOffset: firstPageWindow.offset,
          windowLength: firstPageWindow.data.length,
        };

        registerPayloadRow(
          buildBrowserPageWindowPayloadKey({ slotSize }),
          'browser-page-window',
          JSON.stringify(pagePackPayload),
          buildPublishBrowserPageWindowRelativePath({ slotSize }),
        );
        registerPayloadRow(
          buildHomeBootstrapWindowPayloadKey({ slotSize }),
          'home-bootstrap-window',
          JSON.stringify({
            mods,
            pagePack: pagePackPayload,
          }),
          buildPublishHomeBootstrapWindowRelativePath({ slotSize }),
        );

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
          registerPayloadRow(
            `bundle-only:${buildBrowserPageWindowPayloadKey({ slotSize })}:offset=${offset}`,
            'browser-page-window',
            JSON.stringify({
              ...extraWindow,
              page: Math.floor(offset / this.options.firstPageSize) + 1,
              pageSize: this.options.firstPageSize,
              totalPages: Math.max(1, Math.ceil(extraWindow.total / this.options.firstPageSize)),
              atlas: extraAtlas,
              mediaManifest: extraMediaManifest,
              resourceManifest: buildBrowserPageResourceManifest(extraWindow.data, extraAtlas, extraMediaManifest),
              windowOffset: extraWindow.offset,
              windowLength: extraWindow.data.length,
            }),
            buildPublishBrowserPageWindowRelativePath({ slotSize }).replace(/\.json$/i, `-offset-${offset}.json`),
          );
        }
      }
    }

    if (this.options.enabled) {
      this.writeStaticBundle(sourceSignature, compiledAt, rows, incrementalWriteStats);
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
        const payloadJson = row.prewritten
          ? fs.readFileSync(path.join(bundleOutputDir, row.bundle_relative_path), 'utf8')
          : row.payload_json;
        insertPublishPayload.run({
          ...row,
          payload_json: payloadJson,
        });
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
      upsertState.run({ state_key: 'publish_payload_browser_layout_key', state_value: browserLayoutKey });
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
