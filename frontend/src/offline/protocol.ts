import type { CatalogManifest as Manifest } from '@neonei/catalog/source';
import type { Saved } from './store.ts';

export interface Progress { id: string; files: number; totalFiles: number; bytes: number; totalBytes: number }
export type Operation =
  | { kind: 'open'; catalog: string; base: string; locale?: string }
  | { kind: 'query'; endpoint: string }
  | { kind: 'asset'; path: string }
  | { kind: 'list' }
  | { kind: 'save'; catalog: string; base: string }
  | { kind: 'remove'; catalog: string };
export type Call = { id: number; operation: Operation } | { cancel: number };
export type Reply =
  | { id: number; value: unknown }
  | { id: number; cancelled: true }
  | { id: number; progress: Progress }
  | { id: number; error: { code: string; message: string; status: number; name: string } };
export interface Opened { manifest: Manifest }
export type { Saved };
