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
import { countManifestAssets } from './manifest-counts';

type JsonValue = Record<string, unknown>;

function readJsonIfExists(filePath: string): JsonValue | null {
  if (!filePath || !fs.existsSync(filePath)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as JsonValue;
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

export interface AnimatedAtlasTimelineEntry {
  timelineIndex: number;
  frameIndex: number;
  index: number;
  durationMs: number;
}

export interface AnimatedAtlasAssetEntry {
  assetId: string;
  variantKey: string;
  frameDurationMs: number | null;
  loopMode: string | null;
  frameCount: number;
  timeline: AnimatedAtlasTimelineEntry[];
  frames: AnimatedAtlasFrameEntry[];
  atlasFile: string;
  atlasGroup: string;
}

export interface RenderContractAssetEntry {
  assetId: string;
  variantKey: string;
  sourceType: string | null;
  family: string | null;
  mode: string | null;
  renderMode: string | null;
  animationMode: string | null;
  captureMethod: string | null;
  captureSource: string | null;
  rendererFamily: string | null;
  playbackHint: string | null;
  staticFile: string | null;
  primaryArtifact: string | null;
  spriteMetadataFile: string | null;
  nativeSpriteAtlasFile: string | null;
  contractFile: string | null;
  atlasGroup: string | null;
  frameCount: number | null;
  frameDurationMs: number | null;
  layers: Array<Record<string, unknown>>;
  rendererContract: Record<string, unknown> | null;
  shaderContract: Record<string, unknown> | null;
  captureContract: Record<string, unknown> | null;
}

export interface RenderAnimationHint {
  renderMode: string | null;
  animationMode: string | null;
  playbackHint: string | null;
  frameCount: number | null;
  explicitStatic: boolean;
  prefersNativeSprite: boolean;
  prefersCapturedAtlas: boolean;
  hasAnimation: boolean;
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
        timeline?: Array<{
          timelineIndex?: number;
          frameIndex?: number;
          index?: number;
          durationMs?: number;
        }>;
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

type RenderAssetsManifestJson = {
  assets?: Array<Record<string, unknown>>;
};

export class RenderContractService {
  private animatedAtlasEntryCache: Map<string, AnimatedAtlasAssetEntry> | null = null;
  private renderAssetEntryCache: Map<string, RenderContractAssetEntry> | null = null;

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
          assetCount: countManifestAssets(renderAssets),
          groupCount: countTopLevelGroups(renderAssets),
        },
        animationManifest: {
          path: NESQL_ANIMATION_MANIFEST_FILE,
          exists: Boolean(animationManifest),
          assetCount: countManifestAssets(animationManifest),
          groupCount: countTopLevelGroups(animationManifest),
        },
        atlasManifest: {
          path: NESQL_ATLAS_MANIFEST_FILE,
          exists: Boolean(atlasManifest),
          assetCount: countManifestAssets(atlasManifest),
          groupCount: countTopLevelGroups(atlasManifest),
        },
        animatedAtlasManifest: {
          path: NESQL_ANIMATED_ATLAS_MANIFEST_FILE,
          exists: Boolean(animatedAtlasManifest),
          assetCount: countManifestAssets(animatedAtlasManifest),
          groupCount: countTopLevelGroups(animatedAtlasManifest),
        },
        renderIndex: {
          path: NESQL_RENDER_INDEX_FILE,
          exists: Boolean(renderIndex),
          assetCount: countManifestAssets(renderIndex),
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

  getAnimatedAtlasEntries(assetIds: string[]): Map<string, AnimatedAtlasAssetEntry> {
    const cache = this.getAnimatedAtlasEntryCache();
    const entries = new Map<string, AnimatedAtlasAssetEntry>();

    for (const assetId of assetIds) {
      if (!assetId) continue;
      const entry = cache.get(assetId);
      if (!entry) continue;
      entries.set(assetId, entry);
    }

    return entries;
  }

  getRenderAssetEntry(assetId: string): RenderContractAssetEntry {
    const cache = this.getRenderAssetEntryCache();
    const entry = cache.get(assetId);
    if (!entry) {
      throw notFound(`Render contract asset not found: ${assetId}`);
    }
    return entry;
  }

  getRenderAnimationHint(assetId: string): RenderAnimationHint | null {
    if (!assetId) return null;
    const entry = this.getRenderAssetEntryCache().get(assetId);
    return entry ? deriveRenderAnimationHint(entry) : null;
  }

  getRenderAnimationHints(assetIds: string[]): Map<string, RenderAnimationHint> {
    const cache = this.getRenderAssetEntryCache();
    const hints = new Map<string, RenderAnimationHint>();

    for (const assetId of assetIds) {
      if (!assetId) continue;
      const entry = cache.get(assetId);
      if (!entry) continue;
      hints.set(assetId, deriveRenderAnimationHint(entry));
    }

    return hints;
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
        const timeline: AnimatedAtlasTimelineEntry[] = [];
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
        for (const frame of asset.timeline ?? []) {
          if (
            typeof frame.timelineIndex !== 'number'
            || typeof frame.frameIndex !== 'number'
            || typeof frame.index !== 'number'
            || typeof frame.durationMs !== 'number'
          ) {
            continue;
          }
          timeline.push({
            timelineIndex: frame.timelineIndex,
            frameIndex: frame.frameIndex,
            index: frame.index,
            durationMs: frame.durationMs,
          });
        }
        entries.set(asset.assetId, {
          assetId: asset.assetId,
          variantKey: typeof asset.variantKey === 'string' ? asset.variantKey : asset.assetId,
          frameDurationMs: typeof asset.frameDurationMs === 'number' ? asset.frameDurationMs : null,
          loopMode: typeof asset.loopMode === 'string' ? asset.loopMode : null,
          frameCount: typeof asset.frameCount === 'number' ? asset.frameCount : (asset.frames?.length ?? 0),
          timeline,
          frames,
          atlasFile,
          atlasGroup,
        });
      }
    }

    this.animatedAtlasEntryCache = entries;
    return entries;
  }

  private getRenderAssetEntryCache(): Map<string, RenderContractAssetEntry> {
    if (this.renderAssetEntryCache) {
      return this.renderAssetEntryCache;
    }

    const payload = readJsonIfExists(NESQL_RENDER_ASSETS_FILE) as RenderAssetsManifestJson | null;
    const entries = new Map<string, RenderContractAssetEntry>();

    for (const asset of payload?.assets ?? []) {
      const assetId = typeof asset.assetId === 'string' ? asset.assetId : '';
      if (!assetId) continue;
      entries.set(assetId, normalizeRenderAssetEntry(asset));
    }

    this.renderAssetEntryCache = entries;
    return entries;
  }
}

function normalizeRenderAssetEntry(asset: Record<string, unknown>): RenderContractAssetEntry {
  const layers = Array.isArray(asset.layers)
    ? asset.layers.filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === 'object')
    : [];
  const mode = typeof asset.mode === 'string' ? asset.mode : null;
  const renderMode =
    typeof asset.renderMode === 'string'
      ? asset.renderMode
      : mode === 'native_sprite_animation' || mode === 'native_sprite_snapshot'
        ? 'native_sprite'
        : mode === 'rendered_frames'
          ? 'captured_final_atlas'
          : 'native_sprite';

  return {
    assetId: typeof asset.assetId === 'string' ? asset.assetId : '',
    variantKey: typeof asset.variantKey === 'string' ? asset.variantKey : '',
    sourceType: typeof asset.sourceType === 'string' ? asset.sourceType : null,
    family: typeof asset.family === 'string' ? asset.family : null,
    mode,
    renderMode,
    animationMode: typeof asset.animationMode === 'string' ? asset.animationMode : null,
    captureMethod: typeof asset.captureMethod === 'string' ? asset.captureMethod : null,
    captureSource: typeof asset.captureSource === 'string' ? asset.captureSource : null,
    rendererFamily: typeof asset.rendererFamily === 'string' ? asset.rendererFamily : null,
    playbackHint: typeof asset.playbackHint === 'string' ? asset.playbackHint : null,
    staticFile: typeof asset.staticFile === 'string' ? asset.staticFile : null,
    primaryArtifact: typeof asset.primaryArtifact === 'string' ? asset.primaryArtifact : null,
    spriteMetadataFile: typeof asset.spriteMetadataFile === 'string' ? asset.spriteMetadataFile : null,
    nativeSpriteAtlasFile:
      typeof asset.nativeSpriteAtlasFile === 'string' ? asset.nativeSpriteAtlasFile : null,
    contractFile: typeof asset.contractFile === 'string' ? asset.contractFile : null,
    atlasGroup: typeof asset.atlasGroup === 'string' ? asset.atlasGroup : null,
    frameCount: typeof asset.frameCount === 'number' ? asset.frameCount : null,
    frameDurationMs: typeof asset.frameDurationMs === 'number' ? asset.frameDurationMs : null,
    layers,
    rendererContract:
      asset.rendererContract && typeof asset.rendererContract === 'object'
        ? (asset.rendererContract as Record<string, unknown>)
        : null,
    shaderContract:
      asset.shaderContract && typeof asset.shaderContract === 'object'
        ? (asset.shaderContract as Record<string, unknown>)
        : null,
    captureContract:
      asset.captureContract && typeof asset.captureContract === 'object'
        ? (asset.captureContract as Record<string, unknown>)
        : null,
  };
}

function deriveRenderAnimationHint(entry: RenderContractAssetEntry): RenderAnimationHint {
  const captureContract = entry.captureContract as { multiFrame?: unknown } | null;
  const rendererContract = entry.rendererContract as {
    needsMultipleFrames?: unknown;
    shouldPreferNativeSpriteAnimation?: unknown;
    nativeFrameCount?: unknown;
  } | null;
  const hasAuxNativeSprite =
    entry.animationMode === 'native_sprite_aux'
    || (
      typeof entry.spriteMetadataFile === 'string'
      && entry.spriteMetadataFile.length > 0
      && typeof entry.nativeSpriteAtlasFile === 'string'
      && entry.nativeSpriteAtlasFile.length > 0
      && Number(rendererContract?.nativeFrameCount ?? entry.frameCount ?? 0) > 1
    );

  const explicitStatic =
    (entry.animationMode === 'none' && !hasAuxNativeSprite)
    || entry.playbackHint === 'static'
    || (
      typeof entry.frameCount === 'number'
      && entry.frameCount <= 1
      && entry.animationMode !== 'native_sprite'
      && entry.animationMode !== 'native_sprite_aux'
    )
    || (captureContract?.multiFrame === false && rendererContract?.needsMultipleFrames === false && !hasAuxNativeSprite)
    || (
      rendererContract?.shouldPreferNativeSpriteAnimation === false
      && !hasAuxNativeSprite
      && Number(rendererContract?.nativeFrameCount ?? 0) <= 1
    );

  const prefersNativeSprite =
    entry.renderMode === 'native_sprite'
    || entry.animationMode === 'native_sprite'
    || entry.animationMode === 'native_sprite_aux'
    || entry.playbackHint === 'native_sprite'
    || rendererContract?.shouldPreferNativeSpriteAnimation === true
    || hasAuxNativeSprite;

  const prefersCapturedAtlas =
    entry.renderMode === 'captured_final_atlas'
    || entry.mode === 'rendered_frames'
    || entry.animationMode === 'captured_atlas'
    || captureContract?.multiFrame === true
    || rendererContract?.needsMultipleFrames === true;

  return {
    renderMode: entry.renderMode,
    animationMode: entry.animationMode,
    playbackHint: entry.playbackHint,
    frameCount: entry.frameCount,
    explicitStatic,
    prefersNativeSprite,
    prefersCapturedAtlas,
    hasAnimation: !explicitStatic && (prefersNativeSprite || prefersCapturedAtlas || (typeof entry.frameCount === 'number' && entry.frameCount > 1)),
  };
}

let instance: RenderContractService | null = null;

export function getRenderContractService(): RenderContractService {
  if (!instance) {
    instance = new RenderContractService();
  }
  return instance;
}
