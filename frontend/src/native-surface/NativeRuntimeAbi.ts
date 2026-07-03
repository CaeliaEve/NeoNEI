export const NATIVE_RUNTIME_MANIFEST_SCHEMA = "neonei/runtime/current" as const;

export const NATIVE_RUNTIME_PACK_MAGIC = "NNEIBIN\0" as const;

export const NATIVE_RUNTIME_PACK_VERSION = 1 as const;

export const NATIVE_RUNTIME_PACK_HEADER_BYTES = 24 as const;

export const NATIVE_RUNTIME_DEFAULT_BASE_URL = "http://localhost/" as const;

export const NATIVE_RUNTIME_CURRENT_MANIFEST_PATH = "/api/runtime/current/manifest" as const;
export const NATIVE_RUNTIME_CURRENT_ASSET_BASE_PATH = "/api/runtime/current/asset/" as const;

export const NATIVE_RUNTIME_FETCH_CACHE = {
  manifest: "no-cache",
  pack: "force-cache",
  report: "no-cache",
} as const;

export const NATIVE_RUNTIME_REVISION = {
  queryParam: "neoneiRuntime",
  separator: "|",
} as const;

export const NATIVE_RUNTIME_PACK_NAMES = [
  "browser",
  "groups",
  "search",
  "recipes",
  "textures",
  "animations",
  "stringsZhCn",
] as const;

export type NativeRuntimePackName = typeof NATIVE_RUNTIME_PACK_NAMES[number];

export const NATIVE_RUNTIME_PACK_SCHEMAS = {
  browser: "neonei/browser-pack/current",
  groups: "neonei/group-pack/current",
  search: "neonei/search-pack/current",
  recipes: "neonei/recipe-pack/current",
  textures: "neonei/texture-pack/current",
  animations: "neonei/animation-pack/current",
  stringsZhCn: "neonei/string-pack/current",
} as const;

export const NATIVE_RUNTIME_UI_PACK_SCHEMAS = {
  uiTemplates: "neonei/ui-template-pack/current",
  uiBindings: "neonei/ui-binding-pack/current",
  uiStrings: "neonei/ui-string-pack/current",
} as const;

export type NativeRuntimePackSchema =
  | typeof NATIVE_RUNTIME_PACK_SCHEMAS[keyof typeof NATIVE_RUNTIME_PACK_SCHEMAS]
  | typeof NATIVE_RUNTIME_UI_PACK_SCHEMAS[keyof typeof NATIVE_RUNTIME_UI_PACK_SCHEMAS];

export const NATIVE_RUNTIME_PAYLOAD_ENCODINGS = {
  json: "json",
  compactBrowserTable: "compact-browser-table",
  binary: "binary",
} as const;

export type NativeRuntimePayloadEncoding =
  typeof NATIVE_RUNTIME_PAYLOAD_ENCODINGS[keyof typeof NATIVE_RUNTIME_PAYLOAD_ENCODINGS];

export const NATIVE_RUNTIME_CAPABILITIES = [
  "atlas.static",
  "atlas.animated",
  "groups.collapse",
  "groups.semantic-nbt",
  "recipes.native-ui-layout",
  "recipes.lookup",
  "recipes.ui-pack",
  "search.zh-cn",
  "strings.zh-cn",
  "native_ui.surface",
  "native_ui.design_space_coordinates",
  "native_ui.background_asset",
  "native-render.webgl2",
  "native-render.webgpu",
] as const;

export type NativeRuntimeCapability = typeof NATIVE_RUNTIME_CAPABILITIES[number];

export const NATIVE_RUNTIME_REQUIRED_CAPABILITIES = [
  "recipes.native-ui-layout",
  "recipes.ui-pack",
  "native-render.webgl2",
] as const satisfies readonly NativeRuntimeCapability[];

export const NATIVE_UI_RUNTIME_REQUIRED_ENTRYPOINTS = [
  "uiTemplates",
  "uiBindings",
  "uiStrings",
] as const;
