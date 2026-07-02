export const ELYSIUM_COMPILER_CAPABILITY_ABI_VERSION = 'elysium.compiler.capability.v1' as const;

export const ELYSIUM_COMPILER_COMMANDS = [
  'compile',
  'inspect',
  'validate',
  'schemas',
] as const;

export const REQUIRED_COMPILER_COMMANDS = [
  'schemas',
  'validate',
  'compile',
] as const;

export const ELYSIUM_COMPILER_COMPILE_SCOPES = [
  'all',
  'native-ui',
  'search',
  'browser',
  'recipes',
  'ui',
  'textures',
] as const;

export type ElysiumCompilerScope = typeof ELYSIUM_COMPILER_COMPILE_SCOPES[number];

export const NATIVE_UI_REQUIRED_CAPABILITIES = [
  'native_ui.surface',
  'native_ui.design_space_coordinates',
  'native_ui.background_asset',
] as const;

export const NATIVE_UI_REQUIRED_FILES = [
  'native-ui/families.jsonl.zst',
  'native-ui/surfaces.jsonl.zst',
  'native-ui/slots.bin',
  'validation/native-ui-abi.json',
] as const;

export const NATIVE_UI_COORDINATE_SPACE = 'nei_pixels' as const;
export const NATIVE_UI_RUNTIME_TRANSFORM = 'uniform-scale-to-fit-only' as const;
export const NATIVE_UI_FALLBACK_POLICY = 'missing required native UI capture is a validation error' as const;

export const ELYSIUM_COMPILER_POLICY = Object.freeze({
  legacyFallback: 'forbidden',
  missingCapability: 'fail-fast',
  hotPathEncoding: 'binary-pack-preferred',
  fullExportValidation: 'milestone-gate-only',
} as const);

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
