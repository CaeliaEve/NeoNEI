import fs from 'fs';
import {
  CURRENT_RUNTIME_ARTIFACT_STATUS,
  probeCurrentRuntimeFile,
  readCurrentRuntimeJsonArtifact,
  resolveCurrentRuntimeDistDataDir,
  resolveCurrentRuntimeDistManifestFile,
  resolveDistDataRuntimeFile,
} from './current-runtime-artifact-index.service';
import { RUNTIME_RECIPE_PACK_SCHEMA } from './native-runtime-pack-abi';
import {
  ParsedRuntimeRecipePack,
  RuntimeRecipeCategory,
  RuntimeRecipeItemIndexEntry,
  RuntimeRecipeRef,
  RuntimeRecipeUiPayloadIndexEntry,
  parseRuntimeRecipePack,
} from './runtime-recipe-pack-reader.service';

type JsonRecord = Record<string, unknown>;

export type { RuntimeRecipeRef, RuntimeRecipeUiPayloadIndexEntry };

export type RuntimeRecipeItemQuery = {
  itemId: string;
  summary: {
    itemId: string;
    counts: {
      producedBy: number;
      usedIn: number;
      machineGroups: number;
    };
    categories: Array<{
      categoryId: string;
      displayName: string;
      recipeCount: number;
      machineIcon?: { itemId?: string; renderAssetRef?: string } | null;
    }>;
  };
  recipes: RuntimeRecipeRef[];
};

export type RuntimeRecipePage = {
  recipePageId: string;
  recipe: {
    id: string;
    recipeType: string;
    outputs: unknown[];
    inputs: unknown[];
    fluidInputs: unknown[];
    fluidOutputs: unknown[];
    machineInfo: JsonRecord | null;
    metadata: JsonRecord | null;
    additionalData: JsonRecord;
  };
  uiPayload: JsonRecord | null;
};

type RuntimeRecipePack = ParsedRuntimeRecipePack & {
  signature: string;
  generationRoot: string;
  itemById: Map<string, RuntimeRecipeItemIndexEntry>;
  uiPayloadByRecipeId: Map<string, RuntimeRecipeUiPayloadIndexEntry>;
  categoriesById: Map<string, RuntimeRecipeCategory>;
};

function readJsonRequired(filePath: string, label: string, relativePath: string | null = null): JsonRecord {
  const read = readCurrentRuntimeJsonArtifact(filePath, relativePath);
  if (!read.value) {
    throw new Error(
      `Runtime recipe ${label} is ${read.probe.status}: ${read.probe.error ?? filePath}`,
    );
  }
  return read.value;
}

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : null;
}

function asString(value: unknown): string | null {
  const text = `${value ?? ''}`.trim();
  return text || null;
}

export class RuntimeRecipePackService {
  private cache: RuntimeRecipePack | null = null;

  private getRuntimeRecipePackPath(): {
    path: string;
    relativePath: string;
    signature: string;
    generationRoot: string;
  } {
    const generationRoot = resolveCurrentRuntimeDistDataDir();
    const distManifestPath = resolveCurrentRuntimeDistManifestFile(generationRoot);
    const distManifestRead = readCurrentRuntimeJsonArtifact(distManifestPath, 'manifest.json');
    const distManifest = distManifestRead.value;
    if (!distManifest) {
      throw new Error(`Runtime recipe dist manifest is ${distManifestRead.probe.status}: ${distManifestRead.probe.error}`);
    }
    const runtimeManifestPath = asString(asRecord(distManifest.files)?.rustRuntimeManifest);
    if (!runtimeManifestPath) {
      throw new Error('Runtime recipe manifest path is not declared by dist manifest files.rustRuntimeManifest');
    }
    const runtimeManifestRead = readCurrentRuntimeJsonArtifact(
      resolveDistDataRuntimeFile(runtimeManifestPath, generationRoot),
      runtimeManifestPath,
    );
    const runtimeManifest = runtimeManifestRead.value;
    if (!runtimeManifest) {
      throw new Error(`Runtime recipe manifest is ${runtimeManifestRead.probe.status}: ${runtimeManifestRead.probe.error}`);
    }
    const recipePath = asString(asRecord(runtimeManifest.entrypoints)?.recipes);
    if (!recipePath) {
      throw new Error('Runtime recipe pack entrypoint is not declared by runtime manifest entrypoints.recipes');
    }
    const runtimeCacheKey = asString(distManifest.runtimeCacheKey);
    const signature = runtimeCacheKey
      ? [runtimeCacheKey, recipePath].join('::')
      : [
        'artifact-probe',
        generationRoot,
        distManifestRead.probe.bytes,
        distManifestRead.probe.mtimeMs,
        runtimeManifestRead.probe.bytes,
        runtimeManifestRead.probe.mtimeMs,
        recipePath,
      ].join('::');
    return {
      path: resolveDistDataRuntimeFile(recipePath, generationRoot),
      relativePath: recipePath,
      signature,
      generationRoot,
    };
  }

  private loadPack(): RuntimeRecipePack {
    const {
      path: packPath,
      relativePath,
      signature,
      generationRoot,
    } = this.getRuntimeRecipePackPath();
    if (this.cache?.signature === signature) {
      return this.cache;
    }
    const packProbe = probeCurrentRuntimeFile(packPath, relativePath);
    if (packProbe.status !== CURRENT_RUNTIME_ARTIFACT_STATUS.present) {
      throw new Error(`Runtime recipe pack is ${packProbe.status}: ${packProbe.error ?? packPath}`);
    }
    const parsed = parseRuntimeRecipePack(fs.readFileSync(packPath));
    this.cache = {
      signature,
      generationRoot,
      ...parsed,
      itemById: new Map(parsed.itemIndex.map((entry) => [entry.itemId, entry])),
      uiPayloadByRecipeId: new Map(parsed.uiPayloadIndex.map((entry) => [entry.recipeId, entry])),
      categoriesById: new Map(parsed.categoryIndex.map((entry) => [entry.categoryId, entry])),
    };
    return this.cache;
  }

  getItemProducedBy(itemId: string): RuntimeRecipeItemQuery | null {
    return this.getItemQuery(itemId, 'producedBy');
  }

  getItemUsedIn(itemId: string): RuntimeRecipeItemQuery | null {
    return this.getItemQuery(itemId, 'usedIn');
  }

  getRecipePage(recipePageId: string): RuntimeRecipePage | null {
    const normalizedRecipePageId = `${recipePageId ?? ''}`.trim();
    if (!normalizedRecipePageId) return null;
    const pack = this.loadPack();
    const entry = pack.uiPayloadByRecipeId.get(normalizedRecipePageId);
    if (!entry) return null;
    const shard = readJsonRequired(
      resolveDistDataRuntimeFile(entry.path, pack.generationRoot),
      'UI payload shard',
      entry.path,
    );
    const payloads = asRecord(shard.payloads);
    const uiPayload = asRecord(payloads?.[normalizedRecipePageId]);
    if (!uiPayload) return null;
    const machineInfo = asRecord(uiPayload.machineInfo);
    const metadata = asRecord(uiPayload.metadata);
    return {
      recipePageId: normalizedRecipePageId,
      recipe: {
        id: normalizedRecipePageId,
        recipeType: entry.recipeType ?? 'runtime-pack',
        outputs: [],
        inputs: [],
        fluidInputs: [],
        fluidOutputs: [],
        machineInfo: machineInfo ?? (entry.machineType ? { machineType: entry.machineType } : null),
        metadata,
        additionalData: {
          uiPayload,
          uiCaptureKey: entry.captureKey ?? null,
          uiPayloadPath: entry.path,
          handlerKey: entry.handlerKey ?? null,
          machineType: entry.machineType ?? null,
          runtimePackBacked: true,
        },
      },
      uiPayload,
    };
  }

  private getItemQuery(itemId: string, relation: 'producedBy' | 'usedIn'): RuntimeRecipeItemQuery | null {
    const normalizedItemId = `${itemId ?? ''}`.trim();
    if (!normalizedItemId) return null;
    const pack = this.loadPack();
    const entry = pack.itemById.get(normalizedItemId);
    if (!entry) return null;
    const recipes = [...(entry[relation] ?? [])];
    const categoryIds = new Set(recipes.map((recipe) => recipe.categoryId).filter(Boolean));
    const categories = Array.from(categoryIds, (categoryId) => pack.categoriesById.get(categoryId))
      .filter((category): category is RuntimeRecipeCategory => Boolean(category));
    return {
      itemId: normalizedItemId,
      summary: {
        itemId: normalizedItemId,
        counts: {
          producedBy: entry.producedBy?.length ?? 0,
          usedIn: entry.usedIn?.length ?? 0,
          machineGroups: categories.length,
        },
        categories,
      },
      recipes,
    };
  }

}

let runtimeRecipePackService: RuntimeRecipePackService | null = null;

export function getRuntimeRecipePackService(): RuntimeRecipePackService {
  if (!runtimeRecipePackService) {
    runtimeRecipePackService = new RuntimeRecipePackService();
  }
  return runtimeRecipePackService;
}

export { RUNTIME_RECIPE_PACK_SCHEMA };
