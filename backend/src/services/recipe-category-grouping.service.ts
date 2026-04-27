import { getMachineIconItem } from './machine-icon-mapping.service';

type NullableString = string | null | undefined;

type RecipeMachineIcon = {
  itemId: string;
  modId: string;
  internalName: string;
  localizedName: string;
  renderAssetRef?: string | null;
  imageFileName: string;
};

export type RecipeLike = {
  recipeType?: string | null;
  recipeTypeData?: {
    id?: string | null;
    type?: string | null;
    category?: string | null;
    machineType?: string | null;
    machineIcon?: RecipeMachineIcon | null;
  } | null;
  machineInfo?: {
    machineType?: string | null;
    parsedVoltageTier?: string | null;
    machineIcon?: RecipeMachineIcon | null;
  } | null;
  additionalData?: Record<string, unknown> | null;
};

export interface RecipeCategorySummary {
  type: 'crafting' | 'machine';
  name: string;
  recipeType: string;
  recipeCount: number;
  categoryKey: string;
  machineKey?: string | null;
  voltageTier?: string | null;
  machineIcon?: RecipeMachineIcon | null;
}

const GT_MACHINE_CATEGORY_ALIAS_GROUPS: string[][] = [
  ['真空冷冻机', '凛冰冷冻机'],
  ['电解机', '工业电解机'],
  ['离心机', '工业离心机'],
  ['化学反应釜', '大型化学反应釜'],
  ['高炉', '工业高炉'],
  ['搅拌机', '工业搅拌机'],
];

const SPECIAL_MACHINE_ICONS: Array<{ patterns: string[]; itemId: string }> = [
  { patterns: ['rune altar', '符文祭坛'], itemId: 'i~Botania~runeAltar~0' },
  { patterns: ['mana pool', '魔力池'], itemId: 'i~Botania~pool~0' },
  { patterns: ['pure daisy', '白雏菊'], itemId: 'i~Botania~specialFlower~0~BVmnjzvOML-Ap_zxeMIMOw==' },
  { patterns: ['terra plate', '泰拉凝聚板'], itemId: 'i~Botania~terraPlate~0' },
  { patterns: ['arcane infusion', '奥术注魔'], itemId: 'i~Thaumcraft~blockStoneDevice~2' },
  { patterns: ['arcane worktable', '奥术工作台', '有序奥术合成'], itemId: 'i~Thaumcraft~blockTable~15' },
  { patterns: ['crucible', '坩埚'], itemId: 'i~Thaumcraft~blockMetalDevice~0' },
  { patterns: ['blood altar', '血祭坛', '血之祭坛'], itemId: 'i~AWWayofTime~Altar~0' },
  { patterns: ['alchemy array'], itemId: 'i~AWWayofTime~ritualStone~0' },
  { patterns: ['binding ritual', '绑定仪式'], itemId: 'i~AWWayofTime~ritualStone~0' },
];

function normalizeText(value: NullableString): string {
  return `${value ?? ''}`.trim();
}

function lowerText(value: NullableString): string {
  return normalizeText(value).toLowerCase();
}

function getUiFamilyKey(recipe: RecipeLike): string {
  const additionalData = recipe.additionalData && typeof recipe.additionalData === 'object'
    ? recipe.additionalData
    : null;
  if (!additionalData) return '';
  if (typeof additionalData.uiFamilyKey === 'string') {
    return additionalData.uiFamilyKey.trim();
  }
  const uiPayload =
    additionalData.uiPayload && typeof additionalData.uiPayload === 'object'
      ? additionalData.uiPayload as Record<string, unknown>
      : null;
  return typeof uiPayload?.familyKey === 'string' ? uiPayload.familyKey.trim() : '';
}

function getExplicitMachineName(recipe: RecipeLike): string | null {
  const thaumcraftLayout = normalizeText(recipe.additionalData?.thaumcraftLayout as string | undefined).toLowerCase();
  const specialRecipeType = normalizeText(recipe.additionalData?.specialRecipeType as string | undefined).toLowerCase();
  if (specialRecipeType === 'nei_thaumcraft') {
    if (thaumcraftLayout === 'infusion') return '奥术注魔';
    if (thaumcraftLayout === 'arcane') return normalizeText(recipe.machineInfo?.machineType) || '有序奥术合成';
  }

  return normalizeText(recipe.machineInfo?.machineType)
    || normalizeText(recipe.recipeTypeData?.machineType)
    || null;
}

function getCombinedRecipeText(recipe: RecipeLike): string {
  return [
    recipe.recipeType ?? '',
    recipe.recipeTypeData?.id ?? '',
    recipe.recipeTypeData?.type ?? '',
    recipe.recipeTypeData?.category ?? '',
    recipe.recipeTypeData?.machineType ?? '',
    getExplicitMachineName(recipe) ?? '',
    getUiFamilyKey(recipe),
  ]
    .join(' ')
    .toLowerCase();
}

function isExtremeMachineText(text: string): boolean {
  const lower = text.toLowerCase();
  return lower.includes('extreme crafting')
    || lower.includes('dire crafting')
    || lower.includes('extreme')
    || lower.includes('dire')
    || text.includes('终极合成')
    || text.includes('无尽');
}

function normalizeMachineCategoryName(name: string): string {
  if (isExtremeMachineText(name)) {
    return '无尽工作台';
  }

  const normalized = normalizeText(name);
  if (!normalized) return normalized;

  const withoutTier = normalized.replace(/\s*\((ULV|LV|MV|HV|EV|IV|LuV|ZPM|UV|UHV|UEV|UIV|UMV|UXV|MAX)\)\s*$/i, '').trim();
  const aliasGroup = GT_MACHINE_CATEGORY_ALIAS_GROUPS.find((aliases) => aliases.includes(withoutTier));
  return aliasGroup?.[0] ?? withoutTier;
}

function isGenericCraftingLabel(name: string): boolean {
  const normalized = name.trim().toLowerCase();
  return normalized === 'crafting'
    || normalized === 'crafting table'
    || normalized === 'crafting (shaped)'
    || normalized === 'crafting (shapeless)'
    || normalized === 'workbench'
    || normalized === 'minecraft:crafting'
    || normalized === '有序合成'
    || normalized === '无序合成'
    || normalized === '无需合成';
}

function getMachineName(recipeType: string): string {
  const normalized = normalizeText(recipeType);
  const match = normalized.match(/gregtech\s*-\s*(.+?)\s*\(/i);
  if (match) {
    return normalizeText(match[1]);
  }

  const lower = normalized.toLowerCase();
  if (lower === 'minecraft:crafting') return 'Crafting Table';
  if (lower === 'minecraft:smelting') return 'Furnace';
  if (lower === 'minecraft:blasting') return 'Blast Furnace';
  if (lower === 'minecraft:smoking') return 'Smoker';
  if (lower === 'minecraft:campfire') return 'Campfire';
  return normalized;
}

function getCraftingCategoryName(recipe: RecipeLike): string {
  const explicitMachineName = getExplicitMachineName(recipe);
  if (explicitMachineName && !isGenericCraftingLabel(explicitMachineName)) {
    return normalizeMachineCategoryName(explicitMachineName);
  }

  const combined = getCombinedRecipeText(recipe);
  if (combined.includes('singularity compressor') || combined.includes('奇点压缩机')) {
    return explicitMachineName || '奇点压缩机';
  }

  if (combined.includes('no crafting') || combined.includes('无需合成') || combined.includes('no recipe')) {
    return '无需合成';
  }

  if (combined.includes('shapeless') || combined.includes('无序合成')) {
    return '无序合成';
  }

  if (combined.includes('shaped') || combined.includes('有序合成')) {
    return '有序合成';
  }

  if (combined.includes('smelting') || combined.includes('furnace') || combined.includes('烧制') || combined.includes('燃料')) {
    return 'Furnace';
  }

  return 'Crafting Table';
}

function shouldTreatAsCrafting(recipe: RecipeLike): boolean {
  const uiFamilyKey = getUiFamilyKey(recipe);
  if (uiFamilyKey) {
    return false;
  }

  const explicitMachineName = getExplicitMachineName(recipe);
  if (explicitMachineName && !isGenericCraftingLabel(explicitMachineName) && !isExtremeMachineText(explicitMachineName)) {
    return false;
  }

  const combined = getCombinedRecipeText(recipe);
  if (
    combined.includes('arcane') ||
    combined.includes('infusion') ||
    combined.includes('terra plate') ||
    combined.includes('rune altar') ||
    combined.includes('mana pool') ||
    combined.includes('blood altar') ||
    combined.includes('alchemy array') ||
    combined.includes('pure daisy') ||
    combined.includes('研究站') ||
    combined.includes('assembly line')
  ) {
    return false;
  }

  if (combined.includes('smelting') || combined.includes('furnace') || combined.includes('crafting') || combined.includes('shaped') || combined.includes('shapeless')) {
    return true;
  }

  return !explicitMachineName;
}

function getCraftingIcon(categoryName: string): RecipeMachineIcon | null {
  const normalized = lowerText(categoryName);
  if (!normalized) return null;
  if (normalized.includes('furnace') || normalized.includes('烧制') || normalized.includes('燃料')) {
    return {
      itemId: 'i~minecraft~furnace~0',
      modId: 'minecraft',
      internalName: 'furnace',
      localizedName: 'Furnace',
      imageFileName: 'minecraft/furnace~0.png',
    };
  }
  if (normalized.includes('奇点压缩机') || normalized.includes('singularity compressor')) {
    return {
      itemId: 'i~Avaritia~Singularity~0',
      modId: 'Avaritia',
      internalName: 'Singularity',
      localizedName: '奇点压缩机',
      imageFileName: 'Avaritia/Singularity~0.png',
    };
  }
  return {
    itemId: 'i~minecraft~crafting_table~0',
    modId: 'minecraft',
    internalName: 'crafting_table',
    localizedName: 'Crafting Table',
    imageFileName: 'minecraft/crafting_table~0.png',
  };
}

function buildIconFromItemId(itemId: string, localizedName: string): RecipeMachineIcon | null {
  const parts = itemId.split('~');
  if (parts.length < 4 || parts[0] !== 'i') return null;
  const [, modId, internalName, damage] = parts;
  return {
    itemId,
    modId,
    internalName,
    localizedName,
    imageFileName: `${modId}/${internalName}~${damage}.png`,
  };
}

function getSpecialMachineIcon(machineName: string): RecipeMachineIcon | null {
  const normalized = lowerText(machineName);
  if (!normalized) return null;
  const match = SPECIAL_MACHINE_ICONS.find((entry) => entry.patterns.some((pattern) => normalized.includes(pattern.toLowerCase())));
  if (!match) return null;
  return buildIconFromItemId(match.itemId, machineName);
}

function resolveMachineIcon(recipe: RecipeLike, categoryName: string, isCrafting: boolean): RecipeMachineIcon | null {
  if (isCrafting) {
    return getCraftingIcon(categoryName);
  }

  const machineInfoIcon = recipe.machineInfo?.machineIcon;
  if (machineInfoIcon?.itemId) {
    return machineInfoIcon;
  }

  const recipeTypeIcon = recipe.recipeTypeData?.machineIcon;
  if (recipeTypeIcon?.itemId) {
    return recipeTypeIcon;
  }

  const special = getSpecialMachineIcon(categoryName);
  if (special) return special;

  const explicitMachineName = getExplicitMachineName(recipe);
  return explicitMachineName ? getMachineIconItem(explicitMachineName) ?? null : null;
}

export function describeRecipeCategory(recipe: RecipeLike): RecipeCategorySummary {
  const recipeType = normalizeText(recipe.recipeType) || 'unknown';
  const explicitMachineName = getExplicitMachineName(recipe);
  const voltageTier = normalizeText(recipe.machineInfo?.parsedVoltageTier) || null;
  const isCrafting = shouldTreatAsCrafting(recipe);
  const name = isCrafting
    ? getCraftingCategoryName(recipe)
    : normalizeMachineCategoryName(explicitMachineName || getMachineName(recipeType));
  const machineKey = isCrafting ? null : `${name}::${voltageTier ?? ''}`;

  return {
    type: isCrafting ? 'crafting' : 'machine',
    name,
    recipeType,
    recipeCount: 1,
    categoryKey: isCrafting ? `crafting:${name.trim().toLowerCase()}` : `machine:${machineKey}`,
    machineKey,
    voltageTier,
    machineIcon: resolveMachineIcon(recipe, name, isCrafting),
  };
}

export function buildRecipeCategorySummaries(recipes: RecipeLike[]): RecipeCategorySummary[] {
  const groups = new Map<string, RecipeCategorySummary>();
  for (const recipe of recipes) {
    const descriptor = describeRecipeCategory(recipe);
    const existing = groups.get(descriptor.categoryKey);
    if (existing) {
      existing.recipeCount += 1;
      continue;
    }
    groups.set(descriptor.categoryKey, { ...descriptor });
  }
  return Array.from(groups.values());
}
