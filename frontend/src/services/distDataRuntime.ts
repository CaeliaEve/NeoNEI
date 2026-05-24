import type { BrowserSearchPackResponse } from "./api";

type DistDataManifest = {
  schemaVersion?: string;
  generatedAt?: string | null;
  source?: string | null;
  sourceRepository?: string | null;
  runtimeCacheKey?: string | null;
  sourceSignature?: string | null;
  files?: {
    searchAll?: string;
    browserCatalog?: string;
    browserGroups?: string;
    recipeCategories?: string;
    textureManifest?: string;
    validationReport?: string;
  };
};

type DistDataSearchPayload = {
  schemaVersion?: string;
  version?: number;
  signature?: string;
  total?: number;
  items?: BrowserSearchPackResponse["items"];
};

export type DistDataSearchPack = {
  manifest: DistDataManifest;
  runtimeCacheKey: string;
  pack: BrowserSearchPackResponse;
};

let manifestRequest: Promise<DistDataManifest | null> | null = null;
let searchPackRequest: Promise<DistDataSearchPack | null> | null = null;
let cachedSearchPack: DistDataSearchPack | null = null;

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

function getConfiguredBasePath(): string {
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

function joinAssetPath(basePath: string, assetPath: string): string {
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

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    cache: "force-cache",
    credentials: "same-origin",
  });
  if (!response.ok) {
    throw new Error(`dist-data request failed (${response.status}) for ${url}`);
  }
  return response.json() as Promise<T>;
}

function buildRuntimeCacheKey(manifest: DistDataManifest): string {
  const explicit = `${manifest.runtimeCacheKey ?? manifest.sourceSignature ?? ""}`.trim();
  if (explicit) {
    return `dist-data-v3:${explicit}`;
  }

  const schema = `${manifest.schemaVersion ?? "unknown"}`.trim();
  const generatedAt = `${manifest.generatedAt ?? "unknown"}`.trim();
  const source = `${manifest.source ?? "unknown"}`.trim();
  return `dist-data-v3:${schema}:${source}:${generatedAt}`;
}

function coerceSearchPack(manifest: DistDataManifest, payload: DistDataSearchPayload): BrowserSearchPackResponse {
  const items = Array.isArray(payload.items) ? payload.items.filter((entry) => entry?.itemId) : [];
  return {
    version: Number.isFinite(Number(payload.version)) ? Number(payload.version) : 3,
    signature: payload.signature ?? buildRuntimeCacheKey(manifest),
    total: Number.isFinite(Number(payload.total)) ? Number(payload.total) : items.length,
    items,
  };
}

export async function getDistDataManifest(): Promise<DistDataManifest | null> {
  if (manifestRequest) {
    return manifestRequest;
  }

  manifestRequest = fetchJson<DistDataManifest>(joinAssetPath(getConfiguredBasePath(), "manifest.json"))
    .catch(() => null)
    .finally(() => {
      manifestRequest = null;
    });
  return manifestRequest;
}

export async function getDistDataSearchPack(): Promise<DistDataSearchPack | null> {
  if (cachedSearchPack) {
    return cachedSearchPack;
  }
  if (searchPackRequest) {
    return searchPackRequest;
  }

  searchPackRequest = (async () => {
    const manifest = await getDistDataManifest();
    const searchPath = `${manifest?.files?.searchAll ?? ""}`.trim();
    if (!manifest || !searchPath) {
      return null;
    }

    const payload = await fetchJson<DistDataSearchPayload>(joinAssetPath(getConfiguredBasePath(), searchPath));
    const pack = coerceSearchPack(manifest, payload);
    if (!pack.items.length) {
      return null;
    }

    cachedSearchPack = {
      manifest,
      runtimeCacheKey: buildRuntimeCacheKey(manifest),
      pack,
    };
    return cachedSearchPack;
  })()
    .catch(() => null)
    .finally(() => {
      searchPackRequest = null;
    });

  return searchPackRequest;
}

export function resetDistDataRuntimeCache(): void {
  manifestRequest = null;
  searchPackRequest = null;
  cachedSearchPack = null;
}
