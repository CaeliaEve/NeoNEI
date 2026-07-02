import { Router, type Application } from 'express';
import patternsRoutes from './patterns.routes';
import renderContractRoutes from './render-contract.routes';
import { createPublishAdminRouter } from './publish-admin.routes';
import {
  createRuntimeAdminControlRouter,
  type RuntimeAdminControlRouterOptions,
} from './runtime-admin.routes';
import { createRuntimeAdminTokenMiddleware, type RuntimeAdminTokenGuard } from './runtime-admin-transport';
import type { RuntimeAdminReconcileLabel } from '../services/runtime-admin-reconcile-control.service';

export type RuntimeAdminControlPlane = Readonly<{
  name: 'ops' | 'api-admin';
  prefix: '/ops' | '/api/admin';
  reconcileLabel: RuntimeAdminReconcileLabel;
}>;

export const RUNTIME_ADMIN_CONTROL_PLANES: readonly RuntimeAdminControlPlane[] = Object.freeze([
  Object.freeze({
    name: 'ops',
    prefix: '/ops',
    reconcileLabel: 'OPS',
  }),
  Object.freeze({
    name: 'api-admin',
    prefix: '/api/admin',
    reconcileLabel: 'ADMIN',
  }),
]);

export type RegisterRuntimeAdminControlPlaneRoutesOptions<TManager> =
  RuntimeAdminControlRouterOptions<TManager> &
  Readonly<{
    requireAdminToken: RuntimeAdminTokenGuard;
  }>;

function createRuntimeAdminControlPlaneRouter<TManager>(
  plane: RuntimeAdminControlPlane,
  options: RuntimeAdminControlRouterOptions<TManager>,
): Router {
  const router = Router();

  router.use(createRuntimeAdminControlRouter(plane.reconcileLabel, options));
  router.use('/publish', createPublishAdminRouter());
  router.use('/patterns', patternsRoutes);
  router.use('/render-contract', renderContractRoutes);

  return router;
}

export function registerRuntimeAdminControlPlaneRoutes<TManager>(
  app: Application,
  options: RegisterRuntimeAdminControlPlaneRoutesOptions<TManager>,
): void {
  const { requireAdminToken, ...runtimeControlOptions } = options;
  const requireAdminTokenMiddleware = createRuntimeAdminTokenMiddleware(requireAdminToken);

  for (const plane of RUNTIME_ADMIN_CONTROL_PLANES) {
    app.use(
      plane.prefix,
      requireAdminTokenMiddleware,
      createRuntimeAdminControlPlaneRouter(plane, runtimeControlOptions),
    );
  }
}
