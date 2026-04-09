import fs from 'fs';
import zlib from 'zlib';
import { BLOCK_FACE_ICON_OVERRIDES } from '../config/block-face-icon-overrides';
import { NESQL_BLOCK_FACE_ICON_MAP_FILE } from '../config/runtime-paths';

type IconMapPayload =
  | Record<string, string>
  | {
      mappings?: Record<string, string>;
      iconMap?: Record<string, string>;
      entries?: Array<{ iconKey?: string; icon?: string; key?: string; texturePath?: string; path?: string; value?: string }>;
    };

class BlockFaceIconMapService {
  private cacheMtimeMs = 0;
  private iconToTexturePath = new Map<string, string>(Object.entries(BLOCK_FACE_ICON_OVERRIDES));

  private normalizePath(raw: string): string {
    const value = raw.trim();
    if (!value) return '';
    if (/^https?:\/\//i.test(value)) return value;
    if (value.startsWith('/images/')) return value;
    if (value.startsWith('/')) return `/images${value}`;
    if (value.startsWith('item/') || value.startsWith('fluid/')) return `/images/${value}`;
    return `/images/item/${value}`;
  }

  private parsePayload(payload: IconMapPayload): Map<string, string> {
    const map = new Map<string, string>();
    const mergeRecord = (record?: Record<string, string>) => {
      if (!record) return;
      for (const [key, value] of Object.entries(record)) {
        if (!key || typeof value !== 'string') continue;
        const normalized = this.normalizePath(value);
        if (!normalized) continue;
        map.set(key, normalized);
      }
    };

    if (payload && !Array.isArray(payload) && typeof payload === 'object') {
      const obj = payload as Exclude<IconMapPayload, Record<string, string>>;
      mergeRecord((payload as Record<string, string>) ?? undefined);
      mergeRecord(obj.mappings);
      mergeRecord(obj.iconMap);
      for (const entry of obj.entries ?? []) {
        const iconKey = entry.iconKey ?? entry.icon ?? entry.key;
        const texturePath = entry.texturePath ?? entry.path ?? entry.value;
        if (!iconKey || !texturePath) continue;
        const normalized = this.normalizePath(texturePath);
        if (!normalized) continue;
        map.set(iconKey, normalized);
      }
    }

    return map;
  }

  private loadFromFileIfNeeded(): void {
    if (!NESQL_BLOCK_FACE_ICON_MAP_FILE || !fs.existsSync(NESQL_BLOCK_FACE_ICON_MAP_FILE)) {
      this.iconToTexturePath = new Map<string, string>(Object.entries(BLOCK_FACE_ICON_OVERRIDES));
      this.cacheMtimeMs = 0;
      return;
    }
    const stat = fs.statSync(NESQL_BLOCK_FACE_ICON_MAP_FILE);
    if (stat.mtimeMs === this.cacheMtimeMs) return;

    const rawBuffer = fs.readFileSync(NESQL_BLOCK_FACE_ICON_MAP_FILE);
    const text = NESQL_BLOCK_FACE_ICON_MAP_FILE.endsWith('.gz')
      ? zlib.gunzipSync(rawBuffer).toString('utf-8')
      : rawBuffer.toString('utf-8');
    const payload = JSON.parse(text) as IconMapPayload;
    const map = this.parsePayload(payload);
    for (const [key, value] of Object.entries(BLOCK_FACE_ICON_OVERRIDES)) {
      if (!map.has(key)) {
        map.set(key, this.normalizePath(value));
      }
    }
    this.iconToTexturePath = map;
    this.cacheMtimeMs = stat.mtimeMs;
  }

  resolveIconKey(iconKey?: string): string | undefined {
    if (!iconKey) return undefined;
    this.loadFromFileIfNeeded();
    return this.iconToTexturePath.get(iconKey);
  }
}

let instance: BlockFaceIconMapService | null = null;

export function getBlockFaceIconMapService(): BlockFaceIconMapService {
  if (!instance) {
    instance = new BlockFaceIconMapService();
  }
  return instance;
}
