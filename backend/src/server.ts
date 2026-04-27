import express, { type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
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
import { getAccelerationDatabaseManager, getDatabaseManager } from './models/database';
import { DATA_DIR, IMAGES_PATH, NESQL_CANONICAL_DIR, PUBLISH_OUTPUT_DIR, SPLIT_ITEMS_DIR, SPLIT_RECIPES_DIR } from './config/runtime-paths';
import { requestObservability } from './middleware/request-observability';
import { errorHandler } from './middleware/error-handler';
import { logger } from './utils/logger';
import { getRecipeBootstrapService } from './services/recipe-bootstrap.service';
import { getPageAtlasService } from './services/page-atlas.service';
import { getAutowarmPolicy } from './config/autowarm-policy';
import { ensureAccelerationDatabaseReady, ensurePublishPayloadsReady } from './services/acceleration-db-pipeline.service';

const app = express();
const parsedPort = Number(process.env.PORT);
const PORT = Number.isFinite(parsedPort) && parsedPort > 0 ? parsedPort : 3002;
const HOST = process.env.HOST?.trim() || '0.0.0.0';
const PUBLIC_BASE_URL =
  process.env.PUBLIC_BASE_URL?.trim().replace(/\/+$/, '') ||
  `http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`;

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

app.use(express.static(path.join(__dirname, '../public')));

type RequestedArtifactDescriptor = {
  stem: string;
  extension: string;
  variantRegex: RegExp;
  variantRegexes: RegExp[];
};

function isSafeUnderRoot(root: string, candidate: string): boolean {
  return candidate.startsWith(root);
}

function isExistingFile(candidate: string): boolean {
  return fs.existsSync(candidate) && fs.statSync(candidate).isFile();
}

function parseRequestedArtifact(fileName: string): RequestedArtifactDescriptor | null {
  const match = fileName.match(/^(.*?)(\.sprite-atlas\.png|\.sprite\.json|\.render\.json|\.png|\.gif)$/i);
  if (!match) {
    return null;
  }

  const stem = match[1];
  const extension = match[2].toLowerCase();
  const escapedStem = stem.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const variantRegexes =
    extension === '.png' || extension === '.gif'
      ? [
          new RegExp(`^${escapedStem}~.+${extension.replace('.', '\\.')}$`, 'i'),
          new RegExp(`^${escapedStem}~.+\\.sprite-atlas\\.png$`, 'i'),
        ]
      : [new RegExp(`^${escapedStem}~.+${extension.replace('.', '\\.')}$`, 'i')];
  return {
    stem,
    extension,
    variantRegex: variantRegexes[0],
    variantRegexes,
  };
}

function resolveFamilyArtifact(
  family: 'item' | 'fluid',
  modId: string,
  fileName: string,
): string | null {
  const familyRoot = path.resolve(IMAGES_PATH, family);
  const familyDir = path.resolve(familyRoot, modId);
  const direct = path.resolve(familyDir, fileName);

  if (!isSafeUnderRoot(familyRoot, direct) || !isSafeUnderRoot(familyRoot, familyDir)) {
    return null;
  }

  if (isExistingFile(direct)) {
    return direct;
  }

  const descriptor = parseRequestedArtifact(fileName);
  if (!descriptor) {
    return null;
  }

  if (descriptor.extension === '.png' || descriptor.extension === '.gif') {
    const alternateExtension = descriptor.extension === '.png' ? '.gif' : '.png';
    const alternateDirect = path.resolve(familyDir, `${descriptor.stem}${alternateExtension}`);
    if (isSafeUnderRoot(familyRoot, alternateDirect) && isExistingFile(alternateDirect)) {
      return alternateDirect;
    }

    const spriteAtlasDirect = path.resolve(familyDir, `${descriptor.stem}.sprite-atlas.png`);
    if (isSafeUnderRoot(familyRoot, spriteAtlasDirect) && isExistingFile(spriteAtlasDirect)) {
      return spriteAtlasDirect;
    }
  }

  if (!fs.existsSync(familyDir) || !fs.statSync(familyDir).isDirectory()) {
    return null;
  }

  const siblings = fs.readdirSync(familyDir);
  const variantCandidates = siblings.filter((name) =>
    descriptor.variantRegexes.some((regex) => regex.test(name)),
  );
  if (variantCandidates.length > 0) {
    variantCandidates.sort((left, right) => left.localeCompare(right));
    const sameExtension =
      variantCandidates.find((name) => !name.toLowerCase().includes('.sprite-atlas.') && name.toLowerCase().endsWith(descriptor.extension))
      ?? variantCandidates.find((name) => name.toLowerCase().endsWith('.gif'))
      ?? variantCandidates.find((name) => name.toLowerCase().endsWith('.sprite-atlas.png'));
    const chosen = sameExtension ?? variantCandidates[0];
    const resolved = path.resolve(familyDir, chosen);
    if (isSafeUnderRoot(familyRoot, resolved) && isExistingFile(resolved)) {
      return resolved;
    }
  }

  const baseNbtMatch = fileName.match(/^(.+~\d+)~.+(\.png|\.gif)$/i);
  if (baseNbtMatch) {
    const fallback = path.resolve(familyDir, `${baseNbtMatch[1]}${baseNbtMatch[2]}`);
    if (isSafeUnderRoot(familyRoot, fallback) && isExistingFile(fallback)) {
      return fallback;
    }
  }

  return null;
}

function createArtifactFallbackRoute(family: 'item' | 'fluid') {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const modId = decodeURIComponent(req.params.modId || '');
      const fileName = decodeURIComponent(req.params.fileName || '');
      if (!modId || !fileName || modId.includes('..') || fileName.includes('..')) {
        return next();
      }

      const resolved = resolveFamilyArtifact(family, modId, fileName);
      if (resolved) {
        return res.sendFile(resolved);
      }
    } catch {
      // Fall through to static middleware.
    }
    return next();
  };
}

function createRawStaticRoute(rootDir: string, options?: { maxAge?: string; immutable?: boolean }) {
  const resolvedRoot = path.resolve(rootDir);
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const rawPath = `${req.url ?? ''}`.split('?')[0] || '/';
      const normalizedRelativePath = rawPath.replace(/^\/+/, '');
      if (!normalizedRelativePath) {
        return next();
      }

      const segments = normalizedRelativePath.split('/').filter(Boolean);
      if (segments.some((segment) => segment === '.' || segment === '..')) {
        return next();
      }

      const absolutePath = path.resolve(resolvedRoot, ...segments);
      if (!isSafeUnderRoot(resolvedRoot, absolutePath) || !isExistingFile(absolutePath)) {
        return next();
      }

      return res.sendFile(absolutePath, {
        cacheControl: true,
        immutable: options?.immutable ?? false,
        maxAge: options?.maxAge ?? 0,
        lastModified: true,
      });
    } catch {
      return next();
    }
  };
}

const PUBLISH_STATIC_SIDECAR_VARIANTS = [
  { encoding: 'br' as const, extension: '.br' as const },
  { encoding: 'gzip' as const, extension: '.gz' as const },
];

function canServePrecompressedPublishAsset(relativePath: string): boolean {
  return relativePath.toLowerCase().endsWith('.json');
}

function acceptsEncoding(rawHeader: string | string[] | undefined, encoding: 'br' | 'gzip'): boolean {
  const header = Array.isArray(rawHeader) ? rawHeader.join(',') : `${rawHeader ?? ''}`;
  return header
    .split(',')
    .map((token) => token.trim().toLowerCase())
    .some((token) => token === encoding || token.startsWith(`${encoding};`) || token === '*');
}

function createPublishStaticRoute(rootDir: string, options?: { maxAge?: string; immutable?: boolean }) {
  const resolvedRoot = path.resolve(rootDir);
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const rawPath = `${req.url ?? ''}`.split('?')[0] || '/';
      const normalizedRelativePath = rawPath.replace(/^\/+/, '');
      if (!normalizedRelativePath) {
        return next();
      }

      const segments = normalizedRelativePath.split('/').filter(Boolean);
      if (segments.some((segment) => segment === '.' || segment === '..')) {
        return next();
      }

      const absolutePath = path.resolve(resolvedRoot, ...segments);
      if (!isSafeUnderRoot(resolvedRoot, absolutePath) || !isExistingFile(absolutePath)) {
        return next();
      }

      let responsePath = absolutePath;
      let contentEncoding: 'br' | 'gzip' | null = null;
      if (!req.headers['x-no-compression'] && canServePrecompressedPublishAsset(normalizedRelativePath)) {
        for (const variant of PUBLISH_STATIC_SIDECAR_VARIANTS) {
          const candidatePath = `${absolutePath}${variant.extension}`;
          if (acceptsEncoding(req.headers['accept-encoding'], variant.encoding) && isExistingFile(candidatePath)) {
            responsePath = candidatePath;
            contentEncoding = variant.encoding;
            break;
          }
        }
      }

      if (canServePrecompressedPublishAsset(normalizedRelativePath)) {
        res.setHeader('Vary', 'Accept-Encoding');
      }
      if (contentEncoding) {
        res.setHeader('Content-Encoding', contentEncoding);
        res.type(path.extname(absolutePath));
      }

      return res.sendFile(responsePath, {
        cacheControl: true,
        immutable: options?.immutable ?? false,
        maxAge: options?.maxAge ?? 0,
        lastModified: true,
      });
    } catch {
      return next();
    }
  };
}

app.get('/images/item/:modId/:fileName', createArtifactFallbackRoute('item'));
app.get('/images/fluid/:modId/:fileName', createArtifactFallbackRoute('fluid'));

app.use(
  '/images',
  express.static(IMAGES_PATH, {
    maxAge: '7d',
    etag: true,
  })
);

app.use(
  '/generated/page-atlas',
  express.static(path.join(DATA_DIR, 'page-atlas-cache'), {
    maxAge: '7d',
    etag: true,
  })
);

app.use(
  '/api/generated/page-atlas',
  express.static(path.join(DATA_DIR, 'page-atlas-cache'), {
    maxAge: '7d',
    etag: true,
  })
);

app.use(
  '/publish',
  createPublishStaticRoute(PUBLISH_OUTPUT_DIR, {
    maxAge: '365d',
    immutable: true,
  }),
);

app.use(
  '/publish',
  express.static(PUBLISH_OUTPUT_DIR, {
    maxAge: '365d',
    immutable: true,
    etag: true,
  })
);

if (NESQL_CANONICAL_DIR && fs.existsSync(NESQL_CANONICAL_DIR)) {
  app.use(
    '/canonical',
    express.static(NESQL_CANONICAL_DIR, {
      maxAge: '7d',
      etag: true,
    })
  );

  app.use(
    '/api/canonical',
    express.static(NESQL_CANONICAL_DIR, {
      maxAge: '7d',
      etag: true,
    })
  );
}

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
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

app.use('/api/items', itemsRoutes);
app.use('/api/patterns', patternsRoutes);
app.use('/api/recipes-indexed', indexedRecipesRoutes);
app.use('/api/multiblocks', multiblocksRoutes);
app.use('/api/ecosystem', ecosystemRoutes);
app.use('/api/gt-diagrams', gtDiagramsRoutes);
app.use('/api/forestry-genetics', forestryGeneticsRoutes);
app.use('/api/render-contract', renderContractRoutes);
app.use('/api/recipe-bootstrap', recipeBootstrapRoutes);
app.use('/api/publish', publishRoutes);
app.use(errorHandler);

async function startServer() {
  try {
    logger.info('Initializing database...');
    const dbManager = getDatabaseManager();
    await dbManager.init();
    logger.info('Database ready');

    const accelerationDbManager = getAccelerationDatabaseManager();
    logger.info('Initializing acceleration database...');
    const compileResult = await ensureAccelerationDatabaseReady({
      manager: accelerationDbManager,
      sourceRoots: {
        itemsDir: SPLIT_ITEMS_DIR,
        recipesDir: SPLIT_RECIPES_DIR,
        canonicalDir: NESQL_CANONICAL_DIR,
        imageRoot: IMAGES_PATH,
      },
    });
    logger.info('Acceleration database ready');
    if (compileResult) {
      logger.info('[ACCELERATION_DB] compiled', {
        itemsImported: compileResult.itemsImported,
        signature: compileResult.signature,
      });
    } else {
      logger.info('[ACCELERATION_DB] already fresh');
    }

    const publishPayloadsMaterialized = await ensurePublishPayloadsReady({
      manager: accelerationDbManager,
      sourceRoots: {
        itemsDir: SPLIT_ITEMS_DIR,
        recipesDir: SPLIT_RECIPES_DIR,
        canonicalDir: NESQL_CANONICAL_DIR,
        imageRoot: IMAGES_PATH,
      },
    });
    if (publishPayloadsMaterialized) {
      logger.info('[PUBLISH_PAYLOADS] materialized in-place');
    } else {
      logger.info('[PUBLISH_PAYLOADS] already fresh');
    }

    app.listen(PORT, HOST, () => {
      if (!fs.existsSync(IMAGES_PATH)) {
        logger.warn(`[WARN] IMAGES_PATH does not exist: ${IMAGES_PATH}`);
      }
      logger.info(`Server listening on ${HOST}:${PORT}`);
      logger.info(`Public URL: ${PUBLIC_BASE_URL}`);
      logger.info(`API endpoint: ${PUBLIC_BASE_URL}/api`);
      logger.info(`Items API: ${PUBLIC_BASE_URL}/api/items`);
      logger.info(`Images path: ${IMAGES_PATH}`);

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
