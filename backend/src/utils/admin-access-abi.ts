/** Runtime admin access control ABI catalog. */

export type AdminAccessTokenSourceKey = 'header' | 'query';
const ADMIN_ACCESS_TOKEN_SOURCE_KEYS = Object.freeze([
  'header',
  'query',
] as const satisfies readonly AdminAccessTokenSourceKey[]);

export type AdminAccessTokenSourceDescriptor = Readonly<{
  key: AdminAccessTokenSourceKey;
  name: string;
}>;

export const ADMIN_ACCESS_TOKEN_SOURCE_DESCRIPTORS =
  validateAndFreezeAdminAccessTokenSources([
    { key: 'header', name: 'x-neonei-admin-token' },
    { key: 'query', name: 'adminToken' },
  ]);

export const ADMIN_ACCESS_RETRY_AFTER_HEADER = 'Retry-After';
export const ADMIN_ACCESS_MIN_RATE_LIMIT_WINDOW_MS = 1_000;
export const ADMIN_ACCESS_MIN_RATE_LIMIT_MAX = 1;

export type AdminAccessErrorKey = 'rateLimited' | 'tokenNotConfigured' | 'tokenRequired';
const ADMIN_ACCESS_ERROR_KEYS = Object.freeze([
  'rateLimited',
  'tokenNotConfigured',
  'tokenRequired',
] as const satisfies readonly AdminAccessErrorKey[]);

export type AdminAccessErrorDescriptor = Readonly<{
  key: AdminAccessErrorKey;
  statusCode: number;
  code: string;
  message: string;
  logMessage: string;
}>;

export const ADMIN_ACCESS_ERROR_DESCRIPTORS =
  validateAndFreezeAdminAccessErrors([
    {
      key: 'rateLimited',
      statusCode: 429,
      code: 'ADMIN_RATE_LIMITED',
      message: 'Admin request rate limit exceeded',
      logMessage: '[ADMIN] rate limited request',
    },
    {
      key: 'tokenNotConfigured',
      statusCode: 503,
      code: 'ADMIN_TOKEN_NOT_CONFIGURED',
      message: 'Set NEONEI_ADMIN_TOKEN before enabling admin mutation endpoints.',
      logMessage: '[ADMIN] rejected request because NEONEI_ADMIN_TOKEN is not configured',
    },
    {
      key: 'tokenRequired',
      statusCode: 401,
      code: 'ADMIN_TOKEN_REQUIRED',
      message: 'Admin token is required',
      logMessage: '[ADMIN] rejected unauthorized request',
    },
  ]);

export const ADMIN_ACCESS_ERRORS = projectAdminAccessErrors(ADMIN_ACCESS_ERROR_DESCRIPTORS);

export function getAdminAccessTokenCandidate(options: {
  header: (name: string) => string | string[] | undefined;
  query: Readonly<Record<string, unknown>>;
}): string {
  const headerSource = ADMIN_ACCESS_TOKEN_SOURCE_DESCRIPTORS.find((source) => source.key === 'header');
  const querySource = ADMIN_ACCESS_TOKEN_SOURCE_DESCRIPTORS.find((source) => source.key === 'query');
  if (!headerSource || !querySource) {
    throw new Error('Missing runtime admin token source descriptor');
  }
  return `${options.header(headerSource.name) ?? options.query[querySource.name] ?? ''}`;
}

function validateAndFreezeAdminAccessTokenSources(
  descriptors: readonly AdminAccessTokenSourceDescriptor[],
): readonly AdminAccessTokenSourceDescriptor[] {
  const expected = new Set<AdminAccessTokenSourceKey>(ADMIN_ACCESS_TOKEN_SOURCE_KEYS);
  const seenKeys = new Set<string>();
  const seenNames = new Set<string>();

  for (const descriptor of descriptors) {
    if (!descriptor) {
      throw new Error('admin access token source descriptor must not be null');
    }
    if (!expected.has(descriptor.key)) {
      throw new Error(`Unknown admin access token source descriptor: ${descriptor.key}`);
    }
    if (!seenKeys.add(descriptor.key)) {
      throw new Error(`Duplicate admin access token source descriptor: ${descriptor.key}`);
    }
    if (!descriptor.name.trim()) {
      throw new Error(`admin access token source name must be non-empty: ${descriptor.key}`);
    }
    if (!seenNames.add(descriptor.name)) {
      throw new Error(`Duplicate admin access token source name: ${descriptor.name}`);
    }
  }

  for (const key of ADMIN_ACCESS_TOKEN_SOURCE_KEYS) {
    if (!seenKeys.has(key)) {
      throw new Error(`Missing admin access token source descriptor: ${key}`);
    }
  }

  return Object.freeze(descriptors.map((descriptor) => Object.freeze({ ...descriptor })));
}

function validateAndFreezeAdminAccessErrors(
  descriptors: readonly AdminAccessErrorDescriptor[],
): readonly AdminAccessErrorDescriptor[] {
  const expected = new Set<AdminAccessErrorKey>(ADMIN_ACCESS_ERROR_KEYS);
  const seenKeys = new Set<string>();
  const seenCodes = new Set<string>();

  for (const descriptor of descriptors) {
    if (!descriptor) {
      throw new Error('admin access error descriptor must not be null');
    }
    if (!expected.has(descriptor.key)) {
      throw new Error(`Unknown admin access error descriptor: ${descriptor.key}`);
    }
    if (!seenKeys.add(descriptor.key)) {
      throw new Error(`Duplicate admin access error descriptor: ${descriptor.key}`);
    }
    if (!Number.isInteger(descriptor.statusCode) || descriptor.statusCode < 400 || descriptor.statusCode > 599) {
      throw new Error(`Invalid admin access error status: ${descriptor.key}`);
    }
    if (!descriptor.code.trim()) {
      throw new Error(`admin access error code must be non-empty: ${descriptor.key}`);
    }
    if (!seenCodes.add(descriptor.code)) {
      throw new Error(`Duplicate admin access error code: ${descriptor.code}`);
    }
    if (!descriptor.message.trim()) {
      throw new Error(`admin access error message must be non-empty: ${descriptor.key}`);
    }
    if (!descriptor.logMessage.trim()) {
      throw new Error(`admin access error log message must be non-empty: ${descriptor.key}`);
    }
  }

  for (const key of ADMIN_ACCESS_ERROR_KEYS) {
    if (!seenKeys.has(key)) {
      throw new Error(`Missing admin access error descriptor: ${key}`);
    }
  }

  return Object.freeze(descriptors.map((descriptor) => Object.freeze({ ...descriptor })));
}

function projectAdminAccessErrors(
  descriptors: readonly AdminAccessErrorDescriptor[],
): Readonly<Record<AdminAccessErrorKey, AdminAccessErrorDescriptor>> {
  return Object.freeze(
    descriptors.reduce(
      (map, descriptor) => {
        map[descriptor.key] = descriptor;
        return map;
      },
      {} as Record<AdminAccessErrorKey, AdminAccessErrorDescriptor>,
    ),
  );
}
