// Native UI runtime pack ABI catalog shared by Node production gates.
//
// This mirrors the compiler/front-end catalog and keeps gate assertions from
// embedding their own stale copy of the v9 pack contract.

export const UI_TEMPLATE_PACK_MAGIC = 'NEIUIT1\0';
export const UI_BINDING_PACK_MAGIC = 'NEIUIB1\0';
export const UI_STRING_PACK_MAGIC = 'NEIUIS1\0';
export const UI_TEMPLATE_PACK_SCHEMA = 'neonei/ui-template-pack/current';
export const UI_BINDING_PACK_SCHEMA = 'neonei/ui-binding-pack/current';
export const UI_STRING_PACK_SCHEMA = 'neonei/ui-string-pack/current';
export const UI_TEMPLATE_PACK_PAYLOAD_MAGIC_REPORT = 'NEIUIT1_NUL';
export const UI_BINDING_PACK_PAYLOAD_MAGIC_REPORT = 'NEIUIB1_NUL';

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

export const UI_TEMPLATE_PAYLOAD_VERSION = 9;
export const UI_BINDING_PAYLOAD_VERSION = 2;
export const UI_STRING_PAYLOAD_VERSION = 1;

export const UI_TEMPLATE_ROW_STRIDE_U32 = 25;
export const UI_SLOT_ROW_STRIDE_U32 = 12;
export const UI_TEXT_ROW_STRIDE_U32 = 7;
export const UI_PRIMITIVE_ROW_STRIDE_U32 = 13;
export const UI_RECT_ROW_STRIDE_U32 = 15;
export const UI_BINDING_ROW_STRIDE_U32 = 14;
export const UI_BINDING_FIELDS = Object.freeze([
  'recipeId',
  'path',
  'payloadKey',
  'familyKey',
  'recipeType',
  'machineType',
  'templateKey',
  'templateSignature',
  'canonicalMachineFamily',
  'layoutKind',
  'presentationSurface',
  'layoutId',
  'rendererId',
  'flags',
]);

export const UI_PACK_SURFACE_CONTRACT_FIELDS = Object.freeze([
  'coordinateSpace',
  'scaleMode',
  'anchor',
]);
export const UI_PACK_SLOT_GEOMETRY_FIELDS = Object.freeze([
  'coordinateSpace',
  'anchor',
  'slotWidth',
  'slotHeight',
  'pitchX',
  'pitchY',
]);
export const UI_PACK_TEMPLATE_DYNAMIC_PRIMITIVE_FIELDS = Object.freeze([
  'dynamicPrimitives',
]);
export const UI_PACK_DYNAMIC_PRIMITIVE_GEOMETRY_FIELDS = Object.freeze([
  'kind',
  'role',
  'x',
  'y',
  'width',
  'height',
  'coordinateSpace',
  'anchor',
  'orientation',
  'source',
  'trackColor',
  'fillColor',
  'borderColor',
]);
export const UI_PACK_RECT_GEOMETRY_FIELDS = Object.freeze([
  'coordinateSpace',
  'anchor',
]);
export const UI_PACK_INTERACTION_CONTRACT_FIELDS = Object.freeze([
  'interactionKind',
  'interactionTargetKind',
  'interactionTargetId',
  'interactionPayloadSchema',
]);
export const UI_PACK_BACKGROUND_CONTRACT_FIELDS = Object.freeze([
  'coordinateSpace',
  'scaleMode',
  'anchor',
  'status',
  'kind',
  'scaling',
  'texture',
  'recipeBackgroundOffset',
  'recipeBackgroundSize',
]);
export const UI_PACK_BACKGROUND_KINDS = Object.freeze([
  'gt-modular-ui',
  'canonical-nei-template',
]);
export const UI_PACK_TEMPLATE_BACKGROUND_FIELD = 'nativeBackground';

export function expectedUiTemplateHeader() {
  return {
    magic: UI_TEMPLATE_PACK_MAGIC,
    version: UI_TEMPLATE_PAYLOAD_VERSION,
    templateStride: UI_TEMPLATE_ROW_STRIDE_U32,
    slotStride: UI_SLOT_ROW_STRIDE_U32,
    textStride: UI_TEXT_ROW_STRIDE_U32,
    primitiveStride: UI_PRIMITIVE_ROW_STRIDE_U32,
    rectStride: UI_RECT_ROW_STRIDE_U32,
  };
}

export function validateUiTemplateHeader(header) {
  const expected = expectedUiTemplateHeader();
  const failures = [];
  for (const [key, value] of Object.entries(expected)) {
    if (header?.[key] !== value) {
      failures.push(`${key}: expected ${JSON.stringify(value)}, got ${JSON.stringify(header?.[key])}`);
    }
  }
  return failures;
}

export function uiPackFormatCatalog() {
  return {
    templatePackMagic: UI_TEMPLATE_PACK_PAYLOAD_MAGIC_REPORT,
    templatePackVersion: UI_TEMPLATE_PAYLOAD_VERSION,
    templateStride: UI_TEMPLATE_ROW_STRIDE_U32,
    slotStride: UI_SLOT_ROW_STRIDE_U32,
    textStride: UI_TEXT_ROW_STRIDE_U32,
    primitiveStride: UI_PRIMITIVE_ROW_STRIDE_U32,
    rectStride: UI_RECT_ROW_STRIDE_U32,
    surfaceContractFields: UI_PACK_SURFACE_CONTRACT_FIELDS,
    legacyRectActionFields: false,
    legacyRectActionFieldNames: [],
    slotGeometryFields: UI_PACK_SLOT_GEOMETRY_FIELDS,
    templateDynamicPrimitiveFields: UI_PACK_TEMPLATE_DYNAMIC_PRIMITIVE_FIELDS,
    dynamicPrimitiveGeometryFields: UI_PACK_DYNAMIC_PRIMITIVE_GEOMETRY_FIELDS,
    rectGeometryFields: UI_PACK_RECT_GEOMETRY_FIELDS,
    interactionContractFields: UI_PACK_INTERACTION_CONTRACT_FIELDS,
    backgroundContractFields: UI_PACK_BACKGROUND_CONTRACT_FIELDS,
    backgroundKinds: UI_PACK_BACKGROUND_KINDS,
    templateBackgroundField: UI_PACK_TEMPLATE_BACKGROUND_FIELD,
    bindingPackMagic: UI_BINDING_PACK_PAYLOAD_MAGIC_REPORT,
    bindingPackVersion: UI_BINDING_PAYLOAD_VERSION,
    bindingStride: UI_BINDING_ROW_STRIDE_U32,
    bindingFields: UI_BINDING_FIELDS,
  };
}

export function validateUiPackFormat(format) {
  const expected = uiPackFormatCatalog();
  const failures = [];
  for (const [key, value] of Object.entries(expected)) {
    const actual = format?.[key];
    if (Array.isArray(value)) {
      const actualItems = Array.isArray(actual) ? actual : [];
      const missing = value.filter((item) => !actualItems.includes(item));
      if (missing.length > 0) {
        failures.push(`${key} missing ${missing.join(', ')}`);
      }
    } else if (actual !== value) {
      failures.push(`${key}: expected ${JSON.stringify(value)}, got ${JSON.stringify(actual)}`);
    }
  }
  return failures;
}

function stringValue(value) {
  return `${value ?? ''}`.trim();
}

function stringArray(value) {
  return Array.isArray(value) ? value.map((entry) => `${entry ?? ''}`.trim()).filter(Boolean) : [];
}

function nonNegativeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

export function validateNativeUiExportAbiReport(report) {
  const failures = [];
  if (!report || typeof report !== 'object' || Array.isArray(report)) {
    return ['native UI export ABI report is missing or unreadable'];
  }
  if (stringValue(report.schemaVersion) !== NATIVE_UI_EXPORT_ABI_VALIDATION_SCHEMA_VERSION) {
    failures.push('native UI export ABI report schema mismatch');
  }
  if (stringValue(report.status) !== NATIVE_UI_EXPORT_STATUS_OK) {
    failures.push('native UI export ABI report status is not ok');
  }
  if (stringValue(report.rawReportSchemaVersion) !== NATIVE_UI_EXPORT_RAW_REPORT_SCHEMA_VERSION) {
    failures.push('native UI export ABI raw report schema mismatch');
  }
  if (stringValue(report.rawReportStatus) !== NATIVE_UI_EXPORT_STATUS_OK) {
    failures.push('native UI export ABI raw report status is not ok');
  }
  if (report.missingReport === true) {
    failures.push('native UI export ABI report declares missing raw report');
  }
  if (stringValue(report.policy?.legacyFallback) !== NATIVE_UI_EXPORT_POLICY_LEGACY_FALLBACK) {
    failures.push('native UI export ABI report must forbid legacy fallback');
  }
  for (const key of NATIVE_UI_EXPORT_VIOLATION_ARRAY_FIELDS) {
    if (stringArray(report[key]).length > 0) {
      failures.push(`native UI export ABI ${key} must be empty`);
    }
  }
  for (const key of NATIVE_UI_EXPORT_REQUIRED_POSITIVE_COUNTERS) {
    if ((nonNegativeNumber(report[key]) ?? 0) <= 0) {
      failures.push(`native UI export ABI ${key} must be greater than zero`);
    }
  }
  for (const key of NATIVE_UI_EXPORT_ZERO_VIOLATION_COUNTERS) {
    if ((nonNegativeNumber(report[key]) ?? 0) !== 0) {
      failures.push(`native UI export ABI ${key} must be zero`);
    }
  }
  return failures;
}
