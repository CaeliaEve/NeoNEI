export const ELYSIUM_COMPILER_CAPABILITY_ABI_VERSION = 'elysium.compiler.capability.v1';

export const ELYSIUM_COMPILER_COMMANDS = Object.freeze([
  'compile',
  'inspect',
  'validate',
  'schemas',
]);

export const REQUIRED_COMPILER_COMMANDS = Object.freeze([
  'schemas',
  'validate',
  'compile',
]);

export const REQUIRED_COMPILER_COMMAND_INVOCATIONS = Object.freeze({
  schemas: Object.freeze(['schemas', '--help']),
  validate: Object.freeze(['validate', '--help']),
  compile: Object.freeze(['compile', '--help']),
});

export const ELYSIUM_COMPILER_COMPILE_SCOPES = Object.freeze([
  'all',
  'native-ui',
  'search',
  'browser',
  'recipes',
  'ui',
  'textures',
]);

export const NATIVE_UI_REQUIRED_CAPABILITIES = Object.freeze([
  'native_ui.surface',
  'native_ui.design_space_coordinates',
  'native_ui.background_asset',
]);

export const NATIVE_UI_REQUIRED_FILES = Object.freeze([
  'native-ui/families.jsonl.zst',
  'native-ui/surfaces.jsonl.zst',
  'native-ui/slots.bin',
  'validation/native-ui-abi.json',
]);

export const NATIVE_UI_COORDINATE_SPACE = 'nei_pixels';
export const NATIVE_UI_RUNTIME_TRANSFORM = 'uniform-scale-to-fit-only';
export const NATIVE_UI_FALLBACK_POLICY = 'missing required native UI capture is a validation error';

export const ELYSIUM_COMPILER_POLICY = Object.freeze({
  legacyFallback: 'forbidden',
  missingCapability: 'fail-fast',
  hotPathEncoding: 'binary-pack-preferred',
  fullExportValidation: 'milestone-gate-only',
});

export const ELYSIUM_COMPILER_CAPABILITY_ABI = Object.freeze({
  name: 'elysium.compiler.capability',
  version: ELYSIUM_COMPILER_CAPABILITY_ABI_VERSION,
  commands: ELYSIUM_COMPILER_COMMANDS,
  requiredCommands: REQUIRED_COMPILER_COMMANDS,
  compileScopes: ELYSIUM_COMPILER_COMPILE_SCOPES,
  nativeUi: Object.freeze({
    requiredCapabilities: NATIVE_UI_REQUIRED_CAPABILITIES,
    requiredFiles: NATIVE_UI_REQUIRED_FILES,
    coordinateSpace: NATIVE_UI_COORDINATE_SPACE,
    runtimeTransform: NATIVE_UI_RUNTIME_TRANSFORM,
    fallbackPolicy: NATIVE_UI_FALLBACK_POLICY,
  }),
  policy: ELYSIUM_COMPILER_POLICY,
});

function asRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

function requireStringArray(value, path, failures) {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string' || entry.trim() === '')) {
    failures.push(`${path} must be a non-empty string array`);
    return [];
  }
  return value;
}

function requireString(value, path, failures) {
  if (typeof value !== 'string' || value.trim() === '') {
    failures.push(`${path} must be a non-empty string`);
    return '';
  }
  return value;
}

function requireAll(actual, expected, label, failures) {
  const available = new Set(actual);
  const missing = expected.filter((entry) => !available.has(entry));
  if (missing.length > 0) {
    failures.push(`missing required ${label}: ${missing.join(', ')}`);
  }
}

function requireExact(actual, expected, path, failures) {
  if (actual !== expected) {
    failures.push(`${path} must be ${expected}, got ${actual || '<missing>'}`);
  }
}

export function validateElysiumCompilerCapabilityAbi(abi) {
  const failures = [];
  const root = asRecord(abi);
  const capabilityAbi = asRecord(root?.compilerCapabilityAbi);
  const exportAbi = asRecord(root?.exportAbi);
  const nativeUi = asRecord(exportAbi?.nativeUi);
  if (!nativeUi) {
    return ['abi.exportAbi.nativeUi is required'];
  }

  if (capabilityAbi) {
    const capabilityVersion = requireString(
      capabilityAbi.version,
      'abi.compilerCapabilityAbi.version',
      failures,
    );
    const capabilityRequiredCommands = requireStringArray(
      capabilityAbi.requiredCommands,
      'abi.compilerCapabilityAbi.requiredCommands',
      failures,
    );
    requireExact(
      capabilityVersion,
      ELYSIUM_COMPILER_CAPABILITY_ABI_VERSION,
      'abi.compilerCapabilityAbi.version',
      failures,
    );
    requireAll(
      capabilityRequiredCommands,
      REQUIRED_COMPILER_COMMANDS,
      'compiler commands declared by compilerCapabilityAbi',
      failures,
    );
  }

  const requiredCapabilities = requireStringArray(
    nativeUi.requiredCapabilities,
    'abi.exportAbi.nativeUi.requiredCapabilities',
    failures,
  );
  const requiredFiles = requireStringArray(nativeUi.requiredFiles, 'abi.exportAbi.nativeUi.requiredFiles', failures);
  const coordinateSpace = requireString(nativeUi.coordinateSpace, 'abi.exportAbi.nativeUi.coordinateSpace', failures);
  const runtimeTransform = requireString(nativeUi.runtimeTransform, 'abi.exportAbi.nativeUi.runtimeTransform', failures);
  const fallbackPolicy = requireString(nativeUi.fallbackPolicy, 'abi.exportAbi.nativeUi.fallbackPolicy', failures);

  requireAll(requiredCapabilities, NATIVE_UI_REQUIRED_CAPABILITIES, 'native UI capabilities', failures);
  requireAll(requiredFiles, NATIVE_UI_REQUIRED_FILES, 'native UI files', failures);
  requireExact(coordinateSpace, NATIVE_UI_COORDINATE_SPACE, 'abi.exportAbi.nativeUi.coordinateSpace', failures);
  requireExact(runtimeTransform, NATIVE_UI_RUNTIME_TRANSFORM, 'abi.exportAbi.nativeUi.runtimeTransform', failures);
  requireExact(fallbackPolicy, NATIVE_UI_FALLBACK_POLICY, 'abi.exportAbi.nativeUi.fallbackPolicy', failures);
  return failures;
}
