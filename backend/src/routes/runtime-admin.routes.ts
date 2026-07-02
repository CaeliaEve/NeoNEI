import { Router, type Application, type Request, type Response } from 'express';
import type { AccelerationRuntimePhase, AccelerationRuntimeState } from '../services/acceleration-runtime.service';
import {
  getPublicApiIndex,
  getRuntimeAdminDiagnostics,
  getRuntimeAdminHealth,
  getRuntimeOpenApiDocument,
} from '../services/runtime-admin-control.service';
import { type RuntimeAdminReconcileLabel } from '../services/runtime-admin-reconcile-control.service';
import { sendRuntimeAdminReconcile } from './runtime-admin-reconcile-executor';
import { sendRuntimeAdminJson, sendRuntimeAdminOpenApi } from './runtime-admin-transport';

export type RuntimeAdminIndexRoutesOptions = {
  getAccelerationRuntimeSnapshot: () => AccelerationRuntimeState;
};

export type RuntimeAdminControlRouterOptions<TManager> = {
  getAccelerationRuntimeSnapshot: () => AccelerationRuntimeState;
  getRuntimeAccelerationDbManager: () => TManager | null;
  reconcileAccelerationRuntime: (manager: TManager) => Promise<void>;
  setAccelerationRuntimePhase: (
    phase: AccelerationRuntimePhase,
    message: string,
    extras?: Partial<Pick<AccelerationRuntimeState, 'stale' | 'lastCompiledSignature' | 'lastError'>>,
  ) => void;
};

export function registerRuntimeAdminIndexRoutes(
  app: Application,
  options: RuntimeAdminIndexRoutesOptions,
): void {
  app.get('/api/health', (_req, res) => {
    sendRuntimeAdminJson(res, getRuntimeAdminHealth(options.getAccelerationRuntimeSnapshot()));
  });

  app.get('/api', (_req, res) => {
    sendRuntimeAdminJson(res, getPublicApiIndex());
  });

  app.get('/api/openapi.json', (_req, res) => {
    sendRuntimeAdminOpenApi(res, getRuntimeOpenApiDocument());
  });
}

export function createRuntimeAdminControlRouter<TManager>(
  label: RuntimeAdminReconcileLabel,
  options: RuntimeAdminControlRouterOptions<TManager>,
): Router {
  const router = Router();
  const {
    getAccelerationRuntimeSnapshot,
    getRuntimeAccelerationDbManager,
    reconcileAccelerationRuntime,
    setAccelerationRuntimePhase,
  } = options;

  const sendRuntimeDiagnostics = (_req: Request, res: Response): void => {
    sendRuntimeAdminJson(res, getRuntimeAdminDiagnostics(getAccelerationRuntimeSnapshot()));
  };

  router.get('/runtime', sendRuntimeDiagnostics);

  const reconcileRuntime = {
    getAccelerationRuntimeSnapshot,
    getRuntimeAccelerationDbManager,
    reconcileAccelerationRuntime,
    setAccelerationRuntimePhase,
  };

  const scheduleReconcile = (req: Request, res: Response): void => {
    sendRuntimeAdminReconcile(req, res, label, reconcileRuntime);
  };

  router.post('/acceleration/reconcile', scheduleReconcile);

  return router;
}
