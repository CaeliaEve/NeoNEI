import type { NextFunction, Request, RequestHandler, Response } from 'express';
import {
  assertCurrentRuntimeId,
  withCurrentRuntimeApiContext,
  withCurrentRuntimeApiContextAsync,
  type CurrentRuntimeApiContext,
} from '../services/current-runtime-api.service';
import {
  readCurrentRuntimeAsyncParamPayload,
  readCurrentRuntimeContextPayload,
  readCurrentRuntimeStaticPayload,
  readCurrentRuntimeSyncParamPayload,
  type CurrentRuntimeReadOperationKey,
} from '../services/current-runtime-read.service';
import { asyncHandler } from '../utils/http';
import {
  CURRENT_RUNTIME_ENDPOINTS,
  type CurrentRuntimeEndpointKey,
} from './current-runtime-endpoint-registry';
import {
  CURRENT_RUNTIME_ENDPOINT_HANDLER_DESCRIPTORS,
  type CurrentRuntimeEndpointHandlerDescriptor,
  type CurrentRuntimeEndpointParamName,
} from './current-runtime-endpoint-handler-abi';
import {
  assetPathFromMountedRuntimeRequest,
  isRuntimeAssetRequestMethod,
  sendCurrentRuntimeAsset,
  sendCurrentRuntimeManifest,
  sendCurrentRuntimeNoStoreJson,
  sendCurrentRuntimeReport,
} from './current-runtime-transport';
import { validateAndFreezeRouteHandlers } from './route-descriptor-registry';

function requestParam(req: Request, name: CurrentRuntimeEndpointParamName | undefined): string | undefined {
  return name ? req.params[name] : undefined;
}

function readOperation(descriptor: CurrentRuntimeEndpointHandlerDescriptor): CurrentRuntimeReadOperationKey {
  if (!descriptor.read) {
    throw new Error(`current runtime endpoint handler descriptor has no read operation: ${descriptor.key}`);
  }
  return descriptor.read;
}

function assertPinnedRuntimeIfNeeded(
  req: Request,
  descriptor: CurrentRuntimeEndpointHandlerDescriptor,
  context: CurrentRuntimeApiContext,
): void {
  if (descriptor.runtimeIdParam) {
    assertCurrentRuntimeId(requestParam(req, descriptor.runtimeIdParam), context);
  }
}

function sendContextJsonEndpoint(
  req: Request,
  res: Response,
  descriptor: CurrentRuntimeEndpointHandlerDescriptor,
): void {
  withCurrentRuntimeApiContext((context) => {
    assertPinnedRuntimeIfNeeded(req, descriptor, context);
    sendCurrentRuntimeNoStoreJson(
      res,
      readCurrentRuntimeContextPayload(readOperation(descriptor), context),
      context,
    );
  });
}

function sendStaticJsonEndpoint(
  req: Request,
  res: Response,
  descriptor: CurrentRuntimeEndpointHandlerDescriptor,
): void {
  withCurrentRuntimeApiContext((context) => {
    assertPinnedRuntimeIfNeeded(req, descriptor, context);
    sendCurrentRuntimeNoStoreJson(
      res,
      readCurrentRuntimeStaticPayload(readOperation(descriptor)),
      context,
    );
  });
}

function sendSyncParamJsonEndpoint(
  req: Request,
  res: Response,
  descriptor: CurrentRuntimeEndpointHandlerDescriptor,
): void {
  withCurrentRuntimeApiContext((context) => {
    assertPinnedRuntimeIfNeeded(req, descriptor, context);
    sendCurrentRuntimeNoStoreJson(
      res,
      readCurrentRuntimeSyncParamPayload(readOperation(descriptor), requestParam(req, descriptor.param)),
      context,
    );
  });
}

async function sendAsyncParamJsonEndpoint(
  req: Request,
  res: Response,
  descriptor: CurrentRuntimeEndpointHandlerDescriptor,
): Promise<void> {
  await withCurrentRuntimeApiContextAsync(async (context) => {
    assertPinnedRuntimeIfNeeded(req, descriptor, context);
    const payload = await readCurrentRuntimeAsyncParamPayload(
      readOperation(descriptor),
      requestParam(req, descriptor.param),
    );
    sendCurrentRuntimeNoStoreJson(res, payload, context);
  });
}

function sendManifestEndpoint(
  req: Request,
  res: Response,
  descriptor: CurrentRuntimeEndpointHandlerDescriptor,
): void {
  withCurrentRuntimeApiContext((context) => {
    assertPinnedRuntimeIfNeeded(req, descriptor, context);
    sendCurrentRuntimeManifest(res, context, { immutable: descriptor.immutable === true });
  });
}

function sendAssetParamEndpoint(
  req: Request,
  res: Response,
  descriptor: CurrentRuntimeEndpointHandlerDescriptor,
): void {
  withCurrentRuntimeApiContext((context) => {
    assertPinnedRuntimeIfNeeded(req, descriptor, context);
    sendCurrentRuntimeAsset(res, context, requestParam(req, descriptor.param));
  });
}

function sendMountedAssetEndpoint(
  req: Request,
  res: Response,
  next: NextFunction,
  descriptor: CurrentRuntimeEndpointHandlerDescriptor,
): void {
  if (!isRuntimeAssetRequestMethod(req.method)) {
    next();
    return;
  }
  withCurrentRuntimeApiContext((context) => {
    assertPinnedRuntimeIfNeeded(req, descriptor, context);
    sendCurrentRuntimeAsset(res, context, assetPathFromMountedRuntimeRequest(req));
  });
}

function sendReportEndpoint(
  req: Request,
  res: Response,
  descriptor: CurrentRuntimeEndpointHandlerDescriptor,
): void {
  if (!descriptor.runtimeIdParam) {
    sendCurrentRuntimeReport(res, requestParam(req, descriptor.param));
    return;
  }
  withCurrentRuntimeApiContext((context) => {
    assertPinnedRuntimeIfNeeded(req, descriptor, context);
    sendCurrentRuntimeReport(res, requestParam(req, descriptor.param));
  });
}

function createCurrentRuntimeEndpointHandler(descriptor: CurrentRuntimeEndpointHandlerDescriptor): RequestHandler {
  switch (descriptor.kind) {
    case 'context-json':
      return (req, res) => sendContextJsonEndpoint(req, res, descriptor);
    case 'static-json':
      return (req, res) => sendStaticJsonEndpoint(req, res, descriptor);
    case 'param-sync-json':
      return (req, res) => sendSyncParamJsonEndpoint(req, res, descriptor);
    case 'param-async-json':
      return asyncHandler(async (req, res) => sendAsyncParamJsonEndpoint(req, res, descriptor));
    case 'manifest':
      return (req, res) => sendManifestEndpoint(req, res, descriptor);
    case 'asset-param':
      return (req, res) => sendAssetParamEndpoint(req, res, descriptor);
    case 'asset-mounted':
      return (req, res, next) => sendMountedAssetEndpoint(req, res, next, descriptor);
    case 'report':
      return (req, res) => sendReportEndpoint(req, res, descriptor);
    default: {
      const exhaustive: never = descriptor.kind;
      throw new Error(`Unsupported current runtime endpoint handler kind: ${exhaustive}`);
    }
  }
}

function createCurrentRuntimeEndpointHandlers(): Readonly<Record<CurrentRuntimeEndpointKey, RequestHandler>> {
  const handlers = CURRENT_RUNTIME_ENDPOINT_HANDLER_DESCRIPTORS.reduce(
    (map, descriptor) => {
      map[descriptor.key] = createCurrentRuntimeEndpointHandler(descriptor);
      return map;
    },
    {} as Record<CurrentRuntimeEndpointKey, RequestHandler>,
  );
  return validateAndFreezeRouteHandlers({
    label: 'current runtime endpoint',
    descriptors: CURRENT_RUNTIME_ENDPOINTS,
    handlers,
  });
}

export const CURRENT_RUNTIME_ENDPOINT_HANDLERS = createCurrentRuntimeEndpointHandlers();

export function getCurrentRuntimeEndpointHandler(key: CurrentRuntimeEndpointKey): RequestHandler {
  return CURRENT_RUNTIME_ENDPOINT_HANDLERS[key];
}
