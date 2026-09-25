import {
  NATIVE_RUNTIME_CAPABILITIES as NATIVE_RUNTIME_CATALOG_CAPABILITIES,
  NATIVE_RUNTIME_PACK_NAMES as NATIVE_RUNTIME_CATALOG_PACK_NAMES,
  NATIVE_RUNTIME_PACK_SCHEMAS as NATIVE_RUNTIME_CATALOG_PACK_SCHEMAS,
  NATIVE_RUNTIME_REQUIRED_CAPABILITIES as NATIVE_RUNTIME_CATALOG_REQUIRED_CAPABILITIES,
  NATIVE_RUNTIME_UI_PACK_SCHEMAS as NATIVE_RUNTIME_CATALOG_UI_PACK_SCHEMAS,
  NATIVE_UI_RUNTIME_REQUIRED_ENTRYPOINTS as NATIVE_RUNTIME_CATALOG_REQUIRED_ENTRYPOINTS,
  type NativeRuntimeCapabilityCatalogName,
  type NativeRuntimePackCatalogName,
  type NativeRuntimePackCatalogSchema,
  type NativeRuntimeUiPackCatalogSchema,
} from "./NativeRuntimeCatalog.ts";

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

export const NATIVE_RUNTIME_PACK_NAMES = NATIVE_RUNTIME_CATALOG_PACK_NAMES;

export type NativeRuntimePackName = NativeRuntimePackCatalogName;

export const NATIVE_RUNTIME_PACK_SCHEMAS = NATIVE_RUNTIME_CATALOG_PACK_SCHEMAS;

export const NATIVE_RUNTIME_UI_PACK_SCHEMAS = NATIVE_RUNTIME_CATALOG_UI_PACK_SCHEMAS;

export type NativeRuntimePackSchema = NativeRuntimePackCatalogSchema | NativeRuntimeUiPackCatalogSchema;

export const NATIVE_RUNTIME_PAYLOAD_ENCODINGS = {
  json: "json",
  compactBrowserTable: "compact-browser-table",
  binary: "binary",
} as const;

export type NativeRuntimePayloadEncoding =
  typeof NATIVE_RUNTIME_PAYLOAD_ENCODINGS[keyof typeof NATIVE_RUNTIME_PAYLOAD_ENCODINGS];

export const NATIVE_RUNTIME_CAPABILITIES = NATIVE_RUNTIME_CATALOG_CAPABILITIES;

export type NativeRuntimeCapability = NativeRuntimeCapabilityCatalogName;

export const NATIVE_RUNTIME_REQUIRED_CAPABILITIES = NATIVE_RUNTIME_CATALOG_REQUIRED_CAPABILITIES;

export const NATIVE_UI_RUNTIME_REQUIRED_ENTRYPOINTS = NATIVE_RUNTIME_CATALOG_REQUIRED_ENTRYPOINTS;
