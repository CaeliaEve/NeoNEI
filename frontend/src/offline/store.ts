import type { File, Manifest } from '@elysium/contracts';
import { Fault } from '@neonei/catalog/source';

export interface Saved {
  id: string;
  revision: number;
  source: string;
  state: 'partial' | 'ready';
  added: number;
  saved: number | null;
  files: number;
  bytes: number;
  totalFiles: number;
  totalBytes: number;
  items: number;
  recipes: number;
  scope: string;
}

function result<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Local storage request failed'));
  });
}

async function transaction<T>(database: IDBDatabase, stores: string[], mode: IDBTransactionMode,
  action: (transaction: IDBTransaction) => Promise<T>): Promise<T> {
  const tx = database.transaction(stores, mode);
  const done = new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? new DOMException('Storage transaction aborted', 'AbortError'));
    tx.onerror = () => reject(tx.error ?? new Error('Local storage transaction failed'));
  });
  // Attach a rejection handler immediately, before an individual request can reject.
  void done.catch(() => {});
  try { const value = await action(tx); await done; return value; }
  catch (error) { try { tx.abort(); } catch {} await done.catch(() => {}); throw error; }
}

export class Shelf {
  private readonly database: IDBDatabase;
  private constructor(database: IDBDatabase) {
    this.database = database;
    database.onversionchange = () => database.close();
  }

  static open(): Promise<Shelf> {
    return new Promise((resolve, reject) => {
      let blocked = false;
      const opening = indexedDB.open('neonei.catalog', 1);
      opening.onupgradeneeded = () => {
        const database = opening.result;
        database.createObjectStore('catalogs', { keyPath: 'id' });
        database.createObjectStore('manifests', { keyPath: 'id' });
        database.createObjectStore('files', { keyPath: ['catalog', 'path'] }).createIndex('catalog', 'catalog');
      };
      opening.onsuccess = () => {
        if (blocked) { opening.result.close(); return; }
        if (['catalogs', 'manifests', 'files'].some(name => !opening.result.objectStoreNames.contains(name))) {
          opening.result.close(); reject(new Fault('storage_schema', '本地存储结构不完整，请清除此网站的离线资料后重试')); return;
        }
        resolve(new Shelf(opening.result));
      };
      opening.onerror = () => reject(opening.error ?? new Error('Local storage could not be opened'));
      opening.onblocked = () => { blocked = true; reject(new Fault('storage_blocked', '请关闭此网站的其他旧标签页后重试')); };
    });
  }

  async list(): Promise<Saved[]> {
    const rows = await transaction(this.database, ['catalogs'], 'readonly', tx => result<Saved[]>(tx.objectStore('catalogs').getAll()));
    return rows.filter(row => typeof row.id === 'string' && /^[a-f0-9]{64}$/.test(row.id))
      .sort((left, right) => (right.saved ?? right.added) - (left.saved ?? left.added));
  }

  async saved(id: string): Promise<Saved | undefined> {
    return transaction(this.database, ['catalogs'], 'readonly', tx => result<Saved | undefined>(tx.objectStore('catalogs').get(id)));
  }

  async manifest(id: string): Promise<unknown> {
    const row = await transaction(this.database, ['manifests'], 'readonly', tx => result<{ id: string; value: unknown } | undefined>(tx.objectStore('manifests').get(id)));
    if (!row) throw new Fault('catalog_missing', '本地没有这份资料的清单', 404);
    return row.value;
  }

  async file(id: string, path: string): Promise<Uint8Array | null> {
    const row = await transaction(this.database, ['files'], 'readonly', tx => result<{ body: ArrayBuffer } | undefined>(tx.objectStore('files').get([id, path])));
    return row?.body instanceof ArrayBuffer ? new Uint8Array(row.body) : null;
  }

  async begin(manifest: Manifest, source: string): Promise<Saved> {
    return transaction(this.database, ['catalogs', 'manifests', 'files'], 'readwrite', async tx => {
      const catalogs = tx.objectStore('catalogs');
      const existing: Saved | undefined = await result(catalogs.get(manifest.id));
      if (!existing && await result(catalogs.count()) >= 4) throw new Fault('storage_limit', '最多同时保存四份资料，请先移除不再需要的副本');
      const keys = await result(tx.objectStore('files').index('catalog').getAllKeys(IDBKeyRange.only(manifest.id)));
      const present = new Set(keys.flatMap(key => Array.isArray(key) && typeof key[1] === 'string' ? [key[1]] : []));
      const downloaded = manifest.files.filter(file => present.has(file.path));
      const row: Saved = { id: manifest.id, revision: manifest.revision, source, state: 'partial', added: existing?.added ?? Date.now(), saved: null,
        files: downloaded.length, bytes: downloaded.reduce((total, file) => total + file.bytes, 0),
        totalFiles: manifest.files.length, totalBytes: manifest.files.reduce((total, file) => total + file.bytes, 0),
        items: manifest.counts.items ?? 0, recipes: manifest.counts.recipes ?? 0, scope: manifest.scope };
      await result(tx.objectStore('manifests').put({ id: manifest.id, value: manifest }));
      await result(catalogs.put(row));
      return row;
    });
  }

  async put(id: string, file: File, bytes: Uint8Array): Promise<void> {
    await transaction(this.database, ['files', 'catalogs'], 'readwrite', async tx => {
      const catalogs = tx.objectStore('catalogs'), files = tx.objectStore('files');
      const row: Saved | undefined = await result(catalogs.get(id));
      if (!row || row.state !== 'partial') throw new Fault('catalog_missing', '离线保存任务已失效', 404);
      const present = await result(files.getKey([id, file.path]));
      await result(files.put({ catalog: id, path: file.path, body: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) }));
      if (!present) { row.files++; row.bytes += file.bytes; }
      await result(catalogs.put(row));
    });
  }

  async finish(id: string): Promise<Saved> {
    return transaction(this.database, ['catalogs'], 'readwrite', async tx => {
      const catalogs = tx.objectStore('catalogs');
      const row: Saved | undefined = await result(catalogs.get(id));
      if (!row || row.files !== row.totalFiles || row.bytes !== row.totalBytes) throw new Fault('invalid_catalog', '本地文件尚未完整保存');
      row.state = 'ready'; row.saved = Date.now();
      await result(catalogs.put(row));
      return row;
    });
  }

  async remove(id: string): Promise<void> {
    await transaction(this.database, ['catalogs', 'manifests', 'files'], 'readwrite', async tx => {
      await result(tx.objectStore('catalogs').delete(id));
      await result(tx.objectStore('manifests').delete(id));
      const files = tx.objectStore('files');
      const cursor = files.index('catalog').openKeyCursor(IDBKeyRange.only(id));
      await new Promise<void>((resolve, reject) => {
        cursor.onerror = () => reject(cursor.error);
        cursor.onsuccess = () => {
          if (!cursor.result) { resolve(); return; }
          files.delete(cursor.result.primaryKey);
          cursor.result.continue();
        };
      });
    });
  }

}
