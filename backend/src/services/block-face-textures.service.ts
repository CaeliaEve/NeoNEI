import fs from 'fs';
import zlib from 'zlib';
import { NESQL_BLOCK_FACES_FILE } from '../config/runtime-paths';
import { getBlockFaceIconMapService } from './block-face-icon-map.service';

export type BlockFaceEntry = {
  blockId: string;
  blockRegistryName?: string;
  modId?: string;
  internalName?: string;
  meta?: number;
  orientationKind?: string;
  faces: Record<string, string>;
  faceUv?: Record<
    string,
    {
      minU: number;
      maxU: number;
      minV: number;
      maxV: number;
    }
  >;
  faceTextureUrls?: Record<string, string>;
};

type BlockFacePayload = {
  generatedAtEpochMs?: number;
  totalBlocksScanned?: number;
  totalBlockStatesExported?: number;
  entries?: BlockFaceEntry[];
};

class BlockFaceTexturesService {
  private cacheMtimeMs = 0;
  private blockFaceMap = new Map<string, BlockFaceEntry>();

  private loadIfNeeded(): void {
    if (!NESQL_BLOCK_FACES_FILE || !fs.existsSync(NESQL_BLOCK_FACES_FILE)) {
      return;
    }
    const stat = fs.statSync(NESQL_BLOCK_FACES_FILE);
    if (stat.mtimeMs === this.cacheMtimeMs) {
      return;
    }
    const gzBuffer = fs.readFileSync(NESQL_BLOCK_FACES_FILE);
    const payload = JSON.parse(zlib.gunzipSync(gzBuffer).toString('utf-8')) as BlockFacePayload;
    const map = new Map<string, BlockFaceEntry>();
    const iconMap = getBlockFaceIconMapService();
    for (const entry of payload.entries ?? []) {
      if (!entry?.blockId || !entry.faces || typeof entry.faces !== 'object') continue;
      const faceTextureUrls: Record<string, string> = { ...(entry.faceTextureUrls || {}) };
      for (const [face, iconKey] of Object.entries(entry.faces)) {
        if (faceTextureUrls[face]) continue;
        const textureUrl = iconMap.resolveIconKey(iconKey);
        if (textureUrl) {
          faceTextureUrls[face] = textureUrl;
        }
      }
      map.set(entry.blockId, {
        ...entry,
        faceTextureUrls: Object.keys(faceTextureUrls).length > 0 ? faceTextureUrls : undefined,
      });
    }
    this.blockFaceMap = map;
    this.cacheMtimeMs = stat.mtimeMs;
  }

  getByBlockId(blockId: string): BlockFaceEntry | undefined {
    if (!blockId) return undefined;
    this.loadIfNeeded();
    return this.blockFaceMap.get(blockId);
  }
}

let instance: BlockFaceTexturesService | null = null;

export function getBlockFaceTexturesService(): BlockFaceTexturesService {
  if (!instance) {
    instance = new BlockFaceTexturesService();
  }
  return instance;
}
