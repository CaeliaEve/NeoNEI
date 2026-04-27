import type { Recipe } from '../services/api';
import { parseAdditionalData } from './useRecipeSlots';
import {
  ASPECT_COLORS,
  ASPECT_HASH_TO_NAME,
  ASPECT_ICON_DAMAGE,
  normalizeAspectName,
  parseAspectNameFromLocalized,
} from '../services/thaumcraftAspects';

export interface RitualItemStack {
  itemId: string;
  count: number;
  localizedName?: string;
  renderAssetRef?: string | null;
  imageFileName?: string | null;
}

export interface RitualAspectCost {
  name: string;
  amount: number;
  color: string;
  hash?: string;
  itemId?: string;
}

export function normalizeCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 1;
}

export function mergeRecipeMetadata(recipe: Recipe): Record<string, unknown> {
  const additional = parseAdditionalData(recipe) ?? {};
  return {
    ...(recipe.additionalData && typeof recipe.additionalData === 'object' ? recipe.additionalData : {}),
    ...(recipe.metadata && typeof recipe.metadata === 'object' ? recipe.metadata : {}),
    ...additional,
  } as Record<string, unknown>;
}

export function readPositiveIntegerMeta(recipe: Recipe, keys: string[]): number | null {
  const merged = mergeRecipeMetadata(recipe);
  for (const key of keys) {
    const value = Number(merged[key]);
    if (Number.isFinite(value) && value > 0) {
      return Math.floor(value);
    }
  }
  return null;
}

export function collectRecipeItemStacks(node: unknown, output: RitualItemStack[]): void {
  if (!node) return;
  if (Array.isArray(node)) {
    for (const child of node) collectRecipeItemStacks(child, output);
    return;
  }
  if (typeof node !== 'object') return;

  const obj = node as {
    itemId?: unknown;
    count?: unknown;
    stackSize?: unknown;
    localizedName?: unknown;
    renderAssetRef?: unknown;
    imageFileName?: unknown;
    item?: { itemId?: unknown; localizedName?: unknown };
    items?: unknown[];
  };

  if (typeof obj.itemId === 'string' && obj.itemId.length > 0) {
    output.push({
      itemId: obj.itemId,
      count: normalizeCount(obj.count ?? obj.stackSize),
      localizedName: typeof obj.localizedName === 'string' ? obj.localizedName : undefined,
      renderAssetRef: typeof obj.renderAssetRef === 'string' ? obj.renderAssetRef : null,
      imageFileName: typeof obj.imageFileName === 'string' ? obj.imageFileName : null,
    });
    return;
  }

  if (obj.item && typeof obj.item.itemId === 'string' && obj.item.itemId.length > 0) {
    output.push({
      itemId: obj.item.itemId,
      count: normalizeCount(obj.count ?? obj.stackSize),
      localizedName: typeof obj.item.localizedName === 'string' ? obj.item.localizedName : undefined,
      renderAssetRef:
        typeof obj.renderAssetRef === 'string' ? obj.renderAssetRef : null,
      imageFileName:
        typeof obj.imageFileName === 'string' ? obj.imageFileName : null,
    });
    return;
  }

  if (Array.isArray(obj.items)) {
    collectRecipeItemStacks(obj.items, output);
    return;
  }

  for (const value of Object.values(obj)) {
    collectRecipeItemStacks(value, output);
  }
}

export function isThaumcraftAspectItem(itemId: string, localizedName?: string): boolean {
  if (itemId.includes('thaumcraftneiplugin~Aspect') || itemId.includes('~Aspect~')) return true;
  return typeof localizedName === 'string' && (
    localizedName.includes('瑕佺礌:') ||
    /aspects?:/i.test(localizedName)
  );
}

function extractAspectHash(itemId: string): string | undefined {
  const parts = itemId.split('~');
  const hash = parts[parts.length - 1];
  return hash && hash.length > 8 ? hash : undefined;
}

function resolveAspectName(input: RitualItemStack, hash: string | undefined): string {
  const localized = parseAspectNameFromLocalized(input.localizedName);
  if (localized && localized !== 'Unknown') return localized;
  if (hash && ASPECT_HASH_TO_NAME[hash]) return normalizeAspectName(ASPECT_HASH_TO_NAME[hash]);
  return 'Unknown';
}

export function buildThaumcraftAspectCosts(recipe: Recipe, sourceNode: unknown): RitualAspectCost[] {
  const merged = new Map<string, RitualAspectCost>();
  const metadata = mergeRecipeMetadata(recipe).aspects;

  if (metadata && typeof metadata === 'object') {
    for (const [rawName, rawAmount] of Object.entries(metadata as Record<string, unknown>)) {
      const amount = Number(rawAmount);
      if (!Number.isFinite(amount) || amount <= 0) continue;
      const name = normalizeAspectName(rawName);
      merged.set(name, {
        name,
        amount: Math.floor(amount),
        color: ASPECT_COLORS[name] || '#d7e0ff',
      });
    }
  }

  const rawInputs: RitualItemStack[] = [];
  collectRecipeItemStacks(sourceNode, rawInputs);

  for (const input of rawInputs) {
    if (!isThaumcraftAspectItem(input.itemId, input.localizedName)) continue;
    const hash = extractAspectHash(input.itemId);
    const name = resolveAspectName(input, hash);
    const existing = merged.get(name);
    if (existing) {
      existing.amount += input.count;
      if (!existing.hash && hash) existing.hash = hash;
      if (!existing.itemId) existing.itemId = input.itemId;
      continue;
    }
    merged.set(name, {
      name,
      amount: input.count,
      color: ASPECT_COLORS[name] || '#d7e0ff',
      hash,
      itemId: input.itemId,
    });
  }

  return Array.from(merged.values()).sort((a, b) => b.amount - a.amount);
}

export function getThaumcraftAspectItemId(aspect: RitualAspectCost): string | null {
  if (aspect.itemId) return aspect.itemId;
  if (aspect.hash) return `i~thaumcraftneiplugin~Aspect~0~${aspect.hash}`;
  return null;
}

export function getThaumcraftAspectImagePath(aspect: RitualAspectCost): string {
  if (aspect.hash) {
    return `${__BACKEND_BASE_URL__}/images/item/thaumcraftneiplugin/Aspect~0~${aspect.hash}.png`;
  }
  const damage = ASPECT_ICON_DAMAGE[aspect.name];
  if (damage) {
    return `${__BACKEND_BASE_URL__}/images/item/Thaumcraft/ItemResource~${damage}~0.png`;
  }
  return '/placeholder.png';
}
