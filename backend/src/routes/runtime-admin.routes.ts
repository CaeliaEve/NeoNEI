import { Router, type Application, type RequestHandler } from 'express';
import type { RuntimeAdminReconcileLabel } from '../services/runtime-admin-reconcile-control.service';
import {
  RUNTIME_ADMIN_CONTROL_ENDPOINTS,
  RUNTIME_ADMIN_INDEX_ENDPOINTS,
  type RuntimeAdminControlEndpoint,
  type RuntimeAdminIndexEndpoint,
} from './runtime-admin-endpoint-registry';
import {
  createRuntimeAdminControlEndpointHandlers,
  createRuntimeAdminIndexEndpointHandlers,
} from './runtime-admin-endpoint-handlers';
import type {
  RuntimeAdminControlRouterOptions,
  RuntimeAdminIndexRoutesOptions,
} from './runtime-admin-endpoint-types';

export type {
  RuntimeAdminControlRouterOptions,
  RuntimeAdminIndexRoutesOptions,
} from './runtime-admin-endpoint-types';

function mountRuntimeAdminIndexEndpoint(
  app: Application,
  endpoint: RuntimeAdminIndexEndpoint,
  handler: RequestHandler,
): void {
  app.get(endpoint.path, handler);
}

function mountRuntimeAdminControlEndpoint(
  router: Router,
  endpoint: RuntimeAdminControlEndpoint,
  handler: RequestHandler,
): void {
  switch (endpoint.method) {
    case 'get':
      router.get(endpoint.path, handler);
      break;
    case 'post':
      router.post(endpoint.path, handler);
      break;
  }
}

export function registerRuntimeAdminIndexRoutes(
  app: Application,
  options: RuntimeAdminIndexRoutesOptions,
): void {
  const handlers = createRuntimeAdminIndexEndpointHandlers(options);
  for (const endpoint of RUNTIME_ADMIN_INDEX_ENDPOINTS) {
    mountRuntimeAdminIndexEndpoint(app, endpoint, handlers[endpoint.key]);
  }
}

export function createRuntimeAdminControlRouter<TManager>(
  label: RuntimeAdminReconcileLabel,
  options: RuntimeAdminControlRouterOptions<TManager>,
): Router {
  const router = Router();
  const handlers = createRuntimeAdminControlEndpointHandlers(label, options);

  for (const endpoint of RUNTIME_ADMIN_CONTROL_ENDPOINTS) {
    mountRuntimeAdminControlEndpoint(router, endpoint, handlers[endpoint.key]);
  }

  return router;
}
