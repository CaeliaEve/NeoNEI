import type { LocationQuery, LocationQueryRaw, LocationQueryValue } from 'vue-router';

export type RecipeTab = 'usedIn' | 'producedBy';
export type RecipeMode = 'u' | 'r';

export type RecipeQuerySnapshot = {
  tab?: RecipeTab;
  mode?: RecipeMode;
  machine: string;
  machineName?: string;
  page: string;
  q?: string;
  recipeId?: string;
};

const firstQueryValue = (
  value: LocationQueryValue | LocationQueryValue[] | undefined
): string | undefined => {
  if (Array.isArray(value)) {
    return typeof value[0] === 'string' ? value[0] : undefined;
  }
  return typeof value === 'string' ? value : undefined;
};

export const parseRecipeQuery = (query: LocationQuery): RecipeQuerySnapshot => {
  const tab = firstQueryValue(query.tab);
  const mode = firstQueryValue(query.mode);
  const machine = firstQueryValue(query.machine) ?? '0';
  const machineName = firstQueryValue(query.machineName);
  const page = firstQueryValue(query.page) ?? '0';
  const q = firstQueryValue(query.q);
  const recipeId = firstQueryValue(query.recipeId);

  return {
    tab: tab === 'usedIn' || tab === 'producedBy' ? tab : undefined,
    mode: mode === 'u' || mode === 'r' ? mode : undefined,
    machine,
    machineName,
    page,
    q,
    recipeId,
  };
};

export const serializeRecipeQuery = (snapshot: RecipeQuerySnapshot): string =>
  `${snapshot.tab ?? ''}|${snapshot.mode ?? ''}|${snapshot.machine}|${snapshot.machineName ?? ''}|${snapshot.page}|${snapshot.q ?? ''}|${snapshot.recipeId ?? ''}`;

export const parseNonNegativeInt = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
};

export const resolveRecipeTab = (snapshot: RecipeQuerySnapshot): RecipeTab | undefined => {
  if (snapshot.mode === 'u') return 'usedIn';
  if (snapshot.mode === 'r') return 'producedBy';
  return snapshot.tab;
};

export const buildRecipeQuery = (
  baseQuery: LocationQuery,
  snapshot: RecipeQuerySnapshot
): LocationQueryRaw => {
  const nextQuery: LocationQueryRaw = {
    ...baseQuery,
    tab: snapshot.tab,
    mode: snapshot.mode,
    machine: snapshot.machine,
    machineName: snapshot.machineName,
    page: snapshot.page,
    recipeId: snapshot.recipeId,
  };

  if (typeof snapshot.q === 'string' && snapshot.q.length > 0) {
    nextQuery.q = snapshot.q;
  } else {
    delete nextQuery.q;
  }
  if (!snapshot.machineName) {
    delete nextQuery.machineName;
  }

  return nextQuery;
};

export const buildRecipeRouteQuery = buildRecipeQuery;
