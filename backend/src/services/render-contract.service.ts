import fs from 'fs';
import {
  NESQL_RENDER_ASSETS_FILE,
  NESQL_ANIMATION_MANIFEST_FILE,
  NESQL_ATLAS_MANIFEST_FILE,
  NESQL_ANIMATED_ATLAS_MANIFEST_FILE,
  NESQL_RENDER_INDEX_FILE,
  NESQL_ATLAS_REGISTRY_FILE,
  NESQL_CANONICAL_DIR,
} from '../config/runtime-paths';
import { notFound } from '../utils/http';

type JsonValue = Record<string, unknown>;

function readJsonIfExists(filePath: string): JsonValue | null {
  if (!filePath || !fs.existsSync(filePath)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as JsonValue;
}

function countTopLevelAssets(payload: JsonValue | null): number {
  if (!payload) return 0;
  const assets = payload.assets;
  return Array.isArray(assets) ? assets.length : 0;
}

function countTopLevelGroups(payload: JsonValue | null): number {
  if (!payload) return 0;
  const groups = payload.groups;
  return Array.isArray(groups) ? groups.length : 0;
}

function countAtlasRegistryAtlases(payload: JsonValue | null): number {
  if (!payload) return 0;
  const atlases = payload.atlases;
  return Array.isArray(atlases) ? atlases.length : 0;
}

export interface RenderContractOverview {
  canonicalDir: string;
  files: {
    renderAssets: { path: string; exists: boolean; assetCount: number; groupCount: number };
    animationManifest: { path: string; exists: boolean; assetCount: number; groupCount: number };
    atlasManifest: { path: string; exists: boolean; assetCount: number; groupCount: number };
    animatedAtlasManifest: { path: string; exists: boolean; assetCount: number; groupCount: number };
    renderIndex: { path: string; exists: boolean; assetCount: number };
    atlasRegistry: { path: string; exists: boolean; atlasCount: number; assetCount: number };
  };
}

export interface AnimatedAtlasFrameEntry {
  index: number;
  sourcePath: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface AnimatedAtlasAssetEntry {
  assetId: string;
  variantKey: string;
  frameDurationMs: number | null;
  loopMode: string | null;
  frameCount: number;
  frames: AnimatedAtlasFrameEntry[];
  atlasFile: string;
  atlasGroup: string;
}

type AnimatedAtlasManifestJson = {
  groups?: Array<{
    atlasGroup?: string;
    atlasFile?: string;
    assets?: Array<{
      assetId?: string;
      variantKey?: string;
      frameDurationMs?: number | null;
      loopMode?: string | null;
      frameCount?: number;
      frames?: Array<{
        index?: number;
        sourcePath?: string;
        x?: number;
        y?: number;
        width?: number;
        height?: number;
      }>;
    }>;
  }>;
};

export class RenderContractService {
  private animatedAtlasEntryCache: Map<string, AnimatedAtlasAssetEntry> | null = null;

  getOverview(): RenderContractOverview {
    const renderAssets = readJsonIfExists(NESQL_RENDER_ASSETS_FILE);
    const animationManifest = readJsonIfExists(NESQL_ANIMATION_MANIFEST_FILE);
    const atlasManifest = readJsonIfExists(NESQL_ATLAS_MANIFEST_FILE);
    const animatedAtlasManifest = readJsonIfExists(NESQL_ANIMATED_ATLAS_MANIFEST_FILE);
    const renderIndex = readJsonIfExists(NESQL_RENDER_INDEX_FILE);
    const atlasRegistry = readJsonIfExists(NESQL_ATLAS_REGISTRY_FILE);

    return {
      canonicalDir: NESQL_CANONICAL_DIR || '',
      files: {
        renderAssets: {
          path: NESQL_RENDER_ASSETS_FILE,
          exists: Boolean(renderAssets),
          assetCount: countTopLevelAssets(renderAssets),
          groupCount: countTopLevelGroups(renderAssets),
        },
        animationManifest: {
          path: NESQL_ANIMATION_MANIFEST_FILE,
          exists: Boolean(animationManifest),
          assetCount: countTopLevelAssets(animationManifest),
          groupCount: countTopLevelGroups(animationManifest),
        },
        atlasManifest: {
          path: NESQL_ATLAS_MANIFEST_FILE,
          exists: Boolean(atlasManifest),
          assetCount: countTopLevelAssets(atlasManifest),
          groupCount: countTopLevelGroups(atlasManifest),
        },
        animatedAtlasManifest: {
          path: NESQL_ANIMATED_ATLAS_MANIFEST_FILE,
          exists: Boolean(animatedAtlasManifest),
          assetCount: countTopLevelAssets(animatedAtlasManifest),
          groupCount: countTopLevelGroups(animatedAtlasManifest),
        },
        renderIndex: {
          path: NESQL_RENDER_INDEX_FILE,
          exists: Boolean(renderIndex),
          assetCount: countTopLevelAssets(renderIndex),
        },
        atlasRegistry: {
          path: NESQL_ATLAS_REGISTRY_FILE,
          exists: Boolean(atlasRegistry),
          atlasCount: countAtlasRegistryAtlases(atlasRegistry),
          assetCount:
            typeof atlasRegistry?.assetCount === 'number'
              ? (atlasRegistry.assetCount as number)
              : 0,
        },
      },
    };
  }

  getAnimatedAtlasEntry(assetId: string): AnimatedAtlasAssetEntry {
    const cache = this.getAnimatedAtlasEntryCache();
    const entry = cache.get(assetId);
    if (!entry) {
      throw notFound(`Animated atlas asset not found: ${assetId}`);
    }
    return entry;
  }

  private getAnimatedAtlasEntryCache(): Map<string, AnimatedAtlasAssetEntry> {
    if (this.animatedAtlasEntryCache) {
      return this.animatedAtlasEntryCache;
    }

    const payload = readJsonIfExists(NESQL_ANIMATED_ATLAS_MANIFEST_FILE) as AnimatedAtlasManifestJson | null;
    const entries = new Map<string, AnimatedAtlasAssetEntry>();

    for (const group of payload?.groups ?? []) {
      const atlasFile = typeof group.atlasFile === 'string' ? group.atlasFile : '';
      const atlasGroup = typeof group.atlasGroup === 'string' ? group.atlasGroup : 'ungrouped';
      for (const asset of group.assets ?? []) {
        if (typeof asset.assetId !== 'string' || !asset.assetId) continue;
        const frames: AnimatedAtlasFrameEntry[] = [];
        for (const frame of asset.frames ?? []) {
          if (
            typeof frame.index !== 'number'
            || typeof frame.sourcePath !== 'string'
            || typeof frame.x !== 'number'
            || typeof frame.y !== 'number'
            || typeof frame.width !== 'number'
            || typeof frame.height !== 'number'
          ) {
            continue;
          }
          frames.push({
            index: frame.index,
            sourcePath: frame.sourcePath,
            x: frame.x,
            y: frame.y,
            width: frame.width,
            height: frame.height,
          });
        }
        entries.set(asset.assetId, {
          assetId: asset.assetId,
          variantKey: typeof asset.variantKey === 'string' ? asset.variantKey : asset.assetId,
          frameDurationMs: typeof asset.frameDurationMs === 'number' ? asset.frameDurationMs : null,
          loopMode: typeof asset.loopMode === 'string' ? asset.loopMode : null,
          frameCount: typeof asset.frameCount === 'number' ? asset.frameCount : (asset.frames?.length ?? 0),
          frames,
          atlasFile,
          atlasGroup,
        });
      }
    }

    this.animatedAtlasEntryCache = entries;
    return entries;
  }
}

let instance: RenderContractService | null = null;

export function getRenderContractService(): RenderContractService {
  if (!instance) {
    instance = new RenderContractService();
  }
  return instance;
}
