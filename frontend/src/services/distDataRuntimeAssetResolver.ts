function trimSlashes(value: string): string {
  return value.replace(/^\/+|\/+$/g, "");
}

function normalizeBasePath(value: unknown): string {
  const raw = `${value ?? ""}`.trim();
  if (!raw) {
    return "/dist-data";
  }
  return raw.replace(/\/+$/g, "");
}

export function getDistDataBasePath(): string {
  const envBasePath = normalizeBasePath(import.meta.env.VITE_DIST_DATA_BASE_URL);
  if (typeof window === "undefined") {
    return envBasePath;
  }

  try {
    const override = window.localStorage.getItem("neonei:dist-data-base-url");
    if (override?.trim()) {
      return normalizeBasePath(override);
    }
  } catch {
    // Storage can be unavailable in privacy modes; keep the env/default base path.
  }

  return envBasePath;
}

export function joinDistDataAssetPath(basePath: string, assetPath: string): string {
  const normalizedAssetPath = `${assetPath ?? ""}`.trim();
  if (!normalizedAssetPath) {
    throw new Error("Missing dist-data asset path");
  }
  if (/^https?:\/\//i.test(normalizedAssetPath)) {
    return normalizedAssetPath;
  }
  if (/^https?:\/\//i.test(basePath)) {
    return `${basePath}/${trimSlashes(normalizedAssetPath)}`;
  }
  return `${basePath.startsWith("/") ? basePath : `/${basePath}`}/${trimSlashes(normalizedAssetPath)}`;
}

export function preserveEncodedDistDataFileNamePath(assetPath: string): string {
  // Raw-export payload indexes store filenames that already contain percent-encoded
  // recipe IDs (for example "%3D%3D"). Browsers/Express decode one URL layer
  // before static-file lookup, so encode literal percent signs once more to
  // address the on-disk filename instead of a decoded variant.
  return assetPath.replace(/%/g, "%25");
}

export function resolveDistDataAssetPath(assetPath?: string | null): string | null {
  const normalizedAssetPath = `${assetPath ?? ""}`.trim();
  if (!normalizedAssetPath) {
    return null;
  }
  return joinDistDataAssetPath(getDistDataBasePath(), normalizedAssetPath);
}

export function resolveDistDataNativeRuntimeManifestPath(): string | null {
  const explicitManifestUrl = `${import.meta.env.VITE_NATIVE_RUNTIME_MANIFEST_URL ?? ""}`.trim();
  if (explicitManifestUrl) {
    return explicitManifestUrl;
  }

  const runtimePacksEnabled = `${import.meta.env.VITE_ENABLE_NATIVE_RUNTIME_PACKS ?? ""}`.trim().toLowerCase();
  if (runtimePacksEnabled === "0" || runtimePacksEnabled === "false" || runtimePacksEnabled === "off") {
    return null;
  }

  return "/api/runtime/current/manifest";
}

export async function fetchDistDataJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    cache: "force-cache",
    credentials: "same-origin",
  });
  if (!response.ok) {
    throw new Error(`dist-data request failed (${response.status}) for ${url}`);
  }
  return response.json() as Promise<T>;
}

export async function fetchDistDataArrayBuffer(url: string): Promise<ArrayBuffer> {
  const response = await fetch(url, {
    cache: "force-cache",
    credentials: "same-origin",
  });
  if (!response.ok) {
    throw new Error(`dist-data request failed (${response.status}) for ${url}`);
  }
  return response.arrayBuffer();
}
