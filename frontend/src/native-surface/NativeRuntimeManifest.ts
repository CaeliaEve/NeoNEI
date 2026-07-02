import {
  NATIVE_RUNTIME_MANIFEST_SCHEMA,
  NATIVE_RUNTIME_PACK_MAGIC,
  NATIVE_RUNTIME_PACK_SCHEMAS,
  NATIVE_RUNTIME_PACK_VERSION,
  type NativeRuntimeCapability,
  type NativeRuntimePackName,
  type NativeRuntimePackSchema,
  type NativeRuntimePayloadEncoding,
} from "./NativeRuntimeAbi.ts";

export {
  NATIVE_RUNTIME_MANIFEST_SCHEMA,
  NATIVE_RUNTIME_PACK_MAGIC,
  NATIVE_RUNTIME_PACK_SCHEMAS,
  NATIVE_RUNTIME_PACK_VERSION,
  type NativeRuntimeCapability,
  type NativeRuntimePackName,
  type NativeRuntimePackSchema,
  type NativeRuntimePayloadEncoding,
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
  schema?: typeof NATIVE_RUNTIME_MANIFEST_SCHEMA;
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

export interface NativeRuntimePackHeader {
  magic: typeof NATIVE_RUNTIME_PACK_MAGIC;
  version: typeof NATIVE_RUNTIME_PACK_VERSION;
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
  payloadEncoding?: NativeRuntimePayloadEncoding;
}

export interface NativeRuntimeBuffers {
  manifest: NativeRuntimeManifest;
  manifestUrl: string;
  packs: Partial<Record<NativeRuntimePackName, NativeRuntimePack>>;
}



