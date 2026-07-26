import { readFileSync } from 'node:fs';

const artifact = deepFreeze(
  JSON.parse(
    readFileSync(
      new URL('../tools/elysium-compiler/elysium-compiler-capability-abi.json', import.meta.url),
      'utf8',
    ).replace(/^\uFEFF/, ''),
  ),
);

function deepFreeze(value) {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

export const ELYSIUM_COMPILER_CAPABILITY_ABI_VERSION = artifact.version;
export const ELYSIUM_COMPILER_CAPABILITY_SOURCE = artifact.source;
export const ELYSIUM_COMPILER_COMMANDS = artifact.commands;
export const REQUIRED_COMPILER_COMMANDS = artifact.requiredCommands;
export const REQUIRED_COMPILER_COMMAND_INVOCATIONS = deepFreeze(
  Object.fromEntries(REQUIRED_COMPILER_COMMANDS.map((command) => [command, [command, '--help']])),
);
export const ELYSIUM_COMPILER_COMPILE_SCOPES = artifact.compileScopes;
export const NATIVE_UI_REQUIRED_CAPABILITIES = artifact.nativeUi.requiredCapabilities;
export const NATIVE_UI_REQUIRED_FILES = artifact.nativeUi.requiredFiles;
export const NATIVE_UI_COORDINATE_SPACE = artifact.nativeUi.coordinateSpace;
export const NATIVE_UI_RUNTIME_TRANSFORM = artifact.nativeUi.runtimeTransform;
export const NATIVE_UI_FALLBACK_POLICY = artifact.nativeUi.fallbackPolicy;
export const ELYSIUM_COMPILER_POLICY = artifact.policy;

export const ELYSIUM_COMPILER_CAPABILITY_ABI = Object.freeze({
  name: artifact.name,
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
  if (
    !Array.isArray(value)
    || value.length === 0
    || value.some((entry) => typeof entry !== 'string' || entry.trim() === '')
  ) {
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

function requireExactArray(actual, expected, path, failures) {
  if (actual.length !== expected.length || actual.some((entry, index) => entry !== expected[index])) {
    failures.push(`${path} must exactly match [${expected.join(', ')}], got [${actual.join(', ')}]`);
  }
}

function requireExact(actual, expected, path, failures) {
  if (actual !== expected) {
    failures.push(`${path} must be ${expected}, got ${actual || '<missing>'}`);
  }
}

function validateNativeUiProjection(nativeUi, path, failures) {
  if (!nativeUi) {
    failures.push(`${path} is required`);
    return;
  }
  const requiredCapabilities = requireStringArray(
    nativeUi.requiredCapabilities,
    `${path}.requiredCapabilities`,
    failures,
  );
  const requiredFiles = requireStringArray(nativeUi.requiredFiles, `${path}.requiredFiles`, failures);
  const coordinateSpace = requireString(nativeUi.coordinateSpace, `${path}.coordinateSpace`, failures);
  const runtimeTransform = requireString(nativeUi.runtimeTransform, `${path}.runtimeTransform`, failures);
  const fallbackPolicy = requireString(nativeUi.fallbackPolicy, `${path}.fallbackPolicy`, failures);

  requireExactArray(requiredCapabilities, NATIVE_UI_REQUIRED_CAPABILITIES, `${path}.requiredCapabilities`, failures);
  requireExactArray(requiredFiles, NATIVE_UI_REQUIRED_FILES, `${path}.requiredFiles`, failures);
  requireExact(coordinateSpace, NATIVE_UI_COORDINATE_SPACE, `${path}.coordinateSpace`, failures);
  requireExact(runtimeTransform, NATIVE_UI_RUNTIME_TRANSFORM, `${path}.runtimeTransform`, failures);
  requireExact(fallbackPolicy, NATIVE_UI_FALLBACK_POLICY, `${path}.fallbackPolicy`, failures);
}

function validatePolicyProjection(policy, path, failures) {
  if (!policy) {
    failures.push(`${path} is required`);
    return;
  }
  for (const [field, expected] of Object.entries(ELYSIUM_COMPILER_POLICY)) {
    const actual = requireString(policy[field], `${path}.${field}`, failures);
    requireExact(actual, expected, `${path}.${field}`, failures);
  }
}

export function validateElysiumCompilerCapabilityAbi(abi) {
  const failures = [];
  const root = asRecord(abi);
  if (!root) return ['abi must be an object'];
  const capabilityAbi = asRecord(root?.compilerCapabilityAbi);
  const exportAbi = asRecord(root?.exportAbi);
  if (!capabilityAbi) {
    failures.push('abi.compilerCapabilityAbi is required');
  } else {
    const capabilityName = requireString(
      capabilityAbi.name,
      'abi.compilerCapabilityAbi.name',
      failures,
    );
    const capabilityVersion = requireString(
      capabilityAbi.version,
      'abi.compilerCapabilityAbi.version',
      failures,
    );
    requireExact(capabilityName, artifact.name, 'abi.compilerCapabilityAbi.name', failures);
    const capabilityRequiredCommands = requireStringArray(
      capabilityAbi.requiredCommands,
      'abi.compilerCapabilityAbi.requiredCommands',
      failures,
    );
    const capabilityCommands = requireStringArray(
      capabilityAbi.commands,
      'abi.compilerCapabilityAbi.commands',
      failures,
    );
    const capabilityCompileScopes = requireStringArray(
      capabilityAbi.compileScopes,
      'abi.compilerCapabilityAbi.compileScopes',
      failures,
    );
    requireExact(
      capabilityVersion,
      ELYSIUM_COMPILER_CAPABILITY_ABI_VERSION,
      'abi.compilerCapabilityAbi.version',
      failures,
    );
    requireExactArray(
      capabilityRequiredCommands,
      REQUIRED_COMPILER_COMMANDS,
      'abi.compilerCapabilityAbi.requiredCommands',
      failures,
    );
    requireExactArray(
      capabilityCommands,
      ELYSIUM_COMPILER_COMMANDS,
      'abi.compilerCapabilityAbi.commands',
      failures,
    );
    requireExactArray(
      capabilityCompileScopes,
      ELYSIUM_COMPILER_COMPILE_SCOPES,
      'abi.compilerCapabilityAbi.compileScopes',
      failures,
    );
    validateNativeUiProjection(
      asRecord(capabilityAbi.nativeUi),
      'abi.compilerCapabilityAbi.nativeUi',
      failures,
    );
    validatePolicyProjection(
      asRecord(capabilityAbi.policy),
      'abi.compilerCapabilityAbi.policy',
      failures,
    );
  }
  validateNativeUiProjection(asRecord(exportAbi?.nativeUi), 'abi.exportAbi.nativeUi', failures);
  validatePolicyProjection(asRecord(root.policy), 'abi.policy', failures);
  return failures;
}
