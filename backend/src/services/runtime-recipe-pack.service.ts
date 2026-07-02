import fs from 'fs';
import {
  CURRENT_RUNTIME_DIST_MANIFEST_FILE,
  readCurrentRuntimeJson,
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
  itemById: Map<string, RuntimeRecipeItemIndexEntry>;
  uiPayloadByRecipeId: Map<string, RuntimeRecipeUiPayloadIndexEntry>;
  categoriesById: Map<string, RuntimeRecipeCategory>;
};

function readJsonRequired(filePath: string, label: string): JsonRecord {
  const parsed = readCurrentRuntimeJson(filePath);
  if (!parsed) {
    throw new Error(`Runtime recipe ${label} is missing or invalid JSON: ${filePath}`);
  }
  return parsed;
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

  private getRuntimeRecipePackPath(): { path: string; signature: string } {
    const distManifest = readCurrentRuntimeJson(CURRENT_RUNTIME_DIST_MANIFEST_FILE);
    const runtimeManifestPath = asString(asRecord(distManifest?.files)?.rustRuntimeManifest) ?? 'rust/runtime-manifest.json';
    const runtimeManifest = readCurrentRuntimeJson(resolveDistDataRuntimeFile(runtimeManifestPath));
    const recipePath = asString(asRecord(runtimeManifest?.entrypoints)?.recipes)
      ?? asString(asRecord(distManifest?.files)?.rustRecipeBin)
      ?? 'rust/recipes.bin';
    return {
      path: resolveDistDataRuntimeFile(recipePath),
      signature: [asString(distManifest?.runtimeCacheKey) ?? 'runtime-cache-missing', recipePath].join('::'),
    };
  }

  private loadPack(): RuntimeRecipePack {
    const { path: packPath, signature } = this.getRuntimeRecipePackPath();
    if (this.cache?.signature === signature) {
      return this.cache;
    }
    if (!fs.existsSync(packPath) || !fs.statSync(packPath).isFile()) {
      throw new Error(`Runtime recipe pack not found: ${packPath}`);
    }
    const parsed = parseRuntimeRecipePack(fs.readFileSync(packPath));
    this.cache = {
      signature,
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
    const shard = readJsonRequired(resolveDistDataRuntimeFile(entry.path), 'UI payload shard');
    const payloads = asRecord(shard.payloads);
    const uiPayload = asRecord(payloads?.[normalizedRecipePageId]);
    if (!uiPayload) return null;
    const machineInfo = asRecord(uiPayload.machineInfo);
    const metadata = asRecord(uiPayload.metadata);
    return {
      recipePageId: normalizedRecipePageId,
      recipe: {
        id: normalizedRecipePageId,
        recipeType: entry.recipeType ?? entry.familyKey ?? 'runtime-pack',
        outputs: [],
        inputs: [],
        fluidInputs: [],
        fluidOutputs: [],
        machineInfo: machineInfo ?? (entry.machineType ? { machineType: entry.machineType } : null),
        metadata,
        additionalData: {
          uiPayload,
          uiFamilyKey: entry.familyKey ?? null,
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
