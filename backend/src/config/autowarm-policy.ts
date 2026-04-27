type Env = Record<string, string | undefined>;

function readPositiveNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function isExplicitlyEnabled(value: string | undefined): boolean {
  return value === '1' || value?.toLowerCase() === 'true';
}

function isExplicitlyDisabled(value: string | undefined): boolean {
  return value === '0' || value?.toLowerCase() === 'false';
}

function readEnabledWithDefault(value: string | undefined, fallback: boolean): boolean {
  if (isExplicitlyEnabled(value)) return true;
  if (isExplicitlyDisabled(value)) return false;
  return fallback;
}

export interface AutowarmPolicy {
  recipeBootstrap: {
    enabled: boolean;
    limit: number;
  };
  recipeShard: {
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
      enabled: readEnabledWithDefault(env.RECIPE_BOOTSTRAP_AUTOWARM, false),
      limit: readPositiveNumber(env.RECIPE_BOOTSTRAP_AUTOWARM_LIMIT, 1000),
    },
    recipeShard: {
      enabled: readEnabledWithDefault(env.RECIPE_SHARD_AUTOWARM, false),
      limit: readPositiveNumber(env.RECIPE_SHARD_AUTOWARM_LIMIT, 16),
    },
    pageAtlas: {
      enabled: readEnabledWithDefault(env.PAGE_ATLAS_AUTOWARM, true),
      pages: readPositiveNumber(env.PAGE_ATLAS_AUTOWARM_PAGES, 8),
      pageSize: readPositiveNumber(env.PAGE_ATLAS_AUTOWARM_PAGE_SIZE, 55),
      itemSize: readPositiveNumber(env.PAGE_ATLAS_AUTOWARM_ITEM_SIZE, 50),
    },
  };
}
