import fs from 'fs';
import { PUBLISH_OUTPUT_DIR } from '../config/runtime-paths';
import type { AccelerationRuntimeState } from './acceleration-runtime.service';

export type RuntimeAdminDiagnostics = Readonly<{
  status: 'ok';
  timestamp: string;
  acceleration: AccelerationRuntimeState;
  publish: Readonly<{
    outputDir: string;
    exists: boolean;
  }>;
}>;

export type RuntimeAdminHealth = Readonly<{
  status: 'ok';
  timestamp: string;
  acceleration: AccelerationRuntimeState;
}>;

export type PublicApiIndex = Readonly<{
  message: 'NeoNEI API';
  version: '1.0.0';
  endpoints: Readonly<Record<string, string>>;
}>;

export type RuntimeOpenApiDocument = Readonly<{
  openapi: '3.1.0';
  info: Readonly<{
    title: 'NeoNEI Public Runtime API';
    version: '1.0.0';
  }>;
  paths: Readonly<Record<string, { get?: { summary: string }; post?: { summary: string } }>>;
}>;

export function serializeAccelerationRuntime(snapshot: AccelerationRuntimeState): AccelerationRuntimeState {
  return Object.freeze({
    revision: snapshot.revision,
    phase: snapshot.phase,
    message: snapshot.message,
    blocking: snapshot.blocking,
    stale: snapshot.stale,
    activeApiRequests: snapshot.activeApiRequests,
    lastCompiledSignature: snapshot.lastCompiledSignature,
    lastError: snapshot.lastError,
  });
}

export function getRuntimeAdminHealth(snapshot: AccelerationRuntimeState): RuntimeAdminHealth {
  return Object.freeze({
    status: 'ok',
    timestamp: new Date().toISOString(),
    acceleration: serializeAccelerationRuntime(snapshot),
  });
}

export function getPublicApiIndex(): PublicApiIndex {
  return Object.freeze({
    message: 'NeoNEI API',
    version: '1.0.0',
    endpoints: Object.freeze({
      health: '/api/health',
      runtimeCurrent: '/api/runtime/current',
      runtimeManifest: '/api/runtime/current/manifest',
      recipeProducedBy: '/api/recipes/current/item/:itemId',
      recipeUsedIn: '/api/recipes/current/usage/:itemId',
      recipePage: '/api/recipes/page/:recipePageId',
      multiblocks: '/api/runtime/current/data/multiblocks/:controllerItemId',
      gtDiagrams: '/api/runtime/current/data/gt-diagrams/overview',
      forestryGenetics: '/api/runtime/current/data/forestry-genetics/overview',
      patternControl: '/ops/patterns',
      publishManifest: '/api/publish/manifest',
      publishControl: '/ops/publish/releases',
    }),
  });
}

export function getRuntimeOpenApiDocument(): RuntimeOpenApiDocument {
  return Object.freeze({
    openapi: '3.1.0',
    info: Object.freeze({
      title: 'NeoNEI Public Runtime API',
      version: '1.0.0',
    }),
    paths: Object.freeze({
      '/api/health': { get: { summary: 'Runtime health and acceleration status' } },
      '/runtime/health': { get: { summary: 'Product-semantic runtime health endpoint' } },
      '/runtime/manifest': { get: { summary: 'Active runtime manifest' } },
      '/runtime/contracts': { get: { summary: 'Runtime contract index' } },
      '/runtime/diagnostics': { get: { summary: 'Public runtime readiness diagnostics' } },
      '/ops/runtime': { get: { summary: 'Token-protected runtime diagnostics' } },
      '/ops/acceleration/reconcile': { post: { summary: 'Token-protected rebuild/materialize trigger' } },
      '/ops/patterns': { get: { summary: 'Token-protected pattern authoring inventory' }, post: { summary: 'Token-protected pattern authoring mutation' } },
      '/ops/publish/releases': { get: { summary: 'Token-protected publish release inventory' } },
      '/ops/publish/releases/{sourceSignature}/activate': { post: { summary: 'Token-protected publish release activation' } },
      '/ops/render-contract': { get: { summary: 'Token-protected render contract diagnostics' }, post: { summary: 'Token-protected render contract queries' } },
      '/api/v1/health': { get: { summary: 'Stable v1 runtime health endpoint' } },
      '/api/v1/runtime/manifest': { get: { summary: 'Stable v1 active runtime manifest' } },
      '/api/v1/runtime/contracts': { get: { summary: 'Stable v1 runtime contract index' } },
      '/api/publish/manifest': { get: { summary: 'No-cache active publish manifest' } },
      '/api/publish/home-bootstrap': { get: { summary: 'Fallback home bootstrap payload' } },
      '/publish/{artifactPath}': { get: { summary: 'Immutable static publish artifacts except active manifests' } },
      '/api/admin/acceleration/reconcile': { post: { summary: 'Token-protected rebuild/materialize trigger' } },
      '/api/admin/patterns': { get: { summary: 'Token-protected pattern authoring inventory' }, post: { summary: 'Token-protected pattern authoring mutation' } },
      '/api/admin/publish/releases': { get: { summary: 'Token-protected publish release inventory' } },
      '/api/admin/publish/releases/{sourceSignature}/activate': { post: { summary: 'Token-protected publish release activation' } },
      '/api/admin/render-contract': { get: { summary: 'Token-protected render contract diagnostics' }, post: { summary: 'Token-protected render contract queries' } },
      '/api/admin/runtime': { get: { summary: 'Token-protected runtime diagnostics' } },
    }),
  });
}

export function getRuntimeAdminDiagnostics(snapshot: AccelerationRuntimeState): RuntimeAdminDiagnostics {
  return Object.freeze({
    status: 'ok',
    timestamp: new Date().toISOString(),
    acceleration: serializeAccelerationRuntime(snapshot),
    publish: Object.freeze({
      outputDir: PUBLISH_OUTPUT_DIR,
      exists: fs.existsSync(PUBLISH_OUTPUT_DIR),
    }),
  });
}
