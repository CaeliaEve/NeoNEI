import express, { type Express } from 'express';
import cors from 'cors';
import compression from 'compression';
import type { Request, Response } from 'express';
import type { getAccelerationDatabaseManager } from './models/database';
import { requestObservability } from './middleware/request-observability';
import { errorHandler } from './middleware/error-handler';
import { sendErrorEnvelope } from './utils/error-response';
import { registerStaticAssetRoutes } from './routes/static-assets.routes';
import { registerRuntimeAdminControlPlaneRoutes } from './routes/runtime-admin-control-plane.routes';
import { registerRuntimeAdminIndexRoutes } from './routes/runtime-admin.routes';
import { registerApiNamespaces } from './routes/api-namespaces.routes';
import type { requireAdminToken, serverSettings } from './config/server-settings';
import { createAccelerationRuntimeMiddleware } from './middleware/acceleration-runtime-gate.middleware';
import {
  getAccelerationRuntimeSnapshot,
  reconcileAccelerationRuntime,
  setAccelerationRuntimePhase,
} from './services/acceleration-runtime.service';

type AccelerationDbManager = ReturnType<typeof getAccelerationDatabaseManager>;
type RuntimeSettings = typeof serverSettings;
type AdminGuard = typeof requireAdminToken;

export interface CreateAppOptions {
  serverSettings: RuntimeSettings;
  requireAdminToken: AdminGuard;
  getRuntimeAccelerationDbManager: () => AccelerationDbManager | null;
}

export function createApp(options: CreateAppOptions): Express {
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: '50mb' }));
  app.use(requestObservability);

  app.use(
    compression({
      filter: (req: Request, res: Response) => {
        if (req.headers['x-no-compression']) {
          return false;
        }
        return compression.filter(req, res);
      },
      level: 6,
      threshold: 1024,
    })
  );

  registerStaticAssetRoutes(app);

  app.use(createAccelerationRuntimeMiddleware());

  registerRuntimeAdminIndexRoutes(app, {
    getAccelerationRuntimeSnapshot,
  });

  registerRuntimeAdminControlPlaneRoutes(app, {
    getAccelerationRuntimeSnapshot,
    requireAdminToken: options.requireAdminToken,
    getRuntimeAccelerationDbManager: options.getRuntimeAccelerationDbManager,
    reconcileAccelerationRuntime: (manager) => reconcileAccelerationRuntime(manager, {
      publishMaterializeOnStart: options.serverSettings.publishMaterializeOnStart,
    }),
    setAccelerationRuntimePhase,
  });

  registerApiNamespaces(app, { publicRuntimeOnly: options.serverSettings.publicRuntimeOnly });

  app.use((req, res) => {
    sendErrorEnvelope(req, res, 404, 'NOT_FOUND', 'Route not found', {
      path: req.originalUrl ?? req.url,
    });
  });
  app.use(errorHandler);

  return app;
}
