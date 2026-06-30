import type { DistDataManifest, DistDataRustRuntimeManifest } from "./distDataRuntimeManifest";

export const PACK_ABI_VALIDATION_REPORT_PATH = "rust/pack-validation-report.json";
export const PACK_ABI_VALIDATION_REPORT_SCHEMA = "elysium-compiler/pack-abi-validation/v1";
export const PACK_ABI_VERSION = "elysium.pack.v1";

type RuntimePackEntrypoint = "browser" | "groups" | "search" | "recipes" | "textures";
type RuntimePackManifestFile = "rustBrowserBin" | "rustGroupsBin" | "rustSearchBin" | "rustRecipeBin" | "rustTextureBin";

export type RuntimePackContract = {
  logicalName: RuntimePackManifestFile;
  manifestFile: RuntimePackManifestFile;
  entrypoint: RuntimePackEntrypoint;
  schema: string;
  description: string;
};

export const RUNTIME_PACK_CONTRACTS = {
  browser: {
    logicalName: "rustBrowserBin",
    manifestFile: "rustBrowserBin",
    entrypoint: "browser",
    schema: "neonei/browser-pack/current",
    description: "Native browser pack",
  },
  groups: {
    logicalName: "rustGroupsBin",
    manifestFile: "rustGroupsBin",
    entrypoint: "groups",
    schema: "neonei/group-pack/current",
    description: "Native group pack",
  },
  search: {
    logicalName: "rustSearchBin",
    manifestFile: "rustSearchBin",
    entrypoint: "search",
    schema: "neonei/search-pack/current",
    description: "Native search pack",
  },
  recipes: {
    logicalName: "rustRecipeBin",
    manifestFile: "rustRecipeBin",
    entrypoint: "recipes",
    schema: "neonei/recipe-pack/current",
    description: "Native recipe pack",
  },
  textures: {
    logicalName: "rustTextureBin",
    manifestFile: "rustTextureBin",
    entrypoint: "textures",
    schema: "neonei/texture-pack/current",
    description: "Native texture pack",
  },
} as const satisfies Record<string, RuntimePackContract>;

export type PackValidationArtifact = {
  logicalName?: string;
  path?: string;
  kind?: string;
  status?: string;
  required?: boolean;
  envelopeSchema?: string;
  schema?: string;
};

export type PackValidationReport = {
  schemaVersion?: string;
  packAbiVersion?: string;
  status?: string;
  missingRequiredArtifacts?: unknown[];
  pathViolations?: unknown[];
  policy?: {
    legacyFallback?: string;
    [key: string]: unknown;
  };
  artifacts?: PackValidationArtifact[];
};

export type PackValidationResult = {
  ok: boolean;
  violations: string[];
};

type RuntimeFileRecord = Record<string, string | undefined>;

function asString(value: unknown): string {
  return `${value ?? ""}`.trim();
}

function normalizeRuntimePath(value: unknown): string {
  return asString(value).replace(/\\/g, "/").replace(/^\/+/, "");
}

function runtimeManifestFilesRecord(runtimeManifest: DistDataRustRuntimeManifest | null): RuntimeFileRecord {
  return runtimeManifest?.files && !Array.isArray(runtimeManifest.files) ? runtimeManifest.files : {};
}

export function runtimeManifestEntrypoints(runtimeManifest: DistDataRustRuntimeManifest | null): RuntimeFileRecord {
  return runtimeManifest?.entrypoints ?? runtimeManifestFilesRecord(runtimeManifest);
}

export function runtimeManifestDeclaresPath(
  runtimeManifest: DistDataRustRuntimeManifest | null,
  artifactPath: string,
): boolean {
  const normalizedArtifactPath = normalizeRuntimePath(artifactPath);
  if (!runtimeManifest || !normalizedArtifactPath) {
    return false;
  }
  const files = runtimeManifest.files;
  if (Array.isArray(files)) {
    return files.some((entry) => normalizeRuntimePath(entry?.path) === normalizedArtifactPath);
  }
  if (files && typeof files === "object") {
    return Object.values(files).some((entry) => normalizeRuntimePath(entry) === normalizedArtifactPath);
  }
  return false;
}

export function resolveNativePackPath(
  manifest: DistDataManifest,
  runtimeManifest: DistDataRustRuntimeManifest | null,
  contract: RuntimePackContract,
): string | null {
  const manifestPath = normalizeRuntimePath(manifest.files?.[contract.manifestFile]);
  if (manifestPath) {
    return manifestPath;
  }
  const runtimePath = normalizeRuntimePath(runtimeManifestEntrypoints(runtimeManifest)[contract.entrypoint]);
  if (runtimePath) {
    return runtimePath;
  }
  return null;
}

export function resolvePackValidationReportPath(
  manifest: DistDataManifest,
  runtimeManifest: DistDataRustRuntimeManifest | null,
): string | null {
  const manifestFiles = manifest.files as (DistDataManifest["files"] & {
    packValidationReport?: string;
  }) | undefined;
  const manifestPath = normalizeRuntimePath(manifestFiles?.rustPackValidationReport ?? manifestFiles?.packValidationReport);
  if (manifestPath) {
    return manifestPath;
  }
  const entrypoints = runtimeManifestEntrypoints(runtimeManifest) as RuntimeFileRecord & {
    packValidationReport?: string;
    packAbiValidationReport?: string;
  };
  const runtimeEntrypointPath = normalizeRuntimePath(entrypoints.packValidationReport ?? entrypoints.packAbiValidationReport);
  if (runtimeEntrypointPath) {
    return runtimeEntrypointPath;
  }
  if (runtimeManifestDeclaresPath(runtimeManifest, PACK_ABI_VALIDATION_REPORT_PATH)) {
    return PACK_ABI_VALIDATION_REPORT_PATH;
  }
  return null;
}

export function validatePackAbiReport(
  report: PackValidationReport | null | undefined,
  contract: RuntimePackContract,
  artifactPath: string,
): PackValidationResult {
  const violations: string[] = [];
  if (!report || typeof report !== "object") {
    return { ok: false, violations: ["report is not an object"] };
  }
  if (report.schemaVersion !== PACK_ABI_VALIDATION_REPORT_SCHEMA) {
    violations.push(`schemaVersion must be ${PACK_ABI_VALIDATION_REPORT_SCHEMA}`);
  }
  if (report.packAbiVersion !== PACK_ABI_VERSION) {
    violations.push(`packAbiVersion must be ${PACK_ABI_VERSION}`);
  }
  if (report.status !== "ok") {
    violations.push(`status must be ok, got ${report.status ?? "missing"}`);
  }
  if ((report.missingRequiredArtifacts?.length ?? 0) > 0) {
    violations.push("missingRequiredArtifacts must be empty");
  }
  if ((report.pathViolations?.length ?? 0) > 0) {
    violations.push("pathViolations must be empty");
  }
  if (report.policy?.legacyFallback !== "forbidden") {
    violations.push("policy.legacyFallback must be forbidden");
  }
  const artifacts = Array.isArray(report.artifacts) ? report.artifacts : [];
  if (!artifacts.length) {
    violations.push("artifacts[] must be present");
  }
  const artifact = artifacts.find((entry) => entry?.logicalName === contract.logicalName);
  if (!artifact) {
    violations.push(`artifact ${contract.logicalName} must be present`);
  } else {
    const normalizedArtifactPath = normalizeRuntimePath(artifact.path);
    const expectedPath = normalizeRuntimePath(artifactPath);
    if (normalizedArtifactPath !== expectedPath) {
      violations.push(`artifact path mismatch for ${contract.logicalName}: expected ${expectedPath}, got ${normalizedArtifactPath || "missing"}`);
    }
    if (artifact.kind !== "binary-pack") {
      violations.push(`artifact kind for ${contract.logicalName} must be binary-pack`);
    }
    if (artifact.status !== "present") {
      violations.push(`artifact status for ${contract.logicalName} must be present`);
    }
    if (artifact.required === false) {
      violations.push(`artifact ${contract.logicalName} must be required`);
    }
    const reportedSchema = asString(artifact.envelopeSchema ?? artifact.schema);
    if (reportedSchema && reportedSchema !== contract.schema) {
      violations.push(`artifact schema mismatch for ${contract.logicalName}: expected ${contract.schema}, got ${reportedSchema}`);
    }
  }
  return { ok: violations.length === 0, violations };
}
