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

const NATIVE_UI_PROOF_LOGICAL_NAME_VALUES = Object.freeze(
  Object.values(NATIVE_UI_PROOF_LOGICAL_NAMES),
);

export const NATIVE_UI_PROOF_MANIFEST_KEYS = Object.freeze({
  nativeUiExportAbiReport: 'rustNativeUiExportAbiValidationReport',
  uiPackAbiReport: 'rustUiPackAbiValidationReport',
  uiTemplatesBin: 'rustUiTemplatesBin',
  uiBindingsBin: 'rustUiBindingsBin',
  uiStringsBin: 'rustUiStringsBin',
} as const);

const NATIVE_UI_PROOF_MANIFEST_KEY_VALUES = Object.freeze(
  Object.values(NATIVE_UI_PROOF_MANIFEST_KEYS),
);

export type NativeUiProofSpec = Readonly<{
  logicalName: NativeUiProofLogicalName;
  displayName: string;
  defaultPath: string;
  expectedSchemaVersion: string;
  candidateKeys: readonly string[];
}>;

export type NativeUiRuntimeProofReport = Readonly<{
  slug: string;
  path: string;
}>;

export type NativeUiRuntimeProofReportDescriptor = NativeUiRuntimeProofReport & Readonly<{
  logicalName: NativeUiProofLogicalName;
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

function isPortableRuntimeProofPath(value: string): boolean {
  const normalized = `${value ?? ''}`.trim().replace(/\\/g, '/');
  return Boolean(normalized)
    && !normalized.includes('..')
    && !normalized.startsWith('/')
    && !/^[A-Za-z]:\//.test(normalized);
}

function nativeUiProofReportDescriptor(
  logicalName: NativeUiProofLogicalName,
  slug: string,
  path: string,
): NativeUiRuntimeProofReportDescriptor {
  return Object.freeze({ logicalName, slug, path });
}

function validateAndFreezeNativeUiProofReports(
  descriptors: readonly NativeUiRuntimeProofReportDescriptor[],
): readonly NativeUiRuntimeProofReportDescriptor[] {
  const expectedLogicalNames = new Set<NativeUiProofLogicalName>(NATIVE_UI_PROOF_LOGICAL_NAME_VALUES);
  const seenLogicalNames = new Set<NativeUiProofLogicalName>();
  const seenSlugs = new Set<string>();
  const seenPaths = new Set<string>();

  for (const descriptor of descriptors) {
    if (!descriptor) {
      throw new Error('Native UI proof report descriptor must not be null');
    }
    if (!expectedLogicalNames.has(descriptor.logicalName)) {
      throw new Error(`Unknown Native UI proof report logical name: ${descriptor.logicalName}`);
    }
    if (!seenLogicalNames.add(descriptor.logicalName)) {
      throw new Error(`Duplicate Native UI proof report logical name: ${descriptor.logicalName}`);
    }
    if (!descriptor.slug.trim()) {
      throw new Error(`Native UI proof report slug must be non-empty: ${descriptor.logicalName}`);
    }
    if (!seenSlugs.add(descriptor.slug)) {
      throw new Error(`Duplicate Native UI proof report slug: ${descriptor.slug}`);
    }
    if (!isPortableRuntimeProofPath(descriptor.path)) {
      throw new Error(`Native UI proof report path must be runtime-relative: ${descriptor.logicalName}`);
    }
    if (!seenPaths.add(descriptor.path)) {
      throw new Error(`Duplicate Native UI proof report path: ${descriptor.path}`);
    }
  }

  for (const logicalName of NATIVE_UI_PROOF_LOGICAL_NAME_VALUES) {
    if (!seenLogicalNames.has(logicalName)) {
      throw new Error(`Missing Native UI proof report descriptor: ${logicalName}`);
    }
  }

  return Object.freeze(descriptors.map((descriptor) => Object.freeze({ ...descriptor })));
}

export const NATIVE_UI_RUNTIME_PROOF_REPORT_DESCRIPTORS = validateAndFreezeNativeUiProofReports([
  nativeUiProofReportDescriptor(
    NATIVE_UI_PROOF_LOGICAL_NAMES.nativeUiExportAbi,
    'native-ui-export-abi-validation-report',
    NATIVE_UI_EXPORT_ABI_VALIDATION_REPORT_PATH,
  ),
  nativeUiProofReportDescriptor(
    NATIVE_UI_PROOF_LOGICAL_NAMES.uiPackAbi,
    'ui-pack-abi-validation-report',
    UI_PACK_ABI_VALIDATION_REPORT_PATH,
  ),
] as const);

export const NATIVE_UI_RUNTIME_PROOF_REPORTS = Object.freeze(
  NATIVE_UI_RUNTIME_PROOF_REPORT_DESCRIPTORS.reduce(
    (reports, descriptor) => {
      reports[descriptor.logicalName] = Object.freeze({
        slug: descriptor.slug,
        path: descriptor.path,
      });
      return reports;
    },
    {} as Record<NativeUiProofLogicalName, NativeUiRuntimeProofReport>,
  ),
);

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

function nativeUiProofSpec(
  logicalName: NativeUiProofLogicalName,
  displayName: string,
  defaultPath: string,
  expectedSchemaVersion: string,
  candidateKeys: readonly string[],
): NativeUiProofSpec {
  return Object.freeze({
    logicalName,
    displayName,
    defaultPath,
    expectedSchemaVersion,
    candidateKeys: Object.freeze([...candidateKeys]),
  });
}

function validateAndFreezeNativeUiProofSpecs(
  specs: readonly NativeUiProofSpec[],
): readonly NativeUiProofSpec[] {
  const expectedLogicalNames = new Set<NativeUiProofLogicalName>(NATIVE_UI_PROOF_LOGICAL_NAME_VALUES);
  const allowedManifestKeys = new Set<string>(NATIVE_UI_PROOF_MANIFEST_KEY_VALUES);
  const seenLogicalNames = new Set<NativeUiProofLogicalName>();

  for (const spec of specs) {
    if (!spec) {
      throw new Error('Native UI proof spec must not be null');
    }
    if (!expectedLogicalNames.has(spec.logicalName)) {
      throw new Error(`Unknown Native UI proof spec logical name: ${spec.logicalName}`);
    }
    if (!seenLogicalNames.add(spec.logicalName)) {
      throw new Error(`Duplicate Native UI proof spec logical name: ${spec.logicalName}`);
    }
    if (!spec.displayName.trim()) {
      throw new Error(`Native UI proof spec display name must be non-empty: ${spec.logicalName}`);
    }
    if (!isPortableRuntimeProofPath(spec.defaultPath)) {
      throw new Error(`Native UI proof spec path must be runtime-relative: ${spec.logicalName}`);
    }
    if (!spec.expectedSchemaVersion.trim()) {
      throw new Error(`Native UI proof spec schema version must be non-empty: ${spec.logicalName}`);
    }
    if (spec.candidateKeys.length === 0) {
      throw new Error(`Native UI proof spec candidate keys must be non-empty: ${spec.logicalName}`);
    }
    for (const candidateKey of spec.candidateKeys) {
      if (!allowedManifestKeys.has(candidateKey)) {
        throw new Error(`Unknown Native UI proof spec candidate key: ${candidateKey}`);
      }
    }
  }

  for (const logicalName of NATIVE_UI_PROOF_LOGICAL_NAME_VALUES) {
    if (!seenLogicalNames.has(logicalName)) {
      throw new Error(`Missing Native UI proof spec: ${logicalName}`);
    }
  }

  return Object.freeze(specs.map((spec) => Object.freeze({
    ...spec,
    candidateKeys: Object.freeze([...spec.candidateKeys]),
  })));
}

export const NATIVE_UI_EXPORT_ABI_PROOF_SPEC: NativeUiProofSpec = nativeUiProofSpec(
  NATIVE_UI_PROOF_LOGICAL_NAMES.nativeUiExportAbi,
  'Native UI export ABI validation report',
  NATIVE_UI_EXPORT_ABI_VALIDATION_REPORT_PATH,
  NATIVE_UI_EXPORT_ABI_VALIDATION_SCHEMA_VERSION,
  [NATIVE_UI_PROOF_MANIFEST_KEYS.nativeUiExportAbiReport],
);

export const UI_PACK_ABI_PROOF_SPEC: NativeUiProofSpec = nativeUiProofSpec(
  NATIVE_UI_PROOF_LOGICAL_NAMES.uiPackAbi,
  'Native UI pack ABI validation report',
  UI_PACK_ABI_VALIDATION_REPORT_PATH,
  UI_PACK_ABI_VALIDATION_SCHEMA_VERSION,
  [NATIVE_UI_PROOF_MANIFEST_KEYS.uiPackAbiReport],
);

export const NATIVE_UI_PROOF_SPECS = validateAndFreezeNativeUiProofSpecs([
  NATIVE_UI_EXPORT_ABI_PROOF_SPEC,
  UI_PACK_ABI_PROOF_SPEC,
] as const);

function validateAndFreezeUiPackRequiredArtifacts(
  artifacts: readonly NativeUiProofRequiredArtifact[],
): readonly NativeUiProofRequiredArtifact[] {
  const expectedLogicalNames = new Set<string>([
    NATIVE_UI_PROOF_MANIFEST_KEYS.uiTemplatesBin,
    NATIVE_UI_PROOF_MANIFEST_KEYS.uiBindingsBin,
    NATIVE_UI_PROOF_MANIFEST_KEYS.uiStringsBin,
  ]);
  const seenLogicalNames = new Set<string>();

  for (const artifact of artifacts) {
    if (!artifact) {
      throw new Error('Native UI pack required artifact descriptor must not be null');
    }
    if (!expectedLogicalNames.has(artifact.logicalName)) {
      throw new Error(`Unknown Native UI pack required artifact: ${artifact.logicalName}`);
    }
    if (!seenLogicalNames.add(artifact.logicalName)) {
      throw new Error(`Duplicate Native UI pack required artifact: ${artifact.logicalName}`);
    }
    if (!artifact.envelopeSchema.trim()) {
      throw new Error(`Native UI pack envelope schema must be non-empty: ${artifact.logicalName}`);
    }
    if (!artifact.payloadMagic.trim()) {
      throw new Error(`Native UI pack payload magic must be non-empty: ${artifact.logicalName}`);
    }
    if (!Number.isInteger(artifact.version) || artifact.version <= 0) {
      throw new Error(`Native UI pack payload version must be positive: ${artifact.logicalName}`);
    }
  }

  for (const logicalName of expectedLogicalNames) {
    if (!seenLogicalNames.has(logicalName)) {
      throw new Error(`Missing Native UI pack required artifact: ${logicalName}`);
    }
  }

  return Object.freeze(artifacts.map((artifact) => Object.freeze({ ...artifact })));
}

export const UI_PACK_REQUIRED_ARTIFACTS = validateAndFreezeUiPackRequiredArtifacts([
  {
    logicalName: NATIVE_UI_PROOF_MANIFEST_KEYS.uiTemplatesBin,
    envelopeSchema: UI_TEMPLATE_PACK_SCHEMA,
    payloadMagic: UI_TEMPLATE_PACK_PAYLOAD_MAGIC_REPORT,
    version: UI_TEMPLATE_PAYLOAD_VERSION,
  },
  {
    logicalName: NATIVE_UI_PROOF_MANIFEST_KEYS.uiBindingsBin,
    envelopeSchema: UI_BINDING_PACK_SCHEMA,
    payloadMagic: UI_BINDING_PACK_PAYLOAD_MAGIC_REPORT,
    version: UI_BINDING_PAYLOAD_VERSION,
  },
  {
    logicalName: NATIVE_UI_PROOF_MANIFEST_KEYS.uiStringsBin,
    envelopeSchema: UI_STRING_PACK_SCHEMA,
    payloadMagic: UI_STRING_PACK_PAYLOAD_MAGIC_REPORT,
    version: UI_STRING_PAYLOAD_VERSION,
  },
] as const satisfies readonly NativeUiProofRequiredArtifact[]);
