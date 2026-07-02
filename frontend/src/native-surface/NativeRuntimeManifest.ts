import {
  NATIVE_RUNTIME_MANIFEST_SCHEMA,
  NATIVE_RUNTIME_PACK_MAGIC,
  NATIVE_RUNTIME_PACK_SCHEMAS,
  NATIVE_RUNTIME_PACK_VERSION,
  NATIVE_UI_RUNTIME_REQUIRED_ENTRYPOINTS,
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
  NATIVE_UI_RUNTIME_REQUIRED_ENTRYPOINTS,
  type NativeRuntimeCapability,
  type NativeRuntimePackName,
  type NativeRuntimePackSchema,
  type NativeRuntimePayloadEncoding,
} from "./NativeRuntimeAbi.ts";

export type NativeUiRuntimeEntrypointName = typeof NATIVE_UI_RUNTIME_REQUIRED_ENTRYPOINTS[number];
export type NativeRuntimeManifestEntrypointName = NativeRuntimePackName | NativeUiRuntimeEntrypointName;

export type NativeRuntimeManifestFiles =
  Partial<Record<NativeRuntimeManifestEntrypointName, string>> & {
    integrity?: string;
    sizeReport?: string;
    missingDataReport?: string;
    [key: string]: string | undefined;
  };

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



