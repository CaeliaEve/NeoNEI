import type {
  NativeRuntimeManifest,
  NativeRuntimeManifestFiles,
} from "./NativeRuntimeManifest.ts";
import {
  NATIVE_RUNTIME_REQUIRED_CAPABILITIES,
  NATIVE_UI_RUNTIME_REQUIRED_ENTRYPOINTS,
  type NativeRuntimeCapability,
  type NativeRuntimePackName,
} from "./NativeRuntimeAbi.ts";

export const NATIVE_UI_RUNTIME_REQUIRED_CAPABILITIES =
  NATIVE_RUNTIME_REQUIRED_CAPABILITIES satisfies readonly NativeRuntimeCapability[];
export { NATIVE_UI_RUNTIME_REQUIRED_ENTRYPOINTS };

export type NativeUiRuntimeEntrypointName = typeof NATIVE_UI_RUNTIME_REQUIRED_ENTRYPOINTS[number];

export type NativeUiRuntimeEntrypoints = Record<NativeUiRuntimeEntrypointName, string>;

function capabilityEnabled(value: boolean | string | number | null | undefined): boolean {
  if (value === true) return true;
  if (typeof value === "number") return Number.isFinite(value) && value !== 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return Boolean(normalized) && normalized !== "0" && normalized !== "false" && normalized !== "off" && normalized !== "disabled";
  }
  return false;
}

export function getNativeRuntimeCapabilitySet(manifest: NativeRuntimeManifest): Set<string> {
  const capabilities = manifest.capabilities;
  if (Array.isArray(capabilities)) {
    return new Set(capabilities.map((capability) => `${capability}`.trim()).filter(Boolean));
  }
  if (capabilities && typeof capabilities === "object") {
    const result = new Set<string>();
    for (const [capability, value] of Object.entries(capabilities)) {
      if (capabilityEnabled(value)) result.add(capability);
    }
    return result;
  }
  return new Set();
}

export function getNativeRuntimeEntrypointSource(manifest: NativeRuntimeManifest): NativeRuntimeManifestFiles {
  return manifest.entrypoints ?? {};
}

export function describeNativeRuntimeIdentity(manifest: NativeRuntimeManifest): string {
  return [
    manifest.runtimeId ? `runtimeId=${manifest.runtimeId}` : "",
    manifest.schema ? `schema=${manifest.schema}` : "",
    manifest.schemaVersion ? `schemaVersion=${manifest.schemaVersion}` : "",
    manifest.schemaRevision !== undefined ? `schemaRevision=${manifest.schemaRevision}` : "",
    manifest.sourceSignature ? `sourceSignature=${manifest.sourceSignature}` : "",
  ].filter(Boolean).join(" ") || "unknown runtime manifest";
}

export function assertNativeRuntimeCapabilities(
  manifest: NativeRuntimeManifest,
  requiredCapabilities: readonly string[],
  contractName = "native runtime",
): void {
  const capabilitySet = getNativeRuntimeCapabilitySet(manifest);
  const missing = requiredCapabilities.filter((capability) => !capabilitySet.has(capability));
  if (missing.length > 0) {
    throw new Error(
      `${contractName} manifest is missing required capabilities: ${missing.join(", ")} (${describeNativeRuntimeIdentity(manifest)})`,
    );
  }
}

export function assertNativeRuntimeEntrypoints<TName extends string>(
  manifest: NativeRuntimeManifest,
  requiredEntrypoints: readonly TName[],
  contractName = "native runtime",
): Record<TName, string> {
  const source = getNativeRuntimeEntrypointSource(manifest) as Record<TName, string | undefined>;
  const result = {} as Record<TName, string>;
  const missing: string[] = [];
  for (const entrypointName of requiredEntrypoints) {
    const value = `${source[entrypointName] ?? ""}`.trim();
    if (!value) {
      missing.push(entrypointName);
    } else {
      result[entrypointName] = value;
    }
  }
  if (missing.length > 0) {
    throw new Error(
      `${contractName} manifest is missing required entrypoints: ${missing.join(", ")} (${describeNativeRuntimeIdentity(manifest)})`,
    );
  }
  return result;
}

export function assertNativeRuntimePackEntrypoints(
  manifest: NativeRuntimeManifest,
  packNames: readonly NativeRuntimePackName[],
): Record<NativeRuntimePackName, string> {
  return assertNativeRuntimeEntrypoints(manifest, packNames, "native runtime pack") as Record<NativeRuntimePackName, string>;
}

export function assertNativeUiRuntimeManifest(manifest: NativeRuntimeManifest): NativeUiRuntimeEntrypoints {
  assertNativeRuntimeCapabilities(manifest, NATIVE_UI_RUNTIME_REQUIRED_CAPABILITIES, "native UI runtime");
  return assertNativeRuntimeEntrypoints(manifest, NATIVE_UI_RUNTIME_REQUIRED_ENTRYPOINTS, "native UI runtime");
}
