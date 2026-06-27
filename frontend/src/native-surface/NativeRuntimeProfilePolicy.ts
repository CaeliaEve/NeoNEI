import type {
  NativeRuntimeCapability,
  NativeRuntimeManifest,
  NativeRuntimePackName,
} from "./NativeRuntimeManifest.ts";
import { assertNativeRuntimeCapabilities } from "./NativeRuntimeCapabilityGate.ts";

export type NativeRuntimePackProfile =
  | "browser-surface"
  | "history-surface"
  | "search"
  | "recipe"
  | "full";

export interface NativeRuntimeProfilePolicy {
  profile: NativeRuntimePackProfile;
  packs: readonly NativeRuntimePackName[];
  capabilities: readonly NativeRuntimeCapability[];
}

const PROFILE_POLICIES: Record<NativeRuntimePackProfile, NativeRuntimeProfilePolicy> = {
  "browser-surface": {
    profile: "browser-surface",
    // Browser search is part of the right-side NEI interaction, so search stays in
    // this profile for now; recipes are intentionally excluded from first paint.
    packs: ["browser", "groups", "search", "textures", "animations", "stringsZhCn"],
    capabilities: ["groups.collapse", "search.zh-cn", "strings.zh-cn", "native-render.webgl2"],
  },
  "history-surface": {
    profile: "history-surface",
    packs: ["browser", "textures", "animations", "stringsZhCn"],
    capabilities: ["strings.zh-cn", "native-render.webgl2"],
  },
  search: {
    profile: "search",
    packs: ["browser", "groups", "search", "stringsZhCn"],
    capabilities: ["groups.collapse", "search.zh-cn", "strings.zh-cn"],
  },
  recipe: {
    profile: "recipe",
    packs: ["recipes", "textures", "animations", "stringsZhCn"],
    capabilities: ["recipes.lookup", "strings.zh-cn"],
  },
  full: {
    profile: "full",
    packs: ["browser", "groups", "search", "recipes", "textures", "animations", "stringsZhCn"],
    capabilities: ["groups.collapse", "recipes.lookup", "search.zh-cn", "strings.zh-cn", "native-render.webgl2"],
  },
};

export function resolveNativeRuntimeProfilePolicy(
  profile: NativeRuntimePackProfile = "full",
): NativeRuntimeProfilePolicy {
  const policy = PROFILE_POLICIES[profile as NativeRuntimePackProfile];
  if (!policy) {
    throw new Error(`Unknown native runtime pack profile: ${profile}`);
  }
  return policy;
}

export function getNativeRuntimePackNamesForProfile(
  profile: NativeRuntimePackProfile,
): readonly NativeRuntimePackName[] {
  return resolveNativeRuntimeProfilePolicy(profile).packs;
}

export function assertNativeRuntimeProfilePolicy(
  manifest: NativeRuntimeManifest,
  profile: NativeRuntimePackProfile,
): NativeRuntimeProfilePolicy {
  const policy = resolveNativeRuntimeProfilePolicy(profile);
  assertNativeRuntimeCapabilities(manifest, policy.capabilities, `native runtime profile ${policy.profile}`);
  return policy;
}
