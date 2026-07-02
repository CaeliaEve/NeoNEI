/**
 * Rust search pack ABI catalog.
 *
 * Dist-data search pack consumers resolve only the current manifest key and the
 * canonical runtime-relative debug path through artifact-index path safety.
 * Historical manifest aliases are intentionally not consumed here.
 */

const RUST_SEARCH_PACK_MANIFEST_KEY_NAMES = Object.freeze([
  'rustSearchPack',
] as const);

export type RustSearchPackManifestKey = typeof RUST_SEARCH_PACK_MANIFEST_KEY_NAMES[number];

const RUST_SEARCH_PACK_SIGNATURE_FIELD_NAMES = Object.freeze([
  'sourceSignature',
  'runtimeCacheKey',
] as const);

export type RustSearchPackSignatureField = typeof RUST_SEARCH_PACK_SIGNATURE_FIELD_NAMES[number];

export type RustSearchPackDescriptor = Readonly<{
  manifestKey: RustSearchPackManifestKey;
  defaultPath: string;
  defaultVersion: number;
  signatureFields: readonly RustSearchPackSignatureField[];
}>;

function isPortableRuntimeSearchPath(value: string): boolean {
  const normalized = `${value ?? ''}`.trim().replace(/\\/g, '/');
  return Boolean(normalized)
    && !normalized.includes('..')
    && !normalized.startsWith('/')
    && !/^[A-Za-z]:\//.test(normalized);
}

function validateAndFreezeRustSearchPackDescriptor(
  descriptor: RustSearchPackDescriptor,
): RustSearchPackDescriptor {
  if (!descriptor) {
    throw new Error('Rust search pack descriptor must not be null');
  }
  if (!RUST_SEARCH_PACK_MANIFEST_KEY_NAMES.includes(descriptor.manifestKey)) {
    throw new Error(`Unknown Rust search pack manifest key: ${descriptor.manifestKey}`);
  }
  if (!isPortableRuntimeSearchPath(descriptor.defaultPath)) {
    throw new Error(`Rust search pack default path must be runtime-relative: ${descriptor.defaultPath}`);
  }
  if (!Number.isInteger(descriptor.defaultVersion) || descriptor.defaultVersion <= 0) {
    throw new Error(`Rust search pack default version must be positive: ${descriptor.defaultVersion}`);
  }
  if (descriptor.signatureFields.length === 0) {
    throw new Error('Rust search pack signature fields must be non-empty');
  }

  const allowedSignatureFields = new Set<RustSearchPackSignatureField>(RUST_SEARCH_PACK_SIGNATURE_FIELD_NAMES);
  const seenSignatureFields = new Set<RustSearchPackSignatureField>();
  for (const field of descriptor.signatureFields) {
    if (!allowedSignatureFields.has(field)) {
      throw new Error(`Unknown Rust search pack signature field: ${field}`);
    }
    if (!seenSignatureFields.add(field)) {
      throw new Error(`Duplicate Rust search pack signature field: ${field}`);
    }
  }

  for (const field of RUST_SEARCH_PACK_SIGNATURE_FIELD_NAMES) {
    if (!seenSignatureFields.has(field)) {
      throw new Error(`Missing Rust search pack signature field: ${field}`);
    }
  }

  return Object.freeze({
    ...descriptor,
    signatureFields: Object.freeze([...descriptor.signatureFields]),
  });
}

export const RUST_SEARCH_PACK_DESCRIPTOR = validateAndFreezeRustSearchPackDescriptor({
  manifestKey: 'rustSearchPack',
  defaultPath: 'rust/search-pack.json',
  defaultVersion: 3,
  signatureFields: RUST_SEARCH_PACK_SIGNATURE_FIELD_NAMES,
});

export const RUST_SEARCH_PACK_MANIFEST_KEYS = Object.freeze({
  rustSearchPack: RUST_SEARCH_PACK_DESCRIPTOR.manifestKey,
} as const);

export const RUST_SEARCH_PACK_DEFAULT_PATH = RUST_SEARCH_PACK_DESCRIPTOR.defaultPath;
export const RUST_SEARCH_PACK_DEFAULT_VERSION = RUST_SEARCH_PACK_DESCRIPTOR.defaultVersion;
export const RUST_SEARCH_PACK_SIGNATURE_FIELDS = RUST_SEARCH_PACK_DESCRIPTOR.signatureFields;
