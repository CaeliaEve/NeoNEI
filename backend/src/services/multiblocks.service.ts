import fs from 'fs';
import zlib from 'zlib';
import { NESQL_MULTIBLOCKS_FILE } from '../config/runtime-paths';
import {
  MULTIBLOCK_OVERRIDES,
  type MultiblockBlueprintOverride,
  type MultiblockVoxelBlueprintOverride,
} from '../config/multiblock-overrides';
import { getBlockFaceTexturesService } from './block-face-textures.service';

type OptionalFeatures = {
  inputSeparation?: boolean;
  batchMode?: boolean;
  recipeLocking?: boolean;
  voidProtection?: boolean;
};

type Dimensions = {
  x: number;
  y: number;
  z: number;
  raw?: string;
};

type VoxelLegend = {
  label: string;
  color?: string;
  textureUrl?: string;
  blockId?: string;
  faceIcons?: Record<string, string>;
  faceTextureUrls?: Record<string, string>;
  faceUv?: Record<
    string,
    {
      minU: number;
      maxU: number;
      minV: number;
      maxV: number;
    }
  >;
  orientationKind?: string;
};

type VoxelBlueprint = {
  size: { x: number; y: number; z: number };
  layers: string[][];
  legend: Record<string, VoxelLegend>;
};

export interface MultiblockBlueprint {
  metaTileId: number;
  className: string;
  controllerItemId: string;
  controllerLocalizedName: string;
  structureSource?: string;
  supports?: OptionalFeatures;
  dimensions?: Dimensions | null;
  information?: string[];
  structureInformation?: string[];
  structureHints?: string[];
  voxelBlueprint?: VoxelBlueprint;
}

type ExportPayload = {
  generatedAtEpochMs?: number;
  totalMetaTileEntitiesScanned?: number;
  totalMultiblocksExported?: number;
  failedControllers?: number;
  blueprints?: MultiblockBlueprint[];
};

class MultiblocksService {
  private static readonly MAX_FALLBACK_VOXEL_VOLUME = 250_000;
  private static readonly MAX_AXIS_X = 48;
  private static readonly MAX_AXIS_Y = 32;
  private static readonly MAX_AXIS_Z = 48;
  private cache: ExportPayload | null = null;
  private cacheMtimeMs = 0;

  private ensureLoaded(): ExportPayload {
    if (!NESQL_MULTIBLOCKS_FILE || !fs.existsSync(NESQL_MULTIBLOCKS_FILE)) {
      throw new Error(`Multiblock blueprint file not found: ${NESQL_MULTIBLOCKS_FILE || 'unset'}`);
    }

    const stat = fs.statSync(NESQL_MULTIBLOCKS_FILE);
    if (this.cache && this.cacheMtimeMs === stat.mtimeMs) {
      return this.cache;
    }

    const gzBuffer = fs.readFileSync(NESQL_MULTIBLOCKS_FILE);
    const jsonBuffer = zlib.gunzipSync(gzBuffer);
    const payload = JSON.parse(jsonBuffer.toString('utf-8')) as ExportPayload;
    this.cache = payload;
    this.cacheMtimeMs = stat.mtimeMs;
    return payload;
  }

  private mergeOverride(
    base: MultiblockBlueprint,
    override: MultiblockBlueprintOverride | undefined,
  ): MultiblockBlueprint {
    if (!override) return base;
    return {
      ...base,
      dimensions: override.dimensions ?? base.dimensions,
      structureInformation: override.structureInformation ?? base.structureInformation,
      structureHints: override.structureHints ?? base.structureHints,
      voxelBlueprint: override.voxelBlueprint ?? base.voxelBlueprint,
    };
  }

  private buildFallbackVoxelBlueprint(dimensions?: Dimensions | null): VoxelBlueprint | undefined {
    if (!dimensions) return undefined;
    const { x, y, z } = dimensions;
    if (!x || !y || !z || x <= 0 || y <= 0 || z <= 0) return undefined;
    const volume = x * y * z;
    if (volume > MultiblocksService.MAX_FALLBACK_VOXEL_VOLUME) {
      return this.buildCoarseShellVoxelBlueprint(dimensions);
    }

    const cx = Math.floor(x / 2);
    const frontZ = 0;
    const cy = Math.min(1, y - 1);

    const layers: string[][] = [];
    for (let yy = 0; yy < y; yy++) {
      const rows: string[] = [];
      for (let zz = 0; zz < z; zz++) {
        let row = '';
        for (let xx = 0; xx < x; xx++) {
          const isBoundary =
            xx === 0 || xx === x - 1 || zz === 0 || zz === z - 1 || yy === 0 || yy === y - 1;
          let token = isBoundary ? 'C' : 'A';
          if (xx === cx && zz === frontZ && yy === cy) {
            token = 'X';
          }
          row += token;
        }
        rows.push(row);
      }
      layers.push(rows);
    }

    return {
      size: { x, y, z },
      layers,
      legend: {
        X: { label: '控制器', color: '#f59e0b' },
        C: { label: '主体方块', color: '#06b6d4' },
        A: { label: '空气', color: '#0ea5e9' },
      },
    };
  }

  private buildCoarseShellVoxelBlueprint(dimensions: Dimensions): VoxelBlueprint | undefined {
    const sx = Math.max(3, Math.min(MultiblocksService.MAX_AXIS_X, dimensions.x));
    const sy = Math.max(3, Math.min(MultiblocksService.MAX_AXIS_Y, dimensions.y));
    const sz = Math.max(3, Math.min(MultiblocksService.MAX_AXIS_Z, dimensions.z));

    const layers: string[][] = [];
    const cx = Math.floor(sx / 2);
    const frontZ = 0;
    const cy = Math.min(1, sy - 1);

    for (let y = 0; y < sy; y++) {
      const rows: string[] = [];
      for (let z = 0; z < sz; z++) {
        let row = '';
        for (let x = 0; x < sx; x++) {
          const isBoundary =
            x === 0 || x === sx - 1 || z === 0 || z === sz - 1 || y === 0 || y === sy - 1;
          let token = isBoundary ? 'C' : 'A';
          if (x === cx && z === frontZ && y === cy) {
            token = 'X';
          }
          row += token;
        }
        rows.push(row);
      }
      layers.push(rows);
    }

    return {
      size: { x: sx, y: sy, z: sz },
      layers,
      legend: {
        X: { label: '控制器（缩略）', color: '#f59e0b' },
        C: { label: '结构外壳（抽稀）', color: '#06b6d4' },
        A: { label: '空气', color: '#0ea5e9' },
      },
    };
  }

  private normalizeVoxelBlueprint(
    voxel: MultiblockVoxelBlueprintOverride | VoxelBlueprint | undefined,
  ): VoxelBlueprint | undefined {
    if (!voxel) return undefined;
    const { size, layers, legend } = voxel;
    if (!size || !layers || !legend) return undefined;
    if (layers.length !== size.y) return undefined;
    const valid = layers.every((rows) => rows.length === size.z && rows.every((row) => row.length === size.x));
    if (!valid) return undefined;
    return { size, layers, legend };
  }

  private inferBlockIdFromTextureUrl(textureUrl?: string): string | undefined {
    if (!textureUrl) return undefined;
    const m = textureUrl.match(/^\/images\/item\/([^/]+)\/(.+)\.png$/i);
    if (!m) return undefined;
    const modId = m[1];
    const raw = m[2];
    const parts = raw.split('~');
    if (parts.length < 2) return undefined;
    const internalName = parts[0];
    const damage = parts[1];
    return `i~${modId}~${internalName}~${damage}`;
  }

  private enrichLegendWithBlockFaces(voxel?: VoxelBlueprint): VoxelBlueprint | undefined {
    if (!voxel) return voxel;
    const svc = getBlockFaceTexturesService();
    const legend: Record<string, VoxelLegend> = {};
    for (const [token, entry] of Object.entries(voxel.legend)) {
      const blockId = entry.blockId ?? this.inferBlockIdFromTextureUrl(entry.textureUrl);
      const blockFace = blockId ? svc.getByBlockId(blockId) : undefined;
      legend[token] = {
        ...entry,
        blockId: blockId ?? entry.blockId,
        faceIcons: blockFace?.faces,
        faceTextureUrls: blockFace?.faceTextureUrls,
        faceUv: blockFace?.faceUv,
        orientationKind: blockFace?.orientationKind,
      };
    }
    return { ...voxel, legend };
  }

  private buildControllerCandidates(controllerItemId: string): string[] {
    const raw = (controllerItemId || '').trim();
    if (!raw) return [];
    const candidates = new Set<string>([raw]);
    const parts = raw.split('~');
    // NESQL item id shape: i~modId~internalName~damage(~nbt)
    if (parts.length >= 4) {
      const base4 = parts.slice(0, 4).join('~');
      candidates.add(base4);
      // Some exports may vary in damage; also provide mod+internal fallback.
      if (parts.length >= 3) {
        candidates.add(`i~${parts[1]}~${parts[2]}~0`);
      }
    }
    return Array.from(candidates);
  }

  private resolveBlueprintFromPayload(
    payload: ExportPayload | null,
    candidates: string[],
  ): MultiblockBlueprint | null {
    const blueprints = payload?.blueprints || [];
    for (const id of candidates) {
      const hit = blueprints.find((bp) => bp.controllerItemId === id);
      if (hit) return hit;
    }
    return null;
  }

  getBlueprintByControllerItemId(controllerItemId: string): MultiblockBlueprint | null {
    const candidates = this.buildControllerCandidates(controllerItemId);
    let payload: ExportPayload | null = null;
    try {
      payload = this.ensureLoaded();
    } catch {
      // Allow manual overrides even when exported multiblock file is absent.
      payload = null;
    }

    const raw = this.resolveBlueprintFromPayload(payload, candidates);
    let override: MultiblockBlueprintOverride | undefined;
    for (const id of candidates) {
      if (MULTIBLOCK_OVERRIDES[id]) {
        override = MULTIBLOCK_OVERRIDES[id];
        break;
      }
    }
    if (!raw && !override) return null;

    const base: MultiblockBlueprint =
      raw ??
      ({
        metaTileId: -1,
        className: 'override-only',
        controllerItemId: candidates[0] || controllerItemId,
        controllerLocalizedName: controllerItemId,
        structureSource: 'manual_override',
        supports: {},
        dimensions: null,
        information: [],
        structureInformation: [],
        structureHints: [],
      } as MultiblockBlueprint);

    const merged = this.mergeOverride(base, override);
    const normalized = this.normalizeVoxelBlueprint(merged.voxelBlueprint);
    const fallback = this.buildFallbackVoxelBlueprint(merged.dimensions);
    return {
      ...merged,
      voxelBlueprint: this.enrichLegendWithBlockFaces(normalized ?? fallback),
    };
  }
}

let instance: MultiblocksService | null = null;

export function getMultiblocksService(): MultiblocksService {
  if (!instance) {
    instance = new MultiblocksService();
  }
  return instance;
}

