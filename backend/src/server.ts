import express, { type Request, type Response } from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import compression from 'compression';
import itemsRoutes from './routes/items.routes';
import patternsRoutes from './routes/patterns.routes';
import indexedRecipesRoutes from './routes/recipes-indexed.routes';
import multiblocksRoutes from './routes/multiblocks.routes';
import ecosystemRoutes from './routes/ecosystem.routes';
import renderContractRoutes from './routes/render-contract.routes';
import recipeBootstrapRoutes from './routes/recipe-bootstrap.routes';
import { getDatabaseManager } from './models/database';
import { DATA_DIR, IMAGES_PATH, NESQL_CANONICAL_DIR } from './config/runtime-paths';
import { requestObservability } from './middleware/request-observability';
import { errorHandler } from './middleware/error-handler';
import { logger } from './utils/logger';
import { getRecipeBootstrapService } from './services/recipe-bootstrap.service';
import { getPageAtlasService } from './services/page-atlas.service';

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

// Item image fallback resolver:
// 1) exact requested file
// 2) drop NBT suffix: internal~damage~nbt.png -> internal~damage.png
app.get('/images/item/:modId/:fileName', (req, res, next) => {
  try {
    const modId = decodeURIComponent(req.params.modId || '');
    const fileName = decodeURIComponent(req.params.fileName || '');
    if (!modId || !fileName || modId.includes('..') || fileName.includes('..')) {
      return next();
    }

    const absolute = path.resolve(IMAGES_PATH, 'item', modId, fileName);
    const itemRoot = path.resolve(IMAGES_PATH, 'item');
    if (!absolute.startsWith(itemRoot)) {
      return next();
    }

    if (fs.existsSync(absolute) && fs.statSync(absolute).isFile()) {
      return res.sendFile(absolute);
    }

    const extensionMatch = fileName.match(/^(.*)\.(png|gif)$/i);
    if (extensionMatch) {
      const stem = extensionMatch[1];
      const alternateExtension = extensionMatch[2].toLowerCase() === 'png' ? 'gif' : 'png';
      const alternateAbsolute = path.resolve(IMAGES_PATH, 'item', modId, `${stem}.${alternateExtension}`);
      if (alternateAbsolute.startsWith(itemRoot) && fs.existsSync(alternateAbsolute) && fs.statSync(alternateAbsolute).isFile()) {
        return res.sendFile(alternateAbsolute);
      }

      const spriteAtlasAbsolute = path.resolve(IMAGES_PATH, 'item', modId, `${stem}.sprite-atlas.png`);
      if (spriteAtlasAbsolute.startsWith(itemRoot) && fs.existsSync(spriteAtlasAbsolute) && fs.statSync(spriteAtlasAbsolute).isFile()) {
        return res.sendFile(spriteAtlasAbsolute);
      }

      const fileDir = path.resolve(IMAGES_PATH, 'item', modId);
      if (fileDir.startsWith(itemRoot) && fs.existsSync(fileDir)) {
        const wildcardGif = fs.readdirSync(fileDir).find((name) => name.startsWith(`${stem}~`) && name.endsWith('.gif'));
        if (wildcardGif) {
          return res.sendFile(path.join(fileDir, wildcardGif));
        }
      }
    }

    const m = fileName.match(/^(.+~\d+)~.+\.png$/i);
    if (!m) {
      return next();
    }

    const baseName = `${m[1]}.png`;
    const fallbackAbsolute = path.resolve(IMAGES_PATH, 'item', modId, baseName);
    if (!fallbackAbsolute.startsWith(itemRoot)) {
      return next();
    }
    if (fs.existsSync(fallbackAbsolute) && fs.statSync(fallbackAbsolute).isFile()) {
      return res.sendFile(fallbackAbsolute);
    }
  } catch {
    // Fall through to static middleware.
  }
  return next();
});

// Fluid image fallback resolver:
// 1) exact requested file
// 2) png <-> gif alternate extension
// 3) native sprite atlas sidecar
app.get('/images/fluid/:modId/:fileName', (req, res, next) => {
  try {
    const modId = decodeURIComponent(req.params.modId || '');
    const fileName = decodeURIComponent(req.params.fileName || '');
    if (!modId || !fileName || modId.includes('..') || fileName.includes('..')) {
      return next();
    }

    const absolute = path.resolve(IMAGES_PATH, 'fluid', modId, fileName);
    const fluidRoot = path.resolve(IMAGES_PATH, 'fluid');
    if (!absolute.startsWith(fluidRoot)) {
      return next();
    }

    if (fs.existsSync(absolute) && fs.statSync(absolute).isFile()) {
      return res.sendFile(absolute);
    }

    const extensionMatch = fileName.match(/^(.*)\.(png|gif)$/i);
    if (!extensionMatch) {
      return next();
    }

    const stem = extensionMatch[1];
    const alternateExtension = extensionMatch[2].toLowerCase() === 'png' ? 'gif' : 'png';
    const alternateAbsolute = path.resolve(IMAGES_PATH, 'fluid', modId, `${stem}.${alternateExtension}`);
    if (alternateAbsolute.startsWith(fluidRoot) && fs.existsSync(alternateAbsolute) && fs.statSync(alternateAbsolute).isFile()) {
      return res.sendFile(alternateAbsolute);
    }

    const spriteAtlasAbsolute = path.resolve(IMAGES_PATH, 'fluid', modId, `${stem}.sprite-atlas.png`);
    if (spriteAtlasAbsolute.startsWith(fluidRoot) && fs.existsSync(spriteAtlasAbsolute) && fs.statSync(spriteAtlasAbsolute).isFile()) {
      return res.sendFile(spriteAtlasAbsolute);
    }
  } catch {
    // Fall through to static middleware.
  }
  return next();
});

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

if (NESQL_CANONICAL_DIR && fs.existsSync(NESQL_CANONICAL_DIR)) {
  app.use(
    '/canonical',
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
      patterns: '/api/patterns',
    },
  });
});

app.use('/api/items', itemsRoutes);
app.use('/api/patterns', patternsRoutes);
app.use('/api/recipes-indexed', indexedRecipesRoutes);
app.use('/api/multiblocks', multiblocksRoutes);
app.use('/api/ecosystem', ecosystemRoutes);
app.use('/api/render-contract', renderContractRoutes);
app.use('/api/recipe-bootstrap', recipeBootstrapRoutes);
app.use(errorHandler);

async function startServer() {
  try {
    logger.info('Initializing database...');
    const dbManager = getDatabaseManager();
    await dbManager.init();
    logger.info('Database ready');

    app.listen(PORT, HOST, () => {
      if (!fs.existsSync(IMAGES_PATH)) {
        logger.warn(`[WARN] IMAGES_PATH does not exist: ${IMAGES_PATH}`);
      }
      logger.info(`Server listening on ${HOST}:${PORT}`);
      logger.info(`Public URL: ${PUBLIC_BASE_URL}`);
      logger.info(`API endpoint: ${PUBLIC_BASE_URL}/api`);
      logger.info(`Items API: ${PUBLIC_BASE_URL}/api/items`);
      logger.info(`Images path: ${IMAGES_PATH}`);

      const autoPrewarm = process.env.RECIPE_BOOTSTRAP_AUTOWARM !== '0';
      if (autoPrewarm) {
        const limit = Number(process.env.RECIPE_BOOTSTRAP_AUTOWARM_LIMIT || 1000);
        setTimeout(() => {
          void getRecipeBootstrapService()
            .prewarmBootstrapCache({ limit: Number.isFinite(limit) && limit > 0 ? limit : undefined })
            .then((result) => {
              logger.info('[RECIPE_BOOTSTRAP_AUTOWARM] completed', {
                warmed: result.warmed,
                skipped: result.skipped,
                limit: Number.isFinite(limit) && limit > 0 ? limit : null,
              });
            })
            .catch((error) => {
              logger.warn('[RECIPE_BOOTSTRAP_AUTOWARM] failed', error);
            });
        }, 500);
      }

      const autoPrewarmAtlas = process.env.PAGE_ATLAS_AUTOWARM !== '0';
      if (autoPrewarmAtlas) {
        const pages = Number(process.env.PAGE_ATLAS_AUTOWARM_PAGES || 4);
        const pageSize = Number(process.env.PAGE_ATLAS_AUTOWARM_PAGE_SIZE || 120);
        const itemSize = Number(process.env.PAGE_ATLAS_AUTOWARM_ITEM_SIZE || 50);
        setTimeout(() => {
          void getPageAtlasService()
            .prewarmPages({
              pages: Number.isFinite(pages) && pages > 0 ? pages : 4,
              pageSize: Number.isFinite(pageSize) && pageSize > 0 ? pageSize : 120,
              itemSize: Number.isFinite(itemSize) && itemSize > 0 ? itemSize : 50,
            })
            .then((result) => {
              logger.info('[PAGE_ATLAS_AUTOWARM] completed', {
                warmed: result.warmed,
                pages: Number.isFinite(pages) && pages > 0 ? pages : 4,
                pageSize: Number.isFinite(pageSize) && pageSize > 0 ? pageSize : 120,
                itemSize: Number.isFinite(itemSize) && itemSize > 0 ? itemSize : 50,
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
