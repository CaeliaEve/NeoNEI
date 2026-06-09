import { loadNativeRuntimeBuffers } from "./runtimeLoader";
import type {
  NativeRuntimeBuffers,
  NativeRuntimePackName,
} from "./NativeRuntimeManifest";

export type NativeRuntimePackProfile =
  | "browser-surface"
  | "history-surface"
  | "search"
  | "recipe"
  | "full";

const PROFILE_PACKS: Record<NativeRuntimePackProfile, readonly NativeRuntimePackName[]> = {
  // Browser search is part of the right-side NEI interaction, so search stays in
  // this profile for now; recipes are intentionally excluded from first paint.
  "browser-surface": ["browser", "groups", "search", "textures", "animations", "stringsZhCn"],
  "history-surface": ["browser", "textures", "animations", "stringsZhCn"],
  search: ["browser", "groups", "search", "stringsZhCn"],
  recipe: ["recipes", "textures", "animations", "stringsZhCn"],
  full: ["browser", "groups", "search", "recipes", "textures", "animations", "stringsZhCn"],
};

const runtimeProfileRequests = new Map<string, Promise<NativeRuntimeBuffers>>();

function normalizeManifestUrl(manifestUrl: string): string {
  return new URL(manifestUrl, globalThis.location?.href ?? "http://localhost/").toString();
}

export function getNativeRuntimePackNamesForProfile(profile: NativeRuntimePackProfile): readonly NativeRuntimePackName[] {
  return PROFILE_PACKS[profile] ?? PROFILE_PACKS.full;
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
  const request = loadNativeRuntimeBuffers(normalizedManifestUrl, packNames)
    .catch((error) => {
      runtimeProfileRequests.delete(cacheKey);
      throw error;
    });
  runtimeProfileRequests.set(cacheKey, request);
  return request;
}
