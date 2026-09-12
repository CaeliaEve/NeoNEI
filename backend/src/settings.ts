import { existsSync } from 'node:fs';
import path from 'node:path';

export interface Settings { host: string; port: number; catalog: string; web?: string }

export function settings(env: NodeJS.ProcessEnv = process.env): Settings {
  const root = path.resolve(__dirname, '../..');
  const rawPort = env.NEONEI_PORT ?? '3002';
  if (!/^[1-9][0-9]{0,4}$/.test(rawPort) || Number(rawPort) > 65535) throw new Error('NEONEI_PORT must be between 1 and 65535');
  const resolve = (value: string): string => path.resolve(root, value);
  const web = resolve(env.NEONEI_WEB_ROOT ?? 'frontend/dist');
  if (env.NEONEI_WEB_ROOT && !existsSync(path.join(web, 'index.html'))) throw new Error('NEONEI_WEB_ROOT must contain index.html');
  return {
    host: env.NEONEI_HOST ?? '127.0.0.1', port: Number(rawPort),
    catalog: resolve(env.NEONEI_CATALOG_ROOT ?? 'data/catalog'),
    web: existsSync(path.join(web, 'index.html')) ? web : undefined,
  };
}
