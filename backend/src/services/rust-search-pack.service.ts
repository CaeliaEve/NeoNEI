import fs from 'fs';
import path from 'path';
import { PUBLIC_DIR } from '../config/runtime-paths';
import type { BrowserSearchPackPayload } from './publish-payload.service';

type DistDataManifest = {
  sourceSignature?: string | null;
  runtimeCacheKey?: string | null;
  files?: {
    rustSearchPack?: string | null;
    searchAll?: string | null;
  };
};

function normalizeRelativePath(value?: string | null): string | null {
  const normalized = `${value ?? ''}`.trim().replace(/\\/g, '/').replace(/^\/+/, '');
  if (!normalized || normalized.split('/').some((segment) => segment === '..')) {
    return null;
  }
  return normalized;
}

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

function coercePack(payload: BrowserSearchPackPayload | null, signature?: string | null): BrowserSearchPackPayload | null {
  const items = Array.isArray(payload?.items) ? payload!.items.filter((entry) => entry?.itemId) : [];
  if (items.length <= 0) {
    return null;
  }
  return {
    version: Number.isFinite(Number(payload?.version)) ? Number(payload?.version) : 3,
    signature: payload?.signature ?? signature ?? undefined,
    total: Number.isFinite(Number(payload?.total)) ? Number(payload?.total) : items.length,
    items,
  };
}

export class RustSearchPackService {
  private cachedSignature: string | null = null;
  private cachedPack: BrowserSearchPackPayload | null = null;

  readDistDataSearchPack(): BrowserSearchPackPayload | null {
    const distDataRoot = path.resolve(PUBLIC_DIR, 'dist-data');
    const manifestPath = path.join(distDataRoot, 'manifest.json');
    const manifest = readJsonFile<DistDataManifest>(manifestPath);
    const signature = `${manifest?.sourceSignature ?? manifest?.runtimeCacheKey ?? ''}`.trim() || manifestPath;
    if (this.cachedSignature === signature && this.cachedPack) {
      return this.cachedPack;
    }

    const relativePaths = Array.from(new Set([
      normalizeRelativePath(manifest?.files?.rustSearchPack),
      normalizeRelativePath(manifest?.files?.searchAll),
      'rust/search-pack.json',
    ].filter((entry): entry is string => Boolean(entry))));

    for (const relativePath of relativePaths) {
      const candidate = path.resolve(distDataRoot, ...relativePath.split('/'));
      if (!candidate.startsWith(distDataRoot)) {
        continue;
      }
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
