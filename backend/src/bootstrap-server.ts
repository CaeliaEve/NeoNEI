import express, { type Request, type Response } from 'express';
import cors from 'cors';
import fs from 'fs';
import compression from 'compression';
import { getAccelerationDatabaseManager, getDatabaseManager } from './models/database';
import { IMAGES_PATH } from './config/runtime-paths';
import { requestObservability } from './middleware/request-observability';
import { errorHandler } from './middleware/error-handler';
import { logger } from './utils/logger';
import { sendErrorEnvelope } from './utils/error-response';
import { registerStaticAssetRoutes } from './routes/static-assets.routes';
import { registerRuntimeAdminRoutes } from './routes/runtime-admin.routes';
import { registerApiNamespaces } from './routes/api-namespaces.routes';
import { scheduleStartupAutowarm } from './services/startup-autowarm.service';
import { requireAdminToken, serverSettings } from './config/server-settings';
import {
  accelerationRuntime,
  createAccelerationRuntimeMiddleware,
  reconcileAccelerationRuntime,
  setAccelerationRuntimePhase,
} from './services/acceleration-runtime.service';

export const app = express();
let runtimeAccelerationDbManager: ReturnType<typeof getAccelerationDatabaseManager> | null = null;

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

registerRuntimeAdminRoutes(app, {
  accelerationRuntime,
  requireAdminToken,
  getRuntimeAccelerationDbManager: () => runtimeAccelerationDbManager,
  reconcileAccelerationRuntime: (manager) => reconcileAccelerationRuntime(manager, {
    publishMaterializeOnStart: serverSettings.publishMaterializeOnStart,
  }),
  setAccelerationRuntimePhase,
});

registerApiNamespaces(app, { publicRuntimeOnly: serverSettings.publicRuntimeOnly });

app.use((req, res) => {
  sendErrorEnvelope(req, res, 404, 'NOT_FOUND', 'Route not found', {
    path: req.originalUrl ?? req.url,
  });
});
app.use(errorHandler);

export async function startServer() {
  try {
    setAccelerationRuntimePhase('initializing', 'Initializing databases...', {
      stale: false,
      lastCompiledSignature: null,
      lastError: null,
    });
    logger.info('Initializing database...');
    const dbManager = getDatabaseManager();
    await dbManager.init();
    logger.info('Database ready');

    const accelerationDbManager = getAccelerationDatabaseManager();
    logger.info('Initializing acceleration database...');
    logger.info('Acceleration database ready');
    await accelerationDbManager.init();
    runtimeAccelerationDbManager = accelerationDbManager;
    setAccelerationRuntimePhase('ready', 'Acceleration database opened; background reconciliation pending.', {
      stale: false,
      lastError: null,
    });

    app.listen(serverSettings.port, serverSettings.host, () => {
      if (!fs.existsSync(IMAGES_PATH)) {
        logger.warn(`[WARN] IMAGES_PATH does not exist: ${IMAGES_PATH}`);
      }
      logger.info(`Server listening on ${serverSettings.host}:${serverSettings.port}`);
      logger.info(`Public URL: ${serverSettings.publicBaseUrl}`);
      logger.info(`API endpoint: ${serverSettings.publicBaseUrl}/api`);
      logger.info(`Items API: ${serverSettings.publicBaseUrl}/api/items`);
      logger.info(`Images path: ${IMAGES_PATH}`);
      logger.info(`Public runtime only: ${serverSettings.publicRuntimeOnly}`);

      setTimeout(() => {
        void reconcileAccelerationRuntime(accelerationDbManager, {
          publishMaterializeOnStart: serverSettings.publishMaterializeOnStart,
        }).catch((error) => {
          const message = error instanceof Error ? error.message : String(error);
          setAccelerationRuntimePhase('error', 'Acceleration reconciliation failed.', {
            stale: true,
            lastError: message,
          });
          logger.error('[ACCELERATION_DB] background reconciliation failed', error);
        });
      }, 150);

      scheduleStartupAutowarm();
    });
  } catch (error) {
    logger.error('Failed to start server', error);
    process.exit(1);
  }
}

void startServer();






