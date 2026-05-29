export interface PublicRuntimeManifest {
  version: number;
  sourceSignature: string;
  compiledAt: string | null;
  publishRevision?: string | null;
  publishCompiledAt?: string | null;
  browserLayoutKey?: string | null;
  runtimeCacheKey?: string;
  publishBundle?: PublishStaticBundleManifest | null;
}

export interface PublishBundleWindowPathEntry {
  scope: string;
  slotSize: number;
  path: string;
  offset: number;
  length: number;
}

export interface PublishBundleSearchShardPathEntry {
  scope: string;
  shardId: string;
  path: string;
  total: number;
}

export interface PublishStaticBundleManifest {
  version: number;
  sourceSignature: string;
  revision: string;
  compiledAt: string;
  publicBasePath: string;
  firstPageSize: number;
  slotSizes: number[];
  includeBrowserSearchPack: boolean;
  files: {
    manifest: string;
    modsList: string | null;
    browserSearchPack: string | null;
    browserSearchShards: PublishBundleSearchShardPathEntry[];
    recipeBootstrapBasePath: string | null;
    recipeBootstrapShardBasePath: string | null;
    recipeBootstrapItems: string[];
    recipeGroupIndexBasePath: string | null;
    recipeGroupWindowBasePath?: string | null;
    recipeSearchBasePath: string | null;
    recipeSearchItems: string[];
    itemRecipeBundleBasePath: string | null;
    itemRecipeBundleItems: string[];
    recipeUiBundleBasePath: string | null;
    recipeUiBundleItems: string[];
    browserPageWindows: PublishBundleWindowPathEntry[];
    homeBootstrapWindows: PublishBundleWindowPathEntry[];
  };
  recipeCoverage?: {
    recipeBootstrapItems: number;
    recipeGroupIndexItems: number;
    recipeGroupWindowItems: number;
    missingRecipeWindowItems: number;
    recipeGroupIndexPayloads: number;
    recipeGroupWindowPayloads: number;
    missingRecipeWindowItemIds: string[];
  };
}

import type { Item } from '../services/api';

export interface BrowserVariantGroup {
  key: string;
  representative: Item;
  size: number;
  visibleCount: number;
  expandable: boolean;
  label: string;
}

export type BrowserGridEntry =
  | { key: string; kind: 'item'; item: Item }
  | { key: string; kind: 'group-collapsed' | 'group-header'; group: BrowserVariantGroup };

export interface PageAtlasSpriteEntry {
  atlasUrl: string;
  atlasWidth: number;
  atlasHeight: number;
  slotSize: number;
  x: number;
  y: number;
}

export interface PageAtlasResult {
  atlasUrl: string;
  atlasWidth: number;
  atlasHeight: number;
  slotSize: number;
  entries: Record<string, PageAtlasSpriteEntry>;
}

export interface PageRichMediaManifest {
  animatedAtlases: Record<string, AnimatedAtlasAssetEntry>;
}

export interface BrowserPageResourceManifest {
  itemIds: string[];
  renderAssetRefs: string[];
  atlasUrls: string[];
  animatedAtlasFiles: string[];
  atlasEntryCount: number;
  animatedAtlasCount: number;
}

export interface BrowserPagePackResponse extends PaginatedResponse<BrowserGridEntry> {
  atlas: PageAtlasResult | null;
  mediaManifest?: PageRichMediaManifest | null;
  resourceManifest?: BrowserPageResourceManifest;
  windowOffset?: number;
  windowLength?: number;
}

export interface BrowserDefaultCatalogResponse extends PaginatedResponse<BrowserGridEntry> {}
export interface BrowserSearchCatalogResponse extends PaginatedResponse<BrowserGridEntry> {}

export interface BrowserGroupItemsResponse {
  groupKey: string;
  total: number;
  items: Item[];
}

export interface BrowserByIdsPackResponse {
  data: Array<{ key: string; kind: 'item'; item: Item }>;
  atlas: PageAtlasResult | null;
  mediaManifest?: PageRichMediaManifest | null;
  resourceManifest?: BrowserPageResourceManifest;
}

export interface BrowserSearchPackEntry {
  itemId: string;
  localizedName: string;
  modId: string;
  normalizedLocalizedName: string;
  normalizedInternalName: string;
  normalizedItemId: string;
  normalizedSearchTerms: string;
  pinyinFull: string;
  pinyinAcronym: string;
  aliases: string;
  popularityScore: number;
  searchRank: number;
}

export interface BrowserSearchPackResponse {
  version: number;
  signature?: string;
  total: number;
  items: BrowserSearchPackEntry[];
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface AnimatedAtlasFrameEntry {
  index: number;
  sourcePath: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface AnimatedAtlasTimelineEntry {
  timelineIndex: number;
  frameIndex: number;
  index: number;
  durationMs: number;
}

export interface AnimatedAtlasAssetEntry {
  assetId: string;
  variantKey: string;
  frameDurationMs: number | null;
  loopMode: string | null;
  frameCount: number;
  timeline: AnimatedAtlasTimelineEntry[];
  frames: AnimatedAtlasFrameEntry[];
  atlasFile: string;
  atlasGroup: string;
}

export interface BrowserAtlasStaticPlacement {
  atlasGroup?: string | null;
  atlasFile?: string | null;
  atlasWidth?: number | null;
  atlasHeight?: number | null;
  x?: number | null;
  y?: number | null;
  width?: number | null;
  height?: number | null;
  sourcePath?: string | null;
}

export interface BrowserAtlasAnimatedFrame {
  index?: number;
  frameIndex?: number;
  timelineIndex?: number;
  durationMs?: number;
  sourcePath?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}

export interface BrowserAtlasAnimatedPlacement {
  atlasGroup?: string | null;
  atlasFile?: string | null;
  atlasWidth?: number | null;
  atlasHeight?: number | null;
  variantKey?: string | null;
  frameDurationMs?: number | null;
  loopMode?: string | null;
  frameCount?: number | null;
  frames?: BrowserAtlasAnimatedFrame[] | null;
  timeline?: BrowserAtlasAnimatedFrame[] | null;
}

export interface BrowserAtlasItemEntry {
  itemId: string;
  assetId?: string | null;
  variantKey?: string | null;
  mode?: string | null;
  renderMode?: string | null;
  resolutionMode?: string | null;
  rendererFamily?: string | null;
  playbackHint?: string | null;
  hasStaticAtlas?: boolean;
  hasAnimatedAtlas?: boolean;
  staticAtlas?: BrowserAtlasStaticPlacement | null;
  animatedAtlas?: BrowserAtlasAnimatedPlacement | null;
}

export interface BrowserAtlasIndexResponse {
  schemaVersion?: string;
  generatedAt?: number;
  staticAtlasManifest?: string | null;
  animatedAtlasManifest?: string | null;
  renderIndex?: string | null;
  itemCount?: number;
  animatedItemCount?: number;
  missingAtlasCount?: number;
  layoutCoverage?: {
    layoutItemCount: number;
    atlasItemCount: number;
    coveredLayoutItemCount: number;
    missingLayoutItemCount: number;
    missingLayoutItemIds: string[];
  };
  items: BrowserAtlasItemEntry[];
}

