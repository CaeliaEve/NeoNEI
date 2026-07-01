import type { Application, Request, Response } from 'express';
import type { AccelerationRuntimePhase, AccelerationRuntimeState } from '../services/acceleration-runtime.service';
import {
  getPublicApiIndex,
  getRuntimeAdminDiagnostics,
  getRuntimeAdminHealth,
  getRuntimeOpenApiDocument,
} from '../services/runtime-admin-control.service';
import { type RuntimeAdminReconcileLabel } from '../services/runtime-admin-reconcile-control.service';
import { sendRuntimeAdminReconcile } from './runtime-admin-reconcile-executor';
import { sendRuntimeAdminJson, sendRuntimeAdminOpenApi, withRuntimeAdminToken } from './runtime-admin-transport';

type RegisterRuntimeAdminRoutesOptions<TManager> = {
  getAccelerationRuntimeSnapshot: () => AccelerationRuntimeState;
  requireAdminToken: (req: Request, res: Response) => boolean;
  getRuntimeAccelerationDbManager: () => TManager | null;
  reconcileAccelerationRuntime: (manager: TManager) => Promise<void>;
  setAccelerationRuntimePhase: (
    phase: AccelerationRuntimePhase,
    message: string,
    extras?: Partial<Pick<AccelerationRuntimeState, 'stale' | 'lastCompiledSignature' | 'lastError'>>,
  ) => void;
};

export function registerRuntimeAdminRoutes<TManager>(
  app: Application,
  options: RegisterRuntimeAdminRoutesOptions<TManager>,
): void {
  const {
    getAccelerationRuntimeSnapshot,
    requireAdminToken,
    getRuntimeAccelerationDbManager,
    reconcileAccelerationRuntime,
    setAccelerationRuntimePhase,
  } = options;

  app.get('/api/health', (_req, res) => {
    sendRuntimeAdminJson(res, getRuntimeAdminHealth(getAccelerationRuntimeSnapshot()));
  });

  app.get('/api', (_req, res) => {
    sendRuntimeAdminJson(res, getPublicApiIndex());
  });

  app.get('/api/openapi.json', (_req, res) => {
    sendRuntimeAdminOpenApi(res, getRuntimeOpenApiDocument());
  });

  const sendRuntimeDiagnostics = (req: Request, res: Response): void => {
    withRuntimeAdminToken(req, res, requireAdminToken, () => {
      sendRuntimeAdminJson(res, getRuntimeAdminDiagnostics(getAccelerationRuntimeSnapshot()));
    });
  };

  app.get('/ops/runtime', sendRuntimeDiagnostics);
  app.get('/api/admin/runtime', sendRuntimeDiagnostics);

  const reconcileRuntime = {
    getAccelerationRuntimeSnapshot,
    getRuntimeAccelerationDbManager,
    reconcileAccelerationRuntime,
    setAccelerationRuntimePhase,
  };

  const scheduleReconcile = (label: RuntimeAdminReconcileLabel) => (req: Request, res: Response): void => {
    withRuntimeAdminToken(req, res, requireAdminToken, () => {
      sendRuntimeAdminReconcile(req, res, label, reconcileRuntime);
    });
  };

  app.post('/ops/acceleration/reconcile', scheduleReconcile('OPS'));
  app.post('/api/admin/acceleration/reconcile', scheduleReconcile('ADMIN'));
}
