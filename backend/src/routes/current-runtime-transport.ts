import type { Request, Response } from 'express';
import {
  getCurrentRuntimeAssetDelivery,
  getCurrentRuntimeManifestDelivery,
  type CurrentRuntimeApiContext,
} from '../services/current-runtime-api.service';
import { resolveCurrentRuntimeReport } from '../services/current-runtime-report-registry.service';
import { setNoStoreHeaders, setStaticAssetCacheHeaders } from '../utils/http-cache';
import {
  CURRENT_RUNTIME_ASSET_REQUEST_METHODS,
  CURRENT_RUNTIME_IMMUTABLE_ASSET_CACHE,
  CURRENT_RUNTIME_JSON_ENVELOPE_OK,
  CURRENT_RUNTIME_MOUNTED_ASSET_PATH_PREFIX,
} from './current-runtime-transport-abi';

type CurrentRuntimeResponseMeta = CurrentRuntimeApiContext['meta'];

export type CurrentRuntimeJsonEnvelope = Readonly<{
  ok: typeof CURRENT_RUNTIME_JSON_ENVELOPE_OK;
  data: unknown;
  meta: CurrentRuntimeResponseMeta;
}>;

export function createCurrentRuntimeEnvelope(
  data: unknown,
  context: CurrentRuntimeApiContext,
): CurrentRuntimeJsonEnvelope {
  return Object.freeze({
    ok: CURRENT_RUNTIME_JSON_ENVELOPE_OK,
    data,
    meta: context.meta,
  });
}

export function sendCurrentRuntimeJson(
  res: Response,
  data: unknown,
  context: CurrentRuntimeApiContext,
): void {
  res.json(createCurrentRuntimeEnvelope(data, context));
}

export function sendCurrentRuntimeNoStoreJson(
  res: Response,
  data: unknown,
  context: CurrentRuntimeApiContext,
): void {
  setNoStoreHeaders(res);
  sendCurrentRuntimeJson(res, data, context);
}

export function sendCurrentRuntimeManifest(
  res: Response,
  context: CurrentRuntimeApiContext,
  options: { immutable?: boolean } = {},
): void {
  const manifest = getCurrentRuntimeManifestDelivery(context);
  res.setHeader('ETag', manifest.etag);
  if (options.immutable) {
    setStaticAssetCacheHeaders(res, CURRENT_RUNTIME_IMMUTABLE_ASSET_CACHE);
  } else {
    setNoStoreHeaders(res);
  }
  sendCurrentRuntimeJson(res, manifest.payload, context);
}

export function sendCurrentRuntimeAsset(
  res: Response,
  context: CurrentRuntimeApiContext,
  fileName: string | undefined,
): void {
  const asset = getCurrentRuntimeAssetDelivery(fileName, context);
  res.setHeader('ETag', asset.etag);
  setStaticAssetCacheHeaders(res, CURRENT_RUNTIME_IMMUTABLE_ASSET_CACHE);
  res.sendFile(asset.artifact.absolutePath);
}

export function sendCurrentRuntimeReport(res: Response, reportName: string | undefined): void {
  const report = resolveCurrentRuntimeReport(reportName);
  setNoStoreHeaders(res);
  res.sendFile(report.absolutePath);
}

export function isRuntimeAssetRequestMethod(method: string): boolean {
  return CURRENT_RUNTIME_ASSET_REQUEST_METHODS.some((candidate) => candidate === method);
}

export function assetPathFromMountedRuntimeRequest(req: Request): string {
  return decodeURIComponent(req.path.replace(CURRENT_RUNTIME_MOUNTED_ASSET_PATH_PREFIX, ''));
}
