import type { BrowserGridEntry, BrowserVariantGroup, Item, PaginatedResponse } from './api';

export type BrowserItemEntry = {
  key: string;
  kind: 'item';
  item: Item;
};

export type BrowserCollapsedGroupEntry = {
  key: string;
  kind: 'group-collapsed';
  group: BrowserVariantGroup;
};

export type BrowserDefaultCatalogEntry =
  | BrowserItemEntry
  | BrowserCollapsedGroupEntry;

function cloneGroup(group: BrowserVariantGroup, overrides?: Partial<BrowserVariantGroup>): BrowserVariantGroup {
  return {
    key: group.key,
    representative: group.representative,
    size: group.size,
    visibleCount: group.visibleCount,
    expandable: group.expandable,
    label: group.label,
    semanticFamily: group.semanticFamily ?? null,
    semanticClassification: group.semanticClassification ?? null,
    groupSource: group.groupSource ?? null,
    ...overrides,
  };
}

function createItemEntry(item: Item): BrowserGridEntry {
  return {
    key: item.itemId,
    kind: 'item',
    item,
  };
}

function createGroupHeaderEntry(group: BrowserVariantGroup, visibleCount: number): BrowserGridEntry {
  return {
    key: `header:${group.key}`,
    kind: 'group-header',
    group: cloneGroup(group, {
      visibleCount,
    }),
  };
}

function createCollapsedGroupEntry(group: BrowserVariantGroup): BrowserGridEntry {
  return {
    key: `collapsed:${group.key}`,
    kind: 'group-collapsed',
    group: cloneGroup(group, {
      visibleCount: 1,
    }),
  };
}

function resolveForcedExpandedGroupKey(entries: BrowserDefaultCatalogEntry[]): string | null {
  if (entries.length !== 1) {
    return null;
  }

  const entry = entries[0];
  if (entry.kind !== 'group-collapsed' || !entry.group.expandable || entry.group.size <= 1) {
    return null;
  }

  return entry.group.key;
}

export function projectBrowserEntriesFromDefaultCatalog(
  entries: BrowserDefaultCatalogEntry[],
  params: {
    expandedGroups?: Iterable<string>;
    groupItemsByKey?: Map<string, Item[]>;
    page: number;
    pageSize: number;
  },
): PaginatedResponse<BrowserGridEntry> {
  const normalizedPageSize = Math.max(1, Math.floor(params.pageSize));
  const normalizedPage = Math.max(1, Math.floor(params.page));
  const expandedGroups = new Set(
    Array.from(params.expandedGroups ?? [])
      .map((groupKey) => `${groupKey ?? ''}`.trim())
      .filter(Boolean),
  );

  const forcedExpandedGroupKey = resolveForcedExpandedGroupKey(entries);
  if (forcedExpandedGroupKey) {
    expandedGroups.add(forcedExpandedGroupKey);
  }

  if (expandedGroups.size === 0) {
    const total = entries.length;
    const totalPages = Math.max(1, Math.ceil(total / normalizedPageSize));
    const clampedPage = Math.min(normalizedPage, totalPages);
    const start = (clampedPage - 1) * normalizedPageSize;
    return {
      data: entries.slice(start, start + normalizedPageSize).map((entry) => (
        entry.kind === 'item'
          ? entry
          : createCollapsedGroupEntry(entry.group)
      )),
      total,
      page: clampedPage,
      pageSize: normalizedPageSize,
      totalPages,
    };
  }

  const pageStart = (normalizedPage - 1) * normalizedPageSize;
  const pageEnd = pageStart + normalizedPageSize;
  const data: BrowserGridEntry[] = [];
  let projectedCount = 0;

  const pushProjectedEntry = (entry: BrowserGridEntry) => {
    if (projectedCount >= pageStart && projectedCount < pageEnd) {
      data.push(entry);
    }
    projectedCount += 1;
  };

  for (const entry of entries) {
    if (entry.kind === 'item') {
      pushProjectedEntry(entry);
      continue;
    }

    const groupKey = `${entry.group.key ?? ''}`.trim();
    const groupItems = groupKey ? params.groupItemsByKey?.get(groupKey) ?? [] : [];
    const expandable = entry.group.expandable && entry.group.size > 1;
    const canExpandLocally = expandable && groupItems.length > 0;
    const expanded = groupKey && expandedGroups.has(groupKey) && canExpandLocally;

    if (!expanded) {
      pushProjectedEntry(createCollapsedGroupEntry(entry.group));
      continue;
    }

    pushProjectedEntry(createGroupHeaderEntry(entry.group, Math.max(1, groupItems.length)));
    for (let index = 1; index < groupItems.length; index += 1) {
      pushProjectedEntry(createItemEntry(groupItems[index]));
    }
  }

  const total = projectedCount;
  const totalPages = Math.max(1, Math.ceil(total / normalizedPageSize));
  const clampedPage = Math.min(normalizedPage, totalPages);

  if (clampedPage !== normalizedPage) {
    return projectBrowserEntriesFromDefaultCatalog(entries, {
      ...params,
      page: clampedPage,
    });
  }

  return {
    data,
    total,
    page: clampedPage,
    pageSize: normalizedPageSize,
    totalPages,
  };
}
