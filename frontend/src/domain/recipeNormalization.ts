import type { Recipe, RecipeVariantGroup, indexedRecipe } from '../services/api';

type ItemInputDimension = { width?: number; height?: number } | undefined;

type IndexedLikeCell = {
  itemId?: unknown;
  count?: unknown;
  stackSize?: unknown;
  probability?: unknown;
  item?: { itemId?: unknown };
  items?: Array<{ item?: { itemId?: unknown }; stackSize?: unknown; probability?: unknown }>;
  slotIndex?: unknown;
  isOreDictionary?: unknown;
  oreDictName?: unknown;
};

const isExtremeMachineText = (value: string): boolean => {
  const lower = value.toLowerCase();
  return (
    lower.includes('extreme crafting') ||
    lower.includes('dire crafting') ||
    lower.includes('extreme') ||
    lower.includes('dire') ||
    value.includes('终极合成') ||
    value.includes('无尽') ||
    value.includes('贪婪') ||
    value.includes('缁堟瀬鍚堟垚') ||
    value.includes('鏃犲敖')
  );
};

const toRecipeCell = (cell: unknown): Recipe['inputs'][number][number] => {
  if (!cell || typeof cell !== 'object') return null;

  if (Array.isArray(cell)) {
    const alternatives = cell
      .map((it) => {
        if (!it || typeof it !== 'object') return null;
        const candidate = it as { itemId?: unknown; count?: unknown; stackSize?: unknown; item?: { itemId?: unknown } };
        if (typeof candidate.itemId === 'string' && candidate.itemId.length > 0) {
          return { itemId: candidate.itemId, count: Number(candidate.count ?? candidate.stackSize) || 1 };
        }
        const nestedItemId = candidate.item?.itemId;
        if (typeof nestedItemId === 'string' && nestedItemId.length > 0) {
          return { itemId: nestedItemId, count: Number(candidate.count ?? candidate.stackSize) || 1 };
        }
        return null;
      })
      .filter((it): it is { itemId: string; count: number } => it !== null);
    return alternatives.length ? (alternatives as unknown as Recipe['inputs'][number][number]) : null;
  }

  const group = cell as IndexedLikeCell;

  if (typeof group.itemId === 'string' && group.itemId.length > 0) {
    return [{ itemId: group.itemId, count: Number(group.count ?? group.stackSize) || 1 }] as unknown as Recipe['inputs'][number][number];
  }
  if (group.item && typeof group.item.itemId === 'string' && group.item.itemId.length > 0) {
    return [{ itemId: group.item.itemId, count: Number(group.count ?? group.stackSize) || 1 }] as unknown as Recipe['inputs'][number][number];
  }
  if (Array.isArray(group.items)) {
    const alternatives = group.items
      .map((it) => {
        const itemId = it?.item?.itemId;
        if (typeof itemId !== 'string' || itemId.length === 0) return null;
        return { itemId, count: Number(it.stackSize) || 1 };
      })
      .filter((it): it is { itemId: string; count: number } => it !== null);
    return alternatives.length ? (alternatives as unknown as Recipe['inputs'][number][number]) : null;
  }
  return null;
};

const normalizeRecipeInputs = (
  rawInputs: unknown,
  options: {
    itemInputDimension?: ItemInputDimension;
    recipeType?: string;
    machineType?: string;
  },
): { inputs: Recipe['inputs']; variantGroups: RecipeVariantGroup[] } => {
  if (!Array.isArray(rawInputs) || rawInputs.length === 0) {
    return { inputs: [], variantGroups: [] };
  }

  const variantGroups: RecipeVariantGroup[] = [];
  const seenVariantGroup = new Set<string>();

  const appendVariantGroup = (row: number, col: number, cell: IndexedLikeCell | null | undefined) => {
    if (!cell || typeof cell !== 'object') return;
    const items = Array.isArray(cell.items)
      ? (cell.items as Array<{ item?: { itemId?: unknown }; stackSize?: unknown }>)
      : [];
    if (items.length === 0) return;

    const options = items
      .map((it) => {
        const itemId = it?.item?.itemId;
        if (typeof itemId !== 'string' || !itemId) return null;
        return { itemId, count: Number(it.stackSize) || 1 };
      })
      .filter((it): it is { itemId: string; count: number } => it !== null);
    if (options.length <= 1) return;

    const slotKey = `${row},${col}`;
    if (seenVariantGroup.has(slotKey)) return;
    seenVariantGroup.add(slotKey);

    variantGroups.push({
      slotKey,
      row,
      col,
      isOreDictionary: Boolean(cell.isOreDictionary),
      oreDictName: typeof cell.oreDictName === 'string' ? cell.oreDictName : null,
      options,
    });
  };

  const machineTypeText = options.machineType || '';
  const typeText = typeof options.recipeType === 'string' ? options.recipeType : '';
  const combinedText = `${machineTypeText} ${typeText}`;
  const combinedLower = combinedText.toLowerCase();
  const isExtreme = isExtremeMachineText(combinedText);

  if (Array.isArray(rawInputs[0])) {
    const rows = rawInputs as Array<Array<IndexedLikeCell>>;

    if (isExtreme) {
      const hasSlotIndex = rows.some((row) =>
        row.some((cell) => typeof cell?.slotIndex === 'number' && Number.isFinite(cell.slotIndex)),
      );
      if (hasSlotIndex) {
        const grid: Recipe['inputs'] = Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => null));
        for (const row of rows) {
          for (const cell of row) {
            const slotIndex = Number(cell?.slotIndex ?? -1);
            if (!Number.isFinite(slotIndex) || slotIndex < 0 || slotIndex >= 81) continue;
            const r = Math.floor(slotIndex / 9);
            const c = slotIndex % 9;
            appendVariantGroup(r, c, cell);
            grid[r][c] = toRecipeCell(cell);
          }
        }
        return { inputs: grid, variantGroups };
      }
    }

    const mapped = rows.map((row, r) =>
      row.map((cell, c) => {
        appendVariantGroup(r, c, cell);
        return toRecipeCell(cell);
      }),
    );
    return { inputs: mapped, variantGroups };
  }

  const flat = rawInputs as Array<IndexedLikeCell>;
  const maxSlotIndex = flat.reduce((max, entry) => Math.max(max, Number(entry.slotIndex ?? -1)), -1);
  const totalSlots = Math.max(0, maxSlotIndex + 1);
  if (totalSlots === 0) return { inputs: [], variantGroups };

  const isAssemblyLineLike =
    combinedLower.includes('assembly line') ||
    combinedText.includes('装配线') ||
    combinedText.includes('部件装配线');
  const isMachineCraftingLike =
    combinedText.includes('组装机') ||
    combinedLower.includes('assembler') ||
    combinedText.includes('机床') ||
    combinedText.includes('压模') ||
    combinedLower.includes('cutting') ||
    combinedLower.includes('lathe');
  const isWorkbenchLike =
    !isMachineCraftingLike &&
    (combinedLower.includes('crafting') ||
      combinedText.includes('有序合成') ||
      combinedText.includes('无序合成') ||
      combinedText.includes('工作台') ||
      combinedLower.includes('arcane'));

  const inferWorkbenchGrid = (slots: number) => {
    const count = Math.max(1, slots);
    if (count <= 1) return { width: 1, height: 1 };
    if (count <= 4) return { width: 2, height: 2 };
    if (count <= 6) return { width: 3, height: 2 };
    return { width: 3, height: 3 };
  };

  const inferredWorkbench = inferWorkbenchGrid(totalSlots);
  const fallbackWidth = Math.min(8, Math.max(1, Math.ceil(Math.sqrt(totalSlots))));
  const derivedWidth = isExtreme ? 9 : isAssemblyLineLike ? 4 : isWorkbenchLike ? inferredWorkbench.width : fallbackWidth;
  const derivedHeight = isExtreme
    ? 9
    : isAssemblyLineLike
      ? 4
      : isWorkbenchLike
        ? inferredWorkbench.height
        : Math.ceil(totalSlots / Math.max(1, derivedWidth));

  const width = Math.max(1, Number(options.itemInputDimension?.width) || derivedWidth);
  const height = Math.max(1, Number(options.itemInputDimension?.height) || derivedHeight);

  const grid: Recipe['inputs'] = Array.from({ length: height }, () => Array.from({ length: width }, () => null));

  for (const entry of flat) {
    const slotIndex = Number(entry.slotIndex ?? -1);
    if (!Number.isFinite(slotIndex) || slotIndex < 0) continue;
    const row = Math.floor(slotIndex / width);
    const col = slotIndex % width;
    if (row < 0 || row >= height || col < 0 || col >= width) continue;
    appendVariantGroup(row, col, entry);
    grid[row][col] = toRecipeCell(entry);
  }

  return { inputs: grid, variantGroups };
};

export const normalizeRecipeOutputs = (rawOutputs: unknown): Recipe['outputs'] => {
  if (!Array.isArray(rawOutputs)) return [];

  return rawOutputs
    .map((out) => {
      if (!out || typeof out !== 'object') return null;
      const candidate = out as {
        itemId?: unknown;
        count?: unknown;
        probability?: unknown;
        stackSize?: unknown;
        item?: { itemId?: unknown };
      };

      if (typeof candidate.itemId === 'string' && candidate.itemId.length > 0) {
        return {
          itemId: candidate.itemId,
          count: Number(candidate.count ?? candidate.stackSize) || 1,
          probability: Number(candidate.probability) || 1,
        };
      }

      const itemId = candidate.item?.itemId;
      if (typeof itemId !== 'string' || itemId.length === 0) return null;
      return {
        itemId,
        count: Number(candidate.stackSize ?? candidate.count) || 1,
        probability: Number(candidate.probability) || 1,
      };
    })
    .filter((out): out is { itemId: string; count: number; probability: number } => out !== null);
};

export const convertIndexedRecipe = (indexed: indexedRecipe): Recipe => {
  const recipeTypeData =
    indexed && typeof indexed === 'object' && 'recipeTypeData' in indexed
      ? (indexed.recipeTypeData as Recipe['recipeTypeData'])
      : undefined;

  const normalizedInputs = normalizeRecipeInputs(indexed.inputs as unknown, {
    itemInputDimension: recipeTypeData?.itemInputDimension,
    recipeType: indexed.recipeType,
    machineType: indexed.machineInfo?.machineType,
  });

  return {
    recipeId: indexed.id,
    recipeType: indexed.recipeType,
    recipeTypeData,
    inputs: normalizedInputs.inputs,
    outputs: normalizeRecipeOutputs(indexed.outputs),
    fluidInputs: Array.isArray(indexed.fluidInputs) ? (indexed.fluidInputs as any) : [],
    fluidOutputs: Array.isArray(indexed.fluidOutputs) ? (indexed.fluidOutputs as any) : [],
    machineInfo: indexed.machineInfo ?? undefined,
    metadata: (indexed.metadata as any) ?? undefined,
    additionalData: {
      ...((indexed.metadata as unknown as Record<string, unknown>) ?? {}),
      rawIndexedInputs: indexed.inputs as unknown,
      rawIndexedOutputs: indexed.outputs as unknown,
      variantGroups: normalizedInputs.variantGroups,
    } as any,
  };
};

export const normalizeRecipeForDisplay = (recipe: Recipe): Recipe => {
  const normalized = normalizeRecipeInputs(recipe.inputs as unknown, {
    itemInputDimension: recipe.recipeTypeData?.itemInputDimension,
    recipeType: recipe.recipeType,
    machineType: recipe.machineInfo?.machineType || recipe.recipeTypeData?.machineType,
  });

  const additionalData =
    recipe.additionalData && typeof recipe.additionalData === 'object'
      ? ({ ...(recipe.additionalData as Record<string, unknown>) } as Record<string, unknown>)
      : {};

  if (normalized.variantGroups.length > 0) {
    additionalData.variantGroups = normalized.variantGroups;
  }

  return {
    ...recipe,
    inputs: normalized.inputs,
    outputs: normalizeRecipeOutputs(recipe.outputs),
    additionalData: additionalData as Recipe['additionalData'],
  };
};
