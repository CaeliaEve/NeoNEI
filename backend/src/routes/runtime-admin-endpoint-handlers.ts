import type { RequestHandler } from 'express';
import {
  getPublicApiIndex,
  getRuntimeAdminDiagnostics,
  getRuntimeAdminHealth,
  getRuntimeOpenApiDocument,
} from '../services/runtime-admin-control.service';
import type { RuntimeAdminReconcileLabel } from '../services/runtime-admin-reconcile-control.service';
import type {
  RuntimeAdminControlEndpointKey,
  RuntimeAdminIndexEndpointKey,
} from './runtime-admin-endpoint-registry';
import {
  RUNTIME_ADMIN_CONTROL_ENDPOINTS,
  RUNTIME_ADMIN_INDEX_ENDPOINTS,
} from './runtime-admin-endpoint-registry';
import type {
  RuntimeAdminControlRouterOptions,
  RuntimeAdminIndexRoutesOptions,
} from './runtime-admin-endpoint-types';
import { validateAndFreezeRouteHandlers } from './route-descriptor-registry';
import { sendRuntimeAdminReconcile } from './runtime-admin-reconcile-executor';
import { sendRuntimeAdminJson, sendRuntimeAdminOpenApi } from './runtime-admin-transport';

export function createRuntimeAdminIndexEndpointHandlers(
  options: RuntimeAdminIndexRoutesOptions,
): Readonly<Record<RuntimeAdminIndexEndpointKey, RequestHandler>> {
  return validateAndFreezeRouteHandlers({
    label: 'runtime admin index endpoint',
    descriptors: RUNTIME_ADMIN_INDEX_ENDPOINTS,
    handlers: {
      health: (_req, res) => {
        sendRuntimeAdminJson(res, getRuntimeAdminHealth(options.getAccelerationRuntimeSnapshot()));
      },
      'api-index': (_req, res) => {
        sendRuntimeAdminJson(res, getPublicApiIndex());
      },
      openapi: (_req, res) => {
        sendRuntimeAdminOpenApi(res, getRuntimeOpenApiDocument());
      },
    },
  });
}

export function createRuntimeAdminControlEndpointHandlers<TManager>(
  label: RuntimeAdminReconcileLabel,
  options: RuntimeAdminControlRouterOptions<TManager>,
): Readonly<Record<RuntimeAdminControlEndpointKey, RequestHandler>> {
  const reconcileRuntime = Object.freeze({
    getAccelerationRuntimeSnapshot: options.getAccelerationRuntimeSnapshot,
    getRuntimeAccelerationDbManager: options.getRuntimeAccelerationDbManager,
    reconcileAccelerationRuntime: options.reconcileAccelerationRuntime,
    setAccelerationRuntimePhase: options.setAccelerationRuntimePhase,
  });

  return validateAndFreezeRouteHandlers({
    label: 'runtime admin control endpoint',
    descriptors: RUNTIME_ADMIN_CONTROL_ENDPOINTS,
    handlers: {
      'runtime-diagnostics': (_req, res) => {
        sendRuntimeAdminJson(res, getRuntimeAdminDiagnostics(options.getAccelerationRuntimeSnapshot()));
      },
      'acceleration-reconcile': (req, res) => {
        sendRuntimeAdminReconcile(req, res, label, reconcileRuntime);
      },
    },
  });
}
