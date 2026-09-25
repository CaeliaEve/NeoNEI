import type { MachineCategory } from './helpers';

export type RecipeTab = 'usedIn' | 'producedBy';

export function buildMachineGroupRequestKey(options: {
  machineKey: string;
  offset?: number;
  limit?: number;
  includeRecipeIds?: boolean;
  defaultLimit: number;
}): string {
  return `${options.machineKey}:${options.offset ?? 0}:${options.limit ?? options.defaultLimit}:${options.includeRecipeIds ? 1 : 0}`;
}

export function buildCategoryGroupRequestKey(options: {
  tab: RecipeTab;
  categoryKey: string;
  offset?: number;
  limit?: number;
  includeRecipeIds?: boolean;
  defaultLimit: number;
}): string {
  return `${options.tab}:${options.categoryKey}:${options.offset ?? 0}:${options.limit ?? options.defaultLimit}:${options.includeRecipeIds ? 1 : 0}`;
}

export function resolveCategoryMachineRoute(category: MachineCategory): {
  isMachineRoute: boolean;
  machineKey: string;
  machineType: string;
} {
  const machineKey = `${category.machineKey ?? ''}`.trim();
  return {
    isMachineRoute: category.type === 'machine' && Boolean(machineKey),
    machineKey,
    machineType: machineKey.split('::')[0]?.trim() || category.name,
  };
}

export function computeCategoryPackWindow(options: {
  targetStart: number;
  orderedRecipeCount: number;
  packWindowSize: number;
}): number {
  return Math.max(
    0,
    Math.min(options.targetStart, Math.max(0, options.orderedRecipeCount - options.packWindowSize)),
  );
}

export function collectAdjacentRecipePages(currentPage: number, pageCount: number): number[] {
  if (pageCount <= 1) {
    return [];
  }
  const normalizedPage = Math.max(0, Math.floor(currentPage));
  return [normalizedPage + 1, normalizedPage - 1]
    .filter((page, index, values) => page >= 0 && page < pageCount && values.indexOf(page) === index);
}

export function collectNeighborCategoryIndexes(selectedIndex: number, categoryCount: number): number[] {
  if (categoryCount <= 1) {
    return [];
  }
  const normalizedIndex = ((selectedIndex % categoryCount) + categoryCount) % categoryCount;
  const candidateIndexes = [
    (normalizedIndex + 1) % categoryCount,
    (normalizedIndex - 1 + categoryCount) % categoryCount,
  ];
  const seen = new Set<number>([normalizedIndex]);
  return candidateIndexes.filter((index) => {
    if (seen.has(index)) return false;
    seen.add(index);
    return true;
  });
}
