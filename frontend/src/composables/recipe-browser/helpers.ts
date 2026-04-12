import { getImageUrlFromFileName, getImageUrlFromRenderAssetRef, type Recipe, type RecipeItem, type RecipeVariantGroup } from '../../services/api';
import { resolveRecipePresentationProfile } from '../../services/uiTypeMapping';

export interface MachineCategory {
  type: 'crafting' | 'machine';
  name: string;
  recipeType: string;
  machineIcon: string | null;
  recipes: Recipe[];
  recipeVariants: Map<string, Recipe[]>;
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
    case 'blood_magic_altar':
      return getImagePath('i~AWWayofTime~Altar~0');
    case 'botania_mana_pool':
      return getImagePath('i~Botania~pool~0');
    case 'botania_rune_altar':
      return getImagePath('i~Botania~runeAltar~0');
    case 'botania_pure_daisy':
      return getImagePath('i~Botania~specialFlower~0~BVmnjzvOML-Ap_zxeMIMOw==');
    default:
      break;
  }

  const resolved = resolveMachineIcon(recipe, getImagePath);
  if (resolved) return resolved;

  const combined = getCombinedRecipeText(recipe);
  if (
    combined.includes('singularity compressor') ||
    combined.includes('奇点压缩机')
  ) {
    return getImagePath('i~Avaritia~Singularity~0');
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

const normalizeMachineCategoryName = (name: string): string => {
  return isExtremeMachineText(name) ? '无尽工作台' : name;
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
      categories.set(categoryName, {
        type: isCrafting ? 'crafting' : 'machine',
        name: categoryName,
        recipeType: recipe.recipeType,
        machineIcon: getCategoryMachineIcon(recipe, getImagePath),
        recipes: [],
        recipeVariants: new Map(),
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

    const dedupedRecipes = Array.from(signatureGroups.values()).map((group) => group[0]);
    return { ...category, recipeVariants: signatureGroups, recipes: dedupedRecipes };
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
