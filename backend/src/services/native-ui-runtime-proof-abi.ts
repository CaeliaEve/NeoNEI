import {
  NATIVE_UI_EXPORT_ABI_VALIDATION_REPORT_PATH,
  NATIVE_UI_EXPORT_ABI_VALIDATION_SCHEMA_VERSION,
  NATIVE_UI_EXPORT_POLICY_LEGACY_FALLBACK,
  UI_BINDING_PACK_PAYLOAD_MAGIC_REPORT,
  UI_BINDING_PACK_SCHEMA,
  UI_BINDING_PAYLOAD_VERSION,
  UI_PACK_ABI_VALIDATION_REPORT_PATH,
  UI_PACK_ABI_VALIDATION_SCHEMA_VERSION,
  UI_STRING_PACK_PAYLOAD_MAGIC_REPORT,
  UI_STRING_PACK_SCHEMA,
  UI_STRING_PAYLOAD_VERSION,
  UI_TEMPLATE_PACK_PAYLOAD_MAGIC_REPORT,
  UI_TEMPLATE_PACK_SCHEMA,
  UI_TEMPLATE_PAYLOAD_VERSION,
} from './native-ui-pack-abi';

export const NATIVE_UI_PROOF_STATUS = Object.freeze({
  ok: 'ok',
  blocked: 'blocked',
  missing: 'missing',
} as const);

export type NativeUiProofStatus = typeof NATIVE_UI_PROOF_STATUS[keyof typeof NATIVE_UI_PROOF_STATUS];

export const NATIVE_UI_PROOF_LOGICAL_NAMES = Object.freeze({
  nativeUiExportAbi: 'nativeUiExportAbi',
  uiPackAbi: 'uiPackAbi',
} as const);

export type NativeUiProofLogicalName =
  typeof NATIVE_UI_PROOF_LOGICAL_NAMES[keyof typeof NATIVE_UI_PROOF_LOGICAL_NAMES];

export const NATIVE_UI_PROOF_MANIFEST_KEYS = Object.freeze({
  nativeUiExportAbiReport: 'rustNativeUiExportAbiValidationReport',
  uiPackAbiReport: 'rustUiPackAbiValidationReport',
  uiTemplatesBin: 'rustUiTemplatesBin',
  uiBindingsBin: 'rustUiBindingsBin',
  uiStringsBin: 'rustUiStringsBin',
} as const);

export type NativeUiProofSpec = Readonly<{
  logicalName: NativeUiProofLogicalName;
  displayName: string;
  defaultPath: string;
  expectedSchemaVersion: string;
  candidateKeys: readonly string[];
}>;

export type NativeUiProofRequiredArtifact = Readonly<{
  logicalName:
    | typeof NATIVE_UI_PROOF_MANIFEST_KEYS.uiTemplatesBin
    | typeof NATIVE_UI_PROOF_MANIFEST_KEYS.uiBindingsBin
    | typeof NATIVE_UI_PROOF_MANIFEST_KEYS.uiStringsBin;
  envelopeSchema: string;
  payloadMagic: string;
  version: number;
}>;

export const NATIVE_UI_RUNTIME_PROOF_SCHEMA_VERSION = 'neonei/native-ui-runtime-proof/current' as const;

export const NATIVE_UI_RUNTIME_PROOF_POLICY = Object.freeze({
  legacyFallback: NATIVE_UI_EXPORT_POLICY_LEGACY_FALLBACK,
  missingProof: 'fail-closed',
  invalidProof: 'fail-closed',
  reportPlane: 'debugfs',
} as const);

export const NATIVE_UI_RUNTIME_PROOF_REPORTS = Object.freeze({
  nativeUiExportAbi: Object.freeze({
    slug: 'native-ui-export-abi-validation-report',
    path: NATIVE_UI_EXPORT_ABI_VALIDATION_REPORT_PATH,
  }),
  uiPackAbi: Object.freeze({
    slug: 'ui-pack-abi-validation-report',
    path: UI_PACK_ABI_VALIDATION_REPORT_PATH,
  }),
} as const);

export const NATIVE_UI_PROOF_REPORT_FIELDS = Object.freeze({
  schemaVersion: 'schemaVersion',
  status: 'status',
  policy: 'policy',
  legacyFallback: 'legacyFallback',
  missingRequiredArtifacts: 'missingRequiredArtifacts',
  sectionViolations: 'sectionViolations',
  artifacts: 'artifacts',
  logicalName: 'logicalName',
  artifactStatus: 'status',
  artifactPresentStatus: 'present',
  envelopeSchema: 'envelopeSchema',
  payloadMagic: 'payloadMagic',
  version: 'version',
  bytes: 'bytes',
  layoutCount: 'layoutCount',
  slotCount: 'slotCount',
  rectCount: 'rectCount',
  primitiveCount: 'primitiveCount',
  missingSurfaceCount: 'missingSurfaceCount',
  slotBoundsViolationCount: 'slotBoundsViolationCount',
  rectBoundsViolationCount: 'rectBoundsViolationCount',
  primitiveBoundsViolationCount: 'primitiveBoundsViolationCount',
  backgroundBoundsViolationCount: 'backgroundBoundsViolationCount',
  coordinateContractViolationCount: 'coordinateContractViolationCount',
  interactionContractViolationCount: 'interactionContractViolationCount',
} as const);

export const NATIVE_UI_EXPORT_ABI_PROOF_SPEC: NativeUiProofSpec = Object.freeze({
  logicalName: NATIVE_UI_PROOF_LOGICAL_NAMES.nativeUiExportAbi,
  displayName: 'Native UI export ABI validation report',
  defaultPath: NATIVE_UI_EXPORT_ABI_VALIDATION_REPORT_PATH,
  expectedSchemaVersion: NATIVE_UI_EXPORT_ABI_VALIDATION_SCHEMA_VERSION,
  candidateKeys: Object.freeze([NATIVE_UI_PROOF_MANIFEST_KEYS.nativeUiExportAbiReport]),
});

export const UI_PACK_ABI_PROOF_SPEC: NativeUiProofSpec = Object.freeze({
  logicalName: NATIVE_UI_PROOF_LOGICAL_NAMES.uiPackAbi,
  displayName: 'Native UI pack ABI validation report',
  defaultPath: UI_PACK_ABI_VALIDATION_REPORT_PATH,
  expectedSchemaVersion: UI_PACK_ABI_VALIDATION_SCHEMA_VERSION,
  candidateKeys: Object.freeze([NATIVE_UI_PROOF_MANIFEST_KEYS.uiPackAbiReport]),
});

export const NATIVE_UI_PROOF_SPECS = Object.freeze([
  NATIVE_UI_EXPORT_ABI_PROOF_SPEC,
  UI_PACK_ABI_PROOF_SPEC,
] as const);

export const UI_PACK_REQUIRED_ARTIFACTS = Object.freeze([
  Object.freeze({
    logicalName: NATIVE_UI_PROOF_MANIFEST_KEYS.uiTemplatesBin,
    envelopeSchema: UI_TEMPLATE_PACK_SCHEMA,
    payloadMagic: UI_TEMPLATE_PACK_PAYLOAD_MAGIC_REPORT,
    version: UI_TEMPLATE_PAYLOAD_VERSION,
  }),
  Object.freeze({
    logicalName: NATIVE_UI_PROOF_MANIFEST_KEYS.uiBindingsBin,
    envelopeSchema: UI_BINDING_PACK_SCHEMA,
    payloadMagic: UI_BINDING_PACK_PAYLOAD_MAGIC_REPORT,
    version: UI_BINDING_PAYLOAD_VERSION,
  }),
  Object.freeze({
    logicalName: NATIVE_UI_PROOF_MANIFEST_KEYS.uiStringsBin,
    envelopeSchema: UI_STRING_PACK_SCHEMA,
    payloadMagic: UI_STRING_PACK_PAYLOAD_MAGIC_REPORT,
    version: UI_STRING_PAYLOAD_VERSION,
  }),
] as const satisfies readonly NativeUiProofRequiredArtifact[]);
