import path from 'path';
import fs from 'fs';

const resolvedDataDir = path.resolve(process.cwd(), process.env.DATA_DIR || 'data');

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
export const DB_FILE = process.env.DB_FILE || path.join(DATA_DIR, 'database.db');
export const ACCELERATION_DB_FILE =
  process.env.ACCELERATION_DB_FILE || path.join(DATA_DIR, 'acceleration.db');
export const RECIPE_SUMMARIES_FILE =
  process.env.RECIPE_SUMMARIES_FILE || path.join(DATA_DIR, 'recipe_summaries.csv');
export const REBUILD_PROGRESS_FILE =
  process.env.REBUILD_PROGRESS_FILE || path.join(DATA_DIR, 'rebuild-progress.json');
export const LOG_DIR = process.env.LOG_DIR || path.join(DATA_DIR, 'logs');

export const NESQL_REPOSITORY_PATH = pickFirstExistingPath([
  process.env.NESQL_REPOSITORY_PATH,
  path.resolve(process.cwd(), '..', 'nesql-repository'),
  path.resolve(process.cwd(), '..', '..', 'nesql-repository'),
  path.resolve(process.cwd(), '..'),
  path.resolve(process.cwd(), '..', '..'),
]);
export const IMAGES_PATH = pickImageRootPath([
  process.env.IMAGES_PATH,
  NESQL_REPOSITORY_PATH ? path.join(NESQL_REPOSITORY_PATH, 'image') : undefined,
  path.resolve(process.cwd(), '..', 'image'),
  path.resolve(process.cwd(), '..', '..', 'image'),
]);
export const NESQL_IMAGES_DIR = pickFirstExistingPath([
  process.env.NESQL_IMAGES_DIR,
  IMAGES_PATH ? path.join(IMAGES_PATH, 'item') : undefined,
  NESQL_REPOSITORY_PATH ? path.join(NESQL_REPOSITORY_PATH, 'image', 'item') : undefined,
]);
export const NESQL_MULTIBLOCKS_FILE = pickFirstExistingPath([
  process.env.NESQL_MULTIBLOCKS_FILE,
  NESQL_REPOSITORY_PATH
    ? path.join(NESQL_REPOSITORY_PATH, 'multiblocks', 'gregtech-multiblocks.json.gz')
    : undefined,
]);
export const NESQL_BLOCK_FACES_FILE = pickFirstExistingPath([
  process.env.NESQL_BLOCK_FACES_FILE,
  NESQL_REPOSITORY_PATH
    ? path.join(NESQL_REPOSITORY_PATH, 'multiblocks', 'block-face-textures.json.gz')
    : undefined,
]);
export const NESQL_BLOCK_FACE_ICON_MAP_FILE = pickFirstExistingPath([
  process.env.NESQL_BLOCK_FACE_ICON_MAP_FILE,
  NESQL_REPOSITORY_PATH
    ? path.join(NESQL_REPOSITORY_PATH, 'multiblocks', 'block-face-icon-map.json.gz')
    : undefined,
  NESQL_REPOSITORY_PATH
    ? path.join(NESQL_REPOSITORY_PATH, 'multiblocks', 'block-face-icon-map.json')
    : undefined,
]);
export const NESQL_CANONICAL_DIR = pickFirstExistingPath([
  process.env.NESQL_CANONICAL_DIR,
  NESQL_REPOSITORY_PATH ? path.join(NESQL_REPOSITORY_PATH, 'canonical') : undefined,
]);
export const SPLIT_ITEMS_DIR = pickFirstExistingPath([
  process.env.NESQL_SPLIT_ITEMS_DIR,
  NESQL_REPOSITORY_PATH ? path.join(NESQL_REPOSITORY_PATH, 'items') : undefined,
  path.join(DATA_DIR, 'items'),
]);
export const SPLIT_RECIPES_DIR = pickFirstExistingPath([
  process.env.NESQL_SPLIT_RECIPES_DIR,
  NESQL_REPOSITORY_PATH ? path.join(NESQL_REPOSITORY_PATH, 'recipes') : undefined,
  path.join(DATA_DIR, 'recipes'),
]);
export const NESQL_RENDER_ASSETS_FILE = pickFirstExistingPath([
  process.env.NESQL_RENDER_ASSETS_FILE,
  NESQL_CANONICAL_DIR ? path.join(NESQL_CANONICAL_DIR, 'render-assets.json') : undefined,
]);
export const NESQL_ANIMATION_MANIFEST_FILE = pickFirstExistingPath([
  process.env.NESQL_ANIMATION_MANIFEST_FILE,
  NESQL_CANONICAL_DIR ? path.join(NESQL_CANONICAL_DIR, 'animation-manifest.json') : undefined,
]);
export const NESQL_ATLAS_MANIFEST_FILE = pickFirstExistingPath([
  process.env.NESQL_ATLAS_MANIFEST_FILE,
  NESQL_CANONICAL_DIR ? path.join(NESQL_CANONICAL_DIR, 'atlas-manifest.json') : undefined,
]);
export const NESQL_ANIMATED_ATLAS_MANIFEST_FILE = pickFirstExistingPath([
  process.env.NESQL_ANIMATED_ATLAS_MANIFEST_FILE,
  NESQL_CANONICAL_DIR ? path.join(NESQL_CANONICAL_DIR, 'animated-atlas-manifest.json') : undefined,
]);
export const NESQL_RENDER_INDEX_FILE = pickFirstExistingPath([
  process.env.NESQL_RENDER_INDEX_FILE,
  NESQL_CANONICAL_DIR ? path.join(NESQL_CANONICAL_DIR, 'render-index.json') : undefined,
]);
export const NESQL_ATLAS_REGISTRY_FILE = pickFirstExistingPath([
  process.env.NESQL_ATLAS_REGISTRY_FILE,
  NESQL_CANONICAL_DIR ? path.join(NESQL_CANONICAL_DIR, 'atlas-registry.json') : undefined,
]);
