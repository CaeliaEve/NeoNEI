export function setCacheWithLimit<K, V>(cache: Map<K, V>, key: K, value: V, limit: number): void {
  if (cache.has(key)) {
    cache.delete(key);
  }
  cache.set(key, value);
  if (cache.size > limit) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) {
      cache.delete(oldest);
    }
  }
}

export function buildRuntimePayloadCacheKey(
  kind: string,
  signature: string,
  identity: Record<string, unknown>,
): string {
  return JSON.stringify({
    type: kind,
    version: 2,
    signature,
    ...identity,
  });
}
