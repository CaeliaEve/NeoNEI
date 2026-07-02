import type { Router } from 'express';
import patternsRoutes from './patterns.routes';
import renderContractRoutes from './render-contract.routes';
import { createPublishAdminRouter } from './publish-admin.routes';
import { createRuntimeAdminControlRouter } from './runtime-admin.routes';
import type { RuntimeAdminControlRouterOptions } from './runtime-admin-endpoint-types';
import type {
  RuntimeAdminControlPlane,
  RuntimeAdminControlPlaneSubsystem,
} from './runtime-admin-control-plane-registry';

function createRuntimeAdminControlPlaneSubsystemRouter<TManager>(
  plane: RuntimeAdminControlPlane,
  subsystem: RuntimeAdminControlPlaneSubsystem,
  options: RuntimeAdminControlRouterOptions<TManager>,
): Router {
  switch (subsystem.key) {
    case 'runtime-control':
      return createRuntimeAdminControlRouter(plane.reconcileLabel, options);
    case 'publish':
      return createPublishAdminRouter();
    case 'patterns':
      return patternsRoutes;
    case 'render-contract':
      return renderContractRoutes;
  }
}

export function mountRuntimeAdminControlPlaneSubsystem<TManager>(
  router: Router,
  plane: RuntimeAdminControlPlane,
  subsystem: RuntimeAdminControlPlaneSubsystem,
  options: RuntimeAdminControlRouterOptions<TManager>,
): void {
  const subsystemRouter = createRuntimeAdminControlPlaneSubsystemRouter(plane, subsystem, options);
  if (subsystem.mountPath === null) {
    router.use(subsystemRouter);
    return;
  }
  router.use(subsystem.mountPath, subsystemRouter);
}
