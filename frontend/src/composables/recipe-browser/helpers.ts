import {
  getImageUrlFromFileName,
  getImageUrlFromRenderAssetRef,
  type Recipe,
  type RecipeItem,
  type RecipeVariantGroup,
  type indexedRecipeCategorySummary,
  type indexedMachineGroupSummary,
} from '../../services/api';
import { resolveMachineIconByName } from './machineIconPolicyCatalog';

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

const MACHINE_CATEGORY_ALIAS_GROUPS: string[][] = [
  ['工业屠宰场', 'Extreme Entity Crusher', 'Infernal Drops'],
  ['熔炉', 'Furnace', '烧制', '燃料', 'Smelting', 'Fuel'],
  ['有序合成', 'Crafting (Shaped)'],
  ['无序合成', 'Crafting (Shapeless)'],
  ['Terra Plate', '泰拉凝聚板'],
  ['Rune Altar', '符文祭坛'],
  ['Mana Pool', '魔力池'],
  ['Pure Daisy', '白雏菊'],
  ['Binding Ritual', '绑定仪式'],
  ['Blood Altar', '血之祭坛', '血祭坛'],
  ['Alchemy Array', '炼金阵', '炼金法阵'],
  ['Alchemy Table', '炼金台'],
  ['Arcane Infusion', '奥术注魔'],
  ['Arcane Worktable', '奥术工作台', '奥术合成'],
  ['Crucible', '坩埚'],
  ['真空冷冻机', '凛冰冷冻机'],
  ['电解机', '工业电解机'],
  ['离心机', '工业离心机'],
  ['高炉', '工业高炉'],
  ['搅拌机', '工业搅拌机'],
];

const GT_RECIPE_NAME_BY_KEY: Record<string, string> = {
  implosioncompressor: '聚爆压缩机',
  electricimplosioncompressor: '电动聚爆压缩机',
  laserengraver: '激光蚀刻机',
  compressor: '压缩机',
  bender: '压模机',
  alloysmelter: '合金炉',
  centrifuge: '离心机',
  electrolyzer: '电解机',
  blastfurnace: '高炉',
  electricblastfurnace: '电力高炉',
  arcfurnace: '电弧炉',
  assembler: '组装机',
  assemblyline: '装配线',
  fluidsolidifier: '流体固化机',
  chemicalreactor: '化学反应釜',
  largechemicalreactor: '大型化学反应釜',
  macerator: '粉碎机',
  extractor: '提取机',
  extruder: '挤压机',
  lathe: '车床',
  mixer: '搅拌机',
  autoclave: '高压釜',
  distillery: '蒸馏室',
  distillationtower: '蒸馏塔',
  vacuumfreezer: '真空冷冻机',
};
const WELL_KNOWN_RECIPE_NAME_BY_ID: Array<[RegExp, string]> = [
  [/codechicken_nei_recipe_shapedrecipehandler|crafting~shaped/i, '有序合成'],
  [/codechicken_nei_recipe_shapelessrecipehandler|crafting~shapeless/i, '无序合成'],
  [/minecraft~smelting|furnace|smelting/i, '熔炉'],
  [/botania.*manapool|botania~mana_pool/i, '魔力池'],
  [/mana pool/i, '魔力池'],
  [/botania.*runic|rune/i, '符文祭坛'],
  [/botania.*elven|elven/i, '精灵交易'],
  [/botania.*lexica/i, '植物魔法辞典'],
  [/thaumcraft.*crucible|crucible/i, '坩埚'],
  [/crucible/i, '坩埚'],
  [/thaumcraft.*infusion|infusion/i, '奥术注魔'],
  [/thaumcraft.*arcane|arcane/i, '奥术合成'],
];

const stripRecipeDisplayDecorations = (value: string): string => {
  return value
    .replace(/^\s*[A-Za-z0-9_ -]+\s+-\s+/, '')
    .replace(/\s*\((ULV|LV|MV|HV|EV|IV|LuV|ZPM|UV|UHV|UEV|UIV|UMV|UXV|MAX)\)\s*$/i, '')
    .trim();
};

const humanizeRecipeCategoryName = (raw: string): string => {
  const value = `${raw ?? ''}`.trim();
  if (!value) return value;

  const gtMatch = value.match(/gt\.recipe\.([a-z0-9_]+)(?:~|$)/i);
  if (gtMatch) {
    const key = gtMatch[1].toLowerCase().replace(/_/g, '');
    return GT_RECIPE_NAME_BY_KEY[key] ?? stripRecipeDisplayDecorations(value);
  }

  for (const [pattern, label] of WELL_KNOWN_RECIPE_NAME_BY_ID) {
    if (pattern.test(value)) return label;
  }

  const stripped = stripRecipeDisplayDecorations(value);
  if (/^rt~/i.test(stripped)) {
    return value;
  }
  if (/crafting \(shaped\)/i.test(stripped)) return '有序合成';
  if (/crafting \(shapeless\)/i.test(stripped)) return '无序合成';
  if (/mana pool/i.test(stripped)) return '魔力池';
  if (/furnace|smelting/i.test(stripped)) return '熔炉';
  return stripped || value;
};

export const normalizeMachineFamilyName = (name: string): string => {
  const normalized = humanizeRecipeCategoryName(`${name ?? ''}`.trim());
  if (!normalized) return normalized;
  if (/mana\s*pool/i.test(normalized)) return '魔力池';
  if (/crucible/i.test(normalized)) return '坩埚';

  if (/extreme entity crusher|industrial slaughterhouse/i.test(normalized) || normalized.includes('工业屠宰场')) {
    return '工业屠宰场';
  }
  if (isExtremeMachineText(normalized)) {
    return '无尽工作台';
  }

  const withoutTier = normalized.replace(/\s*\((ULV|LV|MV|HV|EV|IV|LuV|ZPM|UV|UHV|UEV|UIV|UMV|UXV|MAX)\)\s*$/i, '').trim();
  const aliasGroup = MACHINE_CATEGORY_ALIAS_GROUPS.find((aliases) => aliases.includes(withoutTier));
  return aliasGroup?.[0] ?? withoutTier;
};

export const buildCanonicalMachineKey = (
  entry: {
    machineKey?: string | null;
    categoryKey?: string | null;
    name?: string | null;
    voltageTier?: string | null;
  },
): string => {
  const rawMachineKey = `${entry.machineKey ?? ''}`.trim();
  if (rawMachineKey) {
    const [machineType, ...rest] = rawMachineKey.split('::');
    const normalizedMachineType = normalizeMachineFamilyName(machineType);
    if (!rest.length) {
      return normalizedMachineType;
    }
    return `${normalizedMachineType}::${rest.join('::')}`;
  }

  const rawCategoryKey = `${entry.categoryKey ?? ''}`.trim();
  if (rawCategoryKey.startsWith('machine:')) {
    return buildCanonicalMachineKey({
      machineKey: rawCategoryKey.slice('machine:'.length),
      voltageTier: entry.voltageTier ?? null,
    });
  }

  const normalizedMachineType = normalizeMachineFamilyName(`${entry.name ?? ''}`);
  if (!normalizedMachineType) {
    return '';
  }

  return `${normalizedMachineType}::${entry.voltageTier ?? ''}`;
};

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
  const resolved = resolveMachineIcon(recipe, getImagePath);
  if (resolved) return resolved;
  return resolveMachineIconByName(getExplicitMachineName(recipe) || '', getImagePath);
};

const getKnownCategoryIcon = (name: string, getImagePath: (itemId: string) => string): string | null => {
  const normalized = humanizeRecipeCategoryName(name).toLowerCase();
  if (normalized.includes('魔力池')) return getImagePath('i~Botania~pool~0');
  if (normalized.includes('植物魔法辞典')) return getImagePath('i~Botania~lexicon~0');
  if (normalized.includes('坩埚')) return getImagePath('i~Thaumcraft~blockMetalDevice~0');
  if (normalized.includes('奥术')) return getImagePath('i~Thaumcraft~blockTable~15');
  if (normalized.includes('有序合成') || normalized.includes('无序合成') || normalized.includes('crafting')) {
    return getImagePath('i~minecraft~crafting_table~0');
  }
  if (normalized.includes('熔炉')) return getImagePath('i~minecraft~furnace~0');
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
  const thaumcraftHandler = [
    recipe.additionalData?.handler,
    recipe.additionalData?.handlerClass,
    recipe.additionalData?.handlerId,
  ].map((value) => `${value ?? ''}`.trim().toLowerCase()).join(' ');
  if (recipe.additionalData?.specialRecipeType === 'NEI_Thaumcraft') {
    if (
      recipe.additionalData?.thaumcraftLayout === 'crucible' ||
      thaumcraftHandler.includes('crucible') ||
      thaumcraftHandler.includes('tcnacruciblerecipehandler')
    ) {
      return '\u5769\u57da';
    }
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
    const normalized = machineType.trim();
    if (/extreme entity crusher|industrial slaughterhouse/i.test(normalized)) {
      return '工业屠宰场';
    }
    return normalized;
  }

  const additionalMachineType = recipe.additionalData?.machineInfo?.machineType;
  if (typeof additionalMachineType === 'string' && additionalMachineType.trim()) {
    const normalized = additionalMachineType.trim();
    if (/extreme entity crusher|industrial slaughterhouse/i.test(normalized)) {
      return '工业屠宰场';
    }
    return normalized;
  }

  const recipeTypeMachine = recipe.recipeTypeData?.machineType;
  if (typeof recipeTypeMachine === 'string' && recipeTypeMachine.trim()) {
    const normalized = recipeTypeMachine.trim();
    if (/extreme entity crusher|industrial slaughterhouse/i.test(normalized)) {
      return '工业屠宰场';
    }
    return normalized;
  }

  return null;
};

export const isExtremeMachineText = (text: string): boolean => {
  const source = `${text ?? ''}`;
  const lower = source.toLowerCase();
  if (
    lower.includes('extreme entity crusher')
    || lower.includes('industrial slaughterhouse')
    || lower.includes('eec')
    || source.includes('工业屠宰场')
    || source.includes('实体处理')
  ) {
    return false;
  }
  return (
    lower.includes('extreme crafting') ||
    lower.includes('dire crafting') ||
    lower.includes('avaritia') ||
    lower.includes('dire') ||
    source.includes('无尽工作台') ||
    source.includes('终极合成')
  );
};

const normalizeMachineCategoryName = (name: string): string => {
  return normalizeMachineFamilyName(name);
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
  const normalized = normalizeMachineFamilyName(machineName);
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
  return resolveMachineIconByName(group.machineType, getImagePath);
};

export const buildMachineCategories = (
  recipes: Recipe[],
  getImagePath: (itemId: string) => string,
): MachineCategory[] => {
  const categories = new Map<string, MachineCategory>();

  for (const recipe of recipes) {
    const explicitMachineName = getExplicitMachineName(recipe);
    const isCrafting = !explicitMachineName;
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

  const getCategoryPriority = (category: MachineCategory): number => (
    category.type === 'crafting' ? 120 : 100
  );

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
    const canonicalMachineKey = buildCanonicalMachineKey({
      machineKey: typeof group.machineKey === 'string' ? group.machineKey : null,
      name: normalizedName,
      voltageTier: group.voltageTier ?? null,
    }) || getMachineKey(normalizedName, group.voltageTier);
    return {
      type: 'machine',
      name: normalizedName,
      recipeType: group.category || normalizedName,
      machineIcon: getMachineIconPathFromSummary(group, getImagePath),
      recipes: [],
      recipeVariants: new Map(),
      recipeCount: Math.max(0, Number(group.recipeCount ?? 0)),
      categoryKey: `machine:${canonicalMachineKey ?? `${normalizedName}::${group.voltageTier ?? ''}`}`,
      machineKey: canonicalMachineKey,
      voltageTier: group.voltageTier ?? null,
    };
  });
};

export const buildCategorySkeletonsFromSummary = (
  categories: indexedRecipeCategorySummary[],
  getImagePath: (itemId: string) => string,
): MachineCategory[] => {
  return categories.map((group) => {
    const normalizedName = normalizeMachineCategoryName(group.name);
    const rawCategoryKey = `${group.categoryKey ?? ''}`.trim();
    const rawMachineKey = `${group.machineKey ?? ''}`.trim();
    const canonicalMachineKey = group.type === 'machine'
      ? (rawMachineKey || rawCategoryKey || buildCanonicalMachineKey({
          machineKey: null,
          categoryKey: rawCategoryKey,
          name: normalizedName,
          voltageTier: group.voltageTier ?? null,
        }) || getMachineKey(normalizedName, group.voltageTier ?? null))
      : null;
    const categoryKey = rawCategoryKey || (group.type === 'machine'
      ? `machine:${canonicalMachineKey ?? `${normalizedName}::${group.voltageTier ?? ''}`}`
      : normalizedName);
    return ({
    type: group.type,
    name: normalizedName,
    categoryKey,
    recipeType: group.recipeType || normalizedName,
    machineIcon: getMachineIconPathFromSummary({
      machineType: normalizedName,
      category: group.recipeType,
      voltageTier: group.voltageTier ?? null,
      voltage: null,
      recipeCount: group.recipeCount,
      machineKey: group.machineKey ?? undefined,
      machineIcon: group.machineIcon ?? null,
    }, getImagePath) ?? getKnownCategoryIcon(normalizedName, getImagePath),
    recipes: [],
    recipeVariants: new Map(),
    recipeCount: Math.max(0, Number(group.recipeCount ?? 0)),
    machineKey: canonicalMachineKey,
    voltageTier: group.voltageTier ?? null,
  });
  });
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
