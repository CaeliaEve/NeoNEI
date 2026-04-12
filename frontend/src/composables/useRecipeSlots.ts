import { api, type Recipe } from '../services/api';

export interface ResolvedSlot {
  itemId: string;
  count: number;
  localizedName: string;
}

interface RawSlotLike {
  itemId?: unknown;
  count?: unknown;
  stackSize?: unknown;
  item?: unknown;
  items?: unknown;
}

function toCandidate(slotLike: RawSlotLike | null | undefined): { itemId: string; count: number } | null {
  if (!slotLike) {
    return null;
  }
  if (typeof slotLike.itemId === 'string' && slotLike.itemId.length > 0) {
    return {
      itemId: slotLike.itemId,
      count: normalizeCount(slotLike.count ?? slotLike.stackSize),
    };
  }
  if (
    typeof slotLike.item === 'object' &&
    slotLike.item !== null &&
    typeof (slotLike.item as RawSlotLike).itemId === 'string' &&
    ((slotLike.item as RawSlotLike).itemId as string).length > 0
  ) {
    return {
      itemId: (slotLike.item as RawSlotLike).itemId as string,
      count: normalizeCount(slotLike.count ?? slotLike.stackSize),
    };
  }
  return null;
}

function collectFirstCandidate(node: unknown): { itemId: string; count: number } | null {
  if (!node) return null;
  if (Array.isArray(node)) {
    for (const child of node) {
      const candidate = collectFirstCandidate(child);
      if (candidate) return candidate;
    }
    return null;
  }
  if (typeof node !== 'object') return null;
  const record = node as RawSlotLike;
  const direct = toCandidate(record);
  if (direct) return direct;
  if (Array.isArray(record.items)) return collectFirstCandidate(record.items);
  if (record.item) return collectFirstCandidate(record.item);
  return null;
}

function collectAllCandidates(node: unknown, output: Array<{ itemId: string; count: number }>): void {
  if (!node) return;
  if (Array.isArray(node)) {
    for (const child of node) collectAllCandidates(child, output);
    return;
  }
  if (typeof node !== 'object') return;

  const record = node as RawSlotLike;
  const direct = toCandidate(record);
  if (direct) {
    output.push(direct);
    return;
  }

  if (Array.isArray(record.items)) {
    const first = collectFirstCandidate(record.items);
    if (first) output.push(first);
    return;
  }

  if (record.item) {
    collectAllCandidates(record.item, output);
  }
}

function uniqueSlots(slots: Array<{ itemId: string; count: number }>): Array<{ itemId: string; count: number }> {
  const seen = new Set<string>();
  const result: Array<{ itemId: string; count: number }> = [];
  for (const slot of slots) {
    const key = `${slot.itemId}|${slot.count}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push(slot);
    }
  }
  return result;
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
  collectAllCandidates(node, output);
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
  return resolveSlots(uniqueSlots(slots).filter((slot) => slot.itemId));
}

export async function buildPrimaryInputSlots(recipe: Recipe): Promise<ResolvedSlot[]> {
  const inputSource = getInputSource(recipe);
  const rows = Array.isArray(inputSource) ? inputSource : [];
  const selected: Array<{ itemId: string; count: number }> = [];

  for (const row of rows) {
    if (!Array.isArray(row)) {
      const chosen = collectFirstCandidate(row);
      if (chosen) selected.push(chosen);
      continue;
    }

    for (const cell of row) {
      if (!cell) {
        continue;
      }

      const chosen = collectFirstCandidate(cell);
      if (chosen) {
        selected.push(chosen);
      }
    }
  }

  return resolveSlots(uniqueSlots(selected).filter((slot) => slot.itemId));
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

      chosen = collectFirstCandidate(cell);

      if (chosen) {
        break;
      }
    }

    if (chosen && chosen.itemId) {
      selected.push(chosen);
    }
  }

  return resolveSlots(uniqueSlots(selected).filter((slot) => slot.itemId));
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
