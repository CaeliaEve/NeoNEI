import express, { type Request, type Response } from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { spawn } from 'child_process';
import compression from 'compression';
import itemsRoutes from './routes/items.routes';
import patternsRoutes from './routes/patterns.routes';
import indexedRecipesRoutes from './routes/recipes-indexed.routes';
import multiblocksRoutes from './routes/multiblocks.routes';
import ecosystemRoutes from './routes/ecosystem.routes';
import gtDiagramsRoutes from './routes/gt-diagrams.routes';
import forestryGeneticsRoutes from './routes/forestry-genetics.routes';
import renderContractRoutes from './routes/render-contract.routes';
import recipeBootstrapRoutes from './routes/recipe-bootstrap.routes';
import publishRoutes from './routes/publish.routes';
import runtimeRoutes from './routes/runtime.routes';
import v1Routes from './routes/v1.routes';
import { getAccelerationDatabaseManager, getDatabaseManager } from './models/database';
import { IMAGES_PATH, NESQL_CANONICAL_DIR, SPLIT_ITEMS_DIR, SPLIT_RECIPES_DIR } from './config/runtime-paths';
import { requestObservability } from './middleware/request-observability';
import { errorHandler } from './middleware/error-handler';
import { logger } from './utils/logger';
import { getRecipeBootstrapService } from './services/recipe-bootstrap.service';
import { getPageAtlasService } from './services/page-atlas.service';
import { getAutowarmPolicy } from './config/autowarm-policy';
import { NeoNeiCompilerService, type CompilerSourceRoots } from './services/neonei-compiler.service';
import { promoteCompiledAccelerationDatabase } from './services/acceleration-db-pipeline.service';
import { sendErrorEnvelope } from './utils/error-response';
import { createAdminAccessGuard } from './utils/admin-access';
import { registerStaticAssetRoutes } from './routes/static-assets.routes';
import { registerRuntimeAdminRoutes } from './routes/runtime-admin.routes';

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

type AccelerationRuntimePhase =
  | 'initializing'
  | 'ready'
  | 'stale'
  | 'compiling'
  | 'promoting'
  | 'materializing'
  | 'error';

const accelerationRuntime = {
  phase: 'initializing' as AccelerationRuntimePhase,
  message: 'starting',
  activeApiRequests: 0,
  blocking: false,
  stale: false,
  lastCompiledSignature: null as string | null,
  lastError: null as string | null,
};
let runtimeAccelerationDbManager: ReturnType<typeof getAccelerationDatabaseManager> | null = null;

const ACCELERATION_SOURCE_ROOTS: CompilerSourceRoots = {
  itemsDir: SPLIT_ITEMS_DIR,
  recipesDir: SPLIT_RECIPES_DIR,
  canonicalDir: NESQL_CANONICAL_DIR,
  imageRoot: IMAGES_PATH,
};

function setAccelerationRuntimePhase(
  phase: AccelerationRuntimePhase,
  message: string,
  extras?: Partial<Pick<typeof accelerationRuntime, 'stale' | 'lastCompiledSignature' | 'lastError'>>,
): void {
  accelerationRuntime.phase = phase;
  accelerationRuntime.message = message;
  if (typeof extras?.stale === 'boolean') {
    accelerationRuntime.stale = extras.stale;
  }
  if (typeof extras?.lastCompiledSignature !== 'undefined') {
    accelerationRuntime.lastCompiledSignature = extras.lastCompiledSignature;
  }
  if (typeof extras?.lastError !== 'undefined') {
    accelerationRuntime.lastError = extras.lastError;
  }
}

type BackgroundCompileSummary = {
  ok: true;
  stage: string;
  itemsImported: number;
  recipesImported: number;
  hotAtlasesGenerated: number;
  signature: string;
};

type BackgroundPublishSummary = {
  ok: true;
  materialized: boolean;
};

function pipeChildOutput(prefix: string, chunk: Buffer, onStructuredLine?: (line: string) => void): void {
  const text = chunk.toString('utf8');
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }
    if (onStructuredLine) {
      onStructuredLine(line);
    }
    logger.info(`${prefix} ${line}`);
  }
}

function runBackgroundNodeJob<T extends { ok: true }>(
  label: string,
  resultPrefix: string,
  inlineCode: string,
  extraEnv?: NodeJS.ProcessEnv,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let result: T | null = null;
    let stderrBuffer = '';
    const child = spawn(process.execPath, ['-e', inlineCode], {
      cwd: path.resolve(__dirname, '..'),
      env: {
        ...process.env,
        ...extraEnv,
      },
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    child.stdout.on('data', (chunk: Buffer) => {
      pipeChildOutput('[ACCEL_CHILD]', chunk, (line) => {
        if (!line.startsWith(resultPrefix)) {
          return;
        }
        try {
          result = JSON.parse(line.slice(resultPrefix.length).trim()) as T;
        } catch (error) {
          reject(error);
        }
      });
    });

    child.stderr.on('data', (chunk: Buffer) => {
      stderrBuffer += chunk.toString('utf8');
      pipeChildOutput('[ACCEL_CHILD_ERR]', chunk);
    });

    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0 && result) {
        resolve(result);
        return;
      }
      reject(
        new Error(
          `Background job failed (${label}) with code ${code ?? 'unknown'}${stderrBuffer ? `: ${stderrBuffer.trim()}` : ''}`,
        ),
      );
    });
  });
}

function compileAccelerationSnapshotInChild(candidateDbPath: string): Promise<BackgroundCompileSummary> {
  const inlineCode = `
const { compileAccelerationDatabase } = require('./dist/services/acceleration-db-pipeline.service.js');
const { IMAGES_PATH, NESQL_CANONICAL_DIR, SPLIT_ITEMS_DIR, SPLIT_RECIPES_DIR } = require('./dist/config/runtime-paths.js');
compileAccelerationDatabase({
  targetDbPath: process.env.ACCELERATION_DB_FILE,
  sourceRoots: {
    itemsDir: SPLIT_ITEMS_DIR,
    recipesDir: SPLIT_RECIPES_DIR,
    canonicalDir: NESQL_CANONICAL_DIR,
    imageRoot: IMAGES_PATH,
  },
}).then((result) => {
  console.log('ACCEL_COMPILE_RESULT ' + JSON.stringify({
    ok: true,
    stage: 'stage-4',
    itemsImported: result.itemsImported,
    recipesImported: result.recipesImported,
    hotAtlasesGenerated: result.hotAtlasesGenerated,
    signature: result.signature,
  }));
  process.exit(0);
}).catch((error) => {
  console.error(error);
  process.exit(1);
});
`;
  return runBackgroundNodeJob<BackgroundCompileSummary>(
    'compile-acceleration-db',
    'ACCEL_COMPILE_RESULT',
    inlineCode,
    {
      ACCELERATION_DB_FILE: candidateDbPath,
    },
  );
}

function materializePublishPayloadsInChild(): Promise<BackgroundPublishSummary> {
  const inlineCode = `
const { IMAGES_PATH, NESQL_CANONICAL_DIR, SPLIT_ITEMS_DIR, SPLIT_RECIPES_DIR } = require('./dist/config/runtime-paths.js');
const { getAccelerationDatabaseManager } = require('./dist/models/database.js');
const { ensurePublishPayloadsReady } = require('./dist/services/acceleration-db-pipeline.service.js');
(async () => {
  const manager = getAccelerationDatabaseManager();
  await manager.init();
  try {
    const materialized = await ensurePublishPayloadsReady({
      manager,
      sourceRoots: {
        itemsDir: SPLIT_ITEMS_DIR,
        recipesDir: SPLIT_RECIPES_DIR,
        canonicalDir: NESQL_CANONICAL_DIR,
        imageRoot: IMAGES_PATH,
      },
    });
    console.log('PUBLISH_PAYLOAD_RESULT ' + JSON.stringify({ ok: true, materialized }));
  } finally {
    manager.close();
  }
  process.exit(0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
`;
  return runBackgroundNodeJob<BackgroundPublishSummary>(
    'materialize-publish-payloads',
    'PUBLISH_PAYLOAD_RESULT',
    inlineCode,
  );
}

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

function isTrackedAccelerationApiRequest(req: Request): boolean {
  const routePath = `${req.originalUrl ?? req.url ?? ''}`.split('?')[0] || '';
  return routePath.startsWith('/api') && routePath !== '/api/health';
}

app.use((req, res, next) => {
  if (!isTrackedAccelerationApiRequest(req)) {
    return next();
  }

  if (accelerationRuntime.blocking) {
    res.setHeader('Retry-After', '1');
    return sendErrorEnvelope(
      req,
      res,
      503,
      'ACCELERATION_RUNTIME_WARMING',
      'Acceleration database is switching snapshots. Retry shortly.',
      {
        status: 'warming',
        phase: accelerationRuntime.phase,
      },
    );
  }

  accelerationRuntime.activeApiRequests += 1;
  let released = false;
  const release = () => {
    if (released) {
      return;
    }
    released = true;
    accelerationRuntime.activeApiRequests = Math.max(0, accelerationRuntime.activeApiRequests - 1);
  };

  res.on('finish', release);
  res.on('close', release);
  return next();
});

async function waitForAccelerationApiIdle(timeoutMs = 5000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (accelerationRuntime.activeApiRequests > 0 && Date.now() < deadline) {
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

async function reconcileAccelerationRuntime(accelerationDbManager: ReturnType<typeof getAccelerationDatabaseManager>): Promise<void> {
  const compiler = new NeoNeiCompilerService(accelerationDbManager, ACCELERATION_SOURCE_ROOTS);
  const candidateDbPath = `${accelerationDbManager.getDbPath()}.next`;

  if (!compiler.isAccelerationStateFresh()) {
    setAccelerationRuntimePhase('stale', 'Acceleration snapshot is stale; compiling next snapshot in background.', {
      stale: true,
      lastError: null,
    });
    logger.info('[ACCELERATION_DB] stale; runtime will stay online while compiling next snapshot');
    if (fs.existsSync(candidateDbPath)) {
      fs.rmSync(candidateDbPath, { force: true });
    }

    setAccelerationRuntimePhase('compiling', 'Compiling next acceleration snapshot in background.', {
      stale: true,
    });
    const compileResult = await compileAccelerationSnapshotInChild(candidateDbPath);

    setAccelerationRuntimePhase('promoting', 'Promoting freshly compiled acceleration snapshot.', {
      stale: true,
      lastCompiledSignature: compileResult.signature,
    });
    accelerationRuntime.blocking = true;
    try {
      await waitForAccelerationApiIdle();
      await promoteCompiledAccelerationDatabase({
        manager: accelerationDbManager,
        compiledDbPath: candidateDbPath,
      });
    } finally {
      accelerationRuntime.blocking = false;
    }

    setAccelerationRuntimePhase('ready', 'Acceleration snapshot refreshed.', {
      stale: false,
      lastCompiledSignature: compileResult.signature,
      lastError: null,
    });
    logger.info('[ACCELERATION_DB] promoted background snapshot', {
      itemsImported: compileResult.itemsImported,
      recipesImported: compileResult.recipesImported,
      signature: compileResult.signature,
    });
    setAccelerationRuntimePhase('ready', 'Acceleration runtime ready.', {
      stale: false,
      lastError: null,
    });
    return;
  }

  if (!PUBLISH_MATERIALIZE_ON_START) {
    logger.info('[PUBLISH_PAYLOADS] startup materialization skipped; set NEONEI_PUBLISH_MATERIALIZE_ON_START=1 to refresh publish bundles on boot');
    setAccelerationRuntimePhase('ready', 'Acceleration runtime ready.', {
      stale: false,
      lastError: null,
    });
    return;
  }

  setAccelerationRuntimePhase('materializing', 'Refreshing publish hot payloads.', {
    stale: false,
    lastError: null,
  });
  const publishPayloadsResult = await materializePublishPayloadsInChild();
  logger.info(
    publishPayloadsResult.materialized
      ? '[PUBLISH_PAYLOADS] materialized in background'
      : '[PUBLISH_PAYLOADS] already fresh',
  );
  setAccelerationRuntimePhase('ready', 'Acceleration runtime ready.', {
    stale: false,
    lastError: null,
  });
}

registerRuntimeAdminRoutes(app, {
  accelerationRuntime,
  requireAdminToken,
  getRuntimeAccelerationDbManager: () => runtimeAccelerationDbManager,
  reconcileAccelerationRuntime,
  setAccelerationRuntimePhase,
});

app.use('/runtime', (_req, res, next) => {
  res.setHeader('x-neonei-api-tier', 'public-runtime');
  next();
}, runtimeRoutes);
if (!PUBLIC_RUNTIME_ONLY) {
  app.use('/lab', (_req, res, next) => {
    res.setHeader('x-neonei-api-tier', 'dev-compat');
    next();
  });
  app.use('/lab/items', itemsRoutes);
  app.use('/lab/patterns', patternsRoutes);
  app.use('/lab/recipes', indexedRecipesRoutes);
  app.use('/lab/recipe-bootstrap', recipeBootstrapRoutes);
  app.use('/lab/publish', publishRoutes);
  app.use('/lab/render-contract', renderContractRoutes);
  app.use('/lab/multiblocks', multiblocksRoutes);
  app.use('/lab/ecosystem', ecosystemRoutes);
  app.use('/lab/gt-diagrams', gtDiagramsRoutes);
  app.use('/lab/forestry-genetics', forestryGeneticsRoutes);
}

app.use('/api', (_req, res, next) => {
  res.setHeader('x-neonei-api-tier', 'legacy-compat');
  next();
});
if (!PUBLIC_RUNTIME_ONLY) {
  app.use('/api/items', itemsRoutes);
  app.use('/api/patterns', patternsRoutes);
  app.use('/api/recipes-indexed', indexedRecipesRoutes);
  app.use('/api/multiblocks', multiblocksRoutes);
  app.use('/api/ecosystem', ecosystemRoutes);
  app.use('/api/gt-diagrams', gtDiagramsRoutes);
  app.use('/api/forestry-genetics', forestryGeneticsRoutes);
  app.use('/api/render-contract', renderContractRoutes);
  app.use('/api/recipe-bootstrap', recipeBootstrapRoutes);
}
app.use('/api/publish', publishRoutes);
app.use('/api/v1', v1Routes);
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
        void reconcileAccelerationRuntime(accelerationDbManager).catch((error) => {
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
