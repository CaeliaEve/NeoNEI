import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { pinyin } from 'pinyin-pro';
import { DatabaseManager } from '../models/database';
import { DATA_DIR } from '../config/runtime-paths';
import { ItemsService, type Item } from './items.service';
import { PageAtlasService } from './page-atlas.service';
import { PublishPayloadMaterializerService } from './publish-payload-materializer.service';
import { buildCollapsibleItemAssignments, type CollapsibleItemCandidate } from './gtnh-collapsible-items.service';
import { buildSyntheticBrowserVariantAssignments, mergeBrowserGroupAssignments } from './browser-variant-grouping.service';
import { compareGtnhBrowserOrder } from './gtnh-browser-order.service';
import { getMachineIconItem } from './machine-icon-mapping.service';
import { transformRecipeMetadata } from './recipe-metadata';
import {
  buildRecipeCategorySummaries,
  describeRecipeCategory,
  type RecipeCategorySummary,
  type RecipeLike,
} from './recipe-category-grouping.service';

export interface CompilerSourceRoots {
  itemsDir: string;
  recipesDir: string;
  canonicalDir: string;
  imageRoot: string;
}

export interface CompilerRunResult {
  signature: string;
  itemsImported: number;
  recipesImported: number;
  hotAtlasesGenerated: number;
}

export interface CompilerOptions {
  hotPageAtlas?: {
    enabled?: boolean;
    pages?: number;
    pageSize?: number;
    slotSizes?: number[];
    atlasOutputDir?: string;
  };
  publishHotPayloads?: {
    enabled?: boolean;
    firstPageSize?: number;
    slotSizes?: number[];
    includeBrowserSearchPack?: boolean;
    windowCount?: number;
    windowStride?: number;
    searchHotShardSize?: number;
  };
}

type NormalizedCompilerOptions = {
  hotPageAtlas: {
    enabled: boolean;
    pages: number;
    pageSize: number;
    slotSizes: number[];
    atlasOutputDir: string;
  };
  publishHotPayloads: {
    enabled: boolean;
    firstPageSize: number;
    slotSizes: number[];
    includeBrowserSearchPack: boolean;
    windowCount: number;
    windowStride: number;
    searchHotShardSize: number;
  };
  bootstrap: {
    hotItemLimit: number;
    inlineSeedLimit: number;
  };
};

const MATERIAL_BASE_SUFFIX_RULES: Array<{ suffix: string; weight: number }> = [
  { suffix: '锭', weight: 120 },
  { suffix: '粒', weight: 100 },
  { suffix: '珍珠', weight: 95 },
  { suffix: '钻石', weight: 95 },
  { suffix: '宝石', weight: 90 },
];

type SplitItemRecord = {
  itemId?: string;
  modId?: string;
  internalName?: string;
  localizedName?: string;
  unlocalizedName?: string;
  damage?: number;
  imageFileName?: string | null;
  renderAssetRef?: string | null;
  preferredImageUrl?: string | null;
  tooltip?: string | null;
  searchTerms?: string | null;
};

type SplitRecipeRecord = {
  id?: string;
  recipeType?: string;
  inputs?: Array<{
    slotIndex?: number;
    items?: Array<{
      item?: {
        itemId?: string;
        modId?: string;
        internalName?: string;
        localizedName?: string;
        imageFileName?: string | null;
        renderAssetRef?: string | null;
        damage?: number;
        tooltip?: string | null;
      };
      stackSize?: number;
      probability?: number;
    }>;
    isOreDictionary?: boolean;
    oreDictName?: string | null;
  }>;
  outputs?: Array<{
    item?: {
      itemId?: string;
      modId?: string;
      internalName?: string;
      localizedName?: string;
      imageFileName?: string | null;
      renderAssetRef?: string | null;
      damage?: number;
      tooltip?: string | null;
    };
    stackSize?: number;
    probability?: number;
  }>;
  fluidInputs?: Array<{
    slotIndex?: number;
    fluids?: Array<{
      fluid?: {
        fluidId?: string;
        modId?: string;
        internalName?: string;
        localizedName?: string;
        renderAssetRef?: string | null;
        temperature?: number;
      };
      amount?: number;
      probability?: number;
    }>;
  }>;
  fluidOutputs?: Array<{
    fluid?: {
      fluidId?: string;
      modId?: string;
      internalName?: string;
      localizedName?: string;
      renderAssetRef?: string | null;
      temperature?: number;
    };
    amount?: number;
    probability?: number;
  }>;
  machineInfo?: {
    machineId?: string;
    machineType?: string;
    category?: string;
    iconInfo?: string;
    shapeless?: boolean;
    parsedVoltageTier?: string | null;
    parsedVoltage?: number | null;
  };
  metadata?: Record<string, unknown> | null;
  additionalData?: Record<string, unknown> | null;
  recipeTypeData?: Record<string, unknown> | null;
};

type UiPayloadRecord = {
  payloadId: string;
  recipeId: string;
  familyKey: string;
  payloadJson: string;
};

type RecipeRelationType = 'produced_by' | 'used_in';

type MaterializedRecipeGroupState = {
  family: string;
  voltageTier: string | null;
  recipeIds: string[];
};

type MaterializedCategoryGroupState = {
  descriptor: RecipeCategorySummary;
  recipeIds: string[];
};

type MaterializedItemRecord = {
  itemId: string;
  modId: string;
  internalName: string;
  localizedName: string;
  renderAssetRef: string | null;
  damage: number;
  imageFileName: string | null;
  tooltip: string | null;
};

type MaterializedRecipePayload = Record<string, unknown>;

function readGzipJsonArray(filePath: string): SplitItemRecord[] {
  if (!fs.existsSync(filePath)) return [];
  const buffer = fs.readFileSync(filePath);
  return JSON.parse(zlib.gunzipSync(buffer).toString('utf8')) as SplitItemRecord[];
}

function readGzipRecipeArray(filePath: string): SplitRecipeRecord[] {
  if (!fs.existsSync(filePath)) return [];
  const buffer = fs.readFileSync(filePath);
  return JSON.parse(zlib.gunzipSync(buffer).toString('utf8')) as SplitRecipeRecord[];
}

function normalizeLooseText(value: string | null | undefined): string {
  return `${value ?? ''}`.trim().toLowerCase();
}

function normalizeCompactText(value: string | null | undefined): string {
  return normalizeLooseText(value).replace(/\s+/g, '');
}

function buildPinyinFields(localizedName: string): { pinyinFull: string; pinyinAcronym: string } {
  const syllables = pinyin(localizedName, {
    toneType: 'none',
    type: 'array',
    nonZh: 'consecutive',
    v: false,
  })
    .map((part) => normalizeCompactText(part))
    .filter(Boolean);

  return {
    pinyinFull: syllables.join(''),
    pinyinAcronym: syllables.map((part) => part[0]).join(''),
  };
}

function deriveAliasesAndPopularity(
  record: Pick<SplitItemRecord, 'modId' | 'internalName' | 'localizedName' | 'itemId'>,
): { aliases: string | null; popularityScore: number } {
  const normalizedName = `${record.localizedName ?? ''}`.trim();
  const normalizedInternalName = `${record.internalName ?? ''}`.trim().toLowerCase();
  const normalizedModId = `${record.modId ?? ''}`.trim().toLowerCase();
  const aliasSet = new Set<string>();
  let popularityScore = 0;

  for (const rule of MATERIAL_BASE_SUFFIX_RULES) {
    if (normalizedName.endsWith(rule.suffix) && normalizedName.length > rule.suffix.length) {
      const baseName = normalizedName.slice(0, -rule.suffix.length);
      const pinyinFields = buildPinyinFields(baseName);
      [baseName, pinyinFields.pinyinFull, pinyinFields.pinyinAcronym]
        .map((value) => `${value ?? ''}`.trim())
        .filter(Boolean)
        .forEach((value) => aliasSet.add(value));
      popularityScore = Math.max(popularityScore, rule.weight);
      break;
    }
  }

  if (normalizedModId === 'thaumcraft') {
    const thaumcraftWandLike =
      normalizedInternalName === 'wandcasting'
      || normalizedInternalName === 'wandrod'
      || normalizedInternalName === 'wandcap'
      || normalizedName.includes('法杖')
      || normalizedName.includes('手杖')
      || normalizedName.includes('权杖')
      || normalizedName.includes('杖端')
      || normalizedName.includes('杖芯')
      || normalizedName.includes('杖柄');

    if (thaumcraftWandLike) {
      [
        'thaumcraft',
        'wand',
        'staff',
        'scepter',
        'sceptre',
        '法杖',
        '手杖',
        '权杖',
        '魔杖',
        '魔杖核心',
      ].forEach((value) => aliasSet.add(value));
      popularityScore = Math.max(popularityScore, 80);
    }

    if (normalizedInternalName === 'wandcasting') {
      ['wandcasting', 'wand casting', 'casting wand', '法杖', '手杖', '权杖'].forEach((value) => aliasSet.add(value));
      popularityScore = Math.max(popularityScore, 90);
    }

    if (normalizedInternalName === 'wandrod') {
      ['wandrod', 'wand rod', 'rod', 'core', '杖芯', '杖柄'].forEach((value) => aliasSet.add(value));
      popularityScore = Math.max(popularityScore, 72);
    }

    if (normalizedInternalName === 'wandcap') {
      ['wandcap', 'wand cap', 'cap', '杖端'].forEach((value) => aliasSet.add(value));
      popularityScore = Math.max(popularityScore, 72);
    }
  }

  return {
    aliases: aliasSet.size > 0 ? Array.from(aliasSet).join(' ') : null,
    popularityScore,
  };
}

function toPublicImageUrl(imageFileName: string | null | undefined): string | null {
  if (!imageFileName) return null;
  const normalized = imageFileName
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .replace(/^images\/item\//, '')
    .replace(/^api\/images\/item\//, '');
  if (!normalized) return null;
  return `/images/item/${normalized.split('/').map((part) => encodeURIComponent(part)).join('/')}`;
}

function normalizeCompilerImagePath(imageFileName: string | null | undefined): string | null {
  if (!imageFileName) return null;
  const normalized = imageFileName
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .replace(/^images\/item\//, '')
    .replace(/^api\/images\/item\//, '');
  return normalized || null;
}

function compilerImageExists(imageRoot: string, relativePath: string): boolean {
  const itemRoot = path.resolve(imageRoot, 'item');
  const absolute = path.resolve(itemRoot, relativePath);
  return absolute.startsWith(itemRoot) && fs.existsSync(absolute);
}

function resolveCompilerSiblingVariant(imageRoot: string, modId: string, stem: string): string | null {
  const itemRoot = path.resolve(imageRoot, 'item');
  const directory = path.resolve(itemRoot, modId);
  if (!directory.startsWith(itemRoot) || !fs.existsSync(directory) || !fs.statSync(directory).isDirectory()) {
    return null;
  }

  const escapedStem = stem.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const variantPattern = new RegExp(`^${escapedStem}~.+(?:\\.png|\\.gif|\\.sprite-atlas\\.png)$`, 'i');
  const siblings = fs.readdirSync(directory).filter((name) => variantPattern.test(name));
  if (siblings.length === 0) {
    return null;
  }

  siblings.sort((left, right) => left.localeCompare(right));
  const preferred =
    siblings.find((name) => !name.toLowerCase().includes('.sprite-atlas.') && name.toLowerCase().endsWith('.png'))
    ?? siblings.find((name) => name.toLowerCase().endsWith('.gif'))
    ?? siblings.find((name) => name.toLowerCase().endsWith('.sprite-atlas.png'))
    ?? siblings[0];
  return `${modId}/${preferred}`.replace(/\\/g, '/');
}

function resolveMaterializedPreferredItemUrl(
  imageRoot: string,
  record: Pick<SplitItemRecord, 'imageFileName' | 'modId' | 'internalName' | 'damage' | 'itemId'>,
): string | null {
  const normalizedImagePath = normalizeCompilerImagePath(record.imageFileName ?? null);
  if (normalizedImagePath) {
    if (compilerImageExists(imageRoot, normalizedImagePath)) {
      return `/images/item/${normalizedImagePath.split('/').map((part) => encodeURIComponent(part)).join('/')}`;
    }

    const spriteAtlasPath = normalizedImagePath.replace(/\.(png|gif)$/i, '.sprite-atlas.png');
    if (spriteAtlasPath !== normalizedImagePath && compilerImageExists(imageRoot, spriteAtlasPath)) {
      return `/images/item/${spriteAtlasPath.split('/').map((part) => encodeURIComponent(part)).join('/')}`;
    }

    const slash = normalizedImagePath.lastIndexOf('/');
    if (slash > 0) {
      const modId = normalizedImagePath.slice(0, slash);
      const stem = normalizedImagePath.slice(slash + 1).replace(/\.(png|gif)$/i, '');
      const sibling = resolveCompilerSiblingVariant(imageRoot, modId, stem);
      if (sibling) {
        return `/images/item/${sibling.split('/').map((part) => encodeURIComponent(part)).join('/')}`;
      }
    }
  }

  const modId = `${record.modId ?? ''}`.trim();
  const internalName = `${record.internalName ?? ''}`.trim();
  if (!modId || !internalName) {
    return toPublicImageUrl(record.imageFileName ?? null);
  }

  const damage = Number(record.damage ?? 0);
  const directCandidates = [
    `${modId}/${internalName}~${damage}.png`,
    `${modId}/${internalName}~${damage}.gif`,
    `${modId}/${internalName}~${damage}.sprite-atlas.png`,
  ];

  for (const candidate of directCandidates) {
    if (compilerImageExists(imageRoot, candidate)) {
      return `/images/item/${candidate.split('/').map((part) => encodeURIComponent(part)).join('/')}`;
    }
  }

  const sibling = resolveCompilerSiblingVariant(imageRoot, modId, `${internalName}~${damage}`);
  if (sibling) {
    return `/images/item/${sibling.split('/').map((part) => encodeURIComponent(part)).join('/')}`;
  }

  return toPublicImageUrl(record.imageFileName ?? null);
}

function listModItemFiles(itemsDir: string): string[] {
  if (!fs.existsSync(itemsDir)) return [];
  return fs
    .readdirSync(itemsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(itemsDir, entry.name, 'items.json.gz'))
    .filter((filePath) => fs.existsSync(filePath))
    .sort((a, b) => a.localeCompare(b));
}

function listRecipeFiles(recipesDir: string): string[] {
  if (!fs.existsSync(recipesDir)) return [];
  const result: string[] = [];
  const categoryDirs = fs.readdirSync(recipesDir, { withFileTypes: true }).filter((entry) => entry.isDirectory());
  for (const categoryDir of categoryDirs) {
    const categoryPath = path.join(recipesDir, categoryDir.name);
    const modDirs = fs.readdirSync(categoryPath, { withFileTypes: true }).filter((entry) => entry.isDirectory());
    for (const modDir of modDirs) {
      const filePath = path.join(categoryPath, modDir.name, 'recipes.json.gz');
      if (fs.existsSync(filePath)) {
        result.push(filePath);
      }
    }
  }
  return result.sort((a, b) => a.localeCompare(b));
}

function extractInputItemIds(recipe: SplitRecipeRecord): string[] {
  const result = new Set<string>();
  for (const slot of recipe.inputs ?? []) {
    for (const stack of slot.items ?? []) {
      const itemId = stack.item?.itemId;
      if (itemId?.trim()) {
        result.add(itemId.trim());
      }
    }
  }
  return Array.from(result);
}

function collectRecipeOreDictionaryRefs(recipe: SplitRecipeRecord, sink: Map<string, Set<string>>): void {
  for (const slot of recipe.inputs ?? []) {
    const oreDictName = `${slot.oreDictName ?? ''}`.trim();
    if (!slot.isOreDictionary || !oreDictName) {
      continue;
    }

    for (const stack of slot.items ?? []) {
      const itemId = `${stack.item?.itemId ?? ''}`.trim();
      if (!itemId) continue;
      const current = sink.get(itemId) ?? new Set<string>();
      current.add(oreDictName);
      sink.set(itemId, current);
    }
  }
}

function extractOutputItemIds(recipe: SplitRecipeRecord): string[] {
  const result = new Set<string>();
  for (const stack of recipe.outputs ?? []) {
    const itemId = stack.item?.itemId;
    if (itemId?.trim()) {
      result.add(itemId.trim());
    }
  }
  return Array.from(result);
}

function addRecipeToMachineGroupsMap(
  machineGroupsMap: Map<string, Map<string, MaterializedRecipeGroupState>>,
  itemId: string,
  machineType: string,
  family: string,
  voltageTier: string | null,
  recipeId: string,
): void {
  if (!itemId || !machineType || !recipeId) {
    return;
  }

  const machineKey = `${machineType}::${voltageTier ?? ''}`;
  const itemMachineGroups = machineGroupsMap.get(itemId) ?? new Map<string, MaterializedRecipeGroupState>();
  const group = itemMachineGroups.get(machineKey) ?? {
    family,
    voltageTier,
    recipeIds: [],
  };
  group.recipeIds.push(recipeId);
  itemMachineGroups.set(machineKey, group);
  machineGroupsMap.set(itemId, itemMachineGroups);
}

function addRecipeToCategoryGroupsMap(
  categoryGroupsMap: Map<string, Map<string, MaterializedCategoryGroupState>>,
  itemId: string,
  descriptor: RecipeCategorySummary,
  recipeId: string,
): void {
  if (!itemId || !descriptor.categoryKey || !recipeId) {
    return;
  }

  const itemCategoryGroups = categoryGroupsMap.get(itemId) ?? new Map<string, MaterializedCategoryGroupState>();
  const group = itemCategoryGroups.get(descriptor.categoryKey) ?? {
    descriptor: { ...descriptor, recipeCount: 0 },
    recipeIds: [],
  };
  group.recipeIds.push(recipeId);
  group.descriptor.recipeCount = group.recipeIds.length;
  itemCategoryGroups.set(descriptor.categoryKey, group);
  categoryGroupsMap.set(itemId, itemCategoryGroups);
}

function detectUiFamilyKey(recipe: SplitRecipeRecord): string | null {
  const machineType = `${recipe.machineInfo?.machineType ?? ''}`.trim().toLowerCase();
  const recipeType = `${recipe.recipeType ?? ''}`.trim().toLowerCase();
  const combined = `${machineType} ${recipeType}`;

  if (combined.includes('terra plate') || combined.includes('泰拉凝聚板')) return 'botania_terra_plate';
  if (combined.includes('rune altar') || combined.includes('符文祭坛')) return 'botania_rune_altar';
  if (combined.includes('mana pool') || combined.includes('魔力池')) return 'botania_mana_pool';
  if (combined.includes('infusion') || combined.includes('奥术注魔')) return 'thaumcraft_infusion';
  if (combined.includes('blood altar') || combined.includes('血祭坛') || combined.includes('血之祭坛')) return 'blood_magic_altar';
  return null;
}

function buildUiPayload(recipe: SplitRecipeRecord, familyKey: string): UiPayloadRecord {
  const inputIds = extractInputItemIds(recipe);
  const outputIds = extractOutputItemIds(recipe);
  const payload = {
    recipeId: `${recipe.id ?? ''}`.trim(),
    familyKey,
    machineType: `${recipe.machineInfo?.machineType ?? ''}`.trim(),
    recipeType: `${recipe.recipeType ?? ''}`.trim(),
    inputItemIds: inputIds,
    outputItemIds: outputIds,
    slotCount: {
      input: inputIds.length,
      output: outputIds.length,
    },
    presentation: {
      surface: familyKey.includes('botania') ? 'nature_ritual' : 'ritual',
      density: outputIds.length + inputIds.length > 8 ? 'wide' : 'default',
    },
  };

  return {
    payloadId: `ui~${payload.recipeId}`,
    recipeId: payload.recipeId,
    familyKey,
    payloadJson: JSON.stringify(payload),
  };
}

function toMachineGroupSummaryEntries(
  groups: Map<string, MaterializedRecipeGroupState> | undefined,
): Array<{
  machineType: string;
  category: string;
  voltageTier: string | null;
  voltage: null;
  recipeCount: number;
}> {
  return Array.from(groups?.entries() ?? []).map(([machineKey, group]) => ({
    machineType: machineKey.split('::')[0],
    category: group.family,
    voltageTier: group.voltageTier,
    voltage: null,
    recipeCount: group.recipeIds.length,
  }));
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function compactJsonValue(value: unknown, depth = 0): unknown {
  if (value == null) return null;
  if (depth > 5) return undefined;
  if (typeof value === 'string') {
    return value.length <= 512 ? value : undefined;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (Array.isArray(value)) {
    return value
      .map((entry) => compactJsonValue(entry, depth + 1))
      .filter((entry) => entry !== undefined);
  }
  if (!isPlainObject(value)) {
    return undefined;
  }

  const compacted: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    const normalized = compactJsonValue(entry, depth + 1);
    if (normalized !== undefined) {
      compacted[key] = normalized;
    }
  }
  return compacted;
}

function compactObject(value: Record<string, unknown> | null | undefined): Record<string, unknown> | null {
  if (!value) return null;
  const compacted = compactJsonValue(value, 0);
  if (!isPlainObject(compacted) || Object.keys(compacted).length === 0) {
    return null;
  }
  return compacted;
}

function toMaterializedItemRecord(record: SplitItemRecord): MaterializedItemRecord | null {
  const itemId = String(record.itemId ?? '').trim();
  if (!itemId) return null;
  return {
    itemId,
    modId: String(record.modId ?? ''),
    internalName: String(record.internalName ?? ''),
    localizedName: String(record.localizedName ?? ''),
    renderAssetRef: typeof record.renderAssetRef === 'string' ? record.renderAssetRef : null,
    damage: Number(record.damage ?? 0),
    imageFileName: typeof record.imageFileName === 'string' ? record.imageFileName : null,
    tooltip: typeof record.tooltip === 'string' ? record.tooltip : null,
  };
}

function buildMaterializedItem(
  entry: {
    itemId?: string;
    modId?: string;
    internalName?: string;
    localizedName?: string;
    imageFileName?: string | null;
    renderAssetRef?: string | null;
    damage?: number;
    tooltip?: string | null;
  } | undefined,
  itemRecords: Map<string, MaterializedItemRecord>,
): Record<string, unknown> {
  const itemId = `${entry?.itemId ?? ''}`.trim();
  const fallback = itemId ? itemRecords.get(itemId) : null;
  return {
    itemId,
    modId: `${entry?.modId ?? fallback?.modId ?? ''}`.trim(),
    internalName: `${entry?.internalName ?? fallback?.internalName ?? ''}`.trim(),
    localizedName: `${entry?.localizedName ?? fallback?.localizedName ?? ''}`.trim(),
    renderAssetRef:
      typeof entry?.renderAssetRef === 'string' ? entry.renderAssetRef : fallback?.renderAssetRef ?? null,
    damage: Number(entry?.damage ?? fallback?.damage ?? 0),
    stackSize: 1,
    maxStackSize: 64,
    maxDamage: 0,
    nbt: null,
    imageFileName:
      typeof entry?.imageFileName === 'string' ? entry.imageFileName : fallback?.imageFileName ?? null,
    tooltip: typeof entry?.tooltip === 'string' ? entry.tooltip : fallback?.tooltip ?? null,
  };
}

function buildMaterializedRecipe(
  recipe: SplitRecipeRecord,
  family: string,
  itemRecords: Map<string, MaterializedItemRecord>,
): MaterializedRecipePayload {
  const machineType = `${recipe.machineInfo?.machineType ?? ''}`.trim();
  const machineIcon = machineType ? getMachineIconItem(machineType) : null;
  const compactMetadata = compactObject(recipe.metadata ?? null);
  const transformedMetadata = transformRecipeMetadata(compactMetadata, (entry) =>
    buildMaterializedItem((entry as { itemId?: string } | undefined) ?? undefined, itemRecords) as never,
  );

  return {
    id: `${recipe.id ?? ''}`.trim(),
    recipeType: `${recipe.recipeType ?? family}`.trim(),
    outputs: (recipe.outputs ?? []).map((stack) => ({
      item: buildMaterializedItem(stack.item, itemRecords),
      stackSize: Number(stack.stackSize ?? 1),
      probability: Number(stack.probability ?? 1),
    })),
    inputs: (recipe.inputs ?? []).map((group) => ({
      slotIndex: Number(group.slotIndex ?? 0),
      items: (group.items ?? []).map((stack) => ({
        item: buildMaterializedItem(stack.item, itemRecords),
        stackSize: Number(stack.stackSize ?? 1),
        probability: Number(stack.probability ?? 1),
      })),
      isOreDictionary: Boolean(group.isOreDictionary),
      oreDictName: typeof group.oreDictName === 'string' ? group.oreDictName : null,
    })),
    fluidInputs: (recipe.fluidInputs ?? []).map((group) => ({
      slotIndex: Number(group.slotIndex ?? 0),
      fluids: (group.fluids ?? []).map((stack) => ({
        fluid: {
          fluidId: `${stack.fluid?.fluidId ?? ''}`.trim(),
          modId: `${stack.fluid?.modId ?? ''}`.trim(),
          internalName: `${stack.fluid?.internalName ?? ''}`.trim(),
          localizedName: `${stack.fluid?.localizedName ?? ''}`.trim(),
          renderAssetRef: typeof stack.fluid?.renderAssetRef === 'string' ? stack.fluid.renderAssetRef : null,
          temperature: Number(stack.fluid?.temperature ?? 0),
        },
        amount: Number(stack.amount ?? 0),
        probability: Number(stack.probability ?? 1),
      })),
    })),
    fluidOutputs: (recipe.fluidOutputs ?? []).map((stack) => ({
      fluid: {
        fluidId: `${stack.fluid?.fluidId ?? ''}`.trim(),
        modId: `${stack.fluid?.modId ?? ''}`.trim(),
        internalName: `${stack.fluid?.internalName ?? ''}`.trim(),
        localizedName: `${stack.fluid?.localizedName ?? ''}`.trim(),
        renderAssetRef: typeof stack.fluid?.renderAssetRef === 'string' ? stack.fluid.renderAssetRef : null,
        temperature: Number(stack.fluid?.temperature ?? 0),
      },
      amount: Number(stack.amount ?? 0),
      probability: Number(stack.probability ?? 1),
    })),
    machineInfo: recipe.machineInfo
      ? {
          machineId: `${recipe.machineInfo.machineId ?? ''}`.trim(),
          category: `${recipe.machineInfo.category ?? ''}`.trim(),
          machineType,
          iconInfo: `${recipe.machineInfo.iconInfo ?? ''}`.trim(),
          shapeless: Boolean(recipe.machineInfo.shapeless),
          parsedVoltageTier: recipe.machineInfo.parsedVoltageTier ?? null,
          parsedVoltage: recipe.machineInfo.parsedVoltage ?? null,
          machineIcon: machineIcon ?? undefined,
        }
      : null,
    metadata: transformedMetadata,
    additionalData: compactObject(recipe.additionalData ?? null),
    recipeTypeData: compactObject(recipe.recipeTypeData ?? null),
  };
}

function chunkArray<T>(items: T[], chunkSize: number): T[][] {
  if (chunkSize <= 0) return [items];
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize));
  }
  return chunks;
}

const ACCELERATION_COMPILER_VERSION = '2026-04-26-publish-hot-payloads-v1';

export class NeoNeiCompilerService {
  private options: NormalizedCompilerOptions;
  private readonly bootstrapChunkSize = 500;
  private logStage(message: string, meta?: Record<string, unknown>): void {
    if (meta && Object.keys(meta).length > 0) {
      console.log(`[ACCEL_COMPILE] ${message} ${JSON.stringify(meta)}`);
      return;
    }
    console.log(`[ACCEL_COMPILE] ${message}`);
  }
  constructor(
    private readonly databaseManager: DatabaseManager,
    private readonly sourceRoots: CompilerSourceRoots,
    options: CompilerOptions = {},
  ) {
    this.options = {
      hotPageAtlas: {
        enabled: options.hotPageAtlas?.enabled ?? true,
        pages: options.hotPageAtlas?.pages ?? 12,
        pageSize: options.hotPageAtlas?.pageSize ?? 55,
        slotSizes: options.hotPageAtlas?.slotSizes ?? [45],
        atlasOutputDir: options.hotPageAtlas?.atlasOutputDir ?? path.join(DATA_DIR, 'page-atlas-cache'),
      },
      publishHotPayloads: {
        enabled: options.publishHotPayloads?.enabled ?? true,
        firstPageSize: options.publishHotPayloads?.firstPageSize ?? 256,
        slotSizes: options.publishHotPayloads?.slotSizes ?? [45],
        includeBrowserSearchPack: options.publishHotPayloads?.includeBrowserSearchPack ?? true,
        windowCount: options.publishHotPayloads?.windowCount ?? 48,
        windowStride: options.publishHotPayloads?.windowStride ?? 64,
        searchHotShardSize: options.publishHotPayloads?.searchHotShardSize ?? 8192,
      },
      bootstrap: {
        hotItemLimit: 5000,
        inlineSeedLimit: 2,
      },
    };
  }

  private buildSignature(itemFiles: string[]): string {
    const hash = crypto.createHash('sha1');
    hash.update(JSON.stringify({
      compilerVersion: ACCELERATION_COMPILER_VERSION,
      sourceRoots: this.sourceRoots,
      bootstrap: this.options.bootstrap,
    }));
    for (const filePath of itemFiles) {
      const stat = fs.statSync(filePath);
      hash.update(`${filePath}:${stat.size}:${stat.mtimeMs}`);
    }
    return hash.digest('hex');
  }

  private getItemFiles(): string[] {
    return listModItemFiles(this.sourceRoots.itemsDir);
  }

  private getRecipeFiles(): string[] {
    return listRecipeFiles(this.sourceRoots.recipesDir);
  }

  getCurrentSourceSignature(): string {
    return this.buildSignature([...this.getItemFiles(), ...this.getRecipeFiles()]);
  }

  isAccelerationStateFresh(): boolean {
    const db = this.databaseManager.getDatabase();
    const stateRow = db
      .prepare('SELECT state_value FROM compiler_state WHERE state_key = ?')
      .get('source_signature') as { state_value?: string } | undefined;
    if (!stateRow?.state_value) return false;
    return stateRow.state_value === this.getCurrentSourceSignature();
  }

  async ensureCompiled(): Promise<CompilerRunResult | null> {
    if (this.isAccelerationStateFresh()) {
      return null;
    }
    return this.compile();
  }

  async compile(): Promise<CompilerRunResult> {
    const db = this.databaseManager.getDatabase();
    const itemFiles = this.getItemFiles();
    const recipeFiles = this.getRecipeFiles();
    const signature = this.buildSignature([...itemFiles, ...recipeFiles]);
    this.logStage('compile-start', {
      itemFiles: itemFiles.length,
      recipeFiles: recipeFiles.length,
      signature,
    });

    const insertItemCore = db.prepare(`
      INSERT OR REPLACE INTO items_core (
        item_id, mod_id, internal_name, localized_name, unlocalized_name, damage,
        image_file_name, render_asset_ref, preferred_image_url, tooltip, search_terms, updated_at
      ) VALUES (
        @item_id, @mod_id, @internal_name, @localized_name, @unlocalized_name, @damage,
        @image_file_name, @render_asset_ref, @preferred_image_url, @tooltip, @search_terms, CURRENT_TIMESTAMP
      )
    `);

    const insertItemSearch = db.prepare(`
      INSERT OR REPLACE INTO items_search (
        item_id, localized_name_norm, internal_name_norm, item_id_norm, search_terms_norm,
        pinyin_full, pinyin_acronym, aliases, popularity_score, family_score, updated_at
      ) VALUES (
        @item_id, @localized_name_norm, @internal_name_norm, @item_id_norm, @search_terms_norm,
        @pinyin_full, @pinyin_acronym, @aliases, @popularity_score, @family_score, CURRENT_TIMESTAMP
      )
    `);

    const insertItemBrowserGroup = db.prepare(`
      INSERT OR REPLACE INTO item_browser_groups (
        item_id, group_key, group_label, group_size, group_sort_order, updated_at
      ) VALUES (
        @item_id, @group_key, @group_label, @group_size, @group_sort_order, CURRENT_TIMESTAMP
      )
    `);

    const upsertState = db.prepare(`
      INSERT INTO compiler_state (state_key, state_value, updated_at)
      VALUES (@state_key, @state_value, CURRENT_TIMESTAMP)
      ON CONFLICT(state_key) DO UPDATE SET
        state_value = excluded.state_value,
        updated_at = CURRENT_TIMESTAMP
    `);

    const insertRecipeCore = db.prepare(`
      INSERT OR REPLACE INTO recipes_core (
        recipe_id, recipe_type, family, machine_type, voltage_tier, source_mod,
        input_count, output_count, bootstrap_key, payload, updated_at
      ) VALUES (
        @recipe_id, @recipe_type, @family, @machine_type, @voltage_tier, @source_mod,
        @input_count, @output_count, @bootstrap_key, @payload, CURRENT_TIMESTAMP
      )
    `);

    const insertRecipeEdge = db.prepare(`
      INSERT INTO recipe_edges (
        item_id, relation_type, recipe_id, slot_index, weight, updated_at
      ) VALUES (
        @item_id, @relation_type, @recipe_id, @slot_index, @weight, CURRENT_TIMESTAMP
      )
    `);

    const insertMachineGroup = db.prepare(`
      INSERT INTO recipe_machine_groups (
        item_id, relation_type, machine_key, family, voltage_tier, recipe_ids_blob, recipe_count, updated_at
      ) VALUES (
        @item_id, @relation_type, @machine_key, @family, @voltage_tier, @recipe_ids_blob, @recipe_count, CURRENT_TIMESTAMP
      )
    `);

    const insertCategoryGroup = db.prepare(`
      INSERT INTO recipe_category_groups (
        item_id, relation_type, category_key, category_type, category_name, machine_key, voltage_tier, recipe_ids_blob, recipe_count, updated_at
      ) VALUES (
        @item_id, @relation_type, @category_key, @category_type, @category_name, @machine_key, @voltage_tier, @recipe_ids_blob, @recipe_count, CURRENT_TIMESTAMP
      )
    `);

    const insertBootstrap = db.prepare(`
      INSERT OR REPLACE INTO recipe_bootstrap (
        item_id, produced_by_ids, used_in_ids, produced_by_payload, used_in_payload, summary_payload, signature, updated_at
      ) VALUES (
        @item_id, @produced_by_ids, @used_in_ids, @produced_by_payload, @used_in_payload, @summary_payload, @signature, CURRENT_TIMESTAMP
      )
    `);

    const insertSummaryCompact = db.prepare(`
      INSERT OR REPLACE INTO recipe_summary_compact (
        item_id, summary_payload, signature, updated_at
      ) VALUES (
        @item_id, @summary_payload, @signature, CURRENT_TIMESTAMP
      )
    `);

    const insertUiPayload = db.prepare(`
      INSERT OR REPLACE INTO ui_payloads (
        payload_id, recipe_id, family_key, payload_json, signature, updated_at
      ) VALUES (
        @payload_id, @recipe_id, @family_key, @payload_json, @signature, CURRENT_TIMESTAMP
      )
    `);

    const insertHotItem = db.prepare(`
      INSERT OR REPLACE INTO hot_items (
        item_id, popularity_score, home_rank, search_rank, recipe_rank, updated_at
      ) VALUES (
        @item_id, @popularity_score, @home_rank, @search_rank, @recipe_rank, CURRENT_TIMESTAMP
      )
    `);

    const insertModsSummary = db.prepare(`
      INSERT OR REPLACE INTO mods_summary (
        mod_id, mod_name, item_count, updated_at
      ) VALUES (
        @mod_id, @mod_name, @item_count, CURRENT_TIMESTAMP
      )
    `);

    const insertBrowserDefaultEntry = db.prepare(`
      INSERT OR REPLACE INTO browser_default_entries (
        entry_order,
        entry_kind,
        item_id,
        mod_id,
        group_key,
        group_label,
        group_size,
        updated_at
      ) VALUES (
        @entry_order,
        @entry_kind,
        @item_id,
        @mod_id,
        @group_key,
        @group_label,
        @group_size,
        CURRENT_TIMESTAMP
      )
    `);

    let itemsImported = 0;
    let recipesImported = 0;
    let recipesCorePayloadBytes = 0;
    let recipeBootstrapPayloadBytes = 0;
    let recipeSummaryCompactBytes = 0;
    let uiPayloadBytes = 0;
    let publishPayloadBytes = 0;
    let publishPayloadCount = 0;
    const itemRecords = new Map<string, MaterializedItemRecord>();
    const itemSourceOrder = new Map<string, number>();
    const itemOreDictionaryNames = new Map<string, Set<string>>();
    const producedByMap = new Map<string, MaterializedRecipePayload[]>();
    const usedInMap = new Map<string, MaterializedRecipePayload[]>();
    const producedByMachineGroupsMap = new Map<string, Map<string, MaterializedRecipeGroupState>>();
    const usedInMachineGroupsMap = new Map<string, Map<string, MaterializedRecipeGroupState>>();
    const producedByCategoryGroupsMap = new Map<string, Map<string, MaterializedCategoryGroupState>>();
    const usedInCategoryGroupsMap = new Map<string, Map<string, MaterializedCategoryGroupState>>();
    let allBootstrapItemIds: string[] = [];
    let hotBootstrapItemIds: string[] = [];

    const resetTransaction = db.transaction(() => {
      db.exec('DELETE FROM items_core');
      db.exec('DELETE FROM items_search');
      db.exec('DELETE FROM recipes_core');
      db.exec('DELETE FROM recipe_edges');
      db.exec('DELETE FROM recipe_machine_groups');
      db.exec('DELETE FROM recipe_category_groups');
      db.exec('DELETE FROM item_browser_groups');
      db.exec('DELETE FROM recipe_bootstrap');
      db.exec('DELETE FROM recipe_summary_compact');
      db.exec('DELETE FROM ui_payloads');
      db.exec('DELETE FROM hot_items');
      db.exec('DELETE FROM mods_summary');
      db.exec('DELETE FROM browser_default_entries');
      db.exec('DELETE FROM publish_payloads');
      db.exec("DELETE FROM assets_manifest WHERE asset_type = 'page_atlas'");
    });

    const itemsTransaction = db.transaction(() => {
      let sourceOrder = 0;
      for (const filePath of itemFiles) {
        const records = readGzipJsonArray(filePath);
        for (const record of records) {
          const itemId = String(record.itemId ?? '').trim();
          if (!itemId) continue;

          const localizedName = String(record.localizedName ?? '');
          const internalName = String(record.internalName ?? '');
          const pinyinFields = buildPinyinFields(localizedName);
          const aliasMetadata = deriveAliasesAndPopularity(record);

          insertItemCore.run({
            item_id: itemId,
            mod_id: String(record.modId ?? ''),
            internal_name: internalName,
            localized_name: localizedName,
            unlocalized_name: String(record.unlocalizedName ?? ''),
            damage: Number(record.damage ?? 0),
            image_file_name: record.imageFileName ?? null,
            render_asset_ref: record.renderAssetRef ?? null,
            preferred_image_url:
              resolveMaterializedPreferredItemUrl(this.sourceRoots.imageRoot, record)
              ?? record.preferredImageUrl
              ?? toPublicImageUrl(record.imageFileName ?? null),
            tooltip: record.tooltip ?? null,
            search_terms: record.searchTerms ?? null,
          });

          insertItemSearch.run({
            item_id: itemId,
            localized_name_norm: normalizeLooseText(localizedName),
            internal_name_norm: normalizeCompactText(internalName),
            item_id_norm: normalizeCompactText(itemId),
            search_terms_norm: normalizeLooseText(record.searchTerms ?? ''),
            pinyin_full: pinyinFields.pinyinFull,
            pinyin_acronym: pinyinFields.pinyinAcronym,
            aliases: aliasMetadata.aliases,
            popularity_score: aliasMetadata.popularityScore,
            family_score: 0,
          });

          const materializedItem = toMaterializedItemRecord(record);
          if (materializedItem) {
            itemRecords.set(materializedItem.itemId, materializedItem);
          }

          if (!itemSourceOrder.has(itemId)) {
            itemSourceOrder.set(itemId, sourceOrder);
          }
          sourceOrder += 1;

          itemsImported += 1;
        }
      }
    });

    const recipesTransaction = db.transaction((filePath: string) => {
      const records = readGzipRecipeArray(filePath);
      const sourceMod = path.basename(path.dirname(filePath));
      const family = path.basename(path.dirname(path.dirname(filePath)));

      for (const recipe of records) {
        collectRecipeOreDictionaryRefs(recipe, itemOreDictionaryNames);

        const recipeId = `${recipe.id ?? ''}`.trim();
        if (!recipeId) continue;

        const inputIds = extractInputItemIds(recipe);
        const outputIds = extractOutputItemIds(recipe);
        const machineType = `${recipe.machineInfo?.machineType ?? ''}`.trim() || null;
        const voltageTier = recipe.machineInfo?.parsedVoltageTier ?? null;
        const uiFamilyKey = detectUiFamilyKey(recipe);
        const materializedRecipe = buildMaterializedRecipe(recipe, family, itemRecords);
        const categoryDescriptor = describeRecipeCategory(materializedRecipe as RecipeLike);
        const materializedRecipeJson = JSON.stringify(materializedRecipe);
        recipesCorePayloadBytes += Buffer.byteLength(materializedRecipeJson, 'utf8');

        insertRecipeCore.run({
          recipe_id: recipeId,
          recipe_type: recipe.recipeType ?? family,
          family,
          machine_type: machineType,
          voltage_tier: voltageTier,
          source_mod: sourceMod,
          input_count: inputIds.length,
          output_count: outputIds.length,
          bootstrap_key: outputIds[0] ?? inputIds[0] ?? recipeId,
          payload: materializedRecipeJson,
        });

        inputIds.forEach((itemId, index) => {
          insertRecipeEdge.run({
            item_id: itemId,
            relation_type: 'used_in',
            recipe_id: recipeId,
            slot_index: index,
            weight: 0,
          });
          const list = usedInMap.get(itemId) ?? [];
          list.push(materializedRecipe);
          usedInMap.set(itemId, list);
          addRecipeToCategoryGroupsMap(
            usedInCategoryGroupsMap,
            itemId,
            categoryDescriptor,
            recipeId,
          );
          if (machineType) {
            addRecipeToMachineGroupsMap(
              usedInMachineGroupsMap,
              itemId,
              machineType,
              family,
              voltageTier,
              recipeId,
            );
          }
        });

        outputIds.forEach((itemId, index) => {
          insertRecipeEdge.run({
            item_id: itemId,
            relation_type: 'produced_by',
            recipe_id: recipeId,
            slot_index: index,
            weight: 0,
          });
          const list = producedByMap.get(itemId) ?? [];
          list.push(materializedRecipe);
          producedByMap.set(itemId, list);
          addRecipeToCategoryGroupsMap(
            producedByCategoryGroupsMap,
            itemId,
            categoryDescriptor,
            recipeId,
          );

          if (machineType) {
            addRecipeToMachineGroupsMap(
              producedByMachineGroupsMap,
              itemId,
              machineType,
              family,
              voltageTier,
              recipeId,
            );
          }
        });

        if (uiFamilyKey) {
          const uiPayload = buildUiPayload(recipe, uiFamilyKey);
          uiPayloadBytes += Buffer.byteLength(uiPayload.payloadJson, 'utf8');
          insertUiPayload.run({
            payload_id: uiPayload.payloadId,
            recipe_id: uiPayload.recipeId,
            family_key: uiPayload.familyKey,
            payload_json: uiPayload.payloadJson,
            signature,
          });
        }

        recipesImported += 1;
      }
    });

    const itemBrowserGroupsTransaction = db.transaction(() => {
      const orderedRows = db.prepare(`
        SELECT item_id, mod_id, internal_name, localized_name, damage, tooltip
        FROM items_core
      `).all() as Array<{
        item_id: string;
        mod_id: string;
        internal_name: string;
        localized_name: string;
        damage: number;
        tooltip: string | null;
      }>;

      orderedRows.sort((left, right) =>
        compareGtnhBrowserOrder(
          {
            itemId: left.item_id,
            modId: left.mod_id,
            internalName: left.internal_name,
            localizedName: left.localized_name,
            damage: Number(left.damage ?? 0),
            tooltip: left.tooltip,
            sourceOrder: itemSourceOrder.get(left.item_id) ?? null,
          },
          {
            itemId: right.item_id,
            modId: right.mod_id,
            internalName: right.internal_name,
            localizedName: right.localized_name,
            damage: Number(right.damage ?? 0),
            tooltip: right.tooltip,
            sourceOrder: itemSourceOrder.get(right.item_id) ?? null,
          },
        ),
      );

      const candidates: CollapsibleItemCandidate[] = orderedRows.map((row) => ({
        itemId: row.item_id,
        modId: row.mod_id,
        internalName: row.internal_name,
        localizedName: row.localized_name,
        damage: Number(row.damage ?? 0),
        oreDictionaryNames: Array.from(itemOreDictionaryNames.get(row.item_id) ?? []),
      }));

      const curatedAssignments = buildCollapsibleItemAssignments(candidates);
      const blockedItemIds = new Set(
        Array.from(curatedAssignments.values())
          .filter((assignment) => Boolean(assignment.groupKey) && assignment.groupSize > 1)
          .map((assignment) => assignment.itemId),
      );
      const syntheticAssignments = buildSyntheticBrowserVariantAssignments(candidates, { blockedItemIds });
      const assignments = mergeBrowserGroupAssignments(candidates, curatedAssignments, syntheticAssignments);
      const candidateByItemId = new Map(candidates.map((candidate) => [candidate.itemId, candidate]));
      const seenCollapsedGroups = new Set<string>();
      let browserDefaultEntryOrder = 0;

      for (const candidate of candidates) {
        const assignment = assignments.get(candidate.itemId);
        if (!assignment) continue;
        insertItemBrowserGroup.run({
          item_id: assignment.itemId,
          group_key: assignment.groupKey,
          group_label: assignment.groupLabel,
          group_size: assignment.groupSize,
          group_sort_order: assignment.groupSortOrder,
        });

        if (!assignment.groupKey || assignment.groupSize <= 1) {
          insertBrowserDefaultEntry.run({
            entry_order: browserDefaultEntryOrder,
            entry_kind: 'item',
            item_id: assignment.itemId,
            mod_id: candidate.modId,
            group_key: null,
            group_label: null,
            group_size: 1,
          });
          browserDefaultEntryOrder += 1;
          continue;
        }

        if (seenCollapsedGroups.has(assignment.groupKey)) {
          continue;
        }

        seenCollapsedGroups.add(assignment.groupKey);
        const syntheticRepresentativeItemId = syntheticAssignments.get(candidate.itemId)?.representativeItemId;
        const representativeCandidate =
          (syntheticRepresentativeItemId
            ? candidateByItemId.get(syntheticRepresentativeItemId)
            : null)
          ?? candidate;
        insertBrowserDefaultEntry.run({
          entry_order: browserDefaultEntryOrder,
          entry_kind: 'group-collapsed',
          item_id: representativeCandidate.itemId,
          mod_id: representativeCandidate.modId,
          group_key: assignment.groupKey,
          group_label: assignment.groupLabel ?? representativeCandidate.localizedName,
          group_size: assignment.groupSize,
        });
        browserDefaultEntryOrder += 1;
      }
    });

    const modsSummaryTransaction = db.transaction(() => {
      const modRows = db.prepare(`
        SELECT mod_id, COUNT(*) AS item_count
        FROM items_core
        GROUP BY mod_id
        ORDER BY mod_id COLLATE NOCASE ASC
      `).all() as Array<{ mod_id: string; item_count: number }>;

      for (const row of modRows) {
        insertModsSummary.run({
          mod_id: row.mod_id,
          mod_name: row.mod_id,
          item_count: Number(row.item_count ?? 0),
        });
      }
    });

    const machineGroupsTransaction = db.transaction(() => {
      const writeRelationGroups = (
        relationType: RecipeRelationType,
        groupsMap: Map<string, Map<string, MaterializedRecipeGroupState>>,
      ) => {
        for (const [itemId, groups] of groupsMap.entries()) {
          for (const [machineKey, group] of groups.entries()) {
            insertMachineGroup.run({
              item_id: itemId,
              relation_type: relationType,
              machine_key: machineKey,
              family: group.family,
              voltage_tier: group.voltageTier,
              recipe_ids_blob: JSON.stringify(group.recipeIds),
              recipe_count: group.recipeIds.length,
            });
          }
        }
      };

      writeRelationGroups('produced_by', producedByMachineGroupsMap);
      writeRelationGroups('used_in', usedInMachineGroupsMap);
    });

    const categoryGroupsTransaction = db.transaction(() => {
      const writeRelationGroups = (
        relationType: RecipeRelationType,
        groupsMap: Map<string, Map<string, MaterializedCategoryGroupState>>,
      ) => {
        for (const [itemId, groups] of groupsMap.entries()) {
          for (const group of groups.values()) {
            insertCategoryGroup.run({
              item_id: itemId,
              relation_type: relationType,
              category_key: group.descriptor.categoryKey,
              category_type: group.descriptor.type,
              category_name: group.descriptor.name,
              machine_key: group.descriptor.machineKey ?? null,
              voltage_tier: group.descriptor.voltageTier ?? null,
              recipe_ids_blob: JSON.stringify(group.recipeIds),
              recipe_count: group.recipeIds.length,
            });
          }
        }
      };

      writeRelationGroups('produced_by', producedByCategoryGroupsMap);
      writeRelationGroups('used_in', usedInCategoryGroupsMap);
    });

    const hotItemsTransaction = db.transaction(() => {
      const selectHomeOrder = db.prepare(`
        SELECT item_id, mod_id, internal_name, localized_name, damage, tooltip
        FROM items_core
      `);
      const selectPopularity = db.prepare(`
        SELECT popularity_score
        FROM items_search
        WHERE item_id = ?
      `);

      const homeRows = (selectHomeOrder.all() as Array<{
        item_id: string;
        mod_id: string;
        internal_name: string;
        localized_name: string;
        damage: number;
        tooltip: string | null;
      }>).sort((left, right) =>
        compareGtnhBrowserOrder(
          {
            itemId: left.item_id,
            modId: left.mod_id,
            internalName: left.internal_name,
            localizedName: left.localized_name,
            damage: Number(left.damage ?? 0),
            tooltip: left.tooltip,
            sourceOrder: itemSourceOrder.get(left.item_id) ?? null,
          },
          {
            itemId: right.item_id,
            modId: right.mod_id,
            internalName: right.internal_name,
            localizedName: right.localized_name,
            damage: Number(right.damage ?? 0),
            tooltip: right.tooltip,
            sourceOrder: itemSourceOrder.get(right.item_id) ?? null,
          },
        ),
      ).slice(0, 2000);
      const homeRankMap = new Map<string, number>();
      homeRows.forEach((row, index) => {
        homeRankMap.set(row.item_id, index + 1);
      });

      const hotScores = new Map<string, { score: number; recipeRank: number }>();
      const allBootstrapItemIds = new Set<string>([
        ...Array.from(producedByMap.keys()),
        ...Array.from(usedInMap.keys()),
      ]);

      for (const itemId of allBootstrapItemIds) {
        const produced = producedByMap.get(itemId)?.length ?? 0;
        const used = usedInMap.get(itemId)?.length ?? 0;
        const machineCount = (producedByMachineGroupsMap.get(itemId)?.size ?? 0) + (usedInMachineGroupsMap.get(itemId)?.size ?? 0);
        const popularityRow = selectPopularity.get(itemId) as { popularity_score?: number } | undefined;
        const popularity = Number(popularityRow?.popularity_score ?? 0);
        const score = produced * 5 + used * 3 + machineCount * 7 + popularity;
        hotScores.set(itemId, {
          score,
          recipeRank: produced + used,
        });
      }

      const sorted = Array.from(hotScores.entries())
        .sort((a, b) => b[1].score - a[1].score || b[1].recipeRank - a[1].recipeRank || a[0].localeCompare(b[0]));

      sorted.forEach(([itemId, meta], index) => {
        insertHotItem.run({
          item_id: itemId,
          popularity_score: meta.score,
          home_rank: homeRankMap.get(itemId) ?? null,
          search_rank: index + 1,
          recipe_rank: meta.recipeRank,
        });
      });
    });

    const bootstrapTransaction = db.transaction((bootstrapItemIds: string[], writeFullBootstrap: boolean) => {
      const selectItemCore = db.prepare(`
        SELECT
          item_id,
          mod_id,
          internal_name,
          localized_name,
          unlocalized_name,
          damage,
          image_file_name,
          render_asset_ref,
          preferred_image_url,
          tooltip,
          search_terms
        FROM items_core
        WHERE item_id = ?
      `);

      for (const itemId of bootstrapItemIds) {
        const itemRow = selectItemCore.get(itemId) as Record<string, unknown> | undefined;
        if (!itemRow) continue;

        const itemPayload = {
          itemId: String(itemRow.item_id ?? ''),
          modId: String(itemRow.mod_id ?? ''),
          internalName: String(itemRow.internal_name ?? ''),
          localizedName: String(itemRow.localized_name ?? ''),
          renderAssetRef: typeof itemRow.render_asset_ref === 'string' ? itemRow.render_asset_ref : null,
          preferredImageUrl: typeof itemRow.preferred_image_url === 'string' ? itemRow.preferred_image_url : null,
          unlocalizedName: String(itemRow.unlocalized_name ?? ''),
          damage: Number(itemRow.damage ?? 0),
          maxStackSize: 64,
          maxDamage: 0,
          imageFileName: typeof itemRow.image_file_name === 'string' ? itemRow.image_file_name : null,
          tooltip: typeof itemRow.tooltip === 'string' ? itemRow.tooltip : null,
          searchTerms: typeof itemRow.search_terms === 'string' ? itemRow.search_terms : null,
          toolClasses: null,
        };

        const indexedCrafting = (producedByMap.get(itemId) ?? []) as unknown as object[];
        const indexedUsage = (usedInMap.get(itemId) ?? []) as unknown as object[];
        const producedByRecipeIds = indexedCrafting
          .map((recipe) => String((recipe as { id?: string }).id ?? ''))
          .filter(Boolean);
        const usedInRecipeIds = indexedUsage
          .map((recipe) => String((recipe as { id?: string }).id ?? ''))
          .filter(Boolean);
        const inlineProducedBy = indexedCrafting.slice(0, this.options.bootstrap.inlineSeedLimit);
        const inlineUsedIn = indexedUsage.slice(0, this.options.bootstrap.inlineSeedLimit);
        const producedByMachineGroups = toMachineGroupSummaryEntries(producedByMachineGroupsMap.get(itemId));
        const usedInMachineGroups = toMachineGroupSummaryEntries(usedInMachineGroupsMap.get(itemId));
        const producedByCategoryGroups = buildRecipeCategorySummaries(indexedCrafting as RecipeLike[]);
        const usedInCategoryGroups = buildRecipeCategorySummaries(indexedUsage as RecipeLike[]);
        const payload = {
          item: itemPayload,
          recipeIndex: {
            usedInRecipes: usedInRecipeIds,
            producedByRecipes: producedByRecipeIds,
          },
          seedRecipeIds: {
            producedBy: producedByRecipeIds.slice(0, this.options.bootstrap.inlineSeedLimit),
            usedIn: usedInRecipeIds.slice(0, this.options.bootstrap.inlineSeedLimit),
          },
          indexedSummary: {
            itemId,
            itemName: itemPayload.localizedName,
            counts: {
              producedBy: indexedCrafting.length,
              usedIn: indexedUsage.length,
              machineGroups: producedByMachineGroups.length,
            },
            machineGroups: producedByMachineGroups,
            producedByMachineGroups,
            usedInMachineGroups,
            producedByCategoryGroups,
            usedInCategoryGroups,
          },
        };
        insertSummaryCompact.run({
          item_id: itemId,
          summary_payload: JSON.stringify(payload.indexedSummary),
          signature,
        });
        recipeSummaryCompactBytes += Buffer.byteLength(JSON.stringify(payload.indexedSummary), 'utf8');

        if (writeFullBootstrap) {
          const producedByIds = JSON.stringify(producedByRecipeIds);
          const usedInIds = JSON.stringify(usedInRecipeIds);
          const producedByPayload = JSON.stringify(inlineProducedBy);
          const usedInPayload = JSON.stringify(inlineUsedIn);
          const summaryPayload = JSON.stringify(payload);
          recipeBootstrapPayloadBytes +=
            Buffer.byteLength(producedByIds, 'utf8') +
            Buffer.byteLength(usedInIds, 'utf8') +
            Buffer.byteLength(producedByPayload, 'utf8') +
            Buffer.byteLength(usedInPayload, 'utf8') +
            Buffer.byteLength(summaryPayload, 'utf8');
          insertBootstrap.run({
            item_id: itemId,
            produced_by_ids: producedByIds,
            used_in_ids: usedInIds,
            produced_by_payload: producedByPayload,
            used_in_payload: usedInPayload,
            summary_payload: summaryPayload,
            signature,
          });
        }
      }
    });

    const stateTransaction = db.transaction(() => {
      upsertState.run({ state_key: 'source_signature', state_value: signature });
      upsertState.run({ state_key: 'items_dir', state_value: this.sourceRoots.itemsDir });
      upsertState.run({ state_key: 'recipes_dir', state_value: this.sourceRoots.recipesDir });
      upsertState.run({ state_key: 'canonical_dir', state_value: this.sourceRoots.canonicalDir });
      upsertState.run({ state_key: 'image_root', state_value: this.sourceRoots.imageRoot });
      upsertState.run({ state_key: 'compiler_version', state_value: ACCELERATION_COMPILER_VERSION });
      upsertState.run({ state_key: 'items_core_count', state_value: String(itemsImported) });
      upsertState.run({ state_key: 'recipes_core_count', state_value: String(recipesImported) });
      upsertState.run({ state_key: 'recipe_edges_count', state_value: String(Array.from(producedByMap.values()).reduce((sum, recipes) => sum + recipes.length, 0) + Array.from(usedInMap.values()).reduce((sum, recipes) => sum + recipes.length, 0)) });
      upsertState.run({ state_key: 'recipe_bootstrap_count', state_value: String(hotBootstrapItemIds.length) });
      upsertState.run({ state_key: 'recipe_summary_compact_count', state_value: String(allBootstrapItemIds.length) });
      upsertState.run({
        state_key: 'recipe_machine_groups_count',
        state_value: String(
          Array.from(producedByMachineGroupsMap.values()).reduce((sum, groups) => sum + groups.size, 0)
          + Array.from(usedInMachineGroupsMap.values()).reduce((sum, groups) => sum + groups.size, 0),
        ),
      });
      upsertState.run({
        state_key: 'recipe_category_groups_count',
        state_value: String(
          Array.from(producedByCategoryGroupsMap.values()).reduce((sum, groups) => sum + groups.size, 0)
          + Array.from(usedInCategoryGroupsMap.values()).reduce((sum, groups) => sum + groups.size, 0),
        ),
      });
      upsertState.run({
        state_key: 'item_browser_groups_count',
        state_value: String((db.prepare('SELECT COUNT(*) AS c FROM item_browser_groups').get() as { c: number }).c),
      });
      upsertState.run({
        state_key: 'browser_default_entries_count',
        state_value: String((db.prepare('SELECT COUNT(*) AS c FROM browser_default_entries').get() as { c: number }).c),
      });
      upsertState.run({
        state_key: 'mods_summary_count',
        state_value: String((db.prepare('SELECT COUNT(*) AS c FROM mods_summary').get() as { c: number }).c),
      });
      upsertState.run({ state_key: 'hot_items_count', state_value: String(allBootstrapItemIds.length) });
      upsertState.run({ state_key: 'recipes_core_payload_bytes', state_value: String(recipesCorePayloadBytes) });
      upsertState.run({ state_key: 'recipe_bootstrap_payload_bytes', state_value: String(recipeBootstrapPayloadBytes) });
      upsertState.run({ state_key: 'recipe_summary_compact_bytes', state_value: String(recipeSummaryCompactBytes) });
      upsertState.run({ state_key: 'ui_payload_bytes', state_value: String(uiPayloadBytes) });
      upsertState.run({
        state_key: 'ui_payloads_count',
        state_value: String((db.prepare('SELECT COUNT(*) AS c FROM ui_payloads').get() as { c: number }).c),
      });
    });

    resetTransaction();
    this.logStage('reset-done');
    db.pragma('wal_checkpoint(PASSIVE)');
    itemsTransaction();
    this.logStage('items-done', { itemsImported });
    db.pragma('wal_checkpoint(PASSIVE)');
    for (const filePath of recipeFiles) {
      recipesTransaction(filePath);
      db.pragma('wal_checkpoint(PASSIVE)');
    }
    this.logStage('recipes-done', { recipesImported });
    itemBrowserGroupsTransaction();
    this.logStage('item-browser-groups-done');
    db.pragma('wal_checkpoint(PASSIVE)');
    modsSummaryTransaction();
    this.logStage('mods-summary-done');
    db.pragma('wal_checkpoint(PASSIVE)');
    machineGroupsTransaction();
    this.logStage('machine-groups-done', {
      producedByMachineGroupItems: producedByMachineGroupsMap.size,
      usedInMachineGroupItems: usedInMachineGroupsMap.size,
    });
    categoryGroupsTransaction();
    this.logStage('category-groups-done', {
      producedByCategoryGroupItems: producedByCategoryGroupsMap.size,
      usedInCategoryGroupItems: usedInCategoryGroupsMap.size,
    });
    db.pragma('wal_checkpoint(PASSIVE)');
    hotItemsTransaction();
    this.logStage('hot-items-done');
    db.pragma('wal_checkpoint(PASSIVE)');
    allBootstrapItemIds = Array.from(new Set<string>([
      ...Array.from(producedByMap.keys()),
      ...Array.from(usedInMap.keys()),
    ]));
    const hotBootstrapRows = db.prepare(`
      SELECT item_id
      FROM hot_items
      ORDER BY popularity_score DESC, search_rank ASC
      LIMIT ?
    `).all(this.options.bootstrap.hotItemLimit) as Array<{ item_id: string }>;
    hotBootstrapItemIds = hotBootstrapRows.map((row) => row.item_id);
    const hotBootstrapSet = new Set(hotBootstrapItemIds);
    const coldBootstrapItemIds = allBootstrapItemIds.filter((itemId) => !hotBootstrapSet.has(itemId));
    for (const itemIdChunk of chunkArray(hotBootstrapItemIds, this.bootstrapChunkSize)) {
      bootstrapTransaction(itemIdChunk, true);
      db.pragma('wal_checkpoint(PASSIVE)');
    }
    for (const itemIdChunk of chunkArray(coldBootstrapItemIds, this.bootstrapChunkSize)) {
      bootstrapTransaction(itemIdChunk, false);
      db.pragma('wal_checkpoint(PASSIVE)');
    }
    this.logStage('bootstrap-done', {
      hotBootstrap: hotBootstrapItemIds.length,
      coldBootstrap: coldBootstrapItemIds.length,
    });
    stateTransaction();
    this.logStage('state-done');
    db.pragma('wal_checkpoint(PASSIVE)');

    let hotAtlasesGenerated = 0;
    const hotPageAtlas = this.options.hotPageAtlas;
    const publishHotPayloads = this.options.publishHotPayloads;
    const runtimeItemsService = new ItemsService({
      databaseManager: this.databaseManager,
      splitExportFallback: false,
    });
    const runtimePageAtlasService = new PageAtlasService({
      databaseManager: this.databaseManager,
      itemsService: runtimeItemsService,
      imageRoot: this.sourceRoots.imageRoot,
      atlasDir: hotPageAtlas.atlasOutputDir,
    });

    if (hotPageAtlas.enabled) {
      for (const slotSize of hotPageAtlas.slotSizes) {
        for (let page = 1; page <= hotPageAtlas.pages; page += 1) {
          // eslint-disable-next-line no-await-in-loop
          const pageItems = await runtimeItemsService.getBrowserDisplayItemsForPage({
            page,
            pageSize: hotPageAtlas.pageSize,
          });
          if (!pageItems.length) break;
          // eslint-disable-next-line no-await-in-loop
          const atlas = await runtimePageAtlasService.buildAtlas(pageItems, slotSize);
          if (atlas) {
            hotAtlasesGenerated += 1;
          }
        }
      }
    }

    this.logStage('hot-atlas-done', { hotAtlasesGenerated });

    if (publishHotPayloads.enabled) {
      const publishPayloadMaterializer = new PublishPayloadMaterializerService({
        databaseManager: this.databaseManager,
        imageRoot: this.sourceRoots.imageRoot,
        atlasOutputDir: hotPageAtlas.atlasOutputDir,
        publishHotPayloads,
      });
      const publishPayloadResult = await publishPayloadMaterializer.materialize(signature);
      publishPayloadCount = publishPayloadResult.count;
      publishPayloadBytes = publishPayloadResult.bytes;
    }

    this.logStage('publish-payloads-done', {
      publishPayloadCount,
      publishPayloadBytes,
    });
    const finalStateTransaction = db.transaction(() => {
      upsertState.run({ state_key: 'page_atlas_assets_count', state_value: String(hotAtlasesGenerated) });
      upsertState.run({ state_key: 'publish_payloads_count', state_value: String(publishPayloadCount) });
      upsertState.run({ state_key: 'publish_payload_bytes', state_value: String(publishPayloadBytes) });
    });
    finalStateTransaction();
    db.pragma('wal_checkpoint(PASSIVE)');

    return {
      signature,
      itemsImported,
      recipesImported,
      hotAtlasesGenerated,
    };
  }
}
