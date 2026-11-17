import * as current from '@elysium/contracts';

export type CatalogManifest = current.Manifest;
export type CatalogPointer = current.Pointer;

/** Archived snapshots stay unchanged and belong to their original viewer. */
function requireRevision(revision: unknown): void {
  if (supportedCatalogRevision(revision)) return;
  throw new Error('Unsupported Catalog revision: ' + String(revision)
    + '. Download current data or use the archived viewer; saved data is unchanged.');
}

export function supportedCatalogRevision(revision: unknown): boolean {
  return revision === current.formats.catalog.revision;
}

function revision(value: unknown): unknown {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>).revision : undefined;
}

export function assertCatalogManifest(value: unknown): asserts value is CatalogManifest {
  requireRevision(revision(value));
  current.assertManifest(value);
}

export function assertCatalogPointer(value: unknown): asserts value is CatalogPointer {
  requireRevision(revision(value));
  current.assertPointer(value);
}

export function catalogCollections(revision: number): readonly current.Table['kind'][] {
  requireRevision(revision);
  return current.collections;
}

export function decodeCatalogTable(bytes: Uint8Array, kind: current.Table['kind'], revision: number): current.Table {
  requireRevision(revision);
  return current.decodeTable(bytes, kind);
}
