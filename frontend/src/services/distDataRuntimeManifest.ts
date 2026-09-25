import type { PublicRuntimeManifest } from "../runtime/types";

export type DistDataManifest = {
  schemaVersion?: string;
  generatedAt?: string | null;
  source?: string | null;
  sourceRepository?: string | null;
  runtimeCacheKey?: string | null;
  sourceSignature?: string | null;
  files?: {
    rustSearchPack?: string;
    rustBrowserPack?: string;
    rustSearchBin?: string;
    rustBrowserBin?: string;
    rustGroupsBin?: string;
    rustRecipeBin?: string;
    rustTextureBin?: string;
    rustRecipePack?: string;
    rustTexturePack?: string;
    rustRuntimeManifest?: string;
    rustIntegrity?: string;
    rustPackValidationReport?: string;
    packValidationReport?: string;
    rustUiTemplatesBin?: string;
    rustUiBindingsBin?: string;
    rustUiStringsBin?: string;
    rustUiAssetsManifest?: string;
    rustUiPackReport?: string;
    browserCatalog?: string;
    hiddenBrowserCatalog?: string;
    browserGroups?: string;
    recipeCategories?: string;
    recipeItemIndex?: string;
    recipeUiPayloadIndex?: string;
    textureManifest?: string;
    animationTable?: string;
    browserAtlasIndex?: string;
    nativeRenderIndex?: string;
    validationReport?: string;
  };
};

export type DistDataRustRuntimeManifest = {
  schema?: string;
  schemaVersion?: string;
  runtimeId?: string;
  entrypoints?: {
    recipes?: string;
    textures?: string;
    [key: string]: string | undefined;
  };
  files?: Array<{ path?: string; bytes?: number }> | Record<string, string | undefined>;
};

export function buildRuntimeCacheKey(manifest: DistDataManifest): string {
  const explicit = `${manifest.runtimeCacheKey ?? manifest.sourceSignature ?? ""}`.trim();
  if (explicit) {
    return `dist-data-v3:${explicit}`;
  }

  const schema = `${manifest.schemaVersion ?? "unknown"}`.trim();
  const generatedAt = `${manifest.generatedAt ?? "unknown"}`.trim();
  const source = `${manifest.source ?? "unknown"}`.trim();
  return `dist-data-v3:${schema}:${source}:${generatedAt}`;
}

export function buildPublicManifestFromDistData(manifest: DistDataManifest): PublicRuntimeManifest {
  const runtimeCacheKey = buildRuntimeCacheKey(manifest);
  return {
    version: 3,
    sourceSignature: `${manifest.sourceSignature ?? manifest.runtimeCacheKey ?? runtimeCacheKey}`,
    compiledAt: manifest.generatedAt ?? null,
    publishRevision: manifest.source ?? null,
    publishCompiledAt: manifest.generatedAt ?? null,
    browserLayoutKey: runtimeCacheKey,
    runtimeCacheKey,
    publishBundle: null,
  };
}
