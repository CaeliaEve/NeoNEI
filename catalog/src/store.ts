import { assertManifest, canonical, collections, decodeTable, type File, type Manifest, type Table } from '@elysium/contracts';

export type Collection = Table['kind'];
type Rows = { [T in Table as T['kind']]: T['records'][number] };
export type Row<K extends Collection> = Rows[K];
export type Read = (file: File) => Promise<Uint8Array>;
export const limits = Object.freeze({ manifest: 64 * 1024 * 1024, result: 16 * 1024 * 1024, table: 16 * 1024 * 1024, image: 80 * 1024 * 1024 });
const digest = /^[a-f0-9]{64}$/;
const tableLimit = limits.table, imageLimit = limits.image;

export class Fault extends Error {
  readonly code: string;
  readonly status: number;
  readonly details: unknown;
  constructor(code: string, message: string, status = 422, details?: unknown) {
    super(message); this.name = 'Fault'; this.code = code; this.status = status; this.details = details;
  }
}

export function ensure(value: unknown, message: string): asserts value {
  if (!value) throw new Fault('invalid_catalog', message);
}

export function decode<T>(action: () => T): T {
  try { return action(); }
  catch (error) { throw new Fault('invalid_catalog', error instanceof Error ? error.message : 'Catalog decoding failed'); }
}

export async function hash(bytes: Uint8Array | string): Promise<string> {
  const input = typeof bytes === 'string' ? new TextEncoder().encode(bytes)
    : bytes.buffer instanceof ArrayBuffer ? new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength) : new Uint8Array(bytes);
  return Array.from(new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', input)),
    byte => byte.toString(16).padStart(2, '0')).join('');
}

function portable(value: string): void {
  ensure(value.length > 0 && value.length <= 240 && /^[\x21-\x7e]+$/.test(value)
    && !/[\\:%?*"<>|]/.test(value), 'Invalid catalog path');
  for (const part of value.split('/')) {
    ensure(part && part !== '.' && part !== '..' && !/[. ]$/.test(part)
      && !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part), 'Invalid catalog path segment');
  }
}

async function validate(manifest: Manifest): Promise<void> {
  ensure(digest.test(manifest.id) && digest.test(manifest.source) && digest.test(manifest.environment), 'Invalid catalog identity');
  const { id, ...content } = manifest;
  ensure(await hash(canonical(content)) === id, 'Catalog manifest digest mismatch');
  ensure(manifest.scope === 'complete' || manifest.scope === 'selection', 'Invalid catalog scope');
  const counts = new Map<string, number>();
  const ranges = new Map<string, string>();
  const paths = new Set<string>();
  let previous = '';
  for (const file of manifest.files) {
    portable(file.path);
    ensure(file.path > previous && !paths.has(file.path.toLowerCase()), 'Catalog paths must be unique and sorted');
    paths.add(file.path.toLowerCase()); previous = file.path;
    ensure(Number.isSafeInteger(file.bytes) && file.bytes > 0 && file.bytes <= (file.kind === 'image' ? imageLimit : tableLimit)
      && digest.test(file.sha256) && Number.isSafeInteger(file.rows) && file.rows >= 0, 'Invalid catalog file descriptor');
    if (file.kind === 'image') {
      ensure(file.encoding === 'webp' && file.path === `textures/${file.sha256}.webp`
        && file.rows === 0 && file.first == null && file.last == null, 'Invalid texture descriptor');
    } else {
      ensure(collections.includes(file.kind as Collection) && file.encoding === 'msgpack'
        && file.rows <= 4096 && new RegExp(`^tables/${file.kind}/part-[0-9]{6}\\.msgpack$`).test(file.path), 'Invalid table descriptor');
      if (file.rows === 0) ensure(file.first == null && file.last == null, 'Empty table declares an id range');
      else {
        ensure(typeof file.first === 'string' && typeof file.last === 'string' && file.first.length > 0
          && file.last.length <= 256 && /^[\x21-\x7e]+$/.test(file.first + file.last)
          && file.first <= file.last && (!ranges.has(file.kind) || ranges.get(file.kind)! < file.first), 'Invalid table id range');
        ranges.set(file.kind, file.last);
      }
      counts.set(file.kind, (counts.get(file.kind) ?? 0) + file.rows);
    }
  }
  ensure(counts.size === collections.length && Object.keys(manifest.counts).length === collections.length
    && collections.every(kind => counts.has(kind) && counts.get(kind) === manifest.counts[kind]), 'Catalog counts do not match its tables');
}


export async function checkManifest(value: unknown, expected = ''): Promise<Manifest> {
  const manifest = decode(() => { assertManifest(value); return value; });
  await validate(manifest);
  ensure(!expected || manifest.id === expected, 'Catalog pointer identity mismatch');
  Object.freeze(manifest.counts);
  manifest.files.forEach(Object.freeze);
  Object.freeze(manifest.files);
  return Object.freeze(manifest);
}

/** Storage-neutral reader for one immutable catalog. Both HTTP and offline queries use this class. */
export class Catalog {
  readonly manifest: Manifest;
  private readonly load: Read;
  private readonly files: Map<string, File>;
  private readonly partitions = new Map<Collection, File[]>();
  private readonly tables = new Map<string, { table: Table; bytes: number }>();
  private readonly pending = new Map<string, Promise<Table>>();
  private readonly queue: Array<() => void> = [];
  private active = 0;
  private cachedBytes = 0;

  private constructor(manifest: Manifest, load: Read) {
    this.manifest = manifest; this.load = load;
    this.files = new Map(manifest.files.map(file => [file.path, file]));
    for (const kind of collections) this.partitions.set(kind, manifest.files.filter(file => file.kind === kind && file.rows > 0));
  }

  static async open(value: unknown, load: Read, expected = ''): Promise<Catalog> {
    const manifest = await checkManifest(value, expected);
    return new Catalog(manifest, load);
  }

  descriptor(relative: string): File {
    const file = this.files.get(relative);
    if (!file) throw new Fault('file_missing', 'Catalog does not declare this file', 404);
    return file;
  }

  async read(relative: string): Promise<Uint8Array> {
    const file = this.descriptor(relative);
    const bytes = await this.load(file);
    ensure(bytes instanceof Uint8Array && bytes.byteLength === file.bytes
      && await hash(bytes) === file.sha256, 'Catalog file integrity mismatch: ' + relative);
    return bytes;
  }

  private drain(): void {
    while (this.active < 3 && this.queue.length) this.queue.shift()!();
  }

  private table(file: File): Promise<Table> {
    const cached = this.tables.get(file.path);
    if (cached) {
      this.tables.delete(file.path); this.tables.set(file.path, cached);
      return Promise.resolve(cached.table);
    }
    const pending = this.pending.get(file.path);
    if (pending) return pending;
    const loading = new Promise<Table>((resolve, reject) => {
      this.queue.push(() => {
        this.active++;
        void this.read(file.path).then(buffer => {
          const table = decode(() => decodeTable(buffer, file.kind as Collection));
          const rows = table.records;
          ensure(rows.length === file.rows && (rows[0]?.id ?? null) === (file.first ?? null)
            && (rows[rows.length - 1]?.id ?? null) === (file.last ?? null)
            && rows.every((row, index) => index === 0 || rows[index - 1]!.id < row.id), 'Catalog table range or count mismatch');
          const weight = file.bytes * 4;
          while (this.cachedBytes + weight > 64 * 1024 * 1024 && this.tables.size) {
            const oldest = this.tables.keys().next().value!;
            this.cachedBytes -= this.tables.get(oldest)!.bytes;
            this.tables.delete(oldest);
          }
          this.tables.set(file.path, { table, bytes: weight }); this.cachedBytes += weight;
          return table;
        }).then(resolve, reject).finally(() => { this.active--; this.drain(); });
      });
      this.drain();
    }).finally(() => this.pending.delete(file.path));
    this.pending.set(file.path, loading);
    return loading;
  }

  async *scan<K extends Collection>(kind: K): AsyncGenerator<Row<K>> {
    for (const file of this.manifest.files) {
      if (file.kind === kind) for (const row of (await this.table(file)).records) yield row as Row<K>;
    }
  }

  async all<K extends Collection>(kind: K): Promise<Row<K>[]> {
    const weight = (this.partitions.get(kind) ?? []).reduce((total, file) => total + file.bytes * 4, 0);
    if (weight > 256 * 1024 * 1024) throw new Fault('index_limit', 'Catalog index exceeds the lookup memory budget');
    const rows: Row<K>[] = [];
    for await (const row of this.scan(kind)) rows.push(row);
    return rows;
  }

  async record<K extends Collection>(kind: K, id: string): Promise<Row<K>> {
    const files = this.partitions.get(kind) ?? [];
    let first = 0, last = files.length;
    while (first < last) {
      const middle = (first + last) >>> 1;
      if (files[middle]!.last! < id) first = middle + 1; else last = middle;
    }
    const file = files[first];
    if (file && file.first! <= id) {
      const rows = (await this.table(file)).records;
      let low = 0, high = rows.length;
      while (low < high) {
        const middle = (low + high) >>> 1;
        if (rows[middle]!.id < id) low = middle + 1; else high = middle;
      }
      if (rows[low]?.id === id) return rows[low] as Row<K>;
    }
    throw new Fault('record_missing', 'Catalog has no ' + kind + ' record ' + id, 404);
  }

  async records<K extends Collection>(kind: K, ids: Iterable<string>): Promise<Row<K>[]> {
    const keys = [...ids], result: Row<K>[] = [];
    for (let index = 0; index < keys.length; index += 8) {
      result.push(...await Promise.all(keys.slice(index, index + 8).map(id => this.record(kind, id))));
    }
    return result;
  }

  async check(): Promise<void> {
    for (let start = 0; start < this.manifest.files.length; start += 3) {
      await Promise.all(this.manifest.files.slice(start, start + 3).map(file => file.kind === 'image' ? this.read(file.path) : this.table(file)));
    }
  }
}
