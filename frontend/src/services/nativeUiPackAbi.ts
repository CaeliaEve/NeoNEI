/**
 * Native UI runtime pack ABI catalog.
 *
 * Keep the compact UI pack wire contract in one frontend module so runtime
 * parsing, tests, and production gates do not drift from the compiler's
 * versioned ABI catalog.
 */

export const UI_PACK_ABI_VALIDATION_REPORT_PATH = "rust/ui-pack-abi-validation-report.json";
export const UI_PACK_ABI_VALIDATION_SCHEMA_VERSION = "elysium-compiler/ui-pack-abi-validation/v1";
export const NATIVE_UI_EXPORT_ABI_VALIDATION_REPORT_PATH = "rust/native-ui-export-abi-validation-report.json";
export const NATIVE_UI_EXPORT_ABI_VALIDATION_SCHEMA_VERSION = "elysium-compiler/native-ui-export-abi-validation/v1";
export const NATIVE_UI_EXPORT_RAW_REPORT_SCHEMA_VERSION = "nesqlpp/raw-export/alpha1/native-ui-validation";
export const NATIVE_UI_EXPORT_STATUS_OK = "ok";
export const NATIVE_UI_EXPORT_POLICY_LEGACY_FALLBACK = "forbidden";
export const NATIVE_UI_EXPORT_REQUIRED_POSITIVE_COUNTERS = Object.freeze([
  "layoutCount",
  "slotCount",
]);
export const NATIVE_UI_EXPORT_ZERO_VIOLATION_COUNTERS = Object.freeze([
  "missingSurfaceCount",
  "slotBoundsViolationCount",
  "rectBoundsViolationCount",
  "primitiveBoundsViolationCount",
  "backgroundBoundsViolationCount",
  "coordinateContractViolationCount",
  "interactionContractViolationCount",
]);
export const NATIVE_UI_EXPORT_VIOLATION_ARRAY_FIELDS = Object.freeze([
  "schemaViolations",
  "pathViolations",
  "contractViolations",
]);

type NativeUiExportAbiRecord = Record<string, unknown>;

function exportAbiRecord(value: unknown): NativeUiExportAbiRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as NativeUiExportAbiRecord : null;
}

function exportAbiString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function exportAbiStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((entry) => `${entry ?? ""}`.trim()).filter(Boolean) : [];
}

function exportAbiFiniteNumber(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

export function collectNativeUiExportAbiReportViolations(report: NativeUiExportAbiRecord | null | undefined): string[] {
  const violations: string[] = [];
  if (!report) {
    return ["native UI export ABI validation report is missing or unreadable"];
  }
  const schemaVersion = exportAbiString(report.schemaVersion);
  if (schemaVersion !== NATIVE_UI_EXPORT_ABI_VALIDATION_SCHEMA_VERSION) {
    violations.push(`native UI export ABI validation report schema mismatch: expected ${NATIVE_UI_EXPORT_ABI_VALIDATION_SCHEMA_VERSION}, got ${schemaVersion || "<missing>"}`);
  }
  const status = exportAbiString(report.status);
  if (status !== NATIVE_UI_EXPORT_STATUS_OK) {
    violations.push(`native UI export ABI validation report is not ok: ${status || "<missing>"}`);
  }
  if (exportAbiString(report.rawReportSchemaVersion) !== NATIVE_UI_EXPORT_RAW_REPORT_SCHEMA_VERSION) {
    violations.push("native UI export ABI validation report rawReportSchemaVersion mismatch");
  }
  if (exportAbiString(report.rawReportStatus) !== NATIVE_UI_EXPORT_STATUS_OK) {
    violations.push("native UI export ABI validation report rawReportStatus must be ok");
  }
  if (report.missingReport === true) {
    violations.push("native UI export ABI validation report declares missingReport");
  }
  const policy = exportAbiRecord(report.policy);
  if (exportAbiString(policy?.legacyFallback) !== NATIVE_UI_EXPORT_POLICY_LEGACY_FALLBACK) {
    violations.push("native UI export ABI validation report must forbid legacyFallback");
  }
  const reportViolations = NATIVE_UI_EXPORT_VIOLATION_ARRAY_FIELDS.flatMap((key) => exportAbiStringArray(report[key]));
  if (reportViolations.length > 0) {
    violations.push(`native UI export ABI validation report has violations: ${reportViolations.join("; ")}`);
  }
  for (const key of NATIVE_UI_EXPORT_REQUIRED_POSITIVE_COUNTERS) {
    if ((exportAbiFiniteNumber(report[key]) ?? 0) <= 0) {
      violations.push(`native UI export ABI validation report ${key} must be greater than zero`);
    }
  }
  for (const key of NATIVE_UI_EXPORT_ZERO_VIOLATION_COUNTERS) {
    if ((exportAbiFiniteNumber(report[key]) ?? 0) !== 0) {
      violations.push(`native UI export ABI validation report ${key} must be zero`);
    }
  }
  return violations;
}

export const UI_TEMPLATE_PACK_SCHEMA = "neonei/ui-template-pack/current";
export const UI_BINDING_PACK_SCHEMA = "neonei/ui-binding-pack/current";
export const UI_STRING_PACK_SCHEMA = "neonei/ui-string-pack/current";

export const UI_TEMPLATE_PACK_MAGIC = "NEIUIT1\0";
export const UI_BINDING_PACK_MAGIC = "NEIUIB1\0";
export const UI_STRING_PACK_MAGIC = "NEIUIS1\0";
export const UI_TEMPLATE_PACK_PAYLOAD_MAGIC_REPORT = "NEIUIT1_NUL";
export const UI_BINDING_PACK_PAYLOAD_MAGIC_REPORT = "NEIUIB1_NUL";
export const UI_STRING_PACK_PAYLOAD_MAGIC_REPORT = "NEIUIS1_NUL";

export const UI_TEMPLATE_PAYLOAD_VERSION = 9;
export const UI_BINDING_PAYLOAD_VERSION = 2;
export const UI_STRING_PAYLOAD_VERSION = 1;

export const UI_TEMPLATE_ROW_STRIDE_U32 = 25;
export const UI_SLOT_ROW_STRIDE_U32 = 12;
export const UI_TEXT_ROW_STRIDE_U32 = 7;
export const UI_PRIMITIVE_ROW_STRIDE_U32 = 13;
export const UI_RECT_ROW_STRIDE_U32 = 15;
export const UI_BINDING_ROW_STRIDE_U32 = 14;

export const UI_PACK_SURFACE_CONTRACT_FIELDS = Object.freeze([
  "coordinateSpace",
  "scaleMode",
  "anchor",
]);
export const UI_PACK_SLOT_GEOMETRY_FIELDS = Object.freeze([
  "coordinateSpace",
  "anchor",
  "slotWidth",
  "slotHeight",
  "pitchX",
  "pitchY",
]);
export const UI_PACK_TEMPLATE_DYNAMIC_PRIMITIVE_FIELDS = Object.freeze([
  "dynamicPrimitives",
]);
export const UI_PACK_DYNAMIC_PRIMITIVE_GEOMETRY_FIELDS = Object.freeze([
  "kind",
  "role",
  "x",
  "y",
  "width",
  "height",
  "coordinateSpace",
  "anchor",
  "orientation",
  "source",
  "trackColor",
  "fillColor",
  "borderColor",
]);
export const UI_PACK_RECT_GEOMETRY_FIELDS = Object.freeze([
  "coordinateSpace",
  "anchor",
]);
export const UI_PACK_INTERACTION_CONTRACT_FIELDS = Object.freeze([
  "interactionKind",
  "interactionTargetKind",
  "interactionTargetId",
  "interactionPayloadSchema",
]);
export const UI_PACK_BACKGROUND_CONTRACT_FIELDS = Object.freeze([
  "coordinateSpace",
  "scaleMode",
  "anchor",
  "status",
  "kind",
  "scaling",
  "texture",
  "recipeBackgroundOffset",
  "recipeBackgroundSize",
]);
export const UI_PACK_TEMPLATE_BACKGROUND_FIELD = "nativeBackground";
