import type { BrowserSearchPackEntry, ItemSearchBasic } from './types';

export function normalizeBrowserSearchKeyword(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, '');
}

export function rankBrowserSearchPackEntry(entry: BrowserSearchPackEntry, normalized: string): number | null {
  if (!normalized) return null;

  const aliases = entry.aliases || '';
  if (entry.normalizedLocalizedName === normalized) return 0;
  if (entry.pinyinFull === normalized) return 1;
  if (entry.pinyinAcronym === normalized) return 2;
  if (aliases === normalized) return 3;
  if (entry.normalizedInternalName === normalized) return 4;
  if (entry.normalizedItemId === normalized) return 5;
  if (entry.normalizedSearchTerms === normalized) return 6;

  if (entry.normalizedLocalizedName.startsWith(normalized)) return 10;
  if (entry.pinyinFull.startsWith(normalized)) return 11;
  if (entry.pinyinAcronym.startsWith(normalized)) return 12;
  if (aliases.startsWith(normalized)) return 13;
  if (entry.normalizedInternalName.startsWith(normalized)) return 14;
  if (entry.normalizedSearchTerms.startsWith(normalized)) return 15;
  if (entry.normalizedItemId.startsWith(normalized)) return 16;

  if (entry.normalizedLocalizedName.includes(normalized)) return 20;
  if (aliases.includes(normalized)) return 23;
  if (entry.normalizedInternalName.includes(normalized)) return 24;
  if (entry.normalizedSearchTerms.includes(normalized)) return 25;
  if (entry.normalizedItemId.includes(normalized)) return 26;

  return null;
}

export function searchBrowserSearchPackEntries(
  entries: BrowserSearchPackEntry[],
  query: string,
  limit: number,
): ItemSearchBasic[] {
  const normalized = normalizeBrowserSearchKeyword(query);
  if (!normalized || entries.length === 0) {
    return [];
  }

  return entries
    .map((entry, sourceIndex) => ({
      entry,
      sourceIndex,
      rank: rankBrowserSearchPackEntry(entry, normalized),
    }))
    .filter((entry): entry is { entry: BrowserSearchPackEntry; sourceIndex: number; rank: number } => entry.rank !== null)
    .sort((left, right) =>
      left.rank - right.rank
      || left.entry.searchRank - right.entry.searchRank
      || right.entry.popularityScore - left.entry.popularityScore
      || left.sourceIndex - right.sourceIndex,
    )
    .slice(0, Math.max(1, limit))
    .map(({ entry }) => ({
      itemId: entry.itemId,
      localizedName: entry.localizedName,
      modId: entry.modId,
    }));
}

export function mergeBrowserSearchPackEntries(
  primary: BrowserSearchPackEntry[],
  secondary: BrowserSearchPackEntry[],
): BrowserSearchPackEntry[] {
  if (primary.length === 0) return [...secondary];
  if (secondary.length === 0) return [...primary];

  const seen = new Set(primary.map((entry) => entry.itemId));
  const merged = [...primary];
  for (const entry of secondary) {
    if (!entry?.itemId || seen.has(entry.itemId)) {
      continue;
    }
    seen.add(entry.itemId);
    merged.push(entry);
  }
  return merged;
}
