type Env = Record<string, string | undefined>;

function readPositiveNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function isExplicitlyEnabled(value: string | undefined): boolean {
  return value === '1' || value?.toLowerCase() === 'true';
}

export interface AutowarmPolicy {
  recipeBootstrap: {
    enabled: boolean;
    limit: number;
  };
  pageAtlas: {
    enabled: boolean;
    pages: number;
    pageSize: number;
    itemSize: number;
  };
}
export function getAutowarmPolicy(env: Env = process.env): AutowarmPolicy {
  return {
    recipeBootstrap: {
      enabled: isExplicitlyEnabled(env.RECIPE_BOOTSTRAP_AUTOWARM),
      limit: readPositiveNumber(env.RECIPE_BOOTSTRAP_AUTOWARM_LIMIT, 1000),
    },
    pageAtlas: {
      enabled: isExplicitlyEnabled(env.PAGE_ATLAS_AUTOWARM),
      pages: readPositiveNumber(env.PAGE_ATLAS_AUTOWARM_PAGES, 4),
      pageSize: readPositiveNumber(env.PAGE_ATLAS_AUTOWARM_PAGE_SIZE, 120),
      itemSize: readPositiveNumber(env.PAGE_ATLAS_AUTOWARM_ITEM_SIZE, 50),
    },
  };
}
