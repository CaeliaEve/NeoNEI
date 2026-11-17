import express, { type Express } from 'express';
import compression from 'compression';
import path from 'node:path';
import { Catalogs } from './catalog/catalog';
import { catalogRoutes } from './catalog/http';
import { errors } from './http';
import { Fault } from '@neonei/catalog';

export interface AppOptions { catalog: string; web?: string }

export function createApp(options: AppOptions): Express {
  const app = express();
  const catalogs = new Catalogs(options.catalog);
  app.disable('x-powered-by');
  app.set('query parser', 'simple');
  app.use(compression({ level: 4, threshold: 1024 }));
  app.use((_req, res, next) => { res.setHeader('X-Content-Type-Options', 'nosniff'); next(); });
  app.get('/api/health', async (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const { manifest } = await catalogs.current();
      res.json({ status: 'ready', catalog: manifest.id, scope: manifest.scope });
    } catch (error) {
      if (!(error instanceof Fault)) throw error;
      res.status(503).json({ status: 'unavailable', error: { code: error.code, message: error.message } });
    }
  });
  app.use(catalogRoutes(catalogs));
  if (options.web) {
    const web = path.resolve(options.web);
    app.use(express.static(web, { index: false, fallthrough: true }));
    app.get(['/', '/offline', '/entry/:id', '/recipe', '/recipe/:id', '/recipe-by-id/:recipeId', '/oracle', '/oracle/:id', '/materials', '/material/:id', '/ore-groups', '/ore/:id', '/circuits', '/circuit/:id', '/bees', '/bee/:id', '/trees', '/tree/:id', '/butterflies', '/butterfly/:id', '/flowers', '/flower/:id', '/genetic-database', '/tool-materials', '/villager-trades', '/lexicon', '/mobs', '/mob/:entity', '/infernal-drops', '/draconic-reactor', '/bee-tree', '/underground-fluids', '/gt-minerals', '/bartworks-ores', '/quests', '/furnace-fuels', '/projectblue', '/fireworks', '/lathe', '/forestry-info', '/information', '/usage-queries', '/diagrams', '/ender-storage', '/forge-registry', '/structures', '/structure/:id', '/aspects', '/aspect/:id', '/research', '/research/:id', '/gt-diagrams', '/forestry-bee-tree', '/runtime-health', '/ui-studio'], (req, res, next) => {
      if (!req.accepts('html')) { next(); return; }
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile('index.html', { root: web }, error => { if (error) next(error); });
    });
  }
  app.use((_req, _res, next) => next(new Fault('not_found', 'Route not found', 404)));
  app.use(errors);
  return app;
}
