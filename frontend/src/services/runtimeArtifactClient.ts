import { createRuntimeArtifactClient } from '../runtime/RuntimeArtifactClient.ts';
import {
  getStoredRuntimeSignature,
  readPersistentRuntimeCache,
  writePersistentRuntimeCache,
} from './persistentRuntimeCache.ts';

let activeManifestIdentity = getStoredRuntimeSignature() ?? 'runtime-unresolved';
const contentHashesByManifestIdentity = new Map<string, Map<string, string>>();

function normalizeArtifactPath(path: string): string {
  return `${path ?? ''}`.trim().replace(/\\/g, '/').replace(/^\/+/, '');
}

function resolveRegisteredContentHash(manifestIdentity: string, artifactPath: string): string | null {
  const hashes = contentHashesByManifestIdentity.get(manifestIdentity);
  if (!hashes) return null;
  const normalized = normalizeArtifactPath(artifactPath);
  const exact = hashes.get(normalized);
  if (exact) return exact;
  for (const [path, hash] of hashes) {
    if (normalized.endsWith(`/${path}`)) return hash;
  }
  return null;
}

function persistentArtifactKey(
  request: { manifestIdentity: string },
  canonicalKey: string,
): string {
  return JSON.stringify({
    kind: 'runtime-artifact',
    signature: request.manifestIdentity,
    artifact: canonicalKey,
  });
}

const runtimeArtifactClient = createRuntimeArtifactClient({
  readPersistent: (request, canonicalKey) => (
    readPersistentRuntimeCache(persistentArtifactKey(request, canonicalKey))
  ),
  writePersistent: (request, canonicalKey, payload) => (
    writePersistentRuntimeCache(persistentArtifactKey(request, canonicalKey), payload)
  ),
});

export function setRuntimeArtifactManifestIdentity(identity: string | null | undefined): void {
  const normalized = `${identity ?? ''}`.trim();
  if (normalized) activeManifestIdentity = normalized;
}

export function registerRuntimeArtifactContentHashes(
  manifestIdentity: string,
  hashes: Record<string, string | null | undefined>,
): void {
  const identity = `${manifestIdentity ?? ''}`.trim();
  if (!identity) return;
  const registry = new Map<string, string>();
  for (const [path, hash] of Object.entries(hashes)) {
    const normalizedPath = normalizeArtifactPath(path);
    const normalizedHash = `${hash ?? ''}`.trim().toLowerCase();
    if (normalizedPath && normalizedHash) registry.set(normalizedPath, normalizedHash);
  }
  contentHashesByManifestIdentity.set(identity, registry);
}

export function getRuntimeArtifactManifestIdentity(): string {
  return activeManifestIdentity;
}

export function clearRuntimeArtifactMemoryCache(): void {
  runtimeArtifactClient.clear();
  contentHashesByManifestIdentity.clear();
}

export function isRuntimeArtifactWarm(input: {
  artifactPath: string;
  resolvedUrl: string;
  manifestIdentity?: string | null;
  contentHash?: string | null;
  format?: 'json' | 'arrayBuffer';
  memory?: boolean;
}): boolean {
  const manifestIdentity = input.manifestIdentity ?? activeManifestIdentity;
  return runtimeArtifactClient.isWarm({
    manifestIdentity,
    artifactPath: input.artifactPath,
    resolvedUrl: input.resolvedUrl,
    contentHash: input.contentHash ?? resolveRegisteredContentHash(manifestIdentity, input.artifactPath),
    format: input.format ?? 'json',
    memory: input.memory,
  });
}

export function fetchRuntimeArtifactJson<T>(input: {
  artifactPath: string;
  resolvedUrl: string;
  manifestIdentity?: string | null;
  contentHash?: string | null;
  fetchInit?: RequestInit;
  persistent?: boolean;
  memory?: boolean;
}): Promise<T> {
  const manifestIdentity = input.manifestIdentity ?? activeManifestIdentity;
  return runtimeArtifactClient.loadJson<T>({
    ...input,
    manifestIdentity,
    contentHash: input.contentHash ?? resolveRegisteredContentHash(manifestIdentity, input.artifactPath),
  });
}

export function fetchRuntimeArtifactArrayBuffer(input: {
  artifactPath: string;
  resolvedUrl: string;
  manifestIdentity?: string | null;
  contentHash?: string | null;
  fetchInit?: RequestInit;
  persistent?: boolean;
  memory?: boolean;
}): Promise<ArrayBuffer> {
  const manifestIdentity = input.manifestIdentity ?? activeManifestIdentity;
  return runtimeArtifactClient.loadArrayBuffer({
    ...input,
    manifestIdentity,
    contentHash: input.contentHash ?? resolveRegisteredContentHash(manifestIdentity, input.artifactPath),
  });
}
