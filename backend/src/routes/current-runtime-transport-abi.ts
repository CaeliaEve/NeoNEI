/**
 * Current runtime transport ABI catalog.
 *
 * Express transport helpers consume cache and method policy from this catalog
 * instead of embedding response-envelope or runtime-asset delivery semantics in
 * route code.
 */

export const CURRENT_RUNTIME_JSON_ENVELOPE_OK = true;

export const CURRENT_RUNTIME_IMMUTABLE_ASSET_CACHE = Object.freeze({
  maxAge: '365d',
  immutable: true,
  varyAcceptEncoding: true,
} as const);

export const CURRENT_RUNTIME_ASSET_REQUEST_METHODS = Object.freeze(['GET', 'HEAD'] as const);

export type CurrentRuntimeAssetRequestMethod = typeof CURRENT_RUNTIME_ASSET_REQUEST_METHODS[number];

export const CURRENT_RUNTIME_MOUNTED_ASSET_PATH_PREFIX = /^\/+/;
