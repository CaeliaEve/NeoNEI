/**
 * Native render runtime diagnostics ABI catalog.
 *
 * The diagnostics service reports compiler/runtime capture readiness through
 * these explicit tokens instead of owning schema, status, check, or field
 * strings inline. New runtime report contracts must extend this catalog first.
 */

export const NATIVE_RENDER_RUNTIME_DIAGNOSTICS_SCHEMA = 'neonei/native-render-runtime-diagnostics/current';

export const NATIVE_RENDER_RUNTIME_DIAGNOSTIC_STATUS = Object.freeze({
  ok: 'ok',
  degraded: 'degraded',
  missing: 'missing',
  invalid: 'invalid',
} as const);

export type NativeRenderRuntimeDiagnosticStatus =
  typeof NATIVE_RENDER_RUNTIME_DIAGNOSTIC_STATUS[keyof typeof NATIVE_RENDER_RUNTIME_DIAGNOSTIC_STATUS];

export const NATIVE_RENDER_RUNTIME_MANIFEST_KEYS = Object.freeze({
  nativeRenderIndex: 'nativeRenderIndex',
} as const);

export type NativeRenderRuntimeManifestKey =
  typeof NATIVE_RENDER_RUNTIME_MANIFEST_KEYS[keyof typeof NATIVE_RENDER_RUNTIME_MANIFEST_KEYS];

export const NATIVE_RENDER_RUNTIME_ARTIFACT_PROBE_STATUS = Object.freeze({
  present: 'present',
  missing: 'missing',
  invalid: 'invalid',
} as const);

export type NativeRenderRuntimeArtifactProbeStatus =
  typeof NATIVE_RENDER_RUNTIME_ARTIFACT_PROBE_STATUS[keyof typeof NATIVE_RENDER_RUNTIME_ARTIFACT_PROBE_STATUS];

const NATIVE_RENDER_RUNTIME_ARTIFACT_NAMES = Object.freeze([
  'manifest',
  'nativeRenderIndex',
] as const);

export type NativeRenderRuntimeArtifactName = typeof NATIVE_RENDER_RUNTIME_ARTIFACT_NAMES[number];

export const NATIVE_RENDER_RUNTIME_ARTIFACTS = Object.freeze(
  NATIVE_RENDER_RUNTIME_ARTIFACT_NAMES.reduce(
    (artifacts, name) => {
      artifacts[name] = name;
      return artifacts;
    },
    {} as Record<NativeRenderRuntimeArtifactName, NativeRenderRuntimeArtifactName>,
  ),
);

const NATIVE_RENDER_RUNTIME_CHECK_NAMES = Object.freeze([
  'manifestPresent',
  'manifestValidJson',
  'manifestDeclaresNativeRenderIndex',
  'nativeRenderIndexPathPortable',
  'nativeRenderIndexPresent',
  'nativeRenderIndexValidJson',
  'rendererIndexPresent',
  'captureGateReady',
] as const);

export type NativeRenderRuntimeCheckName = typeof NATIVE_RENDER_RUNTIME_CHECK_NAMES[number];

export const NATIVE_RENDER_RUNTIME_CHECKS = Object.freeze(
  NATIVE_RENDER_RUNTIME_CHECK_NAMES.reduce(
    (checks, name) => {
      checks[name] = name;
      return checks;
    },
    {} as Record<NativeRenderRuntimeCheckName, NativeRenderRuntimeCheckName>,
  ),
);

export type NativeRenderRuntimeChecks = Readonly<Record<NativeRenderRuntimeCheckName, boolean>>;

export type NativeRenderRuntimeCheckDescriptor = Readonly<{
  name: NativeRenderRuntimeCheckName;
  requiredForStatus: 'missing' | 'degraded';
  description: string;
}>;

function nativeRenderRuntimeCheckDescriptor(
  name: NativeRenderRuntimeCheckName,
  requiredForStatus: NativeRenderRuntimeCheckDescriptor['requiredForStatus'],
  description: string,
): NativeRenderRuntimeCheckDescriptor {
  return Object.freeze({ name, requiredForStatus, description });
}

function validateAndFreezeNativeRenderRuntimeCheckDescriptors(
  descriptors: readonly NativeRenderRuntimeCheckDescriptor[],
): readonly NativeRenderRuntimeCheckDescriptor[] {
  const expectedNames = new Set<NativeRenderRuntimeCheckName>(NATIVE_RENDER_RUNTIME_CHECK_NAMES);
  const seenNames = new Set<NativeRenderRuntimeCheckName>();

  for (const descriptor of descriptors) {
    if (!descriptor) {
      throw new Error('Native render runtime check descriptor must not be null');
    }
    if (!expectedNames.has(descriptor.name)) {
      throw new Error(`Unknown native render runtime check: ${descriptor.name}`);
    }
    if (!seenNames.add(descriptor.name)) {
      throw new Error(`Duplicate native render runtime check: ${descriptor.name}`);
    }
    if (!descriptor.description.trim()) {
      throw new Error(`Native render runtime check description must be non-empty: ${descriptor.name}`);
    }
  }

  for (const name of NATIVE_RENDER_RUNTIME_CHECK_NAMES) {
    if (!seenNames.has(name)) {
      throw new Error(`Missing native render runtime check: ${name}`);
    }
  }

  return Object.freeze(descriptors.map((descriptor) => Object.freeze({ ...descriptor })));
}

export const NATIVE_RENDER_RUNTIME_CHECK_DESCRIPTORS = validateAndFreezeNativeRenderRuntimeCheckDescriptors([
  nativeRenderRuntimeCheckDescriptor(
    NATIVE_RENDER_RUNTIME_CHECKS.manifestPresent,
    'missing',
    'Current dist-data manifest file exists.',
  ),
  nativeRenderRuntimeCheckDescriptor(
    NATIVE_RENDER_RUNTIME_CHECKS.manifestValidJson,
    'missing',
    'Current dist-data manifest is valid JSON object data.',
  ),
  nativeRenderRuntimeCheckDescriptor(
    NATIVE_RENDER_RUNTIME_CHECKS.manifestDeclaresNativeRenderIndex,
    'missing',
    'Current manifest declares the native render index file.',
  ),
  nativeRenderRuntimeCheckDescriptor(
    NATIVE_RENDER_RUNTIME_CHECKS.nativeRenderIndexPathPortable,
    'missing',
    'Native render index manifest path is runtime-relative and portable.',
  ),
  nativeRenderRuntimeCheckDescriptor(
    NATIVE_RENDER_RUNTIME_CHECKS.nativeRenderIndexPresent,
    'missing',
    'Native render index file exists.',
  ),
  nativeRenderRuntimeCheckDescriptor(
    NATIVE_RENDER_RUNTIME_CHECKS.nativeRenderIndexValidJson,
    'missing',
    'Native render index is valid JSON object data.',
  ),
  nativeRenderRuntimeCheckDescriptor(
    NATIVE_RENDER_RUNTIME_CHECKS.rendererIndexPresent,
    'degraded',
    'Native render index exposes item renderer lookup data.',
  ),
  nativeRenderRuntimeCheckDescriptor(
    NATIVE_RENDER_RUNTIME_CHECKS.captureGateReady,
    'degraded',
    'Native render validation gate is not blocked.',
  ),
] as const);

const NATIVE_RENDER_RUNTIME_COUNT_FIELD_NAMES = Object.freeze([
  'textureSprites',
  'itemRenderers',
  'shaderItems',
  'framebufferCaptures',
  'itemRendererByItemId',
  'shaderByItemId',
  'spriteByIconName',
] as const);

export type NativeRenderRuntimeCountField = typeof NATIVE_RENDER_RUNTIME_COUNT_FIELD_NAMES[number];

export const NATIVE_RENDER_RUNTIME_COUNT_FIELDS = Object.freeze(
  NATIVE_RENDER_RUNTIME_COUNT_FIELD_NAMES.reduce(
    (fields, name) => {
      fields[name] = name;
      return fields;
    },
    {} as Record<NativeRenderRuntimeCountField, NativeRenderRuntimeCountField>,
  ),
);

export type NativeRenderRuntimeCounts = Readonly<Record<NativeRenderRuntimeCountField, number>>;

export type NativeRenderRuntimeCountFieldDescriptor = Readonly<{
  field: NativeRenderRuntimeCountField;
  description: string;
}>;

function nativeRenderRuntimeCountFieldDescriptor(
  field: NativeRenderRuntimeCountField,
  description: string,
): NativeRenderRuntimeCountFieldDescriptor {
  return Object.freeze({ field, description });
}

function validateAndFreezeNativeRenderRuntimeCountFieldDescriptors(
  descriptors: readonly NativeRenderRuntimeCountFieldDescriptor[],
): readonly NativeRenderRuntimeCountFieldDescriptor[] {
  const expectedFields = new Set<NativeRenderRuntimeCountField>(NATIVE_RENDER_RUNTIME_COUNT_FIELD_NAMES);
  const seenFields = new Set<NativeRenderRuntimeCountField>();

  for (const descriptor of descriptors) {
    if (!descriptor) {
      throw new Error('Native render runtime count field descriptor must not be null');
    }
    if (!expectedFields.has(descriptor.field)) {
      throw new Error(`Unknown native render runtime count field: ${descriptor.field}`);
    }
    if (!seenFields.add(descriptor.field)) {
      throw new Error(`Duplicate native render runtime count field: ${descriptor.field}`);
    }
    if (!descriptor.description.trim()) {
      throw new Error(`Native render runtime count field description must be non-empty: ${descriptor.field}`);
    }
  }

  for (const field of NATIVE_RENDER_RUNTIME_COUNT_FIELD_NAMES) {
    if (!seenFields.has(field)) {
      throw new Error(`Missing native render runtime count field: ${field}`);
    }
  }

  return Object.freeze(descriptors.map((descriptor) => Object.freeze({ ...descriptor })));
}

export const NATIVE_RENDER_RUNTIME_COUNT_FIELD_DESCRIPTORS =
  validateAndFreezeNativeRenderRuntimeCountFieldDescriptors([
    nativeRenderRuntimeCountFieldDescriptor(
      NATIVE_RENDER_RUNTIME_COUNT_FIELDS.textureSprites,
      'Texture sprite count emitted by native render analysis.',
    ),
    nativeRenderRuntimeCountFieldDescriptor(
      NATIVE_RENDER_RUNTIME_COUNT_FIELDS.itemRenderers,
      'Known item renderer family count.',
    ),
    nativeRenderRuntimeCountFieldDescriptor(
      NATIVE_RENDER_RUNTIME_COUNT_FIELDS.shaderItems,
      'Items requiring shader-aware rendering.',
    ),
    nativeRenderRuntimeCountFieldDescriptor(
      NATIVE_RENDER_RUNTIME_COUNT_FIELDS.framebufferCaptures,
      'Framebuffer capture count.',
    ),
    nativeRenderRuntimeCountFieldDescriptor(
      NATIVE_RENDER_RUNTIME_COUNT_FIELDS.itemRendererByItemId,
      'Item-id to renderer index entry count.',
    ),
    nativeRenderRuntimeCountFieldDescriptor(
      NATIVE_RENDER_RUNTIME_COUNT_FIELDS.shaderByItemId,
      'Item-id to shader index entry count.',
    ),
    nativeRenderRuntimeCountFieldDescriptor(
      NATIVE_RENDER_RUNTIME_COUNT_FIELDS.spriteByIconName,
      'Icon-name to sprite index entry count.',
    ),
  ] as const);

const NATIVE_RENDER_RUNTIME_VALIDATION_FIELD_NAMES = Object.freeze([
  'status',
  'shaderItemsNeedingCapture',
  'framebufferCaptures',
  'summary',
] as const);

export type NativeRenderRuntimeValidationField =
  typeof NATIVE_RENDER_RUNTIME_VALIDATION_FIELD_NAMES[number];

export const NATIVE_RENDER_RUNTIME_VALIDATION_FIELDS = Object.freeze(
  NATIVE_RENDER_RUNTIME_VALIDATION_FIELD_NAMES.reduce(
    (fields, name) => {
      fields[name] = name;
      return fields;
    },
    {} as Record<NativeRenderRuntimeValidationField, NativeRenderRuntimeValidationField>,
  ),
);

export type NativeRenderRuntimeValidation = Readonly<{
  [NATIVE_RENDER_RUNTIME_VALIDATION_FIELDS.status]: string | null;
  [NATIVE_RENDER_RUNTIME_VALIDATION_FIELDS.shaderItemsNeedingCapture]: number;
  [NATIVE_RENDER_RUNTIME_VALIDATION_FIELDS.framebufferCaptures]: number;
  [NATIVE_RENDER_RUNTIME_VALIDATION_FIELDS.summary]: string | null;
}>;

export type NativeRenderRuntimeValidationFieldDescriptor = Readonly<{
  field: NativeRenderRuntimeValidationField;
  valueKind: 'status' | 'count' | 'summary';
  description: string;
}>;

function nativeRenderRuntimeValidationFieldDescriptor(
  field: NativeRenderRuntimeValidationField,
  valueKind: NativeRenderRuntimeValidationFieldDescriptor['valueKind'],
  description: string,
): NativeRenderRuntimeValidationFieldDescriptor {
  return Object.freeze({ field, valueKind, description });
}

function validateAndFreezeNativeRenderRuntimeValidationFieldDescriptors(
  descriptors: readonly NativeRenderRuntimeValidationFieldDescriptor[],
): readonly NativeRenderRuntimeValidationFieldDescriptor[] {
  const expectedFields = new Set<NativeRenderRuntimeValidationField>(NATIVE_RENDER_RUNTIME_VALIDATION_FIELD_NAMES);
  const seenFields = new Set<NativeRenderRuntimeValidationField>();

  for (const descriptor of descriptors) {
    if (!descriptor) {
      throw new Error('Native render runtime validation field descriptor must not be null');
    }
    if (!expectedFields.has(descriptor.field)) {
      throw new Error(`Unknown native render runtime validation field: ${descriptor.field}`);
    }
    if (!seenFields.add(descriptor.field)) {
      throw new Error(`Duplicate native render runtime validation field: ${descriptor.field}`);
    }
    if (!descriptor.description.trim()) {
      throw new Error(`Native render runtime validation field description must be non-empty: ${descriptor.field}`);
    }
  }

  for (const field of NATIVE_RENDER_RUNTIME_VALIDATION_FIELD_NAMES) {
    if (!seenFields.has(field)) {
      throw new Error(`Missing native render runtime validation field: ${field}`);
    }
  }

  return Object.freeze(descriptors.map((descriptor) => Object.freeze({ ...descriptor })));
}

export const NATIVE_RENDER_RUNTIME_VALIDATION_FIELD_DESCRIPTORS =
  validateAndFreezeNativeRenderRuntimeValidationFieldDescriptors([
    nativeRenderRuntimeValidationFieldDescriptor(
      NATIVE_RENDER_RUNTIME_VALIDATION_FIELDS.status,
      'status',
      'Native render validation gate status.',
    ),
    nativeRenderRuntimeValidationFieldDescriptor(
      NATIVE_RENDER_RUNTIME_VALIDATION_FIELDS.shaderItemsNeedingCapture,
      'count',
      'Shader items still requiring framebuffer capture.',
    ),
    nativeRenderRuntimeValidationFieldDescriptor(
      NATIVE_RENDER_RUNTIME_VALIDATION_FIELDS.framebufferCaptures,
      'count',
      'Framebuffer captures recorded by validation.',
    ),
    nativeRenderRuntimeValidationFieldDescriptor(
      NATIVE_RENDER_RUNTIME_VALIDATION_FIELDS.summary,
      'summary',
      'Human-readable native render validation summary.',
    ),
  ] as const);

export const NATIVE_RENDER_RUNTIME_BLOCKED_STATUS = 'blocked';
