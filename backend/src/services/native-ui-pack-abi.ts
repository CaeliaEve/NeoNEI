/**
 * Backend Native UI pack ABI catalog.
 *
 * Runtime proof checks must validate the same versioned pack contract as the
 * frontend parser and compiler gates. Keep these constants centralized instead
 * of embedding historical ABI versions in proof services.
 */

export const UI_PACK_ABI_VALIDATION_REPORT_PATH = 'rust/ui-pack-abi-validation-report.json';
export const UI_PACK_ABI_VALIDATION_SCHEMA_VERSION = 'elysium-compiler/ui-pack-abi-validation/v1';
export const NATIVE_UI_EXPORT_ABI_VALIDATION_REPORT_PATH = 'rust/native-ui-export-abi-validation-report.json';
export const NATIVE_UI_EXPORT_ABI_VALIDATION_SCHEMA_VERSION = 'elysium-compiler/native-ui-export-abi-validation/v1';
export const NATIVE_UI_EXPORT_RAW_REPORT_SCHEMA_VERSION = 'nesqlpp/raw-export/alpha1/native-ui-validation';
export const NATIVE_UI_EXPORT_STATUS_OK = 'ok';
export const NATIVE_UI_EXPORT_POLICY_LEGACY_FALLBACK = 'forbidden';
export const NATIVE_UI_EXPORT_REQUIRED_POSITIVE_COUNTERS = Object.freeze([
  'layoutCount',
  'slotCount',
]);
export const NATIVE_UI_EXPORT_ZERO_VIOLATION_COUNTERS = Object.freeze([
  'missingSurfaceCount',
  'slotBoundsViolationCount',
  'rectBoundsViolationCount',
  'primitiveBoundsViolationCount',
  'backgroundBoundsViolationCount',
  'coordinateContractViolationCount',
  'interactionContractViolationCount',
]);
export const NATIVE_UI_EXPORT_VIOLATION_ARRAY_FIELDS = Object.freeze([
  'schemaViolations',
  'pathViolations',
  'contractViolations',
]);
const NATIVE_UI_EXPORT_VIOLATION_ARRAY_MESSAGES = Object.freeze({
  schemaViolations: 'native UI export ABI schema violations are present',
  pathViolations: 'native UI export ABI path violations are present',
  contractViolations: 'native UI export ABI contract violations are present',
} as Record<string, string>);

export const UI_TEMPLATE_PACK_SCHEMA = 'neonei/ui-template-pack/current';
export const UI_BINDING_PACK_SCHEMA = 'neonei/ui-binding-pack/current';
export const UI_STRING_PACK_SCHEMA = 'neonei/ui-string-pack/current';

export const UI_TEMPLATE_PACK_PAYLOAD_MAGIC_REPORT = 'NEIUIT1_NUL';
export const UI_BINDING_PACK_PAYLOAD_MAGIC_REPORT = 'NEIUIB1_NUL';
export const UI_STRING_PACK_PAYLOAD_MAGIC_REPORT = 'NEIUIS1_NUL';

export const UI_TEMPLATE_PAYLOAD_VERSION = 9;
export const UI_BINDING_PAYLOAD_VERSION = 1;
export const UI_STRING_PAYLOAD_VERSION = 1;

type NativeUiExportAbiRecord = Record<string, unknown>;

function asRecord(value: unknown): NativeUiExportAbiRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as NativeUiExportAbiRecord : null;
}

function asString(value: unknown): string | null {
  const text = `${value ?? ''}`.trim();
  return text || null;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((entry) => `${entry ?? ''}`.trim()).filter(Boolean) : [];
}

function asNumber(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

export function countNativeUiExportAbiReportViolations(report: NativeUiExportAbiRecord | null): number {
  if (!report) return 0;
  return NATIVE_UI_EXPORT_VIOLATION_ARRAY_FIELDS
    .reduce((total, key) => total + asStringArray(report[key]).length, 0)
    + NATIVE_UI_EXPORT_ZERO_VIOLATION_COUNTERS
      .reduce((total, key) => total + (asNumber(report[key]) ?? 0), 0);
}

export function validateNativeUiExportAbiReport(report: NativeUiExportAbiRecord | null): string[] {
  const blocked: string[] = [];
  if (!report) return ['native UI export ABI report is missing or unreadable'];

  if (asString(report.schemaVersion) !== NATIVE_UI_EXPORT_ABI_VALIDATION_SCHEMA_VERSION) {
    blocked.push('native UI export ABI report schema mismatch');
  }
  if (asString(report.status) !== NATIVE_UI_EXPORT_STATUS_OK) {
    blocked.push('native UI export ABI report status is not ok');
  }
  if (asString(report.rawReportSchemaVersion) !== NATIVE_UI_EXPORT_RAW_REPORT_SCHEMA_VERSION) {
    blocked.push('native UI export ABI raw report schema mismatch');
  }
  if (asString(report.rawReportStatus) !== NATIVE_UI_EXPORT_STATUS_OK) {
    blocked.push('native UI export ABI raw report status is not ok');
  }
  if (report.missingReport === true) {
    blocked.push('native UI export ABI report declares missing raw report');
  }
  if (asString(asRecord(report.policy)?.legacyFallback) !== NATIVE_UI_EXPORT_POLICY_LEGACY_FALLBACK) {
    blocked.push('native UI export ABI report must forbid legacy fallback');
  }
  for (const key of NATIVE_UI_EXPORT_VIOLATION_ARRAY_FIELDS) {
    if (asStringArray(report[key]).length > 0) {
      blocked.push(NATIVE_UI_EXPORT_VIOLATION_ARRAY_MESSAGES[key]);
    }
  }
  for (const key of NATIVE_UI_EXPORT_REQUIRED_POSITIVE_COUNTERS) {
    if ((asNumber(report[key]) ?? 0) <= 0) {
      blocked.push(`native UI export ABI ${key} must be greater than zero`);
    }
  }
  for (const key of NATIVE_UI_EXPORT_ZERO_VIOLATION_COUNTERS) {
    if ((asNumber(report[key]) ?? 0) !== 0) {
      blocked.push(`native UI export ABI ${key} must be zero`);
    }
  }
  return blocked;
}
