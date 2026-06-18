import path from 'path';
import fs from 'fs';

function pickEnv(...names: string[]): string | undefined {
  for (const name of names) {
    const value = normalizeEnvValue(process.env[name]);
    if (value) {
      return value;
    }
  }
  return undefined;
}

const resolvedDataDir = path.resolve(process.cwd(), pickEnv('NEONEI_DATA_DIR', 'DATA_DIR') || 'data');

function normalizeEnvValue(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  return value.trim().replace(/^['"]+|['"]+$/g, '');
}

function pickFirstExistingPath(candidates: Array<string | undefined>): string {
  const normalizedCandidates = candidates
    .map((candidate) => normalizeEnvValue(candidate))
    .filter((candidate): candidate is string => Boolean(candidate))
    .map((candidate) => path.resolve(candidate));

  for (const candidate of normalizedCandidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return normalizedCandidates[0] ?? '';
}

function pickImageRootPath(candidates: Array<string | undefined>): string {
  const normalizedCandidates = candidates
    .map((candidate) => normalizeEnvValue(candidate))
    .filter((candidate): candidate is string => Boolean(candidate))
    .map((candidate) => path.resolve(candidate));

  // Prefer a path that actually contains item textures.
  for (const candidate of normalizedCandidates) {
    if (!fs.existsSync(candidate)) continue;
    const itemDir = path.join(candidate, 'item');
    if (fs.existsSync(itemDir) && fs.statSync(itemDir).isDirectory()) {
      return candidate;
    }
  }

  // Fallback to first existing path.
  for (const candidate of normalizedCandidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return normalizedCandidates[0] ?? '';
}

export const DATA_DIR = resolvedDataDir;
export const PUBLIC_DIR = path.resolve(__dirname, '..', '..', 'public');
export const RUNTIME_DIR = path.resolve(pickEnv('NEONEI_RUNTIME_DIR') || path.join(DATA_DIR, 'runtime'));
export const CACHE_DIR = path.resolve(pickEnv('NEONEI_CACHE_DIR') || path.join(DATA_DIR, 'cache'));
export const DB_FILE = pickEnv('DB_FILE') || path.join(DATA_DIR, 'database.db');
export const ACCELERATION_DB_FILE =
  pickEnv('ACCELERATION_DB_FILE') || path.join(DATA_DIR, 'acceleration.db');
export const PUBLISH_OUTPUT_DIR =
  pickEnv('NEONEI_PUBLISH_DIR', 'PUBLISH_OUTPUT_DIR') || path.join(DATA_DIR, 'publish');
export const PUBLISH_PUBLIC_PATH =
  (process.env.PUBLISH_PUBLIC_PATH || '/publish').trim().replace(/\/+$/, '') || '/publish';
export const PUBLISH_RETAIN_RELEASES = Math.max(
  1,
  Math.floor(Number(process.env.PUBLISH_RETAIN_RELEASES || process.env.NEONEI_PUBLISH_RETAIN_RELEASES || 3)),
);
export const RECIPE_SUMMARIES_FILE =
  pickEnv('RECIPE_SUMMARIES_FILE') || path.join(DATA_DIR, 'recipe_summaries.csv');
export const REBUILD_PROGRESS_FILE =
  pickEnv('REBUILD_PROGRESS_FILE') || path.join(DATA_DIR, 'rebuild-progress.json');
export const LOG_DIR = pickEnv('NEONEI_LOG_DIR', 'LOG_DIR') || path.join(DATA_DIR, 'logs');
export const CONTRACTS_DIR =
  path.resolve(pickEnv('NEONEI_CONTRACTS_DIR') || path.resolve(__dirname, '..', '..', '..', 'contracts'));

export const NESQL_REPOSITORY_PATH = pickFirstExistingPath([
  pickEnv('NESQL_EXPORT_ROOT', 'NESQL_REPOSITORY_PATH'),
  path.resolve(process.cwd(), '..', 'nesql-repository'),
  path.resolve(process.cwd(), '..', '..', 'nesql-repository'),
  path.resolve(process.cwd(), '..'),
  path.resolve(process.cwd(), '..', '..'),
]);
export const IMAGES_PATH = pickImageRootPath([
  pickEnv('IMAGES_PATH'),
  NESQL_REPOSITORY_PATH ? path.join(NESQL_REPOSITORY_PATH, 'image') : undefined,
  path.resolve(process.cwd(), '..', 'image'),
  path.resolve(process.cwd(), '..', '..', 'image'),
]);
export const NESQL_IMAGES_DIR = pickFirstExistingPath([
  pickEnv('NESQL_IMAGES_DIR'),
  IMAGES_PATH ? path.join(IMAGES_PATH, 'item') : undefined,
  NESQL_REPOSITORY_PATH ? path.join(NESQL_REPOSITORY_PATH, 'image', 'item') : undefined,
]);
export const NESQL_MULTIBLOCKS_FILE = pickFirstExistingPath([
  pickEnv('NESQL_MULTIBLOCKS_FILE'),
  NESQL_REPOSITORY_PATH
    ? path.join(NESQL_REPOSITORY_PATH, 'multiblocks', 'gregtech-multiblocks.json.gz')
    : undefined,
]);
export const NESQL_BLOCK_FACES_FILE = pickFirstExistingPath([
  pickEnv('NESQL_BLOCK_FACES_FILE'),
  NESQL_REPOSITORY_PATH
    ? path.join(NESQL_REPOSITORY_PATH, 'multiblocks', 'block-face-textures.json.gz')
    : undefined,
]);
export const NESQL_BLOCK_FACE_ICON_MAP_FILE = pickFirstExistingPath([
  pickEnv('NESQL_BLOCK_FACE_ICON_MAP_FILE'),
  NESQL_REPOSITORY_PATH
    ? path.join(NESQL_REPOSITORY_PATH, 'multiblocks', 'block-face-icon-map.json.gz')
    : undefined,
  NESQL_REPOSITORY_PATH
    ? path.join(NESQL_REPOSITORY_PATH, 'multiblocks', 'block-face-icon-map.json')
    : undefined,
]);
// canonical is retired from the production runtime. Keep the symbol as an
// empty compatibility constant so old imports fail closed instead of silently
// reactivating /canonical from repository roots.
export const NESQL_CANONICAL_DIR = '';
export const SPLIT_ITEMS_DIR = pickFirstExistingPath([
  pickEnv('NESQL_SPLIT_ITEMS_DIR'),
  NESQL_REPOSITORY_PATH ? path.join(NESQL_REPOSITORY_PATH, 'items') : undefined,
  path.join(DATA_DIR, 'items'),
]);
export const SPLIT_RECIPES_DIR = pickFirstExistingPath([
  pickEnv('NESQL_SPLIT_RECIPES_DIR'),
  NESQL_REPOSITORY_PATH ? path.join(NESQL_REPOSITORY_PATH, 'recipes') : undefined,
  path.join(DATA_DIR, 'recipes'),
]);
export const NESQL_RENDER_ASSETS_FILE = pickFirstExistingPath([
  pickEnv('NESQL_RENDER_ASSETS_FILE'),
  NESQL_CANONICAL_DIR ? path.join(NESQL_CANONICAL_DIR, 'render-assets.json') : undefined,
]);
export const NESQL_ANIMATION_MANIFEST_FILE = pickFirstExistingPath([
  pickEnv('NESQL_ANIMATION_MANIFEST_FILE'),
  NESQL_CANONICAL_DIR ? path.join(NESQL_CANONICAL_DIR, 'animation-manifest.json') : undefined,
]);
export const NESQL_ATLAS_MANIFEST_FILE = pickFirstExistingPath([
  pickEnv('NESQL_ATLAS_MANIFEST_FILE'),
  NESQL_CANONICAL_DIR ? path.join(NESQL_CANONICAL_DIR, 'atlas-manifest.json') : undefined,
]);
export const NESQL_ANIMATED_ATLAS_MANIFEST_FILE = pickFirstExistingPath([
  pickEnv('NESQL_ANIMATED_ATLAS_MANIFEST_FILE'),
  NESQL_CANONICAL_DIR ? path.join(NESQL_CANONICAL_DIR, 'animated-atlas-manifest.json') : undefined,
]);
export const NESQL_RENDER_INDEX_FILE = pickFirstExistingPath([
  pickEnv('NESQL_RENDER_INDEX_FILE'),
  NESQL_CANONICAL_DIR ? path.join(NESQL_CANONICAL_DIR, 'render-index.json') : undefined,
]);
export const NESQL_BROWSER_ATLAS_INDEX_FILE = pickFirstExistingPath([
  pickEnv('NESQL_BROWSER_ATLAS_INDEX_FILE'),
  path.join(PUBLIC_DIR, 'dist-data', 'textures', 'browser-atlas-index.json'),
]);
export const NESQL_BROWSER_LAYOUT_INDEX_FILE = pickFirstExistingPath([
  pickEnv('NESQL_BROWSER_LAYOUT_INDEX_FILE'),
  path.join(PUBLIC_DIR, 'dist-data', 'browser', 'item-catalog.json'),
]);
export const NESQL_ATLAS_REGISTRY_FILE = pickFirstExistingPath([
  pickEnv('NESQL_ATLAS_REGISTRY_FILE'),
  NESQL_CANONICAL_DIR ? path.join(NESQL_CANONICAL_DIR, 'atlas-registry.json') : undefined,
]);
export const NESQL_UI_FAMILY_CENSUS_FILE = pickFirstExistingPath([
  pickEnv('NESQL_UI_FAMILY_CENSUS_FILE'),
  NESQL_REPOSITORY_PATH ? path.join(NESQL_REPOSITORY_PATH, 'raw-export', 'validation', 'ui-family-census.json') : undefined,
]);
