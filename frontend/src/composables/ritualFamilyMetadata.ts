import type { Recipe } from '../services/api';
import { parseAdditionalData } from './useRecipeSlots';
import {
  ASPECT_COLORS,
  extractThaumcraftAspectHash,
  getCanonicalThaumcraftAspectItemId,
  getThaumcraftAspectTexturePath,
  normalizeAspectName,
  parseAspectNameFromLocalized,
  resolveCanonicalThaumcraftAspectHash,
  resolveThaumcraftAspectNameFromHash,
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

interface MetadataAspectItem {
  itemId?: unknown;
  displayName?: unknown;
  localizedName?: unknown;
  name?: unknown;
  amount?: unknown;
  count?: unknown;
  stackSize?: unknown;
  imageFileName?: unknown;
  renderAssetRef?: unknown;
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
  if (extractThaumcraftAspectHash(itemId)) return true;

  const parsedAspectName = parseAspectNameFromLocalized(localizedName);
  return Boolean(parsedAspectName && parsedAspectName !== 'Unknown');
}

function getAspectMergeKey(aspect: Pick<RitualAspectCost, 'name' | 'hash' | 'itemId'>): string {
  return aspect.itemId || (aspect.hash ? `hash:${aspect.hash}` : `name:${aspect.name}`);
}

function resolveAspectName(input: {
  itemId?: string | null;
  localizedName?: string | null;
  displayName?: string | null;
  name?: string | null;
  imageFileName?: string | null;
}, hash?: string | null): string {
  const localized = parseAspectNameFromLocalized(input.localizedName ?? input.displayName ?? input.name ?? undefined);
  if (localized && localized !== 'Unknown') return localized;
  const hashName = resolveThaumcraftAspectNameFromHash(hash) ?? resolveThaumcraftAspectNameFromHash(input.itemId) ?? resolveThaumcraftAspectNameFromHash(input.imageFileName);
  if (hashName) return normalizeAspectName(hashName);
  const rawName = input.name ?? input.displayName ?? input.localizedName;
  if (rawName) return normalizeAspectName(rawName);
  return 'Unknown';
}

function buildAspectCost(input: {
  itemId?: string | null;
  localizedName?: string | null;
  displayName?: string | null;
  name?: string | null;
  imageFileName?: string | null;
  amount: number;
}): RitualAspectCost | null {
  const rawHash = extractThaumcraftAspectHash(input.itemId) ?? extractThaumcraftAspectHash(input.imageFileName);
  const hash = resolveCanonicalThaumcraftAspectHash(rawHash);
  const name = resolveAspectName(input, hash);
  if (name === 'Unknown' && !hash) return null;
  const itemId = hash
    ? getCanonicalThaumcraftAspectItemId(hash) ?? undefined
    : input.itemId?.trim() || undefined;
  return {
    name,
    amount: Math.floor(input.amount),
    color: ASPECT_COLORS[name] || '#d7e0ff',
    hash: hash ?? undefined,
    itemId,
  };
}

function mergeAspectCost(merged: Map<string, RitualAspectCost>, next: RitualAspectCost): void {
  const key = getAspectMergeKey(next);
  const existing = merged.get(key);
  if (existing) {
    existing.amount += next.amount;
    if (!existing.hash && next.hash) existing.hash = next.hash;
    if (!existing.itemId && next.itemId) existing.itemId = next.itemId;
    if (existing.name === 'Unknown' && next.name !== 'Unknown') existing.name = next.name;
    existing.color = ASPECT_COLORS[existing.name] || next.color || existing.color;
    return;
  }
  merged.set(key, next);
}

function collectStructuredAspectItems(metadata: Record<string, unknown>): RitualAspectCost[] {
  const aspectItems = Array.isArray(metadata.aspectItems) ? metadata.aspectItems : [];
  return aspectItems
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null;
      const item = entry as MetadataAspectItem;
      const amount = Number(item.amount ?? item.count ?? item.stackSize);
      if (!Number.isFinite(amount) || amount <= 0) return null;
      return buildAspectCost({
        itemId: typeof item.itemId === 'string' ? item.itemId : null,
        localizedName:
          (typeof item.localizedName === 'string' && item.localizedName)
          || (typeof item.displayName === 'string' && item.displayName)
          || null,
        displayName: typeof item.displayName === 'string' ? item.displayName : null,
        name: typeof item.name === 'string' ? item.name : null,
        imageFileName: typeof item.imageFileName === 'string' ? item.imageFileName : null,
        amount,
      });
    })
    .filter((entry): entry is RitualAspectCost => Boolean(entry));
}

function collectAspectMapCosts(metadata: unknown): RitualAspectCost[] {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return [];
  const costs: RitualAspectCost[] = [];
  for (const [rawName, rawAmount] of Object.entries(metadata as Record<string, unknown>)) {
      const amount = Number(rawAmount);
      if (!Number.isFinite(amount) || amount <= 0) continue;
      const cost = buildAspectCost({
        itemId: extractThaumcraftAspectHash(rawName) ? rawName : null,
        name: rawName,
        amount,
      });
      if (cost) costs.push(cost);
    }
  return costs;
}

export function buildThaumcraftAspectCosts(recipe: Recipe, sourceNode: unknown): RitualAspectCost[] {
  const merged = new Map<string, RitualAspectCost>();
  const recipeMetadata = mergeRecipeMetadata(recipe);
  const structuredCosts = collectStructuredAspectItems(recipeMetadata);
  for (const cost of structuredCosts) {
    mergeAspectCost(merged, cost);
  }

  if (structuredCosts.length === 0) {
    for (const cost of collectAspectMapCosts(recipeMetadata.aspects)) {
      mergeAspectCost(merged, cost);
    }
  }

  const rawInputs: RitualItemStack[] = [];
  collectRecipeItemStacks(sourceNode, rawInputs);

  if (structuredCosts.length === 0) {
    for (const input of rawInputs) {
      if (!isThaumcraftAspectItem(input.itemId, input.localizedName)) continue;
      const cost = buildAspectCost({
        itemId: input.itemId,
        localizedName: input.localizedName ?? null,
        imageFileName: input.imageFileName ?? null,
        amount: input.count,
      });
      if (cost) mergeAspectCost(merged, cost);
    }
  }

  return Array.from(merged.values()).sort((a, b) => b.amount - a.amount);
}

export function getThaumcraftAspectItemId(aspect: RitualAspectCost): string | null {
  if (aspect.hash) return getCanonicalThaumcraftAspectItemId(aspect.hash);
  if (aspect.itemId) {
    const hash = extractThaumcraftAspectHash(aspect.itemId);
    return hash ? getCanonicalThaumcraftAspectItemId(hash) : aspect.itemId;
  }
  return null;
}

export function getThaumcraftAspectImagePath(aspect: RitualAspectCost): string {
  const staticTexturePath = getThaumcraftAspectTexturePath(aspect);
  if (staticTexturePath) {
    return staticTexturePath;
  }

  // Do not fall back to backend per-hash aspect images here. Missing aspects should be
  // fixed in the native aspect texture set/manifest instead of triggering slow 404s
  // while users flip recipe pages.
  return '/placeholder.png';
}
