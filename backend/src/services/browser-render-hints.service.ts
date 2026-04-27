import type { BrowserPageEntry, Item } from './items.service';
import {
  getRenderContractService,
  type AnimatedAtlasAssetEntry,
  type RenderAnimationHint,
} from './render-contract.service';

export interface BrowserPageRichMediaManifest {
  animatedAtlases: Record<string, AnimatedAtlasAssetEntry>;
}

function collectRenderAssetRefsFromItems(items: Item[]): string[] {
  return Array.from(
    new Set(
      items
        .map((item) => `${item.renderAssetRef ?? ''}`.trim())
        .filter(Boolean),
    ),
  );
}

export function attachRenderHintsToItems(items: Item[]): Item[] {
  const assetIds = collectRenderAssetRefsFromItems(items);
  if (assetIds.length === 0) {
    return items;
  }

  const hints = getRenderContractService().getRenderAnimationHints(assetIds);
  for (const item of items) {
    const assetId = `${item.renderAssetRef ?? ''}`.trim();
    if (!assetId) {
      item.renderHint = null;
      continue;
    }
    item.renderHint = hints.get(assetId) ?? null;
  }
  return items;
}

export function attachRenderHintsToEntries(entries: BrowserPageEntry[]): BrowserPageEntry[] {
  const representatives: Item[] = entries.map((entry) =>
    entry.kind === 'item' ? entry.item : entry.group.representative,
  );
  attachRenderHintsToItems(representatives);
  return entries;
}

function collectCapturedAnimatedAssetRefs(items: Item[]): string[] {
  return Array.from(
    new Set(
      items
        .filter((item) =>
          Boolean(item.renderAssetRef)
          && Boolean(item.renderHint?.hasAnimation)
          && !Boolean(item.renderHint?.prefersNativeSprite)
          && Boolean(item.renderHint?.prefersCapturedAtlas),
        )
        .map((item) => `${item.renderAssetRef ?? ''}`.trim())
        .filter(Boolean),
    ),
  );
}

function shouldIncludeCapturedAnimatedAsset(
  assetId: string,
  renderHint?: RenderAnimationHint | null,
): boolean {
  if (!assetId) {
    return false;
  }

  const resolvedHint = renderHint ?? getRenderContractService().getRenderAnimationHint(assetId);
  return Boolean(
    resolvedHint?.hasAnimation
    && !resolvedHint?.prefersNativeSprite
    && resolvedHint?.prefersCapturedAtlas,
  );
}

export function buildRichMediaManifestFromUnknown(
  value: unknown,
  options?: { maxAssets?: number },
): BrowserPageRichMediaManifest | null {
  const seenNodes = new Set<unknown>();
  const assetIds = new Set<string>();
  const maxAssets = Math.max(1, Math.floor(options?.maxAssets ?? Number.MAX_SAFE_INTEGER));

  const visit = (node: unknown) => {
    if (!node || typeof node !== 'object') {
      return;
    }
    if (seenNodes.has(node) || assetIds.size >= maxAssets) {
      return;
    }
    seenNodes.add(node);

    if (Array.isArray(node)) {
      for (const entry of node) {
        if (assetIds.size >= maxAssets) {
          break;
        }
        visit(entry);
      }
      return;
    }

    const record = node as Record<string, unknown>;
    const renderAssetRef = typeof record.renderAssetRef === 'string'
      ? record.renderAssetRef.trim()
      : '';
    const renderHint =
      record.renderHint && typeof record.renderHint === 'object'
        ? (record.renderHint as RenderAnimationHint)
        : (record.renderHint === null ? null : undefined);
    if (renderAssetRef && shouldIncludeCapturedAnimatedAsset(renderAssetRef, renderHint)) {
      assetIds.add(renderAssetRef);
      if (assetIds.size >= maxAssets) {
        return;
      }
    }

    for (const nested of Object.values(record)) {
      if (assetIds.size >= maxAssets) {
        break;
      }
      visit(nested);
    }
  };

  visit(value);

  if (assetIds.size === 0) {
    return null;
  }

  const animatedAtlases = getRenderContractService().getAnimatedAtlasEntries(Array.from(assetIds));
  if (animatedAtlases.size === 0) {
    return null;
  }

  return {
    animatedAtlases: Object.fromEntries(animatedAtlases.entries()),
  };
}

export function buildBrowserRichMediaManifest(items: Item[]): BrowserPageRichMediaManifest | null {
  const assetIds = collectCapturedAnimatedAssetRefs(items);
  if (assetIds.length === 0) {
    return null;
  }

  const animatedAtlases = getRenderContractService().getAnimatedAtlasEntries(assetIds);
  if (animatedAtlases.size === 0) {
    return null;
  }

  return {
    animatedAtlases: Object.fromEntries(animatedAtlases.entries()),
  };
}
