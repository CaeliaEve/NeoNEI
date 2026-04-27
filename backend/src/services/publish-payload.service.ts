import type Database from 'better-sqlite3';
import { getAccelerationDatabaseManager, type DatabaseManager } from '../models/database';
import type { BrowserSearchPackEntry } from './items-search.service';
import type { BrowserPageEntry } from './items.service';
import type { PageAtlasResponse } from './page-atlas.service';

export interface PublishModSummary {
  modId: string;
  modName: string;
  itemCount: number;
}

export interface BrowserPageWindowPayload {
  data: BrowserPageEntry[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  atlas: PageAtlasResponse | null;
}

export interface HomeBootstrapWindowPayload {
  mods: PublishModSummary[];
  pagePack: BrowserPageWindowPayload;
}

export interface BrowserSearchPackPayload {
  version: number;
  signature?: string;
  total: number;
  items: BrowserSearchPackEntry[];
}

type PublishPayloadRow = {
  payload_key: string;
  payload_json: string;
  signature: string | null;
};

type PublishPayloadType =
  | 'mods-list'
  | 'browser-search-pack'
  | 'browser-page-window'
  | 'home-bootstrap-window';

function normalizeScope(value?: string): string {
  const normalized = `${value ?? ''}`.trim();
  if (!normalized || normalized.toLowerCase() === 'all') {
    return 'all';
  }
  return normalized;
}

function buildPayloadKey(type: PublishPayloadType, scope: Record<string, string | number>): string {
  const pairs = Object.entries(scope)
    .map(([key, value]) => `${key}=${String(value)}`)
    .sort((left, right) => left.localeCompare(right));
  return `${type}::${pairs.join('::')}`;
}

export function buildModsListPayloadKey(modId?: string): string {
  return buildPayloadKey('mods-list', {
    mod: normalizeScope(modId),
  });
}

export function buildBrowserSearchPackPayloadKey(modId?: string): string {
  return buildPayloadKey('browser-search-pack', {
    mod: normalizeScope(modId),
  });
}

export function buildBrowserPageWindowPayloadKey(params: {
  modId?: string;
  slotSize: number;
}): string {
  return buildPayloadKey('browser-page-window', {
    mod: normalizeScope(params.modId),
    slotSize: Math.max(1, Math.floor(params.slotSize)),
  });
}

export function buildHomeBootstrapWindowPayloadKey(params: {
  modId?: string;
  slotSize: number;
}): string {
  return buildPayloadKey('home-bootstrap-window', {
    mod: normalizeScope(params.modId),
    slotSize: Math.max(1, Math.floor(params.slotSize)),
  });
}

function collectDisplayItemIds(entries: BrowserPageEntry[]): string[] {
  const ordered: string[] = [];
  const seen = new Set<string>();

  for (const entry of entries) {
    const itemId = entry.kind === 'item' ? entry.item?.itemId : entry.group.representative?.itemId;
    if (!itemId || seen.has(itemId)) continue;
    seen.add(itemId);
    ordered.push(itemId);
  }

  return ordered;
}

function trimAtlasEntries(
  atlas: PageAtlasResponse | null,
  entries: BrowserPageEntry[],
): PageAtlasResponse | null {
  if (!atlas) {
    return null;
  }

  const itemIds = new Set(collectDisplayItemIds(entries));
  const trimmedEntries = Object.fromEntries(
    Object.entries(atlas.entries).filter(([itemId]) => itemIds.has(itemId)),
  );

  return {
    ...atlas,
    entries: trimmedEntries,
  };
}

export function derivePagePackFromWindow(
  window: BrowserPageWindowPayload,
  requestedPage: number,
  requestedPageSize: number,
): BrowserPageWindowPayload | null {
  const normalizedPage = Math.max(1, Math.floor(requestedPage));
  const normalizedPageSize = Math.max(1, Math.floor(requestedPageSize));
  if (window.page !== 1 || normalizedPageSize > window.pageSize) {
    return null;
  }

  const startIndex = (normalizedPage - 1) * normalizedPageSize;
  const endIndex = startIndex + normalizedPageSize;
  if (startIndex >= window.data.length || endIndex > window.data.length) {
    return null;
  }

  const data = window.data.slice(startIndex, endIndex);
  return {
    data,
    total: window.total,
    page: normalizedPage,
    pageSize: normalizedPageSize,
    totalPages: Math.max(1, Math.ceil(window.total / normalizedPageSize)),
    atlas: trimAtlasEntries(window.atlas, data),
  };
}

export interface PublishPayloadServiceOptions {
  databaseManager?: DatabaseManager;
}

export class PublishPayloadService {
  private readonly databaseManager: DatabaseManager;
  private readonly cache = new Map<string, unknown>();

  constructor(options: PublishPayloadServiceOptions = {}) {
    this.databaseManager = options.databaseManager ?? getAccelerationDatabaseManager();
  }

  private getAccelerationDatabase(): Database.Database | null {
    try {
      return this.databaseManager.getDatabase();
    } catch {
      return null;
    }
  }

  private canUsePublishPayloads(db: Database.Database | null): db is Database.Database {
    if (!db) return false;
    try {
      const row = db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'publish_payloads'")
        .get() as { name?: string } | undefined;
      return row?.name === 'publish_payloads';
    } catch {
      return false;
    }
  }

  private readPayload<T>(payloadKey: string, signature?: string): T | null {
    const cacheKey = `${signature ?? '*'}::${payloadKey}`;
    const cached = this.cache.get(cacheKey);
    if (cached !== undefined) {
      return cached as T | null;
    }

    const db = this.getAccelerationDatabase();
    if (!this.canUsePublishPayloads(db)) {
      this.cache.set(cacheKey, null);
      return null;
    }

    const row = db.prepare(`
      SELECT payload_key, payload_json, signature
      FROM publish_payloads
      WHERE payload_key = ?
    `).get(payloadKey) as PublishPayloadRow | undefined;

    if (!row || (signature && row.signature && row.signature !== signature)) {
      this.cache.set(cacheKey, null);
      return null;
    }

    try {
      const parsed = JSON.parse(row.payload_json) as T;
      this.cache.set(cacheKey, parsed);
      return parsed;
    } catch {
      this.cache.set(cacheKey, null);
      return null;
    }
  }

  getModsList(signature?: string, modId?: string): PublishModSummary[] | null {
    return this.readPayload<PublishModSummary[]>(
      buildModsListPayloadKey(modId),
      signature,
    );
  }

  getBrowserSearchPack(signature?: string, modId?: string): BrowserSearchPackPayload | null {
    return this.readPayload<BrowserSearchPackPayload>(
      buildBrowserSearchPackPayloadKey(modId),
      signature,
    );
  }

  getBrowserPageWindow(
    params: { slotSize: number; modId?: string },
    signature?: string,
  ): BrowserPageWindowPayload | null {
    return this.readPayload<BrowserPageWindowPayload>(
      buildBrowserPageWindowPayloadKey(params),
      signature,
    );
  }

  getHomeBootstrapWindow(
    params: { slotSize: number; modId?: string },
    signature?: string,
  ): HomeBootstrapWindowPayload | null {
    return this.readPayload<HomeBootstrapWindowPayload>(
      buildHomeBootstrapWindowPayloadKey(params),
      signature,
    );
  }
}

let publishPayloadService: PublishPayloadService | null = null;

export function getPublishPayloadService(): PublishPayloadService {
  if (!publishPayloadService) {
    publishPayloadService = new PublishPayloadService();
  }
  return publishPayloadService;
}
