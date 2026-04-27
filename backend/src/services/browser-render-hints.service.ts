import type { BrowserPageEntry, Item } from './items.service';
import { getRenderContractService } from './render-contract.service';

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
