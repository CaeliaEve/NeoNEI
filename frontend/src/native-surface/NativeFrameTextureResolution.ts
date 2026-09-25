export type NativeFrameTextureDescriptor = Readonly<{
  key: string;
  url: string;
}>;

function normalizeTextureKey(value: string): string {
  return `${value ?? ""}`.trim().replace(/\\/g, "/").replace(/^\/+/, "");
}

export function requireNativeFrameTextureDescriptors(
  requestedKeys: readonly string[],
  descriptors: readonly NativeFrameTextureDescriptor[],
): NativeFrameTextureDescriptor[] {
  const requested = Array.from(new Set(requestedKeys.map(normalizeTextureKey).filter(Boolean)));
  const descriptorsByKey = new Map<string, NativeFrameTextureDescriptor>();
  for (const descriptor of descriptors) {
    const key = normalizeTextureKey(descriptor.key);
    const url = `${descriptor.url ?? ""}`.trim();
    if (key && url) descriptorsByKey.set(key, { key, url });
  }
  const unresolved = requested.filter((key) => !descriptorsByKey.has(key));
  if (unresolved.length > 0) {
    throw new Error(`Native frame texture descriptors are missing: ${unresolved.join(", ")}`);
  }
  return requested.map((key) => descriptorsByKey.get(key)!);
}
