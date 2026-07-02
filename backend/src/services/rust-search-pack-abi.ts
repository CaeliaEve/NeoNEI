/**
 * Rust search pack ABI catalog.
 *
 * Dist-data search pack consumers resolve only the current manifest key and the
 * canonical runtime-relative debug path through artifact-index path safety.
 * Historical manifest aliases are intentionally not consumed here.
 */

export const RUST_SEARCH_PACK_MANIFEST_KEYS = Object.freeze({
  rustSearchPack: 'rustSearchPack',
} as const);

export type RustSearchPackManifestKey =
  typeof RUST_SEARCH_PACK_MANIFEST_KEYS[keyof typeof RUST_SEARCH_PACK_MANIFEST_KEYS];

export const RUST_SEARCH_PACK_DEFAULT_PATH = 'rust/search-pack.json';
export const RUST_SEARCH_PACK_DEFAULT_VERSION = 3;

export const RUST_SEARCH_PACK_SIGNATURE_FIELDS = Object.freeze([
  'sourceSignature',
  'runtimeCacheKey',
] as const);

export type RustSearchPackSignatureField = typeof RUST_SEARCH_PACK_SIGNATURE_FIELDS[number];
