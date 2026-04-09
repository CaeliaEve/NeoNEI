export interface OcPatternStack {
  id: string;
  meta: number;
  count: number;
  nbt: string | null;
}

export interface OcPatternEntry {
  crafting: boolean;
  substitute: boolean;
  beSubstitute: boolean;
  patternId: string;
  crafterUUID: string;
  author: string;
  inputs: OcPatternStack[];
  outputs: OcPatternStack[];
}

export interface OcPatternExportDocument {
  version: number;
  modVersion: string;
  exportedAt: string;
  patternCount: number;
  compatibility: {
    target: 'oc-pattern';
    itemIdFormat: 'minecraft-registry';
    beSubstitute: 'pattern-field';
    crafterUUID: 'synthetic-pattern-id';
    author: 'default-exporter';
  };
  warnings: string[];
  patterns: OcPatternEntry[];
}

interface ExportPatternSource {
  patternId?: string;
  patternName?: string;
  author?: string;
  crafterUUID?: string;
  beSubstitute?: boolean;
  crafting: number;
  substitute: number;
  recipeId: string;
  inputs: unknown;
  outputs: unknown;
}

interface DirectRecipeItem {
  itemId?: string;
  damage?: number;
  count?: number;
  stackSize?: number;
  nbt?: string | null;
}

interface IndexedRecipeItemStack {
  item?: {
    itemId?: string;
    damage?: number;
    nbt?: string | null;
  };
  stackSize?: number;
}

interface IndexedRecipeItemGroup {
  items?: IndexedRecipeItemStack[];
}

function normalizeDamage(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function normalizeCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 1;
}

export function toMinecraftItemId(itemId: string): string {
  if (!itemId.startsWith('i~')) {
    return itemId;
  }

  const parts = itemId.split('~');
  if (parts.length < 3) {
    return itemId;
  }

  return `${parts[1]}:${parts[2]}`;
}

function parseMetaFromItemId(itemId: string): number {
  if (!itemId.startsWith('i~')) {
    return 0;
  }

  const parts = itemId.split('~');
  if (parts.length < 4) {
    return 0;
  }

  const parsed = Number(parts[3]);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toOcPatternStackFromDirect(item: DirectRecipeItem): OcPatternStack | null {
  if (!item.itemId) {
    return null;
  }

  return {
    id: toMinecraftItemId(item.itemId),
    meta: item.damage !== undefined ? normalizeDamage(item.damage) : parseMetaFromItemId(item.itemId),
    count: normalizeCount(item.count ?? item.stackSize),
    nbt: item.nbt ?? null,
  };
}

function toOcPatternStackFromIndexed(itemStack: IndexedRecipeItemStack): OcPatternStack | null {
  if (!itemStack.item?.itemId) {
    return null;
  }

  return {
    id: toMinecraftItemId(itemStack.item.itemId),
    meta: itemStack.item.damage !== undefined
      ? normalizeDamage(itemStack.item.damage)
      : parseMetaFromItemId(itemStack.item.itemId),
    count: normalizeCount(itemStack.stackSize),
    nbt: itemStack.item.nbt ?? null,
  };
}

function collectOcPatternStacks(input: unknown, target: OcPatternStack[]): void {
  if (!input) {
    return;
  }

  if (Array.isArray(input)) {
    for (const entry of input) {
      collectOcPatternStacks(entry, target);
    }
    return;
  }

  if (typeof input !== 'object') {
    return;
  }

  const record = input as Record<string, unknown>;

  if (typeof record.itemId === 'string') {
    const stack = toOcPatternStackFromDirect(record as DirectRecipeItem);
    if (stack) {
      target.push(stack);
    }
    return;
  }

  if (record.item && typeof record.item === 'object') {
    const stack = toOcPatternStackFromIndexed(record as IndexedRecipeItemStack);
    if (stack) {
      target.push(stack);
    }
    return;
  }

  if (Array.isArray((record as IndexedRecipeItemGroup).items)) {
    for (const itemStack of (record as IndexedRecipeItemGroup).items || []) {
      collectOcPatternStacks(itemStack, target);
    }
  }
}

export function normalizeOcPatternStacks(input: unknown): OcPatternStack[] {
  const result: OcPatternStack[] = [];
  collectOcPatternStacks(input, result);
  return result;
}

export function buildOcPatternEntry(source: ExportPatternSource): OcPatternEntry {
  const stableId = source.patternId || source.recipeId;

  return {
    crafting: source.crafting === 1,
    substitute: source.substitute === 1,
    beSubstitute: source.beSubstitute ?? false,
    patternId: stableId,
    crafterUUID: source.crafterUUID || stableId,
    author: source.author || 'NeoNEI',
    inputs: normalizeOcPatternStacks(source.inputs),
    outputs: normalizeOcPatternStacks(source.outputs),
  };
}

export function buildOcPatternExportDocument(patterns: OcPatternEntry[]): OcPatternExportDocument {
  return {
    version: 1,
    modVersion: '0.1',
    exportedAt: new Date().toISOString(),
    patternCount: patterns.length,
    compatibility: {
      target: 'oc-pattern',
      itemIdFormat: 'minecraft-registry',
      beSubstitute: 'pattern-field',
      crafterUUID: 'synthetic-pattern-id',
      author: 'default-exporter',
    },
    warnings: [
      'crafterUUID is synthesized from patternId when no source UUID exists.',
      'author defaults to "NeoNEI" when no source author exists.',
    ],
    patterns,
  };
}
