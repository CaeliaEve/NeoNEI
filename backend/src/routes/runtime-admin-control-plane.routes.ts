import { Router, type Application } from 'express';
import {
  RUNTIME_ADMIN_CONTROL_PLANES,
  RUNTIME_ADMIN_CONTROL_PLANE_SUBSYSTEMS,
  type RuntimeAdminControlPlane,
} from './runtime-admin-control-plane-registry';
import { mountRuntimeAdminControlPlaneSubsystem } from './runtime-admin-control-plane-subsystems';
import type { RuntimeAdminControlRouterOptions } from './runtime-admin-endpoint-types';
import { createRuntimeAdminTokenMiddleware, type RuntimeAdminTokenGuard } from './runtime-admin-transport';

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

  for (const subsystem of RUNTIME_ADMIN_CONTROL_PLANE_SUBSYSTEMS) {
    mountRuntimeAdminControlPlaneSubsystem(router, plane, subsystem, options);
  }

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
