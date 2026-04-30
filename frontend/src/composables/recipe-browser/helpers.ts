import {
  getImageUrlFromFileName,
  getImageUrlFromRenderAssetRef,
  type Recipe,
  type RecipeItem,
  type RecipeVariantGroup,
  type indexedRecipeCategorySummary,
  type indexedMachineGroupSummary,
} from '../../services/api';
import { resolveRecipePresentationProfile } from '../../services/uiTypeMapping';

export interface MachineCategory {
  type: 'crafting' | 'machine';
  name: string;
  categoryKey: string;
  recipeType: string;
  machineIcon: string | null;
  recipes: Recipe[];
  recipeVariants: Map<string, Recipe[]>;
  recipeCount: number;
  machineKey?: string | null;
  voltageTier?: string | null;
}

const isCircuitRecipeType = (recipeType: string): boolean => {
  return (
    recipeType.includes('Circuit') ||
    recipeType.includes('Assembly Line') ||
    recipeType.includes('Circuit Assembler') ||
    recipeType.toLowerCase().includes('printed')
  );
};

const isCircuitBoardItem = (itemId: string): boolean => {
  return (
    itemId.includes('Circuit') ||
    itemId.includes('gt.metacircuititem') ||
    itemId.includes('board') ||
    itemId.includes('Board')
  );
};

const genericRecipeSignatureCache = new WeakMap<Recipe, string>();
const outputSignatureCache = new WeakMap<Recipe, string>();
const filledSlotIndicesCache = new WeakMap<Recipe, number[]>();
const extremePreferenceCache = new WeakMap<Recipe, number>();

const getCellCandidates = (cell: Recipe['inputs'][number][number] | undefined): RecipeItem[] => {
  if (!cell) return [];
  return Array.isArray(cell) ? cell : [cell];
};

const generateCircuitRecipeSignature = (recipe: Recipe): string | null => {
  if (!isCircuitRecipeType(recipe.recipeType)) {
    return null;
  }

  const parts: string[] = [recipe.recipeType];
  const sortedOutputs = Object.entries(recipe.outputs || {}).sort(([a], [b]) => parseInt(a, 10) - parseInt(b, 10));

  for (const [index, output] of sortedOutputs) {
    parts.push(`out:${index}:${output.itemId}:${output.count || 1}`);
  }

  for (const row of recipe.inputs || []) {
    for (const cell of row || []) {
      for (const input of getCellCandidates(cell)) {
        if (!isCircuitBoardItem(input.itemId)) {
          parts.push(`in:${input.itemId}:${input.count || 1}`);
        }
      }
    }
  }

  if (recipe.additionalData?.fluidInputs) {
    for (const fluid of recipe.additionalData.fluidInputs) {
      parts.push(`fluidIn:${fluid.name}:${fluid.amount}`);
    }
  }
  if (recipe.additionalData?.fluidOutputs) {
    for (const fluid of recipe.additionalData.fluidOutputs) {
      parts.push(`fluidOut:${fluid.name}:${fluid.amount}`);
    }
  }

  return parts.join('|');
};

const getMachineName = (recipeType: string): string => {
  const match = recipeType.match(/gregtech\s*-\s*(.+?)\s*\(/);
  if (match) {
    return match[1].trim();
  }

  const typeMap: Record<string, string> = {
    'minecraft:crafting': 'Crafting Table',
    'minecraft:smelting': 'Furnace',
    'minecraft:blasting': 'Blast Furnace',
    'minecraft:smoking': 'Smoker',
    'minecraft:campfire': 'Campfire',
  };

  return typeMap[recipeType] || recipeType;
};

const getCategoryMachineIcon = (recipe: Recipe, getImagePath: (itemId: string) => string): string | null => {
  const profile = resolveRecipePresentationProfile({
    machineType: recipe.machineInfo?.machineType,
    recipeType: recipe.recipeType,
    recipeTypeData: recipe.recipeTypeData,
    inputs: recipe.inputs,
    additionalData: recipe.additionalData as Record<string, unknown> | undefined,
    metadata: recipe.metadata as Record<string, unknown> | undefined,
    preferDetailedCrafting: false,
  });

  switch (profile.uiConfig.uiType) {
    case 'thaumcraft_arcane':
      return getImagePath('i~Thaumcraft~blockTable~15');
    case 'thaumcraft_infusion':
      return getImagePath('i~Thaumcraft~blockStoneDevice~2');
    case 'thaumcraft_crucible':
      return getImagePath('i~Thaumcraft~blockMetalDevice~0');
    case 'thaumcraft_aspect':
      return getExplicitMachineName(recipe) === '要素组合'
        ? getImagePath('i~Thaumcraft~ItemResource~9')
        : getImagePath('i~Thaumcraft~ItemResearchNotes~0');
    case 'thaumcraft_research':
      return getImagePath('i~Thaumcraft~ItemResearchNotes~0');
    case 'blood_magic_altar':
      return getImagePath('i~AWWayofTime~Altar~0');
    case 'botania_mana_pool':
      return getImagePath('i~Botania~pool~0');
    case 'botania_rune_altar':
      return getImagePath('i~Botania~runeAltar~0');
    case 'botania_pure_daisy':
      return getImagePath('i~Botania~specialFlower~0~BVmnjzvOML-Ap_zxeMIMOw==');
    case 'botania_terra_plate':
      return getImagePath('i~Botania~terraPlate~0');
    default:
      break;
  }

  const resolved = resolveMachineIcon(recipe, getImagePath);
  if (resolved) return resolved;

  const fallbackMapped = resolveFallbackMachineIconByName(getExplicitMachineName(recipe) || '', getImagePath);
  if (fallbackMapped) return fallbackMapped;

  const combined = getCombinedRecipeText(recipe);
  if (
    combined.includes('singularity compressor') ||
    combined.includes('奇点压缩机')
  ) {
    return getImagePath('i~Avaritia~Singularity~0');
  }

  return null;
};

const GT_TIER_ORDER = ['ULV', 'LV', 'MV', 'HV', 'EV', 'IV', 'LuV', 'ZPM', 'UV', 'UHV', 'UEV', 'UIV', 'UMV', 'UXV', 'MAX'] as const;
type GtTier = typeof GT_TIER_ORDER[number];

const GT_MACHINE_ICON_BY_FAMILY: Array<{
  patterns: string[];
  tiers: Partial<Record<GtTier, number>>;
  fallback?: number;
}> = [
  {
    patterns: ['研究站', 'research station'],
    tiers: { ULV: 30, LV: 31, MV: 32, HV: 33, EV: 34, IV: 35, LuV: 36, ZPM: 37, UV: 38, UHV: 39, UEV: 40, UIV: 41, UMV: 42, UXV: 43, MAX: 44 },
    fallback: 33,
  },
  {
    patterns: ['组装机', 'assembler', 'assembly machine', 'circuit assembler'],
    tiers: { ULV: 14, LV: 15, MV: 16, HV: 17, EV: 18, IV: 19, LuV: 20, ZPM: 21, UV: 22, UHV: 23, UEV: 24, UIV: 25, UMV: 26, UXV: 27, MAX: 28 },
    fallback: 17,
  },
  {
    patterns: ['装配线加工', 'assembly line'],
    tiers: { ULV: 4, LV: 5, MV: 6, HV: 7, EV: 8, IV: 9, LuV: 10, ZPM: 11, UV: 12, UHV: 13, UEV: 14, UIV: 2059, UMV: 2060, UXV: 2061, MAX: 2062 },
    fallback: 8,
  },
  {
    patterns: ['压缩机', 'compressor'],
    tiers: { ULV: 114, LV: 115, MV: 116, HV: 117, EV: 118, IV: 119, LuV: 120, ZPM: 121, UV: 122, UHV: 123, UIV: 124, UMV: 125, UXV: 126 },
    fallback: 117,
  },
  {
    patterns: ['电解机', 'electrolyzer'],
    tiers: { LV: 245, MV: 246, HV: 247, EV: 248, IV: 249, LuV: 250, ZPM: 251, UV: 252 },
    fallback: 247,
  },
  {
    patterns: ['离心机', 'centrifuge'],
    tiers: { ULV: 214, LV: 215, MV: 216, HV: 217, EV: 218, IV: 219, LuV: 220, ZPM: 221, UV: 222, UHV: 223 },
    fallback: 217,
  },
  {
    patterns: ['高炉', 'blast furnace'],
    tiers: { ULV: 84, LV: 85, MV: 86, HV: 87, EV: 88, IV: 89, LuV: 90, ZPM: 97, UV: 95, UHV: 92, UEV: 91, UIV: 93, UMV: 94, UXV: 96, MAX: 98 },
    fallback: 87,
  },
  {
    patterns: ['电弧炉', 'arc furnace'],
    tiers: { LV: 132, MV: 133, HV: 134, UEV: 135, UHV: 136 },
    fallback: 134,
  },
  {
    patterns: ['分子重组仪', 'molecular'],
    tiers: { EV: 7, IV: 207, LuV: 207, ZPM: 210, UV: 209, UHV: 208 },
    fallback: 207,
  },
  {
    patterns: ['车床', 'lathe'],
    tiers: { ULV: 310, LV: 314, MV: 316, HV: 312, EV: 311, IV: 313, LuV: 315, ZPM: 317, UV: 318, UHV: 320, UEV: 319, UIV: 321, UMV: 322, UXV: 323 },
    fallback: 312,
  },
  {
    patterns: ['卷板机', 'bender'],
    tiers: { ULV: 148, LV: 149, MV: 150, HV: 151, EV: 152, IV: 153, LuV: 154, ZPM: 155, UV: 156, UHV: 157, UEV: 158, UMV: 160, UXV: 161, MAX: 162 },
    fallback: 151,
  },
  {
    patterns: ['挤压机', 'extruder'],
    tiers: { ULV: 172, LV: 173, MV: 174, HV: 175, EV: 176, IV: 177, LuV: 178, ZPM: 179, UV: 180, UHV: 181, UMV: 183, UXV: 184, MAX: 185 },
    fallback: 175,
  },
  {
    patterns: ['切割机', 'cutting machine'],
    tiers: { ULV: 284, LV: 285, MV: 286, HV: 287, EV: 288, IV: 289, LuV: 290, ZPM: 291, UV: 292, UHV: 293, UEV: 295 },
    fallback: 287,
  },
  {
    patterns: ['化学反应釜', 'chemical reactor'],
    tiers: { ULV: 208, LV: 209, MV: 210, HV: 211, EV: 212, IV: 213, LuV: 214, ZPM: 215, UV: 216, UHV: 217 },
    fallback: 211,
  },
];

const detectGtTier = (name: string): GtTier | null => {
  const match = name.match(/\((ULV|LV|MV|HV|EV|IV|LuV|ZPM|UV|UHV|UEV|UIV|UMV|UXV|MAX)\)/i);
  if (!match) return null;
  const normalized = match[1];
  return GT_TIER_ORDER.find((tier) => tier.toLowerCase() === normalized.toLowerCase()) ?? null;
};

const resolveFallbackMachineIconByName = (
  machineName: string,
  getImagePath: (itemId: string) => string,
): string | null => {
  const normalized = machineName.trim().toLowerCase();
  if (!normalized) return null;

  for (const family of GT_MACHINE_ICON_BY_FAMILY) {
    if (!family.patterns.some((pattern) => normalized.includes(pattern.toLowerCase()))) {
      continue;
    }
    const tier = detectGtTier(machineName);
    const metaId = (tier ? family.tiers[tier] : undefined) ?? family.fallback;
    if (!metaId) return null;
    return getImagePath(`i~gregtech~gt.blockmachines~${metaId}`);
  }

  return null;
};

const getCombinedRecipeText = (recipe: Recipe): string => {
  return [
    recipe.recipeType || '',
    typeof recipe.recipeTypeData?.id === 'string' ? recipe.recipeTypeData.id : '',
    typeof recipe.recipeTypeData?.type === 'string' ? recipe.recipeTypeData.type : '',
    typeof recipe.recipeTypeData?.category === 'string' ? recipe.recipeTypeData.category : '',
    typeof recipe.recipeTypeData?.machineType === 'string' ? recipe.recipeTypeData.machineType : '',
    getExplicitMachineName(recipe) || '',
  ]
    .join(' ')
    .toLowerCase();
};

const isGenericCraftingLabel = (name: string): boolean => {
  const normalized = name.trim().toLowerCase();
  return (
    normalized === 'crafting' ||
    normalized === 'crafting table' ||
    normalized === 'crafting (shaped)' ||
    normalized === 'crafting (shapeless)' ||
    normalized === 'workbench' ||
    normalized === 'minecraft:crafting' ||
    normalized === '有序合成' ||
    normalized === '无序合成' ||
    normalized === '无需合成'
  );
};

const getCraftingCategoryName = (recipe: Recipe): string => {
  const explicitMachineName = getExplicitMachineName(recipe);
  if (explicitMachineName && !isGenericCraftingLabel(explicitMachineName)) {
    return normalizeMachineCategoryName(explicitMachineName);
  }

  const combined = getCombinedRecipeText(recipe);
  if (combined.includes('singularity compressor') || combined.includes('奇点压缩机')) {
    return explicitMachineName || '奇点压缩机';
  }

  if (
    combined.includes('no crafting') ||
    combined.includes('无需合成') ||
    combined.includes('no recipe')
  ) {
    return '无需合成';
  }

  if (
    combined.includes('shapeless') ||
    combined.includes('无序合成')
  ) {
    return '无序合成';
  }

  if (
    combined.includes('shaped') ||
    combined.includes('有序合成')
  ) {
    return '有序合成';
  }

  if (isExtremeMachineText(combined)) {
    return normalizeMachineCategoryName(explicitMachineName || getMachineName(recipe.recipeType));
  }

  return 'Crafting Table';
};

const getExplicitMachineName = (recipe: Recipe): string | null => {
  if (recipe.additionalData?.specialRecipeType === 'NEI_Thaumcraft') {
    if (recipe.additionalData?.thaumcraftLayout === 'infusion') {
      return '奥术注魔';
    }
    if (recipe.additionalData?.thaumcraftLayout === 'arcane') {
      const machineType = recipe.machineInfo?.machineType;
      if (typeof machineType === 'string' && machineType.trim()) {
        return machineType.trim();
      }
      return '有序奥术合成';
    }
  }

  const machineType = recipe.machineInfo?.machineType;
  if (typeof machineType === 'string' && machineType.trim()) {
    return machineType.trim();
  }

  const additionalMachineType = recipe.additionalData?.machineInfo?.machineType;
  if (typeof additionalMachineType === 'string' && additionalMachineType.trim()) {
    return additionalMachineType.trim();
  }

  const recipeTypeMachine = recipe.recipeTypeData?.machineType;
  if (typeof recipeTypeMachine === 'string' && recipeTypeMachine.trim()) {
    return recipeTypeMachine.trim();
  }

  return null;
};

export const isExtremeMachineText = (text: string): boolean => {
  const lower = text.toLowerCase();
  return (
    lower.includes('extreme crafting') ||
    lower.includes('dire crafting') ||
    lower.includes('extreme') ||
    lower.includes('dire') ||
    text.includes('终极合成') ||
    text.includes('无尽') ||
    text.includes('贪婪') ||
    text.includes('缁堟瀬鍚堟垚') ||
    text.includes('鏃犲敖')
  );
};

const GT_MACHINE_CATEGORY_ALIAS_GROUPS: string[][] = [
  ['真空冷冻机', '凛冰冷冻机'],
  ['电解机', '工业电解机'],
  ['离心机', '工业离心机'],
  ['高炉', '工业高炉'],
  ['搅拌机', '工业搅拌机'],
];

const normalizeMachineCategoryName = (name: string): string => {
  if (isExtremeMachineText(name)) {
    return '无尽工作台';
  }

  const normalized = name.trim();
  if (!normalized) return normalized;

  const withoutTier = normalized.replace(/\s*\((ULV|LV|MV|HV|EV|IV|LuV|ZPM|UV|UHV|UEV|UIV|UMV|UXV|MAX)\)\s*$/i, '').trim();
  const aliasGroup = GT_MACHINE_CATEGORY_ALIAS_GROUPS.find((aliases) => aliases.includes(withoutTier));
  return aliasGroup?.[0] ?? withoutTier;
};

const generateGenericRecipeSignature = (recipe: Recipe): string => {
  const cached = genericRecipeSignatureCache.get(recipe);
  if (cached) return cached;

  const outputSig = (recipe.outputs || [])
    .map((output) => `${output.itemId}:${output.count || 1}`)
    .sort()
    .join('|');
  const inputSig: string[] = [];
  for (let rowIndex = 0; rowIndex < recipe.inputs.length; rowIndex += 1) {
    const row = recipe.inputs[rowIndex] || [];
    for (let colIndex = 0; colIndex < row.length; colIndex += 1) {
      const cell = row[colIndex];
      if (!cell || !Array.isArray(cell) || cell.length === 0) continue;
      const normalized = cell
        .map((entry) => `${entry.itemId}:${entry.count || 1}`)
        .sort()
        .join('&');
      inputSig.push(`${rowIndex},${colIndex}:${normalized}`);
    }
  }
  const signature = `${outputSig}::${inputSig.join('|')}`;
  genericRecipeSignatureCache.set(recipe, signature);
  return signature;
};

const getOutputSignature = (recipe: Recipe): string => {
  const cached = outputSignatureCache.get(recipe);
  if (cached) return cached;
  const signature = (recipe.outputs || [])
    .map((output) => `${output.itemId}:${output.count || 1}`)
    .sort()
    .join('|');
  outputSignatureCache.set(recipe, signature);
  return signature;
};

const getFilledSlotIndices = (recipe: Recipe): number[] => {
  const cached = filledSlotIndicesCache.get(recipe);
  if (cached) return cached;

  const slots: number[] = [];
  for (let r = 0; r < (recipe.inputs || []).length; r += 1) {
    const row = recipe.inputs[r] || [];
    for (let c = 0; c < row.length; c += 1) {
      const cell = row[c];
      if (Array.isArray(cell) && cell.length > 0) {
        slots.push(r * 9 + c);
      }
    }
  }
  const normalized = slots.sort((a, b) => a - b);
  filledSlotIndicesCache.set(recipe, normalized);
  return normalized;
};

const getExtremeRecipePreference = (recipe: Recipe): number => {
  const cached = extremePreferenceCache.get(recipe);
  if (cached !== undefined) return cached;

  const machineType = `${getExplicitMachineName(recipe) || ''}`.toLowerCase();
  let score = 0;
  if (machineType.includes('有序终极合成')) score += 2200;
  if (machineType.includes('无序终极合成')) score += 2100;
  if (machineType.includes('缁堟瀬鍚堟垚')) score += 2000;
  if (machineType.includes('extreme crafting')) score += 1000;
  if (machineType.includes('dire crafting')) score += 900;
  if (machineType.includes('终极合成')) score += 1200;
  if (machineType.includes('无尽')) score += 500;

  const slots = getFilledSlotIndices(recipe);
  const filled = slots.length;
  score += filled;
  if (slots.length > 0) {
    const isPrefix = slots.every((slot, idx) => slot === idx);
    if (isPrefix && filled < 81) {
      score -= 1000;
    }
    const min = slots[0];
    const max = slots[slots.length - 1];
    const span = Math.max(0, max - min + 1);
    const gaps = Math.max(0, span - filled);
    score += Math.min(300, gaps * 4);
  }

  extremePreferenceCache.set(recipe, score);
  return score;
};

const isThaumcraftItemAspectRecipe = (recipe: Recipe): boolean => {
  return getExplicitMachineName(recipe) === '物品中的要素';
};

const getMaxItemAspectAmount = (recipe: Recipe): number => {
  let max = 0;
  const rawInputs = recipe.additionalData?.rawIndexedInputs;
  const inputs = Array.isArray(rawInputs) ? rawInputs : recipe.inputs;

  const visit = (node: unknown) => {
    if (!node) return;
    if (Array.isArray(node)) {
      for (const child of node) visit(child);
      return;
    }
    if (typeof node !== 'object') return;
    const record = node as {
      count?: unknown;
      stackSize?: unknown;
      items?: Array<{ count?: unknown; stackSize?: unknown }>;
    };
    const direct = Number(record.count ?? record.stackSize);
    if (Number.isFinite(direct) && direct > max) max = direct;
    if (Array.isArray(record.items)) {
      for (const item of record.items) {
        const amount = Number(item.count ?? item.stackSize);
        if (Number.isFinite(amount) && amount > max) max = amount;
      }
    }
  };

  visit(inputs);
  return max;
};

export const extractVariantGroups = (recipe: Recipe): RecipeVariantGroup[] => {
  if (!recipe.additionalData || typeof recipe.additionalData !== 'object') {
    return [];
  }
  const variantGroups = (recipe.additionalData as Record<string, unknown>).variantGroups;
  return Array.isArray(variantGroups) ? (variantGroups as RecipeVariantGroup[]) : [];
};

export const recipeMatchesTextQuery = (recipe: Recipe, normalizedQuery: string): boolean => {
  if (!normalizedQuery) return true;
  if ((recipe.recipeType || '').toLowerCase().includes(normalizedQuery)) {
    return true;
  }
  for (const output of recipe.outputs || []) {
    if ((output.itemId || '').toLowerCase().includes(normalizedQuery)) {
      return true;
    }
  }
  for (const row of recipe.inputs || []) {
    for (const cell of row || []) {
      if (!Array.isArray(cell)) continue;
      for (const candidate of cell) {
        if ((candidate.itemId || '').toLowerCase().includes(normalizedQuery)) {
          return true;
        }
      }
    }
  }
  return false;
};

const resolveMachineIcon = (recipe: Recipe, getImagePath: (itemId: string) => string): string | null => {
  if (recipe.machineInfo?.machineIcon) {
    const icon = recipe.machineInfo.machineIcon;
    if (icon.renderAssetRef) {
      const renderAssetUrl = getImageUrlFromRenderAssetRef(icon.renderAssetRef);
      if (renderAssetUrl) return renderAssetUrl;
    }
    return icon.itemId
      ? getImagePath(icon.itemId)
      : icon.imageFileName
        ? getImageUrlFromFileName(icon.imageFileName)
        : null;
  }

  if (recipe.recipeTypeData?.machineIcon) {
    const icon = recipe.recipeTypeData.machineIcon;
    if (icon.renderAssetRef) {
      const renderAssetUrl = getImageUrlFromRenderAssetRef(icon.renderAssetRef);
      if (renderAssetUrl) return renderAssetUrl;
    }
    return icon.itemId
      ? getImagePath(icon.itemId)
      : icon.imageFileName
        ? getImageUrlFromFileName(icon.imageFileName)
        : null;
  }

  return null;
};

const getMachineKey = (machineName: string, voltageTier?: string | null): string | null => {
  const normalized = normalizeMachineCategoryName(machineName);
  if (!normalized) return null;
  return `${normalized}::${voltageTier ?? ''}`;
};

const getMachineIconPathFromSummary = (
  group: indexedMachineGroupSummary,
  getImagePath: (itemId: string) => string,
): string | null => {
  const machineIcon = group.machineIcon;
  if (machineIcon?.renderAssetRef) {
    const renderAssetUrl = getImageUrlFromRenderAssetRef(machineIcon.renderAssetRef);
    if (renderAssetUrl) return renderAssetUrl;
  }
  if (machineIcon?.itemId) {
    return getImagePath(machineIcon.itemId);
  }
  if (machineIcon?.imageFileName) {
    return getImageUrlFromFileName(machineIcon.imageFileName);
  }
  return resolveFallbackMachineIconByName(group.machineType, getImagePath);
};

export const buildMachineCategories = (
  recipes: Recipe[],
  getImagePath: (itemId: string) => string,
): MachineCategory[] => {
  const categories = new Map<string, MachineCategory>();

  for (const recipe of recipes) {
    const explicitMachineName = getExplicitMachineName(recipe);
    const profile = resolveRecipePresentationProfile({
      machineType: recipe.machineInfo?.machineType,
      recipeType: recipe.recipeType,
      recipeTypeData: recipe.recipeTypeData,
      inputs: recipe.inputs,
      additionalData: recipe.additionalData as Record<string, unknown> | undefined,
      metadata: recipe.metadata as Record<string, unknown> | undefined,
      preferDetailedCrafting: true,
    });
    const isCrafting = profile.uiConfig.presentation?.surface === 'workbench';
    const categoryName = isCrafting
      ? getCraftingCategoryName(recipe)
      : normalizeMachineCategoryName(explicitMachineName || getMachineName(recipe.recipeType));

    if (!categories.has(categoryName)) {
      const voltageTier = recipe.machineInfo?.parsedVoltageTier ?? null;
      const machineKey = isCrafting ? null : getMachineKey(explicitMachineName || getMachineName(recipe.recipeType), voltageTier);
      categories.set(categoryName, {
        type: isCrafting ? 'crafting' : 'machine',
        name: categoryName,
        categoryKey: isCrafting
          ? `crafting:${categoryName.trim().toLowerCase()}`
          : `machine:${machineKey ?? `${categoryName}::${voltageTier ?? ''}`}`,
        recipeType: recipe.recipeType,
        machineIcon: getCategoryMachineIcon(recipe, getImagePath),
        recipes: [],
        recipeVariants: new Map(),
        recipeCount: 0,
        machineKey,
        voltageTier,
      });
    }

    categories.get(categoryName)!.recipes.push(recipe);
  }

  const ranked = Array.from(categories.values()).map((category) => {
    const signatureGroups = new Map<string, Recipe[]>();
    for (const recipe of category.recipes) {
      if (isExtremeMachineText(category.name)) {
        const key = `extreme:${getOutputSignature(recipe)}`;
        const existing = signatureGroups.get(key);
        if (!existing || existing.length === 0) {
          signatureGroups.set(key, [recipe]);
        } else if (getExtremeRecipePreference(recipe) > getExtremeRecipePreference(existing[0])) {
          signatureGroups.set(key, [recipe]);
        }
        continue;
      }

      const signature = generateCircuitRecipeSignature(recipe);
      const key = signature ?? `normal:${recipe.recipeId}`;
      if (!signatureGroups.has(key)) {
        signatureGroups.set(key, []);
      }
      signatureGroups.get(key)!.push(recipe);
    }

    const sortedSignatureEntries = Array.from(signatureGroups.entries());
    if (sortedSignatureEntries.some(([, group]) => isThaumcraftItemAspectRecipe(group[0]))) {
      sortedSignatureEntries.sort((a, b) => {
        const recipeA = a[1][0];
        const recipeB = b[1][0];
        const amountDelta = getMaxItemAspectAmount(recipeB) - getMaxItemAspectAmount(recipeA);
        if (amountDelta !== 0) return amountDelta;
        return recipeA.recipeId.localeCompare(recipeB.recipeId);
      });
    }
    const sortedRecipeVariants = new Map(sortedSignatureEntries);
    const dedupedRecipes = sortedSignatureEntries.map(([, group]) => group[0]);
    return {
      ...category,
      recipeVariants: sortedRecipeVariants,
      recipes: dedupedRecipes,
      recipeCount: dedupedRecipes.length,
    };
  });

  const getCategoryPriority = (category: MachineCategory): number => {
    const recipe = category.recipes[0];
    if (!recipe) return 0;
    const profile = resolveRecipePresentationProfile({
      machineType: recipe.machineInfo?.machineType,
      recipeType: recipe.recipeType,
      recipeTypeData: recipe.recipeTypeData,
      inputs: recipe.inputs,
      additionalData: recipe.additionalData as Record<string, unknown> | undefined,
      metadata: recipe.metadata as Record<string, unknown> | undefined,
      preferDetailedCrafting: false,
    });

    switch (profile.uiConfig.uiType) {
      case 'thaumcraft_arcane':
      case 'thaumcraft_infusion':
      case 'botania_rune_altar':
      case 'botania_mana_pool':
      case 'botania_pure_daisy':
      case 'botania_terra_plate':
      case 'botania_elven_trade':
      case 'blood_magic_altar':
      case 'blood_alchemy_table':
        return 400;
      case 'gt_assembly_line':
      case 'gt_research_station':
        return 320;
      case 'gt_assembler':
        return 300;
      case 'gt_blast_furnace':
      case 'gt_electric_furnace':
      case 'gt_alloy_smelter':
      case 'gt_electrolyzer':
      case 'gt_molecular':
        return 280;
      case 'multiblock_blueprint':
        return 280;
      case 'gt_generic':
        return 220;
      case 'furnace':
        return 140;
      case 'standard_crafting':
        return 120;
      default:
        return 100;
    }
  };

  ranked.sort((a, b) => {
    const priorityDelta = getCategoryPriority(b) - getCategoryPriority(a);
    if (priorityDelta !== 0) return priorityDelta;
    const recipeCountDelta = b.recipes.length - a.recipes.length;
    if (recipeCountDelta !== 0) return recipeCountDelta;
    return a.name.localeCompare(b.name);
  });

  return ranked;
};

export const buildMachineCategorySkeletonsFromSummary = (
  machineGroups: indexedMachineGroupSummary[],
  getImagePath: (itemId: string) => string,
): MachineCategory[] => {
  return machineGroups.map((group) => {
    const normalizedName = normalizeMachineCategoryName(group.machineType);
    return {
      type: 'machine',
      name: normalizedName,
      recipeType: group.category || normalizedName,
      machineIcon: getMachineIconPathFromSummary(group, getImagePath),
      recipes: [],
      recipeVariants: new Map(),
      recipeCount: Math.max(0, Number(group.recipeCount ?? 0)),
      categoryKey: typeof group.machineKey === 'string' && group.machineKey.trim()
        ? `machine:${group.machineKey.trim()}`
        : `machine:${getMachineKey(normalizedName, group.voltageTier) ?? `${normalizedName}::${group.voltageTier ?? ''}`}`,
      machineKey: typeof group.machineKey === 'string' && group.machineKey.trim()
        ? group.machineKey.trim()
        : getMachineKey(normalizedName, group.voltageTier),
      voltageTier: group.voltageTier ?? null,
    };
  });
};

export const buildCategorySkeletonsFromSummary = (
  categories: indexedRecipeCategorySummary[],
  getImagePath: (itemId: string) => string,
): MachineCategory[] => {
  return categories.map((group) => ({
    type: group.type,
    name: group.name,
    categoryKey: group.categoryKey,
    recipeType: group.recipeType || group.name,
    machineIcon: getMachineIconPathFromSummary({
      machineType: group.name,
      category: group.recipeType,
      voltageTier: group.voltageTier ?? null,
      voltage: null,
      recipeCount: group.recipeCount,
      machineKey: group.machineKey ?? undefined,
      machineIcon: group.machineIcon ?? null,
    }, getImagePath),
    recipes: [],
    recipeVariants: new Map(),
    recipeCount: Math.max(0, Number(group.recipeCount ?? 0)),
    machineKey: group.machineKey ?? null,
    voltageTier: group.voltageTier ?? null,
  }));
};

export const applySelectedVariants = (
  recipe: Recipe,
  getSelectedVariant: (recipeId: string, slotKey: string) => number,
): Recipe => {
  const variantGroups = extractVariantGroups(recipe);
  if (variantGroups.length === 0) {
    return recipe;
  }

  const nextInputs = recipe.inputs.map((row) => row.slice());
  let changed = false;
  for (const group of variantGroups) {
    const selectedIndex = getSelectedVariant(recipe.recipeId, group.slotKey);
    if (selectedIndex <= 0) continue;
    const targetRow = nextInputs[group.row];
    if (!targetRow) continue;
    const sourceOptions = getCellCandidates(targetRow[group.col]);
    const selectedFromCell = selectedIndex < sourceOptions.length ? sourceOptions[selectedIndex] : null;
    const selected = selectedFromCell || group.options[selectedIndex] || null;
    if (!selected) continue;
    const mergedOptions = [selected, ...sourceOptions.filter((entry) => entry.itemId !== selected.itemId)];
    targetRow[group.col] = mergedOptions;
    changed = true;
  }

  return changed ? { ...recipe, inputs: nextInputs } : recipe;
};
