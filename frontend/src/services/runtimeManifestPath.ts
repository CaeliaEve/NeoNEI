export type RuntimeManifestPathRecord = Record<string, unknown>;

export type RuntimeManifestPathSource = Readonly<{
  entrypoints?: RuntimeManifestPathRecord | null;
  files?: unknown;
}>;

export function runtimePathString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizeRuntimePath(value: unknown): string {
  return runtimePathString(value).replace(/\\/g, "/").replace(/^\/+/, "");
}

export function runtimePathFromValue(value: unknown): string {
  return normalizeRuntimePath(value);
}

export function runtimePathsEqual(left: unknown, right: unknown): boolean {
  const normalizedLeft = runtimePathFromValue(left);
  const normalizedRight = runtimePathFromValue(right);
  return Boolean(normalizedLeft) && normalizedLeft === normalizedRight;
}

export function runtimeManifestFileRecord(value: unknown): RuntimeManifestPathRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as RuntimeManifestPathRecord : null;
}

export function runtimeManifestDeclaresPath(
  source: RuntimeManifestPathSource,
  relativePath: unknown,
): boolean {
  const normalized = normalizeRuntimePath(relativePath);
  if (!normalized) return false;

  const entrypoints = source.entrypoints ?? null;
  if (entrypoints && Object.values(entrypoints).some((value) => runtimePathsEqual(value, normalized))) {
    return true;
  }

  const files = source.files;
  if (Array.isArray(files)) {
    return files.some((file) => runtimePathsEqual(runtimeManifestFileRecord(file)?.path, normalized));
  }

  const fileRecord = runtimeManifestFileRecord(files);
  return fileRecord ? Object.values(fileRecord).some((value) => runtimePathsEqual(value, normalized)) : false;
}

export function getManifestRuntimeFileBytes(files: unknown, relativePath: unknown): number | null {
  const normalized = normalizeRuntimePath(relativePath);
  if (!normalized || !Array.isArray(files)) return null;
  const row = files.find((file) => runtimePathsEqual(runtimeManifestFileRecord(file)?.path, normalized));
  const bytes = Number(runtimeManifestFileRecord(row)?.bytes);
  return Number.isFinite(bytes) && bytes >= 0 ? bytes : null;
}
