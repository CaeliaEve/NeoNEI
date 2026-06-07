export type NativeRuntimePackName = "browser" | "groups" | "search" | "recipes" | "textures" | "animations";

export type NativeRuntimePackSchema =
  | "neonei/browser-pack/current"
  | "neonei/group-pack/current"
  | "neonei/search-pack/current"
  | "neonei/recipe-pack/current"
  | "neonei/texture-pack/current"
  | "neonei/animation-pack/current";

export const NATIVE_RUNTIME_PACK_SCHEMAS: Record<NativeRuntimePackName, NativeRuntimePackSchema> = {
  browser: "neonei/browser-pack/current",
  groups: "neonei/group-pack/current",
  search: "neonei/search-pack/current",
  recipes: "neonei/recipe-pack/current",
  textures: "neonei/texture-pack/current",
  animations: "neonei/animation-pack/current",
};

export interface NativeRuntimeManifestFiles {
  browser?: string;
  groups?: string;
  search?: string;
  recipes?: string;
  textures?: string;
  animations?: string;
  integrity?: string;
  sizeReport?: string;
  missingDataReport?: string;
  [key: string]: string | undefined;
}

export interface NativeRuntimeManifest {
  schema?: "neonei/runtime/current" | "neonei/native-runtime/current";
  schemaVersion?: string;
  schemaRevision?: number;
  runtimeId?: string;
  generatedAt?: string;
  sourceSignature?: string;
  locale?: string;
  entrypoints?: NativeRuntimeManifestFiles;
  files?: NativeRuntimeManifestFiles | Array<{ path?: string; bytes?: number }>;
  counts?: Record<string, number>;
  capabilities?: NativeRuntimeCapability[] | Record<string, boolean | string | number | null>;
}

export type NativeRuntimeCapability =
  | "atlas.static"
  | "atlas.animated"
  | "groups.collapse"
  | "groups.semantic-nbt"
  | "recipes.lookup"
  | "search.zh-cn"
  | "native-render.webgl2"
  | "native-render.webgpu";

export interface NativeRuntimePackHeader {
  magic: "NNEIBIN\0";
  version: 1;
  schema: NativeRuntimePackSchema;
  schemaLength: number;
  payloadLength: number;
  byteLength: number;
}

export interface NativeRuntimePack {
  name: NativeRuntimePackName;
  path: string;
  url: string;
  header: NativeRuntimePackHeader;
  buffer: ArrayBuffer;
  payloadBuffer: ArrayBuffer;
  payloadEncoding?: "json" | "compact-browser-table" | "binary";
}

export interface NativeRuntimeBuffers {
  manifest: NativeRuntimeManifest;
  manifestUrl: string;
  packs: Record<NativeRuntimePackName, NativeRuntimePack>;
}
