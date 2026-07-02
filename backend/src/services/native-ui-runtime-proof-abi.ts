import {
  NATIVE_UI_EXPORT_ABI_VALIDATION_REPORT_PATH,
  NATIVE_UI_EXPORT_ABI_VALIDATION_SCHEMA_VERSION,
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

export type NativeUiProofStatus = 'ok' | 'blocked' | 'missing';
export type NativeUiProofLogicalName = 'nativeUiExportAbi' | 'uiPackAbi';

export type NativeUiProofSpec = Readonly<{
  logicalName: NativeUiProofLogicalName;
  displayName: string;
  defaultPath: string;
  expectedSchemaVersion: string;
  candidateKeys: readonly string[];
}>;

export type NativeUiProofRequiredArtifact = Readonly<{
  logicalName: 'rustUiTemplatesBin' | 'rustUiBindingsBin' | 'rustUiStringsBin';
  envelopeSchema: string;
  payloadMagic: string;
  version: number;
}>;

export const NATIVE_UI_RUNTIME_PROOF_SCHEMA_VERSION = 'neonei/native-ui-runtime-proof/current' as const;

export const NATIVE_UI_EXPORT_ABI_PROOF_SPEC: NativeUiProofSpec = Object.freeze({
  logicalName: 'nativeUiExportAbi',
  displayName: 'Native UI export ABI validation report',
  defaultPath: NATIVE_UI_EXPORT_ABI_VALIDATION_REPORT_PATH,
  expectedSchemaVersion: NATIVE_UI_EXPORT_ABI_VALIDATION_SCHEMA_VERSION,
  candidateKeys: Object.freeze(['rustNativeUiExportAbiValidationReport']),
});

export const UI_PACK_ABI_PROOF_SPEC: NativeUiProofSpec = Object.freeze({
  logicalName: 'uiPackAbi',
  displayName: 'Native UI pack ABI validation report',
  defaultPath: UI_PACK_ABI_VALIDATION_REPORT_PATH,
  expectedSchemaVersion: UI_PACK_ABI_VALIDATION_SCHEMA_VERSION,
  candidateKeys: Object.freeze(['rustUiPackAbiValidationReport']),
});

export const NATIVE_UI_PROOF_SPECS = Object.freeze([
  NATIVE_UI_EXPORT_ABI_PROOF_SPEC,
  UI_PACK_ABI_PROOF_SPEC,
] as const);

export const UI_PACK_REQUIRED_ARTIFACTS = Object.freeze([
  Object.freeze({
    logicalName: 'rustUiTemplatesBin',
    envelopeSchema: UI_TEMPLATE_PACK_SCHEMA,
    payloadMagic: UI_TEMPLATE_PACK_PAYLOAD_MAGIC_REPORT,
    version: UI_TEMPLATE_PAYLOAD_VERSION,
  }),
  Object.freeze({
    logicalName: 'rustUiBindingsBin',
    envelopeSchema: UI_BINDING_PACK_SCHEMA,
    payloadMagic: UI_BINDING_PACK_PAYLOAD_MAGIC_REPORT,
    version: UI_BINDING_PAYLOAD_VERSION,
  }),
  Object.freeze({
    logicalName: 'rustUiStringsBin',
    envelopeSchema: UI_STRING_PACK_SCHEMA,
    payloadMagic: UI_STRING_PACK_PAYLOAD_MAGIC_REPORT,
    version: UI_STRING_PAYLOAD_VERSION,
  }),
] as const satisfies readonly NativeUiProofRequiredArtifact[]);
