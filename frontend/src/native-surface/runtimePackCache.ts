import { loadNativeRuntimeBuffers } from "./runtimeLoader.ts";
import type {
  NativeRuntimeBuffers,
} from "./NativeRuntimeManifest.ts";
import {
  assertNativeRuntimeProfilePolicy,
  getNativeRuntimePackNamesForProfile,
  type NativeRuntimePackProfile,
} from "./NativeRuntimeProfilePolicy.ts";

const runtimeProfileRequests = new Map<string, Promise<NativeRuntimeBuffers>>();

function normalizeManifestUrl(manifestUrl: string): string {
  return new URL(manifestUrl, globalThis.location?.href ?? "http://localhost/").toString();
}

export function clearNativeRuntimePackCache(): void {
  runtimeProfileRequests.clear();
}

export function loadNativeRuntimeBuffersForProfile(
  manifestUrl: string,
  profile: NativeRuntimePackProfile = "full",
): Promise<NativeRuntimeBuffers> {
  const normalizedManifestUrl = normalizeManifestUrl(manifestUrl);
  const packNames = getNativeRuntimePackNamesForProfile(profile);
  const cacheKey = `${normalizedManifestUrl}::${profile}::${packNames.join(",")}`;
  const existing = runtimeProfileRequests.get(cacheKey);
  if (existing) return existing;
  const request = loadNativeRuntimeBuffers(
    normalizedManifestUrl,
    packNames,
    (manifest) => assertNativeRuntimeProfilePolicy(manifest, profile),
  )
    .catch((error) => {
      runtimeProfileRequests.delete(cacheKey);
      throw error;
    });
  runtimeProfileRequests.set(cacheKey, request);
  return request;
}
