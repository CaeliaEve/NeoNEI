import {
  NATIVE_RUNTIME_PACK_SCHEMAS,
  type NativeRuntimePackName,
  type NativeRuntimePackSchema,
} from "./NativeRuntimeAbi.ts";

export {
  NATIVE_RUNTIME_PACK_SCHEMAS,
  type NativeRuntimePackName,
  type NativeRuntimePackSchema,
} from "./NativeRuntimeAbi.ts";

export interface NativeRuntimeManifestFiles {
  browser?: string;
  groups?: string;
  search?: string;
  recipes?: string;
  textures?: string;
  animations?: string;
  stringsZhCn?: string;
  uiTemplates?: string;
  uiBindings?: string;
  uiStrings?: string;
  integrity?: string;
  sizeReport?: string;
  missingDataReport?: string;
  [key: string]: string | undefined;
}

export interface NativeRuntimeManifest {
  schema?: "neonei/runtime/current";
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
  | "recipes.native-ui-layout"
  | "recipes.lookup"
  | "recipes.ui-pack"
  | "search.zh-cn"
  | "strings.zh-cn"
  | "native_ui.surface"
  | "native_ui.design_space_coordinates"
  | "native_ui.background_asset"
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
  packs: Partial<Record<NativeRuntimePackName, NativeRuntimePack>>;
}



