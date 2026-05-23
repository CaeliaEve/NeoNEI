const OPFS_ROOT = 'neonei-opfs-assets';
const objectUrlCache = new Map<string, string>();
const assetInFlight = new Map<string, Promise<string | null>>();

function canUseOpfs(): boolean {
  return typeof navigator !== 'undefined'
    && typeof navigator.storage?.getDirectory === 'function'
    && typeof URL !== 'undefined'
    && typeof URL.createObjectURL === 'function';
}

function shouldCacheAsset(url: string): boolean {
  const normalized = `${url ?? ''}`.trim();
  if (!normalized || normalized.startsWith('blob:') || normalized.startsWith('data:')) {
    return false;
  }
  return /\.(png|gif|webp|jpg|jpeg)(\?|#|$)/i.test(normalized)
    || normalized.includes('/images/')
    || normalized.includes('/render-contract/');
}

function hashString(value: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    h1 = Math.imul(h1 ^ code, 2654435761);
    h2 = Math.imul(h2 ^ code, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return `${(h2 >>> 0).toString(16).padStart(8, '0')}${(h1 >>> 0).toString(16).padStart(8, '0')}`;
}

function getExtension(url: string): string {
  const match = url.match(/\.([a-z0-9]+)(?:[?#]|$)/i);
  const ext = match?.[1]?.toLowerCase();
  return ext && ext.length <= 5 ? ext : 'blob';
}

async function getAssetDirectory(): Promise<FileSystemDirectoryHandle | null> {
  if (!canUseOpfs()) {
    return null;
  }
  try {
    const root = await navigator.storage.getDirectory();
    return await root.getDirectoryHandle(OPFS_ROOT, { create: true });
  } catch {
    return null;
  }
}

async function readCachedBlob(directory: FileSystemDirectoryHandle, fileName: string): Promise<Blob | null> {
  try {
    const handle = await directory.getFileHandle(fileName, { create: false });
    return await handle.getFile();
  } catch {
    return null;
  }
}

async function writeCachedBlob(directory: FileSystemDirectoryHandle, fileName: string, blob: Blob): Promise<void> {
  try {
    const handle = await directory.getFileHandle(fileName, { create: true });
    const writable = await handle.createWritable();
    await writable.write(blob);
    await writable.close();
  } catch {
    // OPFS is an acceleration layer only.
  }
}

export async function resolveOpfsCachedAssetUrl(url: string): Promise<string | null> {
  const normalized = `${url ?? ''}`.trim();
  if (!shouldCacheAsset(normalized)) {
    return null;
  }

  const cachedUrl = objectUrlCache.get(normalized);
  if (cachedUrl) {
    return cachedUrl;
  }

  const existing = assetInFlight.get(normalized);
  if (existing) {
    return existing;
  }

  const request = (async () => {
    const directory = await getAssetDirectory();
    if (!directory) {
      return null;
    }

    const fileName = `${hashString(normalized)}.${getExtension(normalized)}`;
    let blob = await readCachedBlob(directory, fileName);
    if (!blob) {
      const response = await fetch(normalized, { cache: 'force-cache' });
      if (!response.ok) {
        return null;
      }
      blob = await response.blob();
      await writeCachedBlob(directory, fileName, blob);
    }

    const objectUrl = URL.createObjectURL(blob);
    objectUrlCache.set(normalized, objectUrl);
    return objectUrl;
  })()
    .catch(() => null)
    .finally(() => {
      assetInFlight.delete(normalized);
    });

  assetInFlight.set(normalized, request);
  return request;
}

export async function clearOpfsAssetCache(): Promise<void> {
  for (const objectUrl of objectUrlCache.values()) {
    try {
      URL.revokeObjectURL(objectUrl);
    } catch {
      // best-effort only
    }
  }
  objectUrlCache.clear();
  assetInFlight.clear();

  if (!canUseOpfs()) {
    return;
  }

  try {
    const root = await navigator.storage.getDirectory();
    await root.removeEntry(OPFS_ROOT, { recursive: true });
  } catch {
    // best-effort only
  }
}

export async function getOpfsAssetCacheStats(): Promise<{ entryCount: number; approxBytes: number }> {
  const directory = await getAssetDirectory();
  if (!directory) {
    return { entryCount: 0, approxBytes: 0 };
  }

  let entryCount = 0;
  let approxBytes = 0;
  try {
    const iterableDirectory = directory as FileSystemDirectoryHandle & {
      entries: () => AsyncIterableIterator<[string, FileSystemHandle]>;
    };
    for await (const [, handle] of iterableDirectory.entries()) {
      if (handle.kind !== 'file') {
        continue;
      }
      entryCount += 1;
      try {
        const fileHandle = handle as FileSystemFileHandle;
        const file = await fileHandle.getFile();
        approxBytes += file.size;
      } catch {
        // ignore unreadable entries
      }
    }
  } catch {
    return { entryCount, approxBytes };
  }

  return { entryCount, approxBytes };
}
