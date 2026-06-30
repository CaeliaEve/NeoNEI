import fs from 'fs';
import type { Application, Request, Response } from 'express';
import { PUBLISH_OUTPUT_DIR } from '../config/runtime-paths';
import { setPublicCacheHeaders } from '../utils/http-cache';
import { sendErrorEnvelope } from '../utils/error-response';
import { logger } from '../utils/logger';

type AccelerationRuntimeState = {
  revision: number;
  phase: string;
  message: string;
  activeApiRequests: number;
  blocking: boolean;
  stale: boolean;
  lastCompiledSignature: string | null;
  lastError: string | null;
};

type RegisterRuntimeAdminRoutesOptions<TManager> = {
  accelerationRuntime: AccelerationRuntimeState;
  requireAdminToken: (req: Request, res: Response) => boolean;
  getRuntimeAccelerationDbManager: () => TManager | null;
  reconcileAccelerationRuntime: (manager: TManager) => Promise<void>;
  setAccelerationRuntimePhase: (
    phase: 'initializing' | 'ready' | 'stale' | 'compiling' | 'promoting' | 'materializing' | 'error',
    message: string,
    extras?: Partial<Pick<AccelerationRuntimeState, 'stale' | 'lastCompiledSignature' | 'lastError'>>,
  ) => void;
};

export function registerRuntimeAdminRoutes<TManager>(
  app: Application,
  options: RegisterRuntimeAdminRoutesOptions<TManager>,
): void {
  const {
    accelerationRuntime,
    requireAdminToken,
    getRuntimeAccelerationDbManager,
    reconcileAccelerationRuntime,
    setAccelerationRuntimePhase,
  } = options;

  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      acceleration: {
        revision: accelerationRuntime.revision,
        phase: accelerationRuntime.phase,
        message: accelerationRuntime.message,
        blocking: accelerationRuntime.blocking,
        stale: accelerationRuntime.stale,
        activeApiRequests: accelerationRuntime.activeApiRequests,
        lastCompiledSignature: accelerationRuntime.lastCompiledSignature,
        lastError: accelerationRuntime.lastError,
      },
    });
  });

  app.get('/api', (_req, res) => {
    res.json({
      message: 'NeoNEI API',
      version: '1.0.0',
      endpoints: {
        health: '/api/health',
        items: '/api/items',
        mods: '/api/items/mods',
        indexedRecipes: '/api/recipes-indexed',
        multiblocks: '/api/multiblocks/:controllerItemId',
        gtDiagrams: '/api/gt-diagrams/overview',
        forestryGenetics: '/api/forestry-genetics/overview',
        patterns: '/api/patterns',
        publishManifest: '/api/publish/manifest',
      },
    });
  });

  app.get('/api/openapi.json', (_req, res) => {
    setPublicCacheHeaders(res, {
      maxAgeSeconds: 300,
      staleWhileRevalidateSeconds: 3600,
      staleIfErrorSeconds: 86400,
    });
    res.json({
      openapi: '3.1.0',
      info: {
        title: 'NeoNEI Public Runtime API',
        version: '1.0.0',
      },
      paths: {
        '/api/health': { get: { summary: 'Runtime health and acceleration status' } },
        '/runtime/health': { get: { summary: 'Product-semantic runtime health endpoint' } },
        '/runtime/manifest': { get: { summary: 'Active runtime manifest' } },
        '/runtime/contracts': { get: { summary: 'Runtime contract index' } },
        '/runtime/diagnostics': { get: { summary: 'Public runtime readiness diagnostics' } },
        '/ops/runtime': { get: { summary: 'Token-protected runtime diagnostics' } },
        '/ops/acceleration/reconcile': { post: { summary: 'Token-protected rebuild/materialize trigger' } },
        '/lab/items': { get: { summary: 'Development compatibility item queries' } },
        '/lab/recipes': { get: { summary: 'Development compatibility recipe queries' } },
        '/api/v1/health': { get: { summary: 'Legacy compatibility runtime health endpoint' } },
        '/api/v1/runtime/manifest': { get: { summary: 'Legacy compatibility active runtime manifest' } },
        '/api/v1/runtime/contracts': { get: { summary: 'Legacy compatibility runtime contract index' } },
        '/api/publish/manifest': { get: { summary: 'No-cache active publish manifest' } },
        '/api/publish/home-bootstrap': { get: { summary: 'Fallback home bootstrap payload' } },
        '/publish/{artifactPath}': { get: { summary: 'Immutable static publish artifacts except active manifests' } },
        '/api/admin/acceleration/reconcile': { post: { summary: 'Token-protected rebuild/materialize trigger' } },
        '/api/admin/runtime': { get: { summary: 'Token-protected runtime diagnostics' } },
      },
    });
  });

  const sendRuntimeDiagnostics = (req: Request, res: Response): void => {
    if (!requireAdminToken(req, res)) {
      return;
    }
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      acceleration: accelerationRuntime,
      publish: {
        outputDir: PUBLISH_OUTPUT_DIR,
        exists: fs.existsSync(PUBLISH_OUTPUT_DIR),
      },
    });
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
    if (accelerationRuntime.phase === 'compiling' || accelerationRuntime.phase === 'promoting' || accelerationRuntime.blocking) {
      sendErrorEnvelope(req, res, 409, 'ACCELERATION_RECONCILE_IN_PROGRESS', 'Acceleration reconcile is already in progress', {
        phase: accelerationRuntime.phase,
        blocking: accelerationRuntime.blocking,
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
      phase: accelerationRuntime.phase,
      message: 'Acceleration reconciliation scheduled.',
    });
  };

  app.post('/ops/acceleration/reconcile', scheduleReconcile('OPS'));
  app.post('/api/admin/acceleration/reconcile', scheduleReconcile('ADMIN'));
}
