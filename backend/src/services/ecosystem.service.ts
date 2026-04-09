import fs from 'fs';
import path from 'path';
import {
  DATA_DIR,
  DB_FILE,
  IMAGES_PATH,
  NESQL_IMAGES_DIR,
  NESQL_REPOSITORY_PATH,
  NESQL_CANONICAL_DIR,
  NESQL_RENDER_ASSETS_FILE,
  NESQL_ATLAS_REGISTRY_FILE,
  SPLIT_ITEMS_DIR,
  SPLIT_RECIPES_DIR,
} from '../config/runtime-paths';

export interface EcosystemLaneStatus {
  id: 'nesql-exporter-main' | 'neonei' | 'oc-pattern';
  label: string;
  role: string;
  repoPath: string;
  detected: boolean;
  details: Array<{ label: string; value: string; ok: boolean }>;
}

export interface EcosystemOverview {
  hub: string;
  workflow: string[];
  lanes: EcosystemLaneStatus[];
}

function resolveSiblingRepo(repoName: string): string {
  const cwd = process.cwd();
  const hubRoot =
    path.basename(cwd).toLowerCase() === 'backend'
      ? path.resolve(cwd, '..')
      : cwd;
  return path.resolve(hubRoot, '..', repoName);
}

function resolveCurrentHubRepo(): string {
  const cwd = process.cwd();
  return path.basename(cwd).toLowerCase() === 'backend'
    ? path.resolve(cwd, '..')
    : cwd;
}

function detail(label: string, value: string, ok: boolean) {
  return { label, value, ok };
}

export class EcosystemService {
  private cache: { expiresAt: number; value: EcosystemOverview } | null = null;
  private readonly cacheTtlMs = Number(process.env.ECOSYSTEM_OVERVIEW_CACHE_TTL_MS || 5 * 60 * 1000);

  getOverview(): EcosystemOverview {
    if (this.cache && this.cache.expiresAt > Date.now()) {
      return this.cache.value;
    }

    const nesqlRepoPath = resolveSiblingRepo('nesql-exporter-main');
    const hubRepoPath = resolveCurrentHubRepo();
    const ocPatternRepoPath = resolveSiblingRepo('oc-pattern');
    const ocLuaDocs = path.join(
      ocPatternRepoPath,
      'src',
      'main',
      'resources',
      'assets',
      'ocpattern',
      'lua',
      'README_LUA.md'
    );
    const ocTechnicalSummary = path.join(ocPatternRepoPath, 'TECHNICAL_SUMMARY.md');

    const overview: EcosystemOverview = {
      hub: 'NeoNEI',
      workflow: [
        'NESQL++ exports recipes, items, images, and indexes.',
        'NeoNEI ingests and serves the dataset as the application hub.',
        'oc-pattern automates AE2 pattern export/import workflows in-game.',
      ],
      lanes: [
        {
          id: 'nesql-exporter-main',
          label: 'NESQL Exporter',
          role: 'Upstream exporter and contract source',
          repoPath: nesqlRepoPath,
          detected: fs.existsSync(nesqlRepoPath),
          details: [
            detail('Repository', nesqlRepoPath, fs.existsSync(nesqlRepoPath)),
            detail(
              'Repository data path',
              NESQL_REPOSITORY_PATH || '(unresolved)',
              Boolean(NESQL_REPOSITORY_PATH) && fs.existsSync(NESQL_REPOSITORY_PATH)
            ),
            detail(
              'Images root',
              IMAGES_PATH || '(unresolved)',
              Boolean(IMAGES_PATH) && fs.existsSync(IMAGES_PATH)
            ),
          ],
        },
        {
          id: 'neonei',
          label: 'NeoNEI',
          role: 'Aggregation hub, API layer, and UI surface',
          repoPath: hubRepoPath,
          detected: fs.existsSync(hubRepoPath),
          details: [
            detail('Repository', hubRepoPath, fs.existsSync(hubRepoPath)),
            detail('Data directory', DATA_DIR, fs.existsSync(DATA_DIR)),
            detail('Database', DB_FILE, fs.existsSync(DB_FILE)),
            detail(
              'Item image directory',
              NESQL_IMAGES_DIR || '(unresolved)',
              Boolean(NESQL_IMAGES_DIR) && fs.existsSync(NESQL_IMAGES_DIR)
            ),
            detail(
              'Split items directory',
              SPLIT_ITEMS_DIR || '(unresolved)',
              Boolean(SPLIT_ITEMS_DIR) && fs.existsSync(SPLIT_ITEMS_DIR)
            ),
            detail(
              'Split recipes directory',
              SPLIT_RECIPES_DIR || '(unresolved)',
              Boolean(SPLIT_RECIPES_DIR) && fs.existsSync(SPLIT_RECIPES_DIR)
            ),
            detail(
              'Canonical render dir',
              NESQL_CANONICAL_DIR || '(unresolved)',
              Boolean(NESQL_CANONICAL_DIR) && fs.existsSync(NESQL_CANONICAL_DIR)
            ),
            detail(
              'Render assets manifest',
              NESQL_RENDER_ASSETS_FILE || '(unresolved)',
              Boolean(NESQL_RENDER_ASSETS_FILE) && fs.existsSync(NESQL_RENDER_ASSETS_FILE)
            ),
            detail(
              'Atlas registry',
              NESQL_ATLAS_REGISTRY_FILE || '(unresolved)',
              Boolean(NESQL_ATLAS_REGISTRY_FILE) && fs.existsSync(NESQL_ATLAS_REGISTRY_FILE)
            ),
          ],
        },
        {
          id: 'oc-pattern',
          label: 'OC Pattern',
          role: 'AE2 / OpenComputers pattern automation lane',
          repoPath: ocPatternRepoPath,
          detected: fs.existsSync(ocPatternRepoPath),
          details: [
            detail('Repository', ocPatternRepoPath, fs.existsSync(ocPatternRepoPath)),
            detail('Lua API docs', ocLuaDocs, fs.existsSync(ocLuaDocs)),
            detail('Technical summary', ocTechnicalSummary, fs.existsSync(ocTechnicalSummary)),
          ],
        },
      ],
    };
    this.cache = {
      value: overview,
      expiresAt: Date.now() + this.cacheTtlMs,
    };
    return overview;
  }
}

let ecosystemService: EcosystemService | null = null;

export function getEcosystemService(): EcosystemService {
  if (!ecosystemService) {
    ecosystemService = new EcosystemService();
  }
  return ecosystemService;
}
