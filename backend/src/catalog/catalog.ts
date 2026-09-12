import { lstat, open, realpath } from 'node:fs/promises';
import path from 'node:path';
import { assertPointer } from '@elysium/contracts';
import { Catalog, Fault, decode, ensure, limits } from '@neonei/catalog';

const digest = /^[a-f0-9]{64}$/;

async function plain(file: string, directory = false, missing = 422): Promise<void> {
  try {
    const stat = await lstat(file);
    ensure(!stat.isSymbolicLink() && (directory ? stat.isDirectory() : stat.isFile()), 'Catalog paths must be plain files and directories');
  } catch (error) {
    const code = (error as NodeJS.ErrnoException)?.code;
    if (code === 'ENOENT' || code === 'ENOTDIR') {
      throw new Fault(missing === 422 ? 'invalid_catalog' : 'catalog_missing',
        missing === 422 ? 'A required catalog file is missing' : 'The requested catalog has not been published', missing);
    }
    throw error;
  }
}

async function bytes(file: string, limit: number, missing = 422): Promise<Buffer> {
  await plain(file, false, missing);
  const handle = await open(file, 'r');
  try {
    const stat = await handle.stat();
    ensure(Number.isSafeInteger(stat.size) && stat.size >= 0 && stat.size <= limit, 'Catalog file exceeds size limit');
    const buffer = Buffer.allocUnsafe(stat.size + 1);
    let length = 0;
    while (length < buffer.length) {
      const result = await handle.read(buffer, length, buffer.length - length, length);
      if (!result.bytesRead) break;
      length += result.bytesRead;
    }
    ensure(length === stat.size, 'Catalog file changed while reading');
    return buffer.subarray(0, length);
  } finally { await handle.close(); }
}


async function openDirectory(root: string, expected: string): Promise<Catalog> {
  await plain(root, true, 404);
  const resolved = await realpath(root);
  const buffer = await bytes(path.join(resolved, 'manifest.json'), limits.manifest);
  const manifest = decode(() => JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(buffer)) as unknown);
  return Catalog.open(manifest, async descriptor => {
    const parts = descriptor.path.split('/');
    let file = resolved;
    for (let index = 0; index < parts.length; index++) {
      file = path.join(file, parts[index]);
      await plain(file, index < parts.length - 1);
    }
    return bytes(file, descriptor.bytes);
  }, expected);
}

export class Catalogs {
  private readonly snapshots = new Map<string, Promise<Catalog>>();
  readonly root: string;
  constructor(root: string) { this.root = path.resolve(root); }

  async current(): Promise<Catalog> {
    await plain(this.root, true, 503);
    const buffer = await bytes(path.join(this.root, 'current.json'), 4096, 503);
    const pointer = decode(() => {
      const value: unknown = JSON.parse(buffer.toString('utf8'));
      assertPointer(value);
      return value;
    });
    ensure(digest.test(pointer.id), 'Invalid catalog pointer identity');
    return this.get(pointer.id);
  }

  get(id: string): Promise<Catalog> {
    if (!digest.test(id)) return Promise.reject(new Fault('invalid_id', 'Catalog id must be a SHA-256 digest', 400));
    let pending = this.snapshots.get(id);
    if (!pending) {
      pending = plain(this.root, true, 404).then(() => plain(path.join(this.root, 'catalogs'), true, 404))
        .then(() => openDirectory(path.join(this.root, 'catalogs', id), id))
        .catch(error => { this.snapshots.delete(id); throw error; });
      this.snapshots.set(id, pending);
      while (this.snapshots.size > 2) this.snapshots.delete(this.snapshots.keys().next().value!);
    }
    return pending;
  }
}
