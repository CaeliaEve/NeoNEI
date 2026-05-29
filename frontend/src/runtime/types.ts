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
