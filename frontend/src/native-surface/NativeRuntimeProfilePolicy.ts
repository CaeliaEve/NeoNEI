import type { NativeRuntimeManifest } from "./NativeRuntimeManifest.ts";
import type {
  NativeRuntimeCapability,
  NativeRuntimePackName,
} from "./NativeRuntimeAbi.ts";
import {
  NATIVE_RUNTIME_PROFILE_POLICY_MAP,
  type NativeRuntimePackProfileName,
} from "./NativeRuntimeCatalog.ts";
import { assertNativeRuntimeCapabilities } from "./NativeRuntimeCapabilityGate.ts";

export type NativeRuntimePackProfile = NativeRuntimePackProfileName;

export interface NativeRuntimeProfilePolicy {
  profile: NativeRuntimePackProfile;
  packs: readonly NativeRuntimePackName[];
  capabilities: readonly NativeRuntimeCapability[];
}

const PROFILE_POLICIES = NATIVE_RUNTIME_PROFILE_POLICY_MAP satisfies Readonly<
  Record<NativeRuntimePackProfile, NativeRuntimeProfilePolicy>
>;

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
