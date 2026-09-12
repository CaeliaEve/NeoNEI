import { Router, type Request, type Response } from 'express';
import { Api, Catalog, Fault, limits } from '@neonei/catalog';
import { Catalogs } from './catalog';

function cached(req: Request, res: Response, id: string, immutable: boolean): boolean {
  const tag = `"${id}"`;
  res.setHeader('ETag', tag);
  res.setHeader('Cache-Control', immutable ? 'public, max-age=31536000, immutable' : 'no-cache');
  if (req.headers['if-none-match']?.split(',').some(value => value.trim() === '*' || value.trim().replace(/^W\//, '') === tag)) {
    res.status(304).end(); return true;
  }
  return false;
}

function send(res: Response, value: unknown): void {
  const body = JSON.stringify(value);
  if (Buffer.byteLength(body) > limits.result) throw new Fault('result_limit', 'Result exceeds 16 MiB; request a smaller page');
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  res.type('json').send(body);
}

export function catalogRoutes(catalogs: Catalogs): Router {
  const router = Router();
  const apis = new WeakMap<Catalog, Api>();
  function api(catalog: Catalog): Api {
    let result = apis.get(catalog);
    if (!result) { result = new Api(catalog); apis.set(catalog, result); }
    return result;
  }
  router.get('/api/catalog', async (req, res) => {
    const catalog = await catalogs.current();
    if (!cached(req, res, catalog.manifest.id, false)) res.json(catalog.manifest);
  });
  router.get('/api/catalog/:catalog', async (req, res) => {
    const catalog = await catalogs.get(req.params.catalog);
    if (!cached(req, res, catalog.manifest.id, true)) res.json(catalog.manifest);
  });
  router.get('/api/catalog/:catalog/*endpoint', async (req, res) => {
    const catalog = await catalogs.get(req.params.catalog);
    const endpoint = (req.params as Record<string, string | string[]>).endpoint;
    if (!Array.isArray(endpoint)) throw new Fault('invalid_url', 'A catalog route is required', 400);
    const parameters = new URL(req.originalUrl, 'http://localhost').searchParams;
    send(res, await api(catalog).read(endpoint, parameters));
  });
  router.get('/assets/:catalog/*asset', async (req, res) => {
    const catalog = await catalogs.get(req.params.catalog);
    const asset = (req.params as Record<string, string | string[]>).asset;
    if (!Array.isArray(asset)) throw new Fault('invalid_url', 'An asset path is required', 400);
    const file = catalog.descriptor(asset.join('/'));
    const data = await catalog.read(file.path);
    if (cached(req, res, file.sha256, true)) return;
    res.setHeader('Content-Type', file.kind === 'image' ? 'image/webp' : 'application/msgpack');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.send(Buffer.from(data.buffer, data.byteOffset, data.byteLength));
  });
  return router;
}
