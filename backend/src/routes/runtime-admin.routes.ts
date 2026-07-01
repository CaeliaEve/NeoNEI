import type { Application, Request, Response } from 'express';
import type { AccelerationRuntimePhase, AccelerationRuntimeState } from '../services/acceleration-runtime.service';
import {
  getPublicApiIndex,
  getRuntimeAdminDiagnostics,
  getRuntimeOpenApiDocument,
  serializeAccelerationRuntime,
} from '../services/runtime-admin-control.service';
import { setPublicCacheHeaders } from '../utils/http-cache';
import { sendErrorEnvelope } from '../utils/error-response';
import { logger } from '../utils/logger';

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
    const accelerationSnapshot = getAccelerationRuntimeSnapshot();
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      acceleration: serializeAccelerationRuntime(accelerationSnapshot),
    });
  });

  app.get('/api', (_req, res) => {
    res.json(getPublicApiIndex());
  });

  app.get('/api/openapi.json', (_req, res) => {
    setPublicCacheHeaders(res, {
      maxAgeSeconds: 300,
      staleWhileRevalidateSeconds: 3600,
      staleIfErrorSeconds: 86400,
    });
    res.json(getRuntimeOpenApiDocument());
  });

  const sendRuntimeDiagnostics = (req: Request, res: Response): void => {
    if (!requireAdminToken(req, res)) {
      return;
    }
    res.json(getRuntimeAdminDiagnostics(getAccelerationRuntimeSnapshot()));
  };

  app.get('/ops/runtime', sendRuntimeDiagnostics);
  app.get('/api/admin/runtime', sendRuntimeDiagnostics);

  const scheduleReconcile = (label: 'OPS' | 'ADMIN') => async (req: Request, res: Response): Promise<void> => {
    if (!requireAdminToken(req, res)) {
      return;
    }
    const runtimeAccelerationDbManager = getRuntimeAccelerationDbManager();
    if (!runtimeAccelerationDbManager) {
      sendErrorEnvelope(req, res, 503, 'ACCELERATION_MANAGER_NOT_READY', 'Acceleration manager is not ready');
      return;
    }
    const accelerationSnapshot = getAccelerationRuntimeSnapshot();
    if (
      accelerationSnapshot.phase === 'compiling'
      || accelerationSnapshot.phase === 'promoting'
      || accelerationSnapshot.blocking
    ) {
      sendErrorEnvelope(req, res, 409, 'ACCELERATION_RECONCILE_IN_PROGRESS', 'Acceleration reconcile is already in progress', {
        phase: accelerationSnapshot.phase,
        blocking: accelerationSnapshot.blocking,
      });
      return;
    }

    logger.info(`[${label}] acceleration reconcile requested`, { ip: req.ip });
    void reconcileAccelerationRuntime(runtimeAccelerationDbManager).catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      setAccelerationRuntimePhase('error', `${label === 'OPS' ? 'Ops' : 'Admin'} acceleration reconciliation failed.`, {
        stale: true,
        lastError: message,
      });
      logger.error(`[${label}] acceleration reconcile failed`, error);
    });

    res.status(202).json({
      status: 'accepted',
      phase: getAccelerationRuntimeSnapshot().phase,
      message: 'Acceleration reconciliation scheduled.',
    });
  };

  app.post('/ops/acceleration/reconcile', scheduleReconcile('OPS'));
  app.post('/api/admin/acceleration/reconcile', scheduleReconcile('ADMIN'));
}
