import { createAdminAccessGuard } from '../utils/admin-access';

export function isEnvEnabled(value: string | undefined): boolean {
  return value === '1' || value?.toLowerCase() === 'true';
}

const parsedPort = Number(process.env.PORT);
const host = process.env.HOST?.trim() || '0.0.0.0';
const port = Number.isFinite(parsedPort) && parsedPort > 0 ? parsedPort : 3002;

export const serverSettings = {
  port,
  host,
  publicBaseUrl:
    process.env.PUBLIC_BASE_URL?.trim().replace(/\/+$/, '') ||
    `http://${host === '0.0.0.0' ? 'localhost' : host}:${port}`,
  publishMaterializeOnStart: isEnvEnabled(process.env.NEONEI_PUBLISH_MATERIALIZE_ON_START),
  publicRuntimeOnly: isEnvEnabled(process.env.NEONEI_PUBLIC_RUNTIME_ONLY),
} as const;

export const requireAdminToken = createAdminAccessGuard({
  token: process.env.NEONEI_ADMIN_TOKEN?.trim() || process.env.ADMIN_TOKEN?.trim() || '',
  rateLimitWindowMs: Number(process.env.NEONEI_ADMIN_RATE_LIMIT_WINDOW_MS ?? 60_000),
  rateLimitMax: Number(process.env.NEONEI_ADMIN_RATE_LIMIT_MAX ?? 12),
});
