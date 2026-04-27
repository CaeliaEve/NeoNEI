import path from 'path';
import type Database from 'better-sqlite3';
import { DATA_DIR } from '../config/runtime-paths';
import { getAccelerationDatabaseManager, type DatabaseManager } from '../models/database';
import { ItemsSearchService } from './items-search.service';
import { ItemsService, type BrowserPageEntry, type Item } from './items.service';
import { PageAtlasService } from './page-atlas.service';
import { attachRenderHintsToEntries } from './browser-render-hints.service';
import {
  buildBrowserPageWindowPayloadKey,
  buildBrowserSearchPackPayloadKey,
  buildHomeBootstrapWindowPayloadKey,
  buildModsListPayloadKey,
} from './publish-payload.service';

export const PUBLISH_PAYLOAD_REVISION = '2026-04-26-runtime-hot-payloads-v3';

export interface PublishPayloadHotOptions {
  enabled?: boolean;
  firstPageSize?: number;
  slotSizes?: number[];
  includeBrowserSearchPack?: boolean;
}

export interface PublishPayloadMaterializerOptions {
  databaseManager?: DatabaseManager;
  imageRoot: string;
  atlasOutputDir?: string;
  publishHotPayloads?: PublishPayloadHotOptions;
}

export interface PublishPayloadMaterializeResult {
  count: number;
  bytes: number;
  revision: string;
  compiledAt: string;
}

type NormalizedPublishPayloadHotOptions = {
  enabled: boolean;
  firstPageSize: number;
  slotSizes: number[];
  includeBrowserSearchPack: boolean;
};

type PublishPayloadRecord = {
  payload_key: string;
  payload_type: string;
  payload_json: string;
  signature: string;
};

type CompilerStateRow = {
  state_key: string;
  state_value: string;
};

function collectDisplayItems(entries: BrowserPageEntry[]): Item[] {
  const ordered: Item[] = [];
  const seen = new Set<string>();

  for (const entry of entries) {
    const item = entry.kind === 'item' ? entry.item : entry.group.representative;
    if (!item?.itemId || seen.has(item.itemId)) continue;
    seen.add(item.itemId);
    ordered.push(item);
  }

  return ordered;
}

function normalizeSlotSizes(values: number[] | undefined): number[] {
  const normalized = Array.from(
    new Set(
      (values ?? [45])
        .map((value) => Math.max(24, Math.min(128, Math.floor(Number(value) || 0))))
        .filter((value) => Number.isFinite(value) && value > 0),
    ),
  ).sort((left, right) => left - right);
  return normalized.length > 0 ? normalized : [45];
}

export class PublishPayloadMaterializerService {
  private readonly databaseManager: DatabaseManager;
  private readonly imageRoot: string;
  private readonly atlasOutputDir: string;
  private readonly options: NormalizedPublishPayloadHotOptions;

  constructor(options: PublishPayloadMaterializerOptions) {
    this.databaseManager = options.databaseManager ?? getAccelerationDatabaseManager();
    this.imageRoot = options.imageRoot;
    this.atlasOutputDir = options.atlasOutputDir ?? path.join(DATA_DIR, 'page-atlas-cache');
    this.options = {
      enabled: options.publishHotPayloads?.enabled ?? true,
      firstPageSize: Math.max(1, Math.floor(options.publishHotPayloads?.firstPageSize ?? 256)),
      slotSizes: normalizeSlotSizes(options.publishHotPayloads?.slotSizes),
      includeBrowserSearchPack: options.publishHotPayloads?.includeBrowserSearchPack ?? false,
    };
  }

  private getAccelerationDatabase(): Database.Database {
    return this.databaseManager.getDatabase();
  }

  private getStateMap(db: Database.Database): Map<string, string> {
    const rows = db.prepare(`
      SELECT state_key, state_value
      FROM compiler_state
      WHERE state_key IN (
        'publish_payload_revision',
        'publish_payload_signature',
        'publish_payload_slot_sizes',
        'publish_payload_first_page_size',
        'publish_payload_include_search_pack',
        'publish_payload_compiled_at',
        'publish_payloads_count'
      )
    `).all() as CompilerStateRow[];

    return new Map(rows.map((row) => [row.state_key, `${row.state_value ?? ''}`]));
  }

  isFresh(sourceSignature: string): boolean {
    const db = this.getAccelerationDatabase();
    const state = this.getStateMap(db);
    const payloadCount = Number(state.get('publish_payloads_count') ?? 0);

    if (!this.options.enabled) {
      return payloadCount === 0;
    }

    return (
      payloadCount > 0
      && (state.get('publish_payload_revision') ?? '') === PUBLISH_PAYLOAD_REVISION
      && (state.get('publish_payload_signature') ?? '') === sourceSignature
      && (state.get('publish_payload_slot_sizes') ?? '') === JSON.stringify(this.options.slotSizes)
      && (state.get('publish_payload_first_page_size') ?? '') === String(this.options.firstPageSize)
      && (state.get('publish_payload_include_search_pack') ?? '') === (this.options.includeBrowserSearchPack ? '1' : '0')
      && Boolean((state.get('publish_payload_compiled_at') ?? '').trim())
    );
  }

  async materialize(sourceSignature: string): Promise<PublishPayloadMaterializeResult> {
    const db = this.getAccelerationDatabase();
    const compiledAt = new Date().toISOString();
    const upsertState = db.prepare(`
      INSERT INTO compiler_state (state_key, state_value, updated_at)
      VALUES (@state_key, @state_value, CURRENT_TIMESTAMP)
      ON CONFLICT(state_key) DO UPDATE SET
        state_value = excluded.state_value,
        updated_at = CURRENT_TIMESTAMP
    `);

    let rows: PublishPayloadRecord[] = [];

    if (this.options.enabled) {
      const itemsService = new ItemsService({
        databaseManager: this.databaseManager,
        splitExportFallback: false,
      });
      const pageAtlasService = new PageAtlasService({
        databaseManager: this.databaseManager,
        itemsService,
        imageRoot: this.imageRoot,
        atlasDir: this.atlasOutputDir,
      });

      const mods = await itemsService.getMods();
      const firstPageWindow = await itemsService.getBrowserItems({
        page: 1,
        pageSize: this.options.firstPageSize,
        expandedGroups: [],
      });
      attachRenderHintsToEntries(firstPageWindow.data);

      rows.push({
        payload_key: buildModsListPayloadKey(),
        payload_type: 'mods-list',
        payload_json: JSON.stringify(mods),
        signature: sourceSignature,
      });

      if (this.options.includeBrowserSearchPack) {
        const searchService = new ItemsSearchService({
          databaseProvider: () => this.databaseManager.getDatabase(),
          splitExportFallback: false,
        });
        const searchPack = await searchService.getBrowserSearchPack();
        rows.push({
          payload_key: buildBrowserSearchPackPayloadKey(),
          payload_type: 'browser-search-pack',
          payload_json: JSON.stringify({
            version: 1,
            signature: sourceSignature,
            total: searchPack.length,
            items: searchPack,
          }),
          signature: sourceSignature,
        });
      }

      const displayItems = collectDisplayItems(firstPageWindow.data);
      for (const slotSize of this.options.slotSizes) {
        // eslint-disable-next-line no-await-in-loop
        const atlas = await pageAtlasService.buildAtlas(displayItems, slotSize);
        const pagePackPayload = {
          ...firstPageWindow,
          atlas,
        };

        rows.push({
          payload_key: buildBrowserPageWindowPayloadKey({ slotSize }),
          payload_type: 'browser-page-window',
          payload_json: JSON.stringify(pagePackPayload),
          signature: sourceSignature,
        });
        rows.push({
          payload_key: buildHomeBootstrapWindowPayloadKey({ slotSize }),
          payload_type: 'home-bootstrap-window',
          payload_json: JSON.stringify({
            mods,
            pagePack: pagePackPayload,
          }),
          signature: sourceSignature,
        });
      }
    }

    const payloadBytes = rows.reduce(
      (sum, row) => sum + Buffer.byteLength(row.payload_json, 'utf8'),
      0,
    );

    const materializeTransaction = db.transaction(() => {
      db.exec('DELETE FROM publish_payloads');
      const insertPublishPayload = db.prepare(`
        INSERT OR REPLACE INTO publish_payloads (
          payload_key,
          payload_type,
          payload_json,
          signature,
          updated_at
        ) VALUES (
          @payload_key,
          @payload_type,
          @payload_json,
          @signature,
          CURRENT_TIMESTAMP
        )
      `);

      for (const row of rows) {
        insertPublishPayload.run(row);
      }

      upsertState.run({ state_key: 'publish_payload_revision', state_value: PUBLISH_PAYLOAD_REVISION });
      upsertState.run({ state_key: 'publish_payload_signature', state_value: sourceSignature });
      upsertState.run({ state_key: 'publish_payload_slot_sizes', state_value: JSON.stringify(this.options.slotSizes) });
      upsertState.run({ state_key: 'publish_payload_first_page_size', state_value: String(this.options.firstPageSize) });
      upsertState.run({ state_key: 'publish_payload_include_search_pack', state_value: this.options.includeBrowserSearchPack ? '1' : '0' });
      upsertState.run({ state_key: 'publish_payload_compiled_at', state_value: compiledAt });
      upsertState.run({ state_key: 'publish_payloads_count', state_value: String(rows.length) });
      upsertState.run({ state_key: 'publish_payload_bytes', state_value: String(payloadBytes) });
    });

    materializeTransaction();
    db.pragma('wal_checkpoint(PASSIVE)');

    return {
      count: rows.length,
      bytes: payloadBytes,
      revision: PUBLISH_PAYLOAD_REVISION,
      compiledAt,
    };
  }
}
