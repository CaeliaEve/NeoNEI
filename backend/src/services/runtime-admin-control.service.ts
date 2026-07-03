import fs from 'fs';
import { PUBLISH_OUTPUT_DIR } from '../config/runtime-paths';
import type { AccelerationRuntimeState } from './acceleration-runtime.service';
import {
  RUNTIME_ADMIN_PUBLIC_API_METADATA,
  RUNTIME_ADMIN_PUBLIC_ENDPOINTS,
  RUNTIME_OPENAPI_PATHS,
  type PublicApiIndex,
  type RuntimeOpenApiDocument,
} from './runtime-admin-control-abi';

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
    message: RUNTIME_ADMIN_PUBLIC_API_METADATA.message,
    version: RUNTIME_ADMIN_PUBLIC_API_METADATA.version,
    endpoints: RUNTIME_ADMIN_PUBLIC_ENDPOINTS,
  });
}

export function getRuntimeOpenApiDocument(): RuntimeOpenApiDocument {
  return Object.freeze({
    openapi: RUNTIME_ADMIN_PUBLIC_API_METADATA.openapi,
    info: Object.freeze({
      title: RUNTIME_ADMIN_PUBLIC_API_METADATA.title,
      version: RUNTIME_ADMIN_PUBLIC_API_METADATA.version,
    }),
    paths: RUNTIME_OPENAPI_PATHS,
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
