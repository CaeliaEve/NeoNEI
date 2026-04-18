import type Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { DATA_DIR, IMAGES_PATH } from '../config/runtime-paths';
import { getAccelerationDatabaseManager, type DatabaseManager } from '../models/database';
import { ItemsService, type Item } from './items.service';

export interface PageAtlasSpriteEntry {
  atlasUrl: string;
  atlasWidth: number;
  atlasHeight: number;
  slotSize: number;
  x: number;
  y: number;
}

export interface PageAtlasResponse {
  atlasUrl: string;
  atlasWidth: number;
  atlasHeight: number;
  slotSize: number;
  entries: Record<string, PageAtlasSpriteEntry>;
}

type CachedAtlas = {
  signature: string;
  response: PageAtlasResponse;
};

type AtlasManifestRow = {
  asset_id: string;
  path: string;
  width: number | null;
  height: number | null;
  hash: string | null;
  metadata_json: string | null;
};

export interface PageAtlasServiceOptions {
  itemsService?: ItemsService;
  databaseManager?: DatabaseManager;
  imageRoot?: string;
  atlasDir?: string;
}

const PNG_HEADER = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function hashAtlasKey(itemIds: string[], slotSize: number): string {
  return crypto
    .createHash('sha1')
    .update(`${slotSize}:${itemIds.join('|')}`)
    .digest('hex');
}

function detectImageMime(buffer: Buffer): string {
  if (buffer.subarray(0, 4).equals(PNG_HEADER)) {
    return 'image/png';
  }
  if (buffer.subarray(0, 3).toString('ascii') === 'GIF') {
    return 'image/gif';
  }
  return 'application/octet-stream';
}

export class PageAtlasService {
  private itemsService: ItemsService;
  private databaseManager: DatabaseManager;
  private imageRoot: string;
  private atlasCache = new Map<string, CachedAtlas>();
  private readonly atlasDir: string;

  constructor(options: PageAtlasServiceOptions = {}) {
    this.itemsService = options.itemsService ?? new ItemsService({ splitExportFallback: false });
    this.databaseManager = options.databaseManager ?? getAccelerationDatabaseManager();
    this.imageRoot = options.imageRoot ?? IMAGES_PATH;
    this.atlasDir = options.atlasDir ?? path.join(DATA_DIR, 'page-atlas-cache');
    fs.mkdirSync(this.atlasDir, { recursive: true });
  }

  private getAccelerationDatabase(): Database.Database | null {
    try {
      return this.databaseManager.getDatabase();
    } catch {
      return null;
    }
  }

  private canUseAssetsManifest(db: Database.Database | null): db is Database.Database {
    if (!db) return false;
    try {
      const row = db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'assets_manifest'")
        .get() as { name?: string } | undefined;
      return row?.name === 'assets_manifest';
    } catch {
      return false;
    }
  }

  private resolveImageFilePath(imageUrl: string): string | null {
    const match = imageUrl.match(/^\/images\/item\/(.+)$/);
    if (!match) return null;
    const relativePath = match[1]
      .split('/')
      .map((part) => decodeURIComponent(part))
      .join(path.sep);
    const absolute = path.resolve(this.imageRoot, 'item', relativePath);
    const itemRoot = path.resolve(this.imageRoot, 'item');
    if (!absolute.startsWith(itemRoot) || !fs.existsSync(absolute)) {
      return null;
    }
    return absolute;
  }

  private buildSignature(items: Item[]): string {
    const hash = crypto.createHash('sha1');
    for (const item of items) {
      const imageUrl = item.preferredImageUrl || this.itemsService.resolvePreferredStaticImageUrl(item);
      const imagePath = this.resolveImageFilePath(imageUrl);
      if (!imagePath) {
        hash.update(`${item.itemId}:missing`);
        continue;
      }
      const stat = fs.statSync(imagePath);
      hash.update(`${item.itemId}:${imagePath}:${stat.size}:${stat.mtimeMs}`);
    }
    return hash.digest('hex');
  }

  private persistAtlasManifest(assetId: string, fileName: string, signature: string, response: PageAtlasResponse): void {
    const db = this.getAccelerationDatabase();
    if (!this.canUseAssetsManifest(db)) {
      return;
    }

    db.prepare(`
      INSERT OR REPLACE INTO assets_manifest (
        asset_id, asset_type, mod_id, path, width, height, hash, atlas_id,
        frame_count, first_frame_path, metadata_json, updated_at
      ) VALUES (
        @asset_id, 'page_atlas', null, @path, @width, @height, @hash, @atlas_id,
        1, null, @metadata_json, CURRENT_TIMESTAMP
      )
    `).run({
      asset_id: assetId,
      path: fileName,
      width: response.atlasWidth,
      height: response.atlasHeight,
      hash: signature,
      atlas_id: assetId,
      metadata_json: JSON.stringify(response),
    });
  }

  private readMaterializedAtlas(assetId: string, signature: string): PageAtlasResponse | null {
    const db = this.getAccelerationDatabase();
    if (!this.canUseAssetsManifest(db)) {
      return null;
    }

    const row = db.prepare(`
      SELECT asset_id, path, width, height, hash, metadata_json
      FROM assets_manifest
      WHERE asset_id = ? AND asset_type = 'page_atlas'
    `).get(assetId) as AtlasManifestRow | undefined;

    if (!row?.metadata_json || row.hash !== signature) {
      return null;
    }

    const filePath = path.join(this.atlasDir, row.path);
    if (!fs.existsSync(filePath)) {
      return null;
    }

    try {
      return JSON.parse(row.metadata_json) as PageAtlasResponse;
    } catch {
      return null;
    }
  }

  async buildAtlas(items: Item[], slotSize: number): Promise<PageAtlasResponse | null> {
    if (items.length === 0) return null;

    const key = hashAtlasKey(items.map((item) => item.itemId), slotSize);
    const cached = this.atlasCache.get(key);
    const signature = this.buildSignature(items);
    if (cached && cached.signature === signature) {
      return cached.response;
    }

    const materialized = this.readMaterializedAtlas(key, signature);
    if (materialized) {
      this.atlasCache.set(key, {
        signature,
        response: materialized,
      });
      return materialized;
    }

    const fileName = `${key}.svg`;
    const filePath = path.join(this.atlasDir, fileName);
    const atlasUrl = `/generated/page-atlas/${encodeURIComponent(fileName)}`;

    const columns = Math.max(1, Math.ceil(Math.sqrt(items.length)));
    const rows = Math.max(1, Math.ceil(items.length / columns));
    const atlasWidth = columns * slotSize;
    const atlasHeight = rows * slotSize;
    const entries: Record<string, PageAtlasSpriteEntry> = {};
    const svgParts: string[] = [
      `<svg xmlns="http://www.w3.org/2000/svg" width="${atlasWidth}" height="${atlasHeight}" viewBox="0 0 ${atlasWidth} ${atlasHeight}">`,
    ];

    let drawnCount = 0;
    for (let index = 0; index < items.length; index += 1) {
      const item = items[index];
      const imageUrl = item.preferredImageUrl || this.itemsService.resolvePreferredStaticImageUrl(item);
      const imagePath = this.resolveImageFilePath(imageUrl);
      if (!imagePath) continue;

      const buffer = fs.readFileSync(imagePath);
      const mime = detectImageMime(buffer);
      const dataUri = `data:${mime};base64,${buffer.toString('base64')}`;
      const x = (index % columns) * slotSize;
      const y = Math.floor(index / columns) * slotSize;
      svgParts.push(
        `<image x="${x}" y="${y}" width="${slotSize}" height="${slotSize}" href="${escapeXml(dataUri)}" preserveAspectRatio="none" image-rendering="pixelated" />`,
      );
      entries[item.itemId] = {
        atlasUrl,
        atlasWidth,
        atlasHeight,
        slotSize,
        x,
        y,
      };
      drawnCount += 1;
    }

    if (drawnCount === 0) {
      return null;
    }

    svgParts.push('</svg>');
    fs.writeFileSync(filePath, svgParts.join(''));

    const response: PageAtlasResponse = {
      atlasUrl,
      atlasWidth,
      atlasHeight,
      slotSize,
      entries,
    };

    this.persistAtlasManifest(key, fileName, signature, response);
    this.atlasCache.set(key, {
      signature,
      response,
    });
    return response;
  }

  async prewarmPages(options?: { pages?: number; pageSize?: number; itemSize?: number }): Promise<{ warmed: number }> {
    const pages = Math.max(1, options?.pages ?? 3);
    const pageSize = Math.max(20, options?.pageSize ?? 120);
    const itemSize = Math.max(32, options?.itemSize ?? 50);
    const slotSize = Math.max(32, Math.ceil(itemSize * 0.9));

    let warmed = 0;
    for (let page = 1; page <= pages; page += 1) {
      const result = await this.itemsService.getItems({ page, pageSize });
      if (!result.data.length) break;
      await this.buildAtlas(result.data, slotSize);
      warmed += 1;
    }

    return { warmed };
  }

  async buildAtlasForPage(params: {
    page: number;
    pageSize: number;
    slotSize: number;
    modId?: string;
  }): Promise<PageAtlasResponse | null> {
    const result = await this.itemsService.getItems({
      page: params.page,
      pageSize: params.pageSize,
      modId: params.modId,
    });
    if (!result.data.length) {
      return null;
    }
    return this.buildAtlas(result.data, params.slotSize);
  }
}

let instance: PageAtlasService | null = null;

export function getPageAtlasService(): PageAtlasService {
  if (!instance) {
    instance = new PageAtlasService();
  }
  return instance;
}
