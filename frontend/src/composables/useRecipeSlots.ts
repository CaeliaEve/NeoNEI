import { api, type Recipe } from '../services/api';

export interface ResolvedSlot {
  itemId: string;
  count: number;
  localizedName: string;
}

interface RawSlotLike {
  itemId?: unknown;
  count?: unknown;
}

function toCandidate(slotLike: RawSlotLike | null | undefined): { itemId: string; count: number } | null {
  if (!slotLike || typeof slotLike.itemId !== 'string' || slotLike.itemId.length === 0) {
    return null;
  }
  return {
    itemId: slotLike.itemId,
    count: normalizeCount(slotLike.count),
  };
}

function normalizeCount(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }
  return 1;
}

function getInputSource(recipe: Recipe): unknown {
  const additional = parseAdditionalData(recipe);
  if (additional && 'rawIndexedInputs' in additional) {
    return (additional as Record<string, unknown>).rawIndexedInputs;
  }
  return recipe.inputs;
}

function collectInputCandidates(node: unknown, output: Array<{ itemId: string; count: number }>): void {
  if (!node) {
    return;
  }

  if (Array.isArray(node)) {
    for (const child of node) {
      collectInputCandidates(child, output);
    }
    return;
  }

  if (typeof node === 'object') {
    const slot = node as RawSlotLike;
    if (typeof slot.itemId === 'string' && slot.itemId.length > 0) {
      output.push({
        itemId: slot.itemId,
        count: normalizeCount(slot.count),
      });
    }
  }
}

async function resolveSlots(slots: Array<{ itemId: string; count: number }>): Promise<ResolvedSlot[]> {
  return Promise.all(
    slots.map(async ({ itemId, count }) => {
      try {
        const item = await api.getItem(itemId);
        return { itemId, count, localizedName: item.localizedName };
      } catch {
        return { itemId, count, localizedName: itemId };
      }
    }),
  );
}

export async function buildInputSlots(recipe: Recipe): Promise<ResolvedSlot[]> {
  const slots: Array<{ itemId: string; count: number }> = [];
  collectInputCandidates(getInputSource(recipe), slots);
  return resolveSlots(slots);
}

export async function buildPrimaryInputSlots(recipe: Recipe): Promise<ResolvedSlot[]> {
  const inputSource = getInputSource(recipe);
  const rows = Array.isArray(inputSource) ? inputSource : [];
  const selected: Array<{ itemId: string; count: number }> = [];

  for (const row of rows) {
    if (!Array.isArray(row)) {
      continue;
    }

    for (const cell of row) {
      if (!cell) {
        continue;
      }

      let chosen: { itemId: string; count: number } | null = null;
      if (Array.isArray(cell)) {
        chosen = toCandidate(cell[0] as RawSlotLike | undefined);
      } else if (typeof cell === 'object') {
        chosen = toCandidate(cell as RawSlotLike);
      }

      if (chosen) {
        selected.push(chosen);
      }
    }
  }

  return resolveSlots(selected);
}

export async function buildFirstInputSlotsPerRow(recipe: Recipe): Promise<ResolvedSlot[]> {
  const inputSource = getInputSource(recipe);
  const rows = Array.isArray(inputSource) ? inputSource : [];
  const selected: Array<{ itemId: string; count: number }> = [];

  for (const row of rows) {
    if (!Array.isArray(row)) {
      continue;
    }

    let chosen: { itemId: string; count: number } | null = null;
    for (const cell of row) {
      if (!cell) {
        continue;
      }

      if (Array.isArray(cell)) {
        const first = cell[0] as RawSlotLike | undefined;
        chosen = toCandidate(first);
      } else if (typeof cell === 'object') {
        chosen = toCandidate(cell as RawSlotLike);
      }

      if (chosen) {
        break;
      }
    }

    if (chosen) {
      selected.push(chosen);
    }
  }

  return resolveSlots(selected);
}

export async function buildOutputSlots(recipe: Recipe, maxCount?: number): Promise<ResolvedSlot[]> {
  const outputs = Array.isArray(recipe.outputs) ? recipe.outputs : [];
  const prepared = outputs
    .map((output) => {
      if (!output || typeof output !== 'object') {
        return null;
      }

      const asRecord = output as Record<string, unknown>;
      const directItemId = typeof asRecord.itemId === 'string' ? asRecord.itemId : null;
      const nestedItemId =
        typeof asRecord.item === 'object' &&
        asRecord.item !== null &&
        typeof (asRecord.item as Record<string, unknown>).itemId === 'string'
          ? ((asRecord.item as Record<string, unknown>).itemId as string)
          : null;
      const itemId = directItemId || nestedItemId;
      if (!itemId) return null;

      const count = normalizeCount(asRecord.count ?? asRecord.stackSize);
      return { itemId, count };
    })
    .filter((slot): slot is { itemId: string; count: number } => Boolean(slot));

  const sliced = typeof maxCount === 'number' ? prepared.slice(0, maxCount) : prepared;
  return resolveSlots(sliced);
}

export function parseAdditionalData(recipe: Recipe): Record<string, unknown> | null {
  if (!recipe.additionalData) {
    return null;
  }

  if (typeof recipe.additionalData === 'string') {
    try {
      const parsed = JSON.parse(recipe.additionalData) as unknown;
      if (parsed && typeof parsed === 'object') {
        return parsed as Record<string, unknown>;
      }
      return null;
    } catch {
      return null;
    }
  }

  if (typeof recipe.additionalData === 'object') {
    return recipe.additionalData as Record<string, unknown>;
  }

  return null;
}
