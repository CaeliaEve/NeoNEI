import express, { type Request, type Response } from 'express';
import cors from 'cors';
import fs from 'fs';
import compression from 'compression';
import { getAccelerationDatabaseManager, getDatabaseManager } from './models/database';
import { IMAGES_PATH } from './config/runtime-paths';
import { requestObservability } from './middleware/request-observability';
import { errorHandler } from './middleware/error-handler';
import { logger } from './utils/logger';
import { getRecipeBootstrapService } from './services/recipe-bootstrap.service';
import { getPageAtlasService } from './services/page-atlas.service';
import { getAutowarmPolicy } from './config/autowarm-policy';
import { sendErrorEnvelope } from './utils/error-response';
import { createAdminAccessGuard } from './utils/admin-access';
import { registerStaticAssetRoutes } from './routes/static-assets.routes';
import { registerRuntimeAdminRoutes } from './routes/runtime-admin.routes';
import { registerApiNamespaces } from './routes/api-namespaces.routes';
import {
  accelerationRuntime,
  createAccelerationRuntimeMiddleware,
  reconcileAccelerationRuntime,
  setAccelerationRuntimePhase,
} from './services/acceleration-runtime.service';

const app = express();
const parsedPort = Number(process.env.PORT);
const PORT = Number.isFinite(parsedPort) && parsedPort > 0 ? parsedPort : 3002;
const HOST = process.env.HOST?.trim() || '0.0.0.0';
const PUBLIC_BASE_URL =
  process.env.PUBLIC_BASE_URL?.trim().replace(/\/+$/, '') ||
  `http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`;
const requireAdminToken = createAdminAccessGuard({
  token: process.env.NEONEI_ADMIN_TOKEN?.trim() || process.env.ADMIN_TOKEN?.trim() || '',
  rateLimitWindowMs: Number(process.env.NEONEI_ADMIN_RATE_LIMIT_WINDOW_MS ?? 60_000),
  rateLimitMax: Number(process.env.NEONEI_ADMIN_RATE_LIMIT_MAX ?? 12),
});

function isEnvEnabled(value: string | undefined): boolean {
  return value === '1' || value?.toLowerCase() === 'true';
}

const PUBLISH_MATERIALIZE_ON_START = isEnvEnabled(process.env.NEONEI_PUBLISH_MATERIALIZE_ON_START);
const PUBLIC_RUNTIME_ONLY = isEnvEnabled(process.env.NEONEI_PUBLIC_RUNTIME_ONLY);
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
    publishMaterializeOnStart: PUBLISH_MATERIALIZE_ON_START,
  }),
  setAccelerationRuntimePhase,
});

registerApiNamespaces(app, { publicRuntimeOnly: PUBLIC_RUNTIME_ONLY });

app.use((req, res) => {
  sendErrorEnvelope(req, res, 404, 'NOT_FOUND', 'Route not found', {
    path: req.originalUrl ?? req.url,
  });
});
app.use(errorHandler);

async function startServer() {
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

    app.listen(PORT, HOST, () => {
      if (!fs.existsSync(IMAGES_PATH)) {
        logger.warn(`[WARN] IMAGES_PATH does not exist: ${IMAGES_PATH}`);
      }
      logger.info(`Server listening on ${HOST}:${PORT}`);
      logger.info(`Public URL: ${PUBLIC_BASE_URL}`);
      logger.info(`API endpoint: ${PUBLIC_BASE_URL}/api`);
      logger.info(`Items API: ${PUBLIC_BASE_URL}/api/items`);
      logger.info(`Images path: ${IMAGES_PATH}`);
      logger.info(`Public runtime only: ${PUBLIC_RUNTIME_ONLY}`);

      setTimeout(() => {
        void reconcileAccelerationRuntime(accelerationDbManager, {
          publishMaterializeOnStart: PUBLISH_MATERIALIZE_ON_START,
        }).catch((error) => {
          const message = error instanceof Error ? error.message : String(error);
          setAccelerationRuntimePhase('error', 'Acceleration reconciliation failed.', {
            stale: true,
            lastError: message,
          });
          logger.error('[ACCELERATION_DB] background reconciliation failed', error);
        });
      }, 150);

      const autowarmPolicy = getAutowarmPolicy();
      if (autowarmPolicy.recipeBootstrap.enabled) {
        setTimeout(() => {
          void getRecipeBootstrapService()
            .prewarmBootstrapCache({ limit: autowarmPolicy.recipeBootstrap.limit })
            .then((result) => {
              logger.info('[RECIPE_BOOTSTRAP_AUTOWARM] completed', {
                warmed: result.warmed,
                skipped: result.skipped,
                limit: autowarmPolicy.recipeBootstrap.limit,
              });
            })
            .catch((error) => {
              logger.warn('[RECIPE_BOOTSTRAP_AUTOWARM] failed', error);
            });
        }, 500);
      }

      if (autowarmPolicy.recipeShard.enabled) {
        setTimeout(() => {
          void getRecipeBootstrapService()
            .prewarmShardCache({ limit: autowarmPolicy.recipeShard.limit })
            .then((result) => {
              logger.info('[RECIPE_SHARD_AUTOWARM] completed', {
                warmed: result.warmed,
                skipped: result.skipped,
                limit: autowarmPolicy.recipeShard.limit,
              });
            })
            .catch((error) => {
              logger.warn('[RECIPE_SHARD_AUTOWARM] failed', error);
            });
        }, 1800);
      }

      if (autowarmPolicy.pageAtlas.enabled) {
        setTimeout(() => {
          void getPageAtlasService()
            .prewarmPages({
              pages: autowarmPolicy.pageAtlas.pages,
              pageSize: autowarmPolicy.pageAtlas.pageSize,
              itemSize: autowarmPolicy.pageAtlas.itemSize,
            })
            .then((result) => {
              logger.info('[PAGE_ATLAS_AUTOWARM] completed', {
                warmed: result.warmed,
                pages: autowarmPolicy.pageAtlas.pages,
                pageSize: autowarmPolicy.pageAtlas.pageSize,
                itemSize: autowarmPolicy.pageAtlas.itemSize,
              });
            })
            .catch((error) => {
              logger.warn('[PAGE_ATLAS_AUTOWARM] failed', error);
            });
        }, 1200);
      }
    });
  } catch (error) {
    logger.error('Failed to start server', error);
    process.exit(1);
  }
}

void startServer();



