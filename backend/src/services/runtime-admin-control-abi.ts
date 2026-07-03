/** Runtime admin public API and OpenAPI ABI catalog. */

export type RuntimeAdminPublicApiMetadata = Readonly<{
  message: 'NeoNEI API';
  version: '1.0.0';
  openapi: '3.1.0';
  title: 'NeoNEI Public Runtime API';
}>;

export const RUNTIME_ADMIN_PUBLIC_API_METADATA: RuntimeAdminPublicApiMetadata = Object.freeze({
  message: 'NeoNEI API',
  version: '1.0.0',
  openapi: '3.1.0',
  title: 'NeoNEI Public Runtime API',
});

export type PublicApiIndex = Readonly<{
  message: RuntimeAdminPublicApiMetadata['message'];
  version: RuntimeAdminPublicApiMetadata['version'];
  endpoints: Readonly<Record<string, string>>;
}>;

export type RuntimeOpenApiDocument = Readonly<{
  openapi: RuntimeAdminPublicApiMetadata['openapi'];
  info: Readonly<{
    title: RuntimeAdminPublicApiMetadata['title'];
    version: RuntimeAdminPublicApiMetadata['version'];
  }>;
  paths: Readonly<Record<string, { get?: { summary: string }; post?: { summary: string } }>>;
}>;

export type RuntimeAdminPublicEndpointKey =
  | 'health'
  | 'runtimeCurrent'
  | 'runtimeManifest'
  | 'recipeProducedBy'
  | 'recipeUsedIn'
  | 'recipePage'
  | 'multiblocks'
  | 'gtDiagrams'
  | 'forestryGenetics'
  | 'patternControl'
  | 'publishManifest'
  | 'publishControl';

const RUNTIME_ADMIN_PUBLIC_ENDPOINT_KEYS = Object.freeze([
  'health',
  'runtimeCurrent',
  'runtimeManifest',
  'recipeProducedBy',
  'recipeUsedIn',
  'recipePage',
  'multiblocks',
  'gtDiagrams',
  'forestryGenetics',
  'patternControl',
  'publishManifest',
  'publishControl',
] as const satisfies readonly RuntimeAdminPublicEndpointKey[]);

export type RuntimeAdminPublicEndpointDescriptor = Readonly<{
  key: RuntimeAdminPublicEndpointKey;
  path: string;
}>;

export const RUNTIME_ADMIN_PUBLIC_ENDPOINT_DESCRIPTORS = validateAndFreezePublicEndpointDescriptors(
  [
    { key: 'health', path: '/api/health' },
    { key: 'runtimeCurrent', path: '/api/runtime/current' },
    { key: 'runtimeManifest', path: '/api/runtime/current/manifest' },
    { key: 'recipeProducedBy', path: '/api/recipes/current/item/:itemId' },
    { key: 'recipeUsedIn', path: '/api/recipes/current/usage/:itemId' },
    { key: 'recipePage', path: '/api/recipes/page/:recipePageId' },
    { key: 'multiblocks', path: '/api/runtime/current/data/multiblocks/:controllerItemId' },
    { key: 'gtDiagrams', path: '/api/runtime/current/data/gt-diagrams/overview' },
    { key: 'forestryGenetics', path: '/api/runtime/current/data/forestry-genetics/overview' },
    { key: 'patternControl', path: '/ops/patterns' },
    { key: 'publishManifest', path: '/api/publish/manifest' },
    { key: 'publishControl', path: '/ops/publish/releases' },
  ] as const,
);

export const RUNTIME_ADMIN_PUBLIC_ENDPOINTS =
  projectPublicEndpointMap(RUNTIME_ADMIN_PUBLIC_ENDPOINT_DESCRIPTORS);

export type RuntimeOpenApiMethod = 'get' | 'post';
export type RuntimeOpenApiPathKey =
  | 'apiHealth'
  | 'runtimeHealth'
  | 'runtimeManifest'
  | 'runtimeContracts'
  | 'runtimeDiagnostics'
  | 'opsRuntime'
  | 'opsAccelerationReconcile'
  | 'opsPatterns'
  | 'opsPatternsMutation'
  | 'opsPublishReleases'
  | 'opsPublishReleaseActivate'
  | 'opsRenderContract'
  | 'opsRenderContractQuery'
  | 'apiV1Health'
  | 'apiV1RuntimeManifest'
  | 'apiV1RuntimeContracts'
  | 'apiPublishManifest'
  | 'apiPublishHomeBootstrap'
  | 'publishArtifact'
  | 'apiAdminAccelerationReconcile'
  | 'apiAdminPatterns'
  | 'apiAdminPatternsMutation'
  | 'apiAdminPublishReleases'
  | 'apiAdminPublishReleaseActivate'
  | 'apiAdminRenderContract'
  | 'apiAdminRenderContractQuery'
  | 'apiAdminRuntime';

const RUNTIME_OPENAPI_PATH_KEYS = Object.freeze([
  'apiHealth',
  'runtimeHealth',
  'runtimeManifest',
  'runtimeContracts',
  'runtimeDiagnostics',
  'opsRuntime',
  'opsAccelerationReconcile',
  'opsPatterns',
  'opsPatternsMutation',
  'opsPublishReleases',
  'opsPublishReleaseActivate',
  'opsRenderContract',
  'opsRenderContractQuery',
  'apiV1Health',
  'apiV1RuntimeManifest',
  'apiV1RuntimeContracts',
  'apiPublishManifest',
  'apiPublishHomeBootstrap',
  'publishArtifact',
  'apiAdminAccelerationReconcile',
  'apiAdminPatterns',
  'apiAdminPatternsMutation',
  'apiAdminPublishReleases',
  'apiAdminPublishReleaseActivate',
  'apiAdminRenderContract',
  'apiAdminRenderContractQuery',
  'apiAdminRuntime',
] as const satisfies readonly RuntimeOpenApiPathKey[]);

export type RuntimeOpenApiPathDescriptor = Readonly<{
  key: RuntimeOpenApiPathKey;
  path: string;
  method: RuntimeOpenApiMethod;
  summary: string;
}>;

export const RUNTIME_OPENAPI_PATH_DESCRIPTORS = validateAndFreezeOpenApiPathDescriptors(
  [
    { key: 'apiHealth', path: '/api/health', method: 'get', summary: 'Runtime health and acceleration status' },
    { key: 'runtimeHealth', path: '/runtime/health', method: 'get', summary: 'Product-semantic runtime health endpoint' },
    { key: 'runtimeManifest', path: '/runtime/manifest', method: 'get', summary: 'Active runtime manifest' },
    { key: 'runtimeContracts', path: '/runtime/contracts', method: 'get', summary: 'Runtime contract index' },
    { key: 'runtimeDiagnostics', path: '/runtime/diagnostics', method: 'get', summary: 'Public runtime readiness diagnostics' },
    { key: 'opsRuntime', path: '/ops/runtime', method: 'get', summary: 'Token-protected runtime diagnostics' },
    { key: 'opsAccelerationReconcile', path: '/ops/acceleration/reconcile', method: 'post', summary: 'Token-protected rebuild/materialize trigger' },
    { key: 'opsPatterns', path: '/ops/patterns', method: 'get', summary: 'Token-protected pattern authoring inventory' },
    { key: 'opsPatternsMutation', path: '/ops/patterns', method: 'post', summary: 'Token-protected pattern authoring mutation' },
    { key: 'opsPublishReleases', path: '/ops/publish/releases', method: 'get', summary: 'Token-protected publish release inventory' },
    { key: 'opsPublishReleaseActivate', path: '/ops/publish/releases/{sourceSignature}/activate', method: 'post', summary: 'Token-protected publish release activation' },
    { key: 'opsRenderContract', path: '/ops/render-contract', method: 'get', summary: 'Token-protected render contract diagnostics' },
    { key: 'opsRenderContractQuery', path: '/ops/render-contract', method: 'post', summary: 'Token-protected render contract queries' },
    { key: 'apiV1Health', path: '/api/v1/health', method: 'get', summary: 'Stable v1 runtime health endpoint' },
    { key: 'apiV1RuntimeManifest', path: '/api/v1/runtime/manifest', method: 'get', summary: 'Stable v1 active runtime manifest' },
    { key: 'apiV1RuntimeContracts', path: '/api/v1/runtime/contracts', method: 'get', summary: 'Stable v1 runtime contract index' },
    { key: 'apiPublishManifest', path: '/api/publish/manifest', method: 'get', summary: 'No-cache active publish manifest' },
    { key: 'apiPublishHomeBootstrap', path: '/api/publish/home-bootstrap', method: 'get', summary: 'Fallback home bootstrap payload' },
    { key: 'publishArtifact', path: '/publish/{artifactPath}', method: 'get', summary: 'Immutable static publish artifacts except active manifests' },
    { key: 'apiAdminAccelerationReconcile', path: '/api/admin/acceleration/reconcile', method: 'post', summary: 'Token-protected rebuild/materialize trigger' },
    { key: 'apiAdminPatterns', path: '/api/admin/patterns', method: 'get', summary: 'Token-protected pattern authoring inventory' },
    { key: 'apiAdminPatternsMutation', path: '/api/admin/patterns', method: 'post', summary: 'Token-protected pattern authoring mutation' },
    { key: 'apiAdminPublishReleases', path: '/api/admin/publish/releases', method: 'get', summary: 'Token-protected publish release inventory' },
    { key: 'apiAdminPublishReleaseActivate', path: '/api/admin/publish/releases/{sourceSignature}/activate', method: 'post', summary: 'Token-protected publish release activation' },
    { key: 'apiAdminRenderContract', path: '/api/admin/render-contract', method: 'get', summary: 'Token-protected render contract diagnostics' },
    { key: 'apiAdminRenderContractQuery', path: '/api/admin/render-contract', method: 'post', summary: 'Token-protected render contract queries' },
    { key: 'apiAdminRuntime', path: '/api/admin/runtime', method: 'get', summary: 'Token-protected runtime diagnostics' },
  ] as const,
);

export const RUNTIME_OPENAPI_PATHS = projectOpenApiPaths(RUNTIME_OPENAPI_PATH_DESCRIPTORS);

function validateAndFreezePublicEndpointDescriptors(
  descriptors: readonly RuntimeAdminPublicEndpointDescriptor[],
): readonly RuntimeAdminPublicEndpointDescriptor[] {
  const expectedKeys = new Set<RuntimeAdminPublicEndpointKey>(RUNTIME_ADMIN_PUBLIC_ENDPOINT_KEYS);
  const seenKeys = new Set<string>();
  const seenPaths = new Set<string>();

  for (const descriptor of descriptors) {
    if (!descriptor) {
      throw new Error('runtime admin public endpoint descriptor must not be null');
    }
    if (!expectedKeys.has(descriptor.key)) {
      throw new Error(`Unknown runtime admin public endpoint descriptor: ${descriptor.key}`);
    }
    if (!seenKeys.add(descriptor.key)) {
      throw new Error(`Duplicate runtime admin public endpoint descriptor: ${descriptor.key}`);
    }
    validateAbsolutePath('runtime admin public endpoint', descriptor.key, descriptor.path);
    if (!seenPaths.add(descriptor.path)) {
      throw new Error(`Duplicate runtime admin public endpoint path: ${descriptor.path}`);
    }
  }

  for (const key of RUNTIME_ADMIN_PUBLIC_ENDPOINT_KEYS) {
    if (!seenKeys.has(key)) {
      throw new Error(`Missing runtime admin public endpoint descriptor: ${key}`);
    }
  }

  return Object.freeze(descriptors.map((descriptor) => Object.freeze({ ...descriptor })));
}

function validateAndFreezeOpenApiPathDescriptors(
  descriptors: readonly RuntimeOpenApiPathDescriptor[],
): readonly RuntimeOpenApiPathDescriptor[] {
  const expectedKeys = new Set<RuntimeOpenApiPathKey>(RUNTIME_OPENAPI_PATH_KEYS);
  const seenKeys = new Set<string>();
  const seenRouteSignatures = new Set<string>();

  for (const descriptor of descriptors) {
    if (!descriptor) {
      throw new Error('runtime OpenAPI path descriptor must not be null');
    }
    if (!expectedKeys.has(descriptor.key)) {
      throw new Error(`Unknown runtime OpenAPI path descriptor: ${descriptor.key}`);
    }
    if (!seenKeys.add(descriptor.key)) {
      throw new Error(`Duplicate runtime OpenAPI path descriptor: ${descriptor.key}`);
    }
    if (descriptor.method !== 'get' && descriptor.method !== 'post') {
      throw new Error(`Invalid runtime OpenAPI method for ${descriptor.key}: ${descriptor.method}`);
    }
    validateAbsolutePath('runtime OpenAPI path', descriptor.key, descriptor.path);
    if (!descriptor.summary.trim()) {
      throw new Error(`runtime OpenAPI summary must be non-empty: ${descriptor.key}`);
    }
    const routeSignature = `${descriptor.method} ${descriptor.path}`;
    if (!seenRouteSignatures.add(routeSignature)) {
      throw new Error(`Duplicate runtime OpenAPI route signature: ${routeSignature}`);
    }
  }

  for (const key of RUNTIME_OPENAPI_PATH_KEYS) {
    if (!seenKeys.has(key)) {
      throw new Error(`Missing runtime OpenAPI path descriptor: ${key}`);
    }
  }

  return Object.freeze(descriptors.map((descriptor) => Object.freeze({ ...descriptor })));
}

function projectPublicEndpointMap(
  descriptors: readonly RuntimeAdminPublicEndpointDescriptor[],
): Readonly<Record<RuntimeAdminPublicEndpointKey, string>> {
  return Object.freeze(
    descriptors.reduce(
      (map, descriptor) => {
        map[descriptor.key] = descriptor.path;
        return map;
      },
      {} as Record<RuntimeAdminPublicEndpointKey, string>,
    ),
  );
}

function projectOpenApiPaths(
  descriptors: readonly RuntimeOpenApiPathDescriptor[],
): Readonly<Record<string, { get?: { summary: string }; post?: { summary: string } }>> {
  return Object.freeze(
    descriptors.reduce(
      (paths, descriptor) => {
        const existing = paths[descriptor.path] ?? {};
        paths[descriptor.path] = Object.freeze({
          ...existing,
          [descriptor.method]: Object.freeze({ summary: descriptor.summary }),
        });
        return paths;
      },
      {} as Record<string, { get?: { summary: string }; post?: { summary: string } }>,
    ),
  );
}

function validateAbsolutePath(label: string, key: string, path: string): void {
  if (!path || !path.startsWith('/')) {
    throw new Error(`${label} path must be absolute: ${key}`);
  }
}
