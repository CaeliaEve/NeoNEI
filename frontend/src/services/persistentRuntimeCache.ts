const DB_NAME = 'neonei-runtime-cache';
const DB_VERSION = 3;
const PAYLOAD_STORE_NAME = 'packs';
const METADATA_STORE_NAME = 'packMetadata';
const STATE_STORE_NAME = 'state';
const LAST_ACCESSED_INDEX_NAME = 'lastAccessedAt';
const TOTAL_BYTES_STATE_KEY = 'totalBytes';

export const PERSISTENT_RUNTIME_CACHE_MAX_BYTES = 256 * 1024 * 1024;
export const RUNTIME_SIGNATURE_STORAGE_KEY = 'neonei:publish-source-signature:v1';
export const RUNTIME_PREVIOUS_SIGNATURE_STORAGE_KEY = 'neonei:publish-previous-source-signature:v1';
const RUNTIME_CLEANUP_SIGNATURE_STORAGE_KEY = 'neonei:runtime-cache-cleanup-signature:v1';

type CachedPackRecord = {
  cacheKey: string;
  payload: unknown;
};

type LegacyCachedPackRecord = CachedPackRecord & {
  bytes?: number;
  lastAccessedAt?: number;
  updatedAt?: number;
};

type CachedPackMetadata = {
  cacheKey: string;
  bytes: number;
  lastAccessedAt: number;
  signature: string | null;
};

type CacheStateRecord = {
  key: string;
  value: number;
};

let openDbPromise: Promise<IDBDatabase | null> | null = null;
let operationQueue: Promise<void> = Promise.resolve();
let lastAccessedClock = 0;
const cleanupInFlightBySignature = new Map<string, Promise<boolean>>();
const readInFlightByCacheKey = new Map<string, Promise<unknown | null>>();

export function estimatePersistentRuntimePayloadBytes(payload: unknown): number {
  if (typeof payload === 'string') return new Blob([payload]).size;
  if (payload instanceof ArrayBuffer) return payload.byteLength;
  if (ArrayBuffer.isView(payload)) return payload.byteLength;
  if (typeof Blob !== 'undefined' && payload instanceof Blob) return payload.size;
  try {
    const serialized = JSON.stringify(payload ?? null);
    if (serialized === undefined) {
      throw new TypeError('payload has no JSON representation');
    }
    return new Blob([serialized]).size;
  } catch {
    throw new TypeError(
      'persistent runtime cache payload must be a string, ArrayBuffer, typed-array view, Blob, or JSON-safe structure',
    );
  }
}

function extractRecordSignature(cacheKey: string): string | null {
  try {
    const decoded = JSON.parse(cacheKey) as { signature?: unknown };
    return typeof decoded?.signature === 'string' && decoded.signature.trim()
      ? decoded.signature.trim()
      : null;
  } catch {
    return null;
  }
}

function canUseIndexedDb(): boolean {
  return typeof window !== 'undefined' && typeof window.indexedDB !== 'undefined';
}

function canUseLocalStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

export function getStoredRuntimeSignature(): string | null {
  if (!canUseLocalStorage()) return null;
  try {
    return window.localStorage.getItem(RUNTIME_SIGNATURE_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setStoredRuntimeSignature(signature: string | null | undefined): void {
  if (!canUseLocalStorage()) return;
  try {
    if (signature) {
      window.localStorage.setItem(RUNTIME_SIGNATURE_STORAGE_KEY, signature);
    } else {
      window.localStorage.removeItem(RUNTIME_SIGNATURE_STORAGE_KEY);
    }
  } catch {
    // Runtime signature persistence is an optional browser optimization.
  }
}

export function getStoredPreviousRuntimeSignature(): string | null {
  if (!canUseLocalStorage()) return null;
  try {
    return window.localStorage.getItem(RUNTIME_PREVIOUS_SIGNATURE_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setStoredPreviousRuntimeSignature(signature: string | null | undefined): void {
  if (!canUseLocalStorage()) return;
  try {
    if (signature) {
      window.localStorage.setItem(RUNTIME_PREVIOUS_SIGNATURE_STORAGE_KEY, signature);
    } else {
      window.localStorage.removeItem(RUNTIME_PREVIOUS_SIGNATURE_STORAGE_KEY);
    }
  } catch {
    // Previous-signature persistence is an optional rollback optimization.
  }
}

function getStoredCleanupSignature(): string | null {
  if (!canUseLocalStorage()) return null;
  try {
    return window.localStorage.getItem(RUNTIME_CLEANUP_SIGNATURE_STORAGE_KEY);
  } catch {
    return null;
  }
}

function setStoredCleanupSignature(signature: string): void {
  if (!canUseLocalStorage()) return;
  try {
    window.localStorage.setItem(RUNTIME_CLEANUP_SIGNATURE_STORAGE_KEY, signature);
  } catch {
    // Cleanup remains valid even if the optional marker cannot be persisted.
  }
}

function clearStoredCleanupSignature(): void {
  if (!canUseLocalStorage()) return;
  try {
    window.localStorage.removeItem(RUNTIME_CLEANUP_SIGNATURE_STORAGE_KEY);
  } catch {
    // The IndexedDB clear already remains authoritative.
  }
}

function enqueueExclusive<T>(operation: () => Promise<T>): Promise<T> {
  const result = operationQueue.then(operation, operation);
  operationQueue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

function nextLastAccessedAt(): number {
  lastAccessedClock = Math.max(Date.now(), lastAccessedClock + 1);
  return lastAccessedClock;
}

function transactionError(transaction: IDBTransaction, operation: string): Error {
  return transaction.error ?? new Error(`IndexedDB ${operation} transaction failed`);
}

function migratePersistentRuntimeCache(request: IDBOpenDBRequest): void {
  const db = request.result;
  const transaction = request.transaction;
  if (!transaction) throw new Error('IndexedDB migration transaction is missing');

  const payloadStore = db.objectStoreNames.contains(PAYLOAD_STORE_NAME)
    ? transaction.objectStore(PAYLOAD_STORE_NAME)
    : db.createObjectStore(PAYLOAD_STORE_NAME, { keyPath: 'cacheKey' });
  const metadataStore = db.objectStoreNames.contains(METADATA_STORE_NAME)
    ? transaction.objectStore(METADATA_STORE_NAME)
    : db.createObjectStore(METADATA_STORE_NAME, { keyPath: 'cacheKey' });
  if (!metadataStore.indexNames.contains(LAST_ACCESSED_INDEX_NAME)) {
    metadataStore.createIndex(LAST_ACCESSED_INDEX_NAME, 'lastAccessedAt');
  }
  const stateStore = db.objectStoreNames.contains(STATE_STORE_NAME)
    ? transaction.objectStore(STATE_STORE_NAME)
    : db.createObjectStore(STATE_STORE_NAME, { keyPath: 'key' });

  let totalBytes = 0;
  const cursorRequest = payloadStore.openCursor();
  cursorRequest.onsuccess = () => {
    const cursor = cursorRequest.result;
    if (!cursor) {
      stateStore.put({ key: TOTAL_BYTES_STATE_KEY, value: totalBytes } satisfies CacheStateRecord);
      return;
    }
    const legacy = cursor.value as LegacyCachedPackRecord;
    const bytes = Number.isFinite(legacy.bytes) && Number(legacy.bytes) >= 0
      ? Number(legacy.bytes)
      : estimatePersistentRuntimePayloadBytes(legacy.payload);
    const lastAccessedAt = legacy.lastAccessedAt ?? legacy.updatedAt ?? 0;
    totalBytes += bytes;
    metadataStore.put({
      cacheKey: legacy.cacheKey,
      bytes,
      lastAccessedAt,
      signature: extractRecordSignature(legacy.cacheKey),
    } satisfies CachedPackMetadata);
    cursor.update({ cacheKey: legacy.cacheKey, payload: legacy.payload } satisfies CachedPackRecord);
    cursor.continue();
  };
}

function openDb(): Promise<IDBDatabase | null> {
  if (!canUseIndexedDb()) return Promise.resolve(null);
  if (openDbPromise) return openDbPromise;

  let failedSynchronously = false;
  const pending = new Promise<IDBDatabase | null>((resolve, reject) => {
    let settled = false;
    const succeed = (value: IDBDatabase) => {
      if (settled) {
        value.close();
        return;
      }
      settled = true;
      resolve(value);
    };
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      openDbPromise = null;
      reject(error);
    };

    try {
      const request = window.indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => migratePersistentRuntimeCache(request);
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => {
          db.close();
          openDbPromise = null;
        };
        succeed(db);
      };
      request.onerror = () => {
        fail(request.error ?? new Error('persistent runtime cache database open failed'));
      };
      request.onblocked = () => {
        fail(new Error('persistent runtime cache database open was blocked'));
      };
    } catch (error) {
      failedSynchronously = true;
      fail(error instanceof Error ? error : new Error(String(error)));
    }
  });
  openDbPromise = failedSynchronously ? null : pending;
  return pending;
}

async function readPersistentRuntimeCacheRecord<T>(cacheKey: string): Promise<T | null> {
  return enqueueExclusive(async () => {
    const db = await openDb();
    if (!db) return null;

    return new Promise<T | null>((resolve) => {
      try {
        const transaction = db.transaction(
          [PAYLOAD_STORE_NAME, METADATA_STORE_NAME],
          'readwrite',
        );
        const payloadRequest = transaction.objectStore(PAYLOAD_STORE_NAME).get(cacheKey);
        const metadataStore = transaction.objectStore(METADATA_STORE_NAME);
        const metadataRequest = metadataStore.get(cacheKey);
        let payload: T | null = null;

        payloadRequest.onsuccess = () => {
          payload = (payloadRequest.result as CachedPackRecord | undefined)?.payload as T ?? null;
        };
        metadataRequest.onsuccess = () => {
          const metadata = metadataRequest.result as CachedPackMetadata | undefined;
          if (metadata) metadataStore.put({ ...metadata, lastAccessedAt: nextLastAccessedAt() });
        };
        transaction.oncomplete = () => resolve(payload);
        transaction.onerror = () => resolve(null);
        transaction.onabort = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  });
}

export function readPersistentRuntimeCache<T>(cacheKey: string): Promise<T | null> {
  const existing = readInFlightByCacheKey.get(cacheKey);
  if (existing) return existing as Promise<T | null>;
  const request = readPersistentRuntimeCacheRecord<T>(cacheKey).finally(() => {
    readInFlightByCacheKey.delete(cacheKey);
  });
  readInFlightByCacheKey.set(cacheKey, request);
  return request;
}

async function writePersistentRuntimeCacheTransaction(
  db: IDBDatabase,
  cacheKey: string,
  payload: unknown,
  maxBytes: number,
): Promise<void> {
  const bytes = estimatePersistentRuntimePayloadBytes(payload);
  const protectedSignatures = new Set(
    [getStoredRuntimeSignature(), getStoredPreviousRuntimeSignature()].filter(
      (signature): signature is string => Boolean(signature),
    ),
  );
  await new Promise<void>((resolve, reject) => {
    try {
      const transaction = db.transaction(
        [PAYLOAD_STORE_NAME, METADATA_STORE_NAME, STATE_STORE_NAME],
        'readwrite',
      );
      const payloadStore = transaction.objectStore(PAYLOAD_STORE_NAME);
      const metadataStore = transaction.objectStore(METADATA_STORE_NAME);
      const stateStore = transaction.objectStore(STATE_STORE_NAME);
      const previousRequest = metadataStore.get(cacheKey);
      const stateRequest = stateStore.get(TOTAL_BYTES_STATE_KEY);
      const now = nextLastAccessedAt();
      let previous: CachedPackMetadata | undefined;
      let totalBytes = 0;
      let ready = 0;

      const updateAndEvict = () => {
        ready += 1;
        if (ready !== 2) return;
        totalBytes = Math.max(0, totalBytes - (previous?.bytes ?? 0) + bytes);
        payloadStore.put({ cacheKey, payload } satisfies CachedPackRecord);
        metadataStore.put({
          cacheKey,
          bytes,
          lastAccessedAt: now,
          signature: extractRecordSignature(cacheKey),
        } satisfies CachedPackMetadata);

        if (totalBytes <= maxBytes) {
          stateStore.put({ key: TOTAL_BYTES_STATE_KEY, value: totalBytes } satisfies CacheStateRecord);
          return;
        }

        const cursorRequest = metadataStore.index(LAST_ACCESSED_INDEX_NAME).openCursor();
        cursorRequest.onsuccess = () => {
          const cursor = cursorRequest.result;
          if (!cursor || totalBytes <= maxBytes) {
            stateStore.put({ key: TOTAL_BYTES_STATE_KEY, value: totalBytes } satisfies CacheStateRecord);
            return;
          }
          const metadata = cursor.value as CachedPackMetadata;
          if (metadata.signature && protectedSignatures.has(metadata.signature)) {
            cursor.continue();
            return;
          }
          cursor.delete();
          payloadStore.delete(metadata.cacheKey);
          totalBytes = Math.max(0, totalBytes - metadata.bytes);
          cursor.continue();
        };
        cursorRequest.onerror = () => transaction.abort();
      };

      previousRequest.onsuccess = () => {
        previous = previousRequest.result as CachedPackMetadata | undefined;
        updateAndEvict();
      };
      previousRequest.onerror = () => transaction.abort();
      stateRequest.onsuccess = () => {
        totalBytes = Number((stateRequest.result as CacheStateRecord | undefined)?.value ?? 0);
        updateAndEvict();
      };
      stateRequest.onerror = () => transaction.abort();
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transactionError(transaction, 'write'));
      transaction.onabort = () => reject(transactionError(transaction, 'write'));
    } catch (error) {
      reject(error);
    }
  });
}

export function writePersistentRuntimeCache(cacheKey: string, payload: unknown): Promise<void> {
  return enqueueExclusive(async () => {
    const db = await openDb();
    if (!db) return;
    await writePersistentRuntimeCacheTransaction(
      db,
      cacheKey,
      payload,
      PERSISTENT_RUNTIME_CACHE_MAX_BYTES,
    );
  });
}

export function cleanupPersistentRuntimeCacheForSignature(
  activeSignature: string,
  retainedSignatures: readonly string[] = [],
): Promise<boolean> {
  return enqueueExclusive(async () => {
    if (!activeSignature) return false;
    const retained = new Set([activeSignature, ...retainedSignatures].filter(Boolean));
    const db = await openDb();
    if (!db) return false;

    await new Promise<void>((resolve, reject) => {
      try {
        const transaction = db.transaction(
          [PAYLOAD_STORE_NAME, METADATA_STORE_NAME, STATE_STORE_NAME],
          'readwrite',
        );
        const payloadStore = transaction.objectStore(PAYLOAD_STORE_NAME);
        const metadataStore = transaction.objectStore(METADATA_STORE_NAME);
        const stateStore = transaction.objectStore(STATE_STORE_NAME);
        const stateRequest = stateStore.get(TOTAL_BYTES_STATE_KEY);
        let totalBytes = 0;
        let removedBytes = 0;

        stateRequest.onsuccess = () => {
          totalBytes = Number((stateRequest.result as CacheStateRecord | undefined)?.value ?? 0);
          const cursorRequest = metadataStore.openCursor();
          cursorRequest.onsuccess = () => {
            const cursor = cursorRequest.result;
            if (!cursor) {
              stateStore.put({
                key: TOTAL_BYTES_STATE_KEY,
                value: Math.max(0, totalBytes - removedBytes),
              } satisfies CacheStateRecord);
              return;
            }
            const metadata = cursor.value as CachedPackMetadata;
            if (metadata.signature && !retained.has(metadata.signature)) {
              removedBytes += metadata.bytes;
              cursor.delete();
              payloadStore.delete(metadata.cacheKey);
            }
            cursor.continue();
          };
          cursorRequest.onerror = () => transaction.abort();
        };
        stateRequest.onerror = () => transaction.abort();
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transactionError(transaction, 'cleanup'));
        transaction.onabort = () => reject(transactionError(transaction, 'cleanup'));
      } catch (error) {
        reject(error);
      }
    });
    return true;
  });
}

export async function clearPersistentRuntimeCache(): Promise<void> {
  await enqueueExclusive(async () => {
    const db = await openDb();
    if (db) {
      await new Promise<void>((resolve, reject) => {
        try {
          const transaction = db.transaction(
            [PAYLOAD_STORE_NAME, METADATA_STORE_NAME, STATE_STORE_NAME],
            'readwrite',
          );
          transaction.objectStore(PAYLOAD_STORE_NAME).clear();
          transaction.objectStore(METADATA_STORE_NAME).clear();
          transaction.objectStore(STATE_STORE_NAME).put({
            key: TOTAL_BYTES_STATE_KEY,
            value: 0,
          } satisfies CacheStateRecord);
          transaction.oncomplete = () => resolve();
          transaction.onerror = () => reject(transactionError(transaction, 'clear'));
          transaction.onabort = () => reject(transactionError(transaction, 'clear'));
        } catch (error) {
          reject(error);
        }
      });
    }

    setStoredRuntimeSignature(null);
    setStoredPreviousRuntimeSignature(null);
    clearStoredCleanupSignature();
    cleanupInFlightBySignature.clear();
    readInFlightByCacheKey.clear();
  });
}

export async function getPersistentRuntimeCacheStats(): Promise<{
  entryCount: number;
  approxBytes: number;
}> {
  return enqueueExclusive(async () => {
    const db = await openDb();
    if (!db) return { entryCount: 0, approxBytes: 0 };

    return new Promise<{ entryCount: number; approxBytes: number }>((resolve, reject) => {
      try {
        const transaction = db.transaction(
          [METADATA_STORE_NAME, STATE_STORE_NAME],
          'readonly',
        );
        const countRequest = transaction.objectStore(METADATA_STORE_NAME).count();
        const stateRequest = transaction.objectStore(STATE_STORE_NAME).get(TOTAL_BYTES_STATE_KEY);
        let entryCount = 0;
        let approxBytes = 0;
        countRequest.onsuccess = () => { entryCount = countRequest.result; };
        countRequest.onerror = () => transaction.abort();
        stateRequest.onsuccess = () => {
          approxBytes = Number((stateRequest.result as CacheStateRecord | undefined)?.value ?? 0);
        };
        stateRequest.onerror = () => transaction.abort();
        transaction.oncomplete = () => resolve({ entryCount, approxBytes });
        transaction.onerror = () => reject(transactionError(transaction, 'stats'));
        transaction.onabort = () => reject(transactionError(transaction, 'stats'));
      } catch (error) {
        reject(error);
      }
    });
  });
}

export function primeRuntimeCacheSignature(signature: string | null | undefined): void {
  if (!signature) return;
  const currentSignature = getStoredRuntimeSignature();
  const previousSignature = currentSignature && currentSignature !== signature
    ? currentSignature
    : getStoredPreviousRuntimeSignature();
  setStoredPreviousRuntimeSignature(previousSignature);
  setStoredRuntimeSignature(signature);
  const cleanupSignature = `${signature}\n${previousSignature ?? ''}`;
  if (getStoredCleanupSignature() === cleanupSignature) return;
  if (cleanupInFlightBySignature.has(cleanupSignature)) return;

  const task = cleanupPersistentRuntimeCacheForSignature(
    signature,
    previousSignature ? [previousSignature] : [],
  )
    .then((completed) => {
      if (completed) setStoredCleanupSignature(cleanupSignature);
      return completed;
    })
    .catch(() => false)
    .finally(() => {
      cleanupInFlightBySignature.delete(cleanupSignature);
    });
  cleanupInFlightBySignature.set(cleanupSignature, task);
}
