import fs from 'fs';
import path from 'path';
import { getNesqlSplitExportService } from './nesql-split-export.service';
import { IMAGES_PATH } from '../config/runtime-paths';

export interface Item {
  itemId: string;
  modId: string;
  internalName: string;
  localizedName: string;
  renderAssetRef?: string | null;
  preferredImageUrl?: string | null;
  unlocalizedName: string;
  damage: number;
  maxStackSize: number;
  maxDamage: number;
  imageFileName: string | null;
  tooltip: string | null;
  searchTerms: string | null;
  toolClasses: string | null;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export class ItemsService {
  private splitExportService = getNesqlSplitExportService();
  private static itemCache = new Map<string, { value: Item; expiresAt: number }>();
  private static imageUrlCache = new Map<string, string>();
  private static readonly ITEM_CACHE_TTL_MS = 60 * 1000;

  private ensureSplitItemsAvailable(): void {
    if (!this.splitExportService.hasSplitItems()) {
      throw new Error('Split item export is unavailable');
    }
  }

  private getCachedItem(itemId: string): Item | null {
    const hit = ItemsService.itemCache.get(itemId);
    if (!hit) return null;
    if (Date.now() > hit.expiresAt) {
      ItemsService.itemCache.delete(itemId);
      return null;
    }
    return hit.value;
  }

  private setCachedItem(item: Item): void {
    ItemsService.itemCache.set(item.itemId, {
      value: item,
      expiresAt: Date.now() + ItemsService.ITEM_CACHE_TTL_MS,
    });
  }

  async getItems(params: {
    page?: number;
    pageSize?: number;
    search?: string;
    modId?: string;
  }): Promise<PaginatedResponse<Item>> {
    this.ensureSplitItemsAvailable();

    const page = params.page || 1;
    const pageSize = Math.min(params.pageSize || 50, 500);
    const offset = (page - 1) * pageSize;

    const normalizedSearch = (params.search || '').trim().toLowerCase();
    const normalizedModId = (params.modId || '').trim();

    let items = this.splitExportService.getAllItems().map((raw) => this.transformSplitItem(raw));

    if (normalizedModId && normalizedModId !== 'all') {
      items = items.filter((item) => item.modId === normalizedModId);
    }

    if (normalizedSearch) {
      items = items.filter((item) =>
        item.localizedName.toLowerCase().includes(normalizedSearch) ||
        item.internalName.toLowerCase().includes(normalizedSearch) ||
        item.itemId.toLowerCase().includes(normalizedSearch)
      );
    }

    const total = items.length;
    const pageItems = items.slice(offset, offset + pageSize);

    return {
      data: pageItems,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  async getItemById(itemId: string): Promise<Item | null> {
    this.ensureSplitItemsAvailable();

    const cached = this.getCachedItem(itemId);
    if (cached) return cached;

    const splitItem = this.splitExportService.getItemById(itemId);
    if (!splitItem) {
      return null;
    }

    const item = this.transformSplitItem(splitItem);
    this.setCachedItem(item);
    return item;
  }

  async getItemsByIds(itemIds: string[]): Promise<Item[]> {
    this.ensureSplitItemsAvailable();
    if (!itemIds.length) return [];

    const uniqueIds = Array.from(new Set(itemIds));
    const byId = new Map<string, Item>();
    const missing: string[] = [];

    for (const id of uniqueIds) {
      const cached = this.getCachedItem(id);
      if (cached) {
        byId.set(id, cached);
      } else {
        missing.push(id);
      }
    }

    if (missing.length > 0) {
      const splitItems = this.splitExportService.getItemsByIds(missing);
      for (const raw of splitItems) {
        const item = this.transformSplitItem(raw);
        byId.set(item.itemId, item);
        this.setCachedItem(item);
      }
    }

    return itemIds
      .map((id) => byId.get(id))
      .filter((item): item is Item => item !== undefined);
  }

  resolvePreferredStaticImageUrl(item: Pick<Item, 'itemId' | 'imageFileName' | 'renderAssetRef'>): string {
    const cacheKey = `${item.itemId}|${item.imageFileName ?? ''}|${item.renderAssetRef ?? ''}`;
    const cached = ItemsService.imageUrlCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const resolved = this.resolvePreferredStaticImageUrlUncached(item);
    ItemsService.imageUrlCache.set(cacheKey, resolved);
    return resolved;
  }

  private resolvePreferredStaticImageUrlUncached(item: Pick<Item, 'itemId' | 'imageFileName' | 'renderAssetRef'>): string {
    const fromImageFile = this.resolveFromImageFileName(item.imageFileName);
    if (fromImageFile) {
      return fromImageFile;
    }

    const parts = item.itemId.split('~');
    if (parts.length >= 4) {
      const modId = parts[1];
      const internalName = parts[2];
      const damage = parts[3];
      const nbt = parts[4] || null;
      const candidates = [
        nbt ? `${internalName}~${damage}~${nbt}.png` : '',
        `${internalName}~${damage}.png`,
        nbt ? `${internalName}~${damage}~${nbt}.gif` : '',
        `${internalName}~${damage}.gif`,
      ].filter(Boolean);
      for (const candidate of candidates) {
        const relativePath = `${modId}/${candidate}`;
        if (this.imageExists(relativePath)) {
          return `/images/item/${this.encodeRelativePath(relativePath)}`;
        }
      }
    }

    return '/images/item/minecraft/barrier~0.png';
  }

  private resolveFromImageFileName(imageFileName: string | null | undefined): string | null {
    if (!imageFileName) return null;
    const normalized = imageFileName
      .replace(/\\/g, '/')
      .replace(/^\/+/, '')
      .replace(/^images\/item\//, '')
      .replace(/^api\/images\/item\//, '');

    if (!normalized) return null;

    if (/\.gif$/i.test(normalized)) {
      const staticCandidate = normalized.replace(/\.gif$/i, '.png');
      if (this.imageExists(staticCandidate)) {
        return `/images/item/${this.encodeRelativePath(staticCandidate)}`;
      }
    }

    if (this.imageExists(normalized)) {
      return `/images/item/${this.encodeRelativePath(normalized)}`;
    }

    return null;
  }

  private imageExists(relativePath: string): boolean {
    const absolute = path.resolve(IMAGES_PATH, 'item', relativePath);
    const itemRoot = path.resolve(IMAGES_PATH, 'item');
    return absolute.startsWith(itemRoot) && fs.existsSync(absolute);
  }

  private encodeRelativePath(relativePath: string): string {
    return relativePath
      .split('/')
      .filter(Boolean)
      .map((part) => encodeURIComponent(part))
      .join('/');
  }

  async getMods(): Promise<Array<{ modId: string; modName: string; itemCount: number }>> {
    this.ensureSplitItemsAvailable();
    return this.splitExportService.getMods();
  }

  private transformSplitItem(raw: Record<string, unknown>): Item {
    const item: Item = {
      itemId: String(raw.itemId ?? raw.id ?? ''),
      modId: String(raw.modId ?? raw.mod_id ?? ''),
      internalName: String(raw.internalName ?? raw.internal_name ?? ''),
      localizedName: String(raw.localizedName ?? raw.localized_name ?? ''),
      renderAssetRef: typeof raw.renderAssetRef === 'string' ? raw.renderAssetRef : null,
      preferredImageUrl: null,
      unlocalizedName: String(raw.unlocalizedName ?? raw.unlocalized_name ?? ''),
      damage: Number(raw.damage ?? 0),
      maxStackSize: Number(raw.maxStackSize ?? raw.max_stack_size ?? 64),
      maxDamage: Number(raw.maxDamage ?? raw.max_damage ?? 0),
      imageFileName: typeof raw.imageFileName === 'string' ? raw.imageFileName : null,
      tooltip: typeof raw.tooltip === 'string' ? raw.tooltip : null,
      searchTerms: typeof raw.searchTerms === 'string' ? raw.searchTerms : null,
      toolClasses: typeof raw.toolClasses === 'string' ? raw.toolClasses : null,
    };
    item.preferredImageUrl = this.resolvePreferredStaticImageUrl(item);
    return item;
  }
}
