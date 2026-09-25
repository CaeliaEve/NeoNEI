import {
  fetchRuntimeArtifactArrayBuffer,
  fetchRuntimeArtifactJson,
} from "./runtimeArtifactClient.ts";

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

function viteEnvValue(key: string): unknown {
  return (import.meta as ImportMeta & { env?: Record<string, unknown> }).env?.[key];
}

export function getDistDataBasePath(): string {
  const envBasePath = normalizeBasePath(viteEnvValue("VITE_DIST_DATA_BASE_URL"));
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
  const explicitManifestUrl = `${viteEnvValue("VITE_NATIVE_RUNTIME_MANIFEST_URL") ?? ""}`.trim();
  if (explicitManifestUrl) {
    return explicitManifestUrl;
  }

  const runtimePacksEnabled = `${viteEnvValue("VITE_ENABLE_NATIVE_RUNTIME_PACKS") ?? ""}`.trim().toLowerCase();
  if (runtimePacksEnabled === "0" || runtimePacksEnabled === "false" || runtimePacksEnabled === "off") {
    return null;
  }

  return "/api/runtime/current/manifest";
}

export async function fetchDistDataJson<T>(
  url: string,
  options?: { persistent?: boolean; memory?: boolean },
): Promise<T> {
  return fetchRuntimeArtifactJson<T>({
    artifactPath: canonicalArtifactPath(url),
    resolvedUrl: url,
    persistent: options?.persistent,
    memory: options?.memory,
    fetchInit: {
      cache: "no-cache",
      credentials: "same-origin",
    },
  });
}

export async function fetchDistDataArrayBuffer(
  url: string,
  options?: { persistent?: boolean; memory?: boolean },
): Promise<ArrayBuffer> {
  return fetchRuntimeArtifactArrayBuffer({
    artifactPath: canonicalArtifactPath(url),
    resolvedUrl: url,
    persistent: options?.persistent,
    memory: options?.memory,
    fetchInit: {
      cache: "no-cache",
      credentials: "same-origin",
    },
  });
}

function canonicalArtifactPath(url: string): string {
  try {
    const resolved = new URL(url, globalThis.location?.href ?? "http://localhost/");
    return `${resolved.pathname}${resolved.search}`;
  } catch {
    return url;
  }
}
