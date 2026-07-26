export type RuntimeArtifactFormat = 'json' | 'arrayBuffer';

export type RuntimeArtifactRequest = {
  manifestIdentity: string;
  artifactPath: string;
  resolvedUrl: string;
  contentHash?: string | null;
  format: RuntimeArtifactFormat;
  fetchInit?: RequestInit;
  persistent?: boolean;
  memory?: boolean;
};

export type RuntimeArtifactClientOptions = {
  readPersistent?: (request: RuntimeArtifactRequest, canonicalKey: string) => Promise<unknown | null>;
  writePersistent?: (
    request: RuntimeArtifactRequest,
    canonicalKey: string,
    payload: unknown,
  ) => Promise<void> | void;
  fetchResponse?: (url: string, init?: RequestInit) => Promise<Response>;
  maxMemoryEntries?: number;
};

function normalizeRequired(value: string, label: string): string {
  const normalized = `${value ?? ''}`.trim();
  if (!normalized) throw new Error(`Missing runtime artifact ${label}`);
  return normalized;
}

function canonicalArtifactKey(request: RuntimeArtifactRequest): string {
  const format = request.format;
  const contentHash = `${request.contentHash ?? ''}`.trim().toLowerCase();
  if (contentHash) return `${format}:hash:${contentHash}`;
  const manifestIdentity = normalizeRequired(request.manifestIdentity, 'manifest identity');
  const artifactPath = normalizeRequired(request.artifactPath, 'path').replace(/\\/g, '/');
  return `${format}:manifest:${manifestIdentity}:path:${artifactPath}`;
}

function isPayloadForFormat(payload: unknown, format: RuntimeArtifactFormat): boolean {
  return format === 'arrayBuffer' ? payload instanceof ArrayBuffer : payload !== null;
}

export function createRuntimeArtifactClient(options: RuntimeArtifactClientOptions = {}) {
  const memory = new Map<string, unknown>();
  const inFlight = new Map<string, Promise<unknown>>();
  const maxMemoryEntries = Math.max(1, options.maxMemoryEntries ?? 128);
  const fetchResponse = options.fetchResponse ?? ((url, init) => fetch(url, init));

  function remember(key: string, payload: unknown): void {
    if (memory.has(key)) memory.delete(key);
    memory.set(key, payload);
    while (memory.size > maxMemoryEntries) {
      const oldest = memory.keys().next().value as string | undefined;
      if (!oldest) break;
      memory.delete(oldest);
    }
  }

  function isWarm(request: RuntimeArtifactRequest): boolean {
    const key = canonicalArtifactKey(request);
    return (request.memory !== false && memory.has(key)) || inFlight.has(key);
  }

  function load<T>(request: RuntimeArtifactRequest): Promise<T> {
    const key = canonicalArtifactKey(request);
    if (request.memory !== false && memory.has(key)) {
      return Promise.resolve(memory.get(key) as T);
    }
    const existing = inFlight.get(key);
    if (existing) return existing as Promise<T>;

    const pending = Promise.resolve()
      .then(async () => {
        const persisted = request.persistent === false
          ? null
          : await options.readPersistent?.(request, key);
        if (isPayloadForFormat(persisted, request.format)) {
          if (request.memory !== false) remember(key, persisted);
          return persisted as T;
        }

        const response = await fetchResponse(request.resolvedUrl, request.fetchInit);
        if (!response.ok) {
          throw new Error(
            `Runtime artifact request failed (${response.status}) for ${request.artifactPath}`,
          );
        }
        const payload = request.format === 'arrayBuffer'
          ? await response.arrayBuffer()
          : await response.json();
        if (request.persistent !== false) {
          await Promise.resolve(options.writePersistent?.(request, key, payload));
        }
        if (request.memory !== false) remember(key, payload);
        return payload as T;
      })
      .finally(() => {
        inFlight.delete(key);
      });

    inFlight.set(key, pending);
    return pending as Promise<T>;
  }

  function clear(): void {
    memory.clear();
    inFlight.clear();
  }

  return {
    clear,
    isWarm,
    loadJson<T>(request: Omit<RuntimeArtifactRequest, 'format'>): Promise<T> {
      return load<T>({ ...request, format: 'json' });
    },
    loadArrayBuffer(request: Omit<RuntimeArtifactRequest, 'format'>): Promise<ArrayBuffer> {
      return load<ArrayBuffer>({ ...request, format: 'arrayBuffer' });
    },
  };
}
