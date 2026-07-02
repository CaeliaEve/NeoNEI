import fs from 'fs';
import type { BrowserSearchPackPayload } from './publish-payload.service';
import {
  CURRENT_RUNTIME_DIST_MANIFEST_FILE,
  isPortableRuntimePath,
  normalizeRuntimePath,
  resolveDistDataRuntimeFile,
} from './current-runtime-artifact-index.service';
import {
  RUST_SEARCH_PACK_DEFAULT_PATH,
  RUST_SEARCH_PACK_DEFAULT_VERSION,
  RUST_SEARCH_PACK_MANIFEST_KEYS,
  RUST_SEARCH_PACK_SIGNATURE_FIELDS,
  type RustSearchPackManifestKey,
  type RustSearchPackSignatureField,
} from './rust-search-pack-abi';

type DistDataManifest = Partial<Record<RustSearchPackSignatureField, string | null>> & {
  files?: Partial<Record<RustSearchPackManifestKey, string | null>>;
};

function readJsonFile<T>(filePath: string): T | null {
  try {
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      return null;
    }
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
  } catch {
    return null;
  }
}

function resolveSearchPackCandidate(relativePath?: string | null): string | null {
  if (!isPortableRuntimePath(relativePath)) {
    return null;
  }
  try {
    return resolveDistDataRuntimeFile(normalizeRuntimePath(relativePath));
  } catch {
    return null;
  }
}

function manifestSignature(manifest: DistDataManifest | null): string {
  for (const field of RUST_SEARCH_PACK_SIGNATURE_FIELDS) {
    const signature = `${manifest?.[field] ?? ''}`.trim();
    if (signature) return signature;
  }
  return CURRENT_RUNTIME_DIST_MANIFEST_FILE;
}

function searchPackCandidatePaths(manifest: DistDataManifest | null): string[] {
  const relativePaths = [
    manifest?.files?.[RUST_SEARCH_PACK_MANIFEST_KEYS.rustSearchPack],
    RUST_SEARCH_PACK_DEFAULT_PATH,
  ];
  return Array.from(new Set(
    relativePaths
      .map((relativePath) => resolveSearchPackCandidate(relativePath))
      .filter((entry): entry is string => Boolean(entry)),
  ));
}

function coercePack(payload: BrowserSearchPackPayload | null, signature?: string | null): BrowserSearchPackPayload | null {
  const items = Array.isArray(payload?.items) ? payload!.items.filter((entry) => entry?.itemId) : [];
  if (items.length <= 0) {
    return null;
  }
  return {
    version: Number.isFinite(Number(payload?.version)) ? Number(payload?.version) : RUST_SEARCH_PACK_DEFAULT_VERSION,
    signature: payload?.signature ?? signature ?? undefined,
    total: Number.isFinite(Number(payload?.total)) ? Number(payload?.total) : items.length,
    items,
  };
}

export class RustSearchPackService {
  private cachedSignature: string | null = null;
  private cachedPack: BrowserSearchPackPayload | null = null;

  readDistDataSearchPack(): BrowserSearchPackPayload | null {
    const manifest = readJsonFile<DistDataManifest>(CURRENT_RUNTIME_DIST_MANIFEST_FILE);
    const signature = manifestSignature(manifest);
    if (this.cachedSignature === signature && this.cachedPack) {
      return this.cachedPack;
    }

    for (const candidate of searchPackCandidatePaths(manifest)) {
      const pack = coercePack(readJsonFile<BrowserSearchPackPayload>(candidate), signature);
      if (pack) {
        this.cachedSignature = signature;
        this.cachedPack = pack;
        return pack;
      }
    }

    this.cachedSignature = signature;
    this.cachedPack = null;
    return null;
  }
}

let rustSearchPackService: RustSearchPackService | null = null;

export function getRustSearchPackService(): RustSearchPackService {
  if (!rustSearchPackService) {
    rustSearchPackService = new RustSearchPackService();
  }
  return rustSearchPackService;
}
