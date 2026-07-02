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

export type NativeRuntimePackSchema =
  | typeof NATIVE_RUNTIME_PACK_SCHEMAS[keyof typeof NATIVE_RUNTIME_PACK_SCHEMAS]
  | "neonei/ui-template-pack/current"
  | "neonei/ui-binding-pack/current"
  | "neonei/ui-string-pack/current";

export const NATIVE_RUNTIME_REQUIRED_CAPABILITIES = [
  "recipes.native-ui-layout",
  "recipes.ui-pack",
  "native-render.webgl2",
] as const;

export const NATIVE_UI_RUNTIME_REQUIRED_ENTRYPOINTS = [
  "uiTemplates",
  "uiBindings",
  "uiStrings",
] as const;
