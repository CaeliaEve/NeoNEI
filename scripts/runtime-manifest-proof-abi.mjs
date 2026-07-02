import {
  NATIVE_UI_EXPORT_ABI_VALIDATION_REPORT_PATH,
  UI_PACK_ABI_VALIDATION_REPORT_PATH,
} from './native-ui-pack-abi.mjs';

export const RUST_PRODUCTION_MANIFEST_VALIDATION_SCHEMA = 'neonei/rust-production-manifest-validation/v1';
export const RUST_RUNTIME_SCHEMA = 'neonei/runtime/current';
export const RUST_RUNTIME_MANIFEST_SCHEMA_VERSION = 'neonei/rust-runtime-manifest/current';
export const RUST_RUNTIME_SCHEMA_REVISION = 1;

export const RUST_RUNTIME_MANIFEST_PATH = 'rust/runtime-manifest.json';
export const RUST_NATIVE_UI_LAYOUT_REPORT_PATH = 'rust/native-ui-layout-report.json';

export const RUST_BASE_REQUIRED_FILE_KEYS = Object.freeze([
  'rustRuntimeManifest',
  'rustBrowserBin',
  'rustGroupsBin',
  'rustSearchBin',
  'rustRecipeBin',
  'rustStringsZhCnBin',
  'rustUiTemplatesBin',
  'rustUiBindingsBin',
  'rustUiStringsBin',
  'rustUiAssetsManifest',
  'rustUiPackReport',
  'rustUiPackAbiValidationReport',
  'rustNativeUiExportAbiValidationReport',
  'rustNativeUiLayoutReport',
]);

export const RUST_TEXTURE_REQUIRED_FILE_KEYS = Object.freeze([
  'rustTextureBin',
  'rustAtlasMetaBin',
  'rustAnimationBin',
]);

export const RUST_BASE_RUNTIME_ARTIFACTS = Object.freeze([
  'rust/browser.bin',
  'rust/groups.bin',
  'rust/search.bin',
  'rust/recipes.bin',
  'rust/strings.zh_cn.bin',
  'rust/ui-pack/ui_templates.bin',
  'rust/ui-pack/ui_bindings.bin',
  'rust/ui-pack/ui_strings.bin',
  UI_PACK_ABI_VALIDATION_REPORT_PATH,
  NATIVE_UI_EXPORT_ABI_VALIDATION_REPORT_PATH,
  RUST_NATIVE_UI_LAYOUT_REPORT_PATH,
]);

export const RUST_TEXTURE_RUNTIME_ARTIFACTS = Object.freeze([
  'rust/textures.bin',
  'rust/atlas.meta.bin',
  'rust/animations.bin',
]);

export const RUST_BASE_ENTRYPOINTS = Object.freeze({
  browser: 'rust/browser.bin',
  groups: 'rust/groups.bin',
  search: 'rust/search.bin',
  recipes: 'rust/recipes.bin',
  stringsZhCn: 'rust/strings.zh_cn.bin',
  uiTemplates: 'rust/ui-pack/ui_templates.bin',
  uiBindings: 'rust/ui-pack/ui_bindings.bin',
  uiStrings: 'rust/ui-pack/ui_strings.bin',
});

export const RUST_TEXTURE_ENTRYPOINTS = Object.freeze({
  textures: 'rust/textures.bin',
  animations: 'rust/animations.bin',
});

export const RUST_BASE_PRODUCTION_CORE_KEYS = Object.freeze({
  browser: 'rustBrowserBin',
  search: 'rustSearchBin',
  recipes: 'rustRecipeBin',
  uiTemplates: 'rustUiTemplatesBin',
  uiBindings: 'rustUiBindingsBin',
});

export const RUST_TEXTURE_PRODUCTION_CORE_KEYS = Object.freeze({
  textures: 'rustTextureBin',
  atlasMeta: 'rustAtlasMetaBin',
});

export function isTextureRuntimeScope(scope) {
  return scope === 'all' || scope === 'textures';
}

export function runtimeRequiredFileKeys(scope) {
  return Object.freeze([
    ...RUST_BASE_REQUIRED_FILE_KEYS,
    ...(isTextureRuntimeScope(scope) ? RUST_TEXTURE_REQUIRED_FILE_KEYS : []),
  ]);
}

export function resolveManifestFile(files, key) {
  return files?.[key];
}

export function buildRequiredRustFiles(files, scope) {
  return Object.fromEntries(runtimeRequiredFileKeys(scope).map((key) => [key, resolveManifestFile(files, key)]));
}

export function expectedRuntimeArtifacts(scope) {
  return Object.freeze([
    ...RUST_BASE_RUNTIME_ARTIFACTS,
    ...(isTextureRuntimeScope(scope) ? RUST_TEXTURE_RUNTIME_ARTIFACTS : []),
  ]);
}

export function expectedRuntimeEntrypoints(scope) {
  return Object.freeze({
    ...RUST_BASE_ENTRYPOINTS,
    ...(isTextureRuntimeScope(scope) ? RUST_TEXTURE_ENTRYPOINTS : {}),
  });
}

export function productionCoreRuntimeFiles(files, scope) {
  const domains = {
    ...RUST_BASE_PRODUCTION_CORE_KEYS,
    ...(isTextureRuntimeScope(scope) ? RUST_TEXTURE_PRODUCTION_CORE_KEYS : {}),
  };
  return Object.fromEntries(Object.entries(domains).map(([domain, key]) => [domain, files?.[key]]));
}
