const DB_NAME = 'neonei-runtime-cache';
const DB_VERSION = 1;
const STORE_NAME = 'packs';
export const RUNTIME_SIGNATURE_STORAGE_KEY = 'neonei:publish-source-signature:v1';
const RUNTIME_CLEANUP_SIGNATURE_STORAGE_KEY = 'neonei:runtime-cache-cleanup-signature:v1';

type CachedPackRecord = {
  cacheKey: string;
  payload: unknown;
  updatedAt: number;
};

let openDbPromise: Promise<IDBDatabase | null> | null = null;
const cleanupInFlightBySignature = new Map<string, Promise<void>>();

function canUseIndexedDb(): boolean {
  return typeof window !== 'undefined' && typeof window.indexedDB !== 'undefined';
}

function canUseLocalStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

export function getStoredRuntimeSignature(): string | null {
  if (!canUseLocalStorage()) {
    return null;
  }
  try {
    return window.localStorage.getItem(RUNTIME_SIGNATURE_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setStoredRuntimeSignature(signature: string | null | undefined): void {
  if (!canUseLocalStorage()) {
    return;
  }
  try {
    if (signature) {
      window.localStorage.setItem(RUNTIME_SIGNATURE_STORAGE_KEY, signature);
      return;
    }
    window.localStorage.removeItem(RUNTIME_SIGNATURE_STORAGE_KEY);
  } catch {
    // best-effort only
  }
}

function getStoredCleanupSignature(): string | null {
  if (!canUseLocalStorage()) {
    return null;
  }
  try {
    return window.localStorage.getItem(RUNTIME_CLEANUP_SIGNATURE_STORAGE_KEY);
  } catch {
    return null;
  }
}

function setStoredCleanupSignature(signature: string): void {
  if (!canUseLocalStorage()) {
    return;
  }
  try {
    window.localStorage.setItem(RUNTIME_CLEANUP_SIGNATURE_STORAGE_KEY, signature);
  } catch {
    // best-effort only
  }
}

function clearStoredCleanupSignature(): void {
  if (!canUseLocalStorage()) {
    return;
  }
  try {
    window.localStorage.removeItem(RUNTIME_CLEANUP_SIGNATURE_STORAGE_KEY);
  } catch {
    // best-effort only
  }
}

function openDb(): Promise<IDBDatabase | null> {
  if (!canUseIndexedDb()) {
    return Promise.resolve(null);
  }
  if (openDbPromise) {
    return openDbPromise;
  }

  openDbPromise = new Promise((resolve) => {
    try {
      const request = window.indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'cacheKey' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });

  return openDbPromise;
}

export async function readPersistentRuntimeCache<T>(cacheKey: string): Promise<T | null> {
  const db = await openDb();
  if (!db) {
    return null;
  }

  return new Promise<T | null>((resolve) => {
    try {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(cacheKey);
      request.onsuccess = () => {
        const record = request.result as CachedPackRecord | undefined;
        resolve((record?.payload as T | undefined) ?? null);
      };
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function writePersistentRuntimeCache(cacheKey: string, payload: unknown): Promise<void> {
  const db = await openDb();
  if (!db) {
    return;
  }

  await new Promise<void>((resolve) => {
    try {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      store.put({
        cacheKey,
        payload,
        updatedAt: Date.now(),
      } satisfies CachedPackRecord);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => resolve();
      transaction.onabort = () => resolve();
    } catch {
      resolve();
    }
  });
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

export async function cleanupPersistentRuntimeCacheForSignature(activeSignature: string): Promise<void> {
  const db = await openDb();
  if (!db || !activeSignature) {
    return;
  }

  await new Promise<void>((resolve) => {
    try {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const cursorRequest = store.openCursor();

      cursorRequest.onsuccess = () => {
        const cursor = cursorRequest.result;
        if (!cursor) {
          return;
        }
        const record = cursor.value as CachedPackRecord | undefined;
        const signature = extractRecordSignature(record?.cacheKey ?? '');
        if (signature && signature !== activeSignature) {
          cursor.delete();
        }
        cursor.continue();
      };

      cursorRequest.onerror = () => resolve();
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => resolve();
      transaction.onabort = () => resolve();
    } catch {
      resolve();
    }
  });
}

export async function clearPersistentRuntimeCache(): Promise<void> {
  const db = await openDb();
  if (!db) {
    setStoredRuntimeSignature(null);
    clearStoredCleanupSignature();
    cleanupInFlightBySignature.clear();
    return;
  }

  await new Promise<void>((resolve) => {
    try {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      store.clear();
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => resolve();
      transaction.onabort = () => resolve();
    } catch {
      resolve();
    }
  });

  setStoredRuntimeSignature(null);
  clearStoredCleanupSignature();
  cleanupInFlightBySignature.clear();
}

export async function getPersistentRuntimeCacheStats(): Promise<{
  entryCount: number;
  approxBytes: number;
}> {
  const db = await openDb();
  if (!db) {
    return {
      entryCount: 0,
      approxBytes: 0,
    };
  }

  return new Promise<{ entryCount: number; approxBytes: number }>((resolve) => {
    try {
      let entryCount = 0;
      let approxBytes = 0;
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const cursorRequest = store.openCursor();

      cursorRequest.onsuccess = () => {
        const cursor = cursorRequest.result;
        if (!cursor) {
          return;
        }
        const record = cursor.value as CachedPackRecord | undefined;
        entryCount += 1;
        try {
          approxBytes += new Blob([
            JSON.stringify({
              cacheKey: record?.cacheKey ?? '',
              payload: record?.payload ?? null,
              updatedAt: record?.updatedAt ?? 0,
            }),
          ]).size;
        } catch {
          approxBytes += `${record?.cacheKey ?? ''}`.length;
        }
        cursor.continue();
      };

      const finish = () => resolve({ entryCount, approxBytes });
      cursorRequest.onerror = finish;
      transaction.oncomplete = finish;
      transaction.onerror = finish;
      transaction.onabort = finish;
    } catch {
      resolve({
        entryCount: 0,
        approxBytes: 0,
      });
    }
  });
}

export function primeRuntimeCacheSignature(signature: string | null | undefined): void {
  if (!signature) {
    return;
  }
  setStoredRuntimeSignature(signature);

  if (getStoredCleanupSignature() === signature) {
    return;
  }

  const existing = cleanupInFlightBySignature.get(signature);
  if (existing) {
    return;
  }

  const task = cleanupPersistentRuntimeCacheForSignature(signature)
    .then(() => {
      setStoredCleanupSignature(signature);
    })
    .catch(() => {
      // best-effort only
    })
    .finally(() => {
      cleanupInFlightBySignature.delete(signature);
    });

  cleanupInFlightBySignature.set(signature, task);
}
