import { markPerfEvent } from '../services/perfMarks';
import { isStrictRuntimeContractsEnabledByEnv } from './runtimeMode';

export type RuntimeDiagnosticKind =
  | 'contract-gap'
  | 'missing-asset'
  | 'missing-payload'
  | 'schema-mismatch';

export interface RuntimeDiagnosticContext {
  code: string;
  kind: RuntimeDiagnosticKind;
  message: string;
  itemId?: string | null;
  recipeId?: string | null;
  assetId?: string | null;
  path?: string | null;
  sourceSignature?: string | null;
  runtimeCacheKey?: string | null;
  scope?: string | null;
  route?: string | null;
  reason?: string | null;
  strict?: boolean;
  details?: Record<string, unknown>;
}

export interface RuntimeContractGapOptions {
  strict?: boolean;
  logger?: Pick<Console, 'warn'>;
  context?: Partial<RuntimeDiagnosticContext>;
}

const MAX_RUNTIME_DIAGNOSTICS = 200;
const runtimeDiagnostics: RuntimeDiagnosticContext[] = [];
let runtimeDiagnosticIdentity: Pick<RuntimeDiagnosticContext, 'sourceSignature' | 'runtimeCacheKey'> = {};

export function setRuntimeDiagnosticIdentity(identity: {
  sourceSignature?: string | null;
  runtimeCacheKey?: string | null;
}): void {
  runtimeDiagnosticIdentity = {
    sourceSignature: identity.sourceSignature ? `${identity.sourceSignature}` : undefined,
    runtimeCacheKey: identity.runtimeCacheKey ? `${identity.runtimeCacheKey}` : undefined,
  };
}

export function isStrictRuntimeContractsEnabled(): boolean {
  if (isStrictRuntimeContractsEnabledByEnv()) {
    return true;
  }

  if (typeof window === 'undefined') {
    return false;
  }

  try {
    return window.localStorage.getItem('neonei:runtime-v3-strict') === '1';
  } catch {
    return false;
  }
}

function normalizeRuntimeDiagnostic(
  diagnostic: RuntimeDiagnosticContext,
): RuntimeDiagnosticContext {
  return {
    ...runtimeDiagnosticIdentity,
    ...diagnostic,
    itemId: diagnostic.itemId ? `${diagnostic.itemId}` : undefined,
    recipeId: diagnostic.recipeId ? `${diagnostic.recipeId}` : undefined,
    assetId: diagnostic.assetId ? `${diagnostic.assetId}` : undefined,
    path: diagnostic.path ? `${diagnostic.path}` : undefined,
    sourceSignature: diagnostic.sourceSignature ? `${diagnostic.sourceSignature}` : undefined,
    runtimeCacheKey: diagnostic.runtimeCacheKey ? `${diagnostic.runtimeCacheKey}` : undefined,
    scope: diagnostic.scope ? `${diagnostic.scope}` : undefined,
    route: diagnostic.route ? `${diagnostic.route}` : undefined,
    reason: diagnostic.reason ? `${diagnostic.reason}` : undefined,
  };
}

export function recordRuntimeDiagnostic(
  diagnostic: RuntimeDiagnosticContext,
): RuntimeDiagnosticContext {
  const normalized = normalizeRuntimeDiagnostic(diagnostic);
  runtimeDiagnostics.push(normalized);
  if (runtimeDiagnostics.length > MAX_RUNTIME_DIAGNOSTICS) {
    runtimeDiagnostics.splice(0, runtimeDiagnostics.length - MAX_RUNTIME_DIAGNOSTICS);
  }

  markPerfEvent('runtime-diagnostic', { ...normalized });

  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    window.dispatchEvent(new CustomEvent('neonei:runtime-diagnostic', {
      detail: normalized,
    }));
  }

  return normalized;
}

export function getRuntimeDiagnosticsSnapshot(): RuntimeDiagnosticContext[] {
  return runtimeDiagnostics.slice();
}

export function clearRuntimeDiagnostics(): void {
  runtimeDiagnostics.length = 0;
}

export function reportMissingRuntimeAsset(context: {
  assetId?: string | null;
  itemId?: string | null;
  path?: string | null;
  sourceSignature?: string | null;
  runtimeCacheKey?: string | null;
  message?: string;
  details?: Record<string, unknown>;
}): RuntimeDiagnosticContext {
  return recordRuntimeDiagnostic({
    code: 'MISSING_RUNTIME_ASSET',
    kind: 'missing-asset',
    message: context.message ?? 'Runtime asset is missing',
    assetId: context.assetId,
    itemId: context.itemId,
    path: context.path,
    sourceSignature: context.sourceSignature,
    runtimeCacheKey: context.runtimeCacheKey,
    details: context.details,
  });
}

export function reportMissingRuntimePayload(context: {
  recipeId?: string | null;
  itemId?: string | null;
  path?: string | null;
  sourceSignature?: string | null;
  runtimeCacheKey?: string | null;
  message?: string;
  details?: Record<string, unknown>;
}): RuntimeDiagnosticContext {
  return recordRuntimeDiagnostic({
    code: 'MISSING_RUNTIME_PAYLOAD',
    kind: 'missing-payload',
    message: context.message ?? 'Runtime payload is missing',
    recipeId: context.recipeId,
    itemId: context.itemId,
    path: context.path,
    sourceSignature: context.sourceSignature,
    runtimeCacheKey: context.runtimeCacheKey,
    details: context.details,
  });
}

export function reportRuntimeSchemaMismatch(context: {
  path?: string | null;
  sourceSignature?: string | null;
  runtimeCacheKey?: string | null;
  message?: string;
  details?: Record<string, unknown>;
}): RuntimeDiagnosticContext {
  return recordRuntimeDiagnostic({
    code: 'RUNTIME_SCHEMA_MISMATCH',
    kind: 'schema-mismatch',
    message: context.message ?? 'Runtime payload schema mismatch',
    path: context.path,
    sourceSignature: context.sourceSignature,
    runtimeCacheKey: context.runtimeCacheKey,
    details: context.details,
  });
}

export function reportRuntimeContractGap(
  scope: string,
  route: string,
  reason: string,
  options: RuntimeContractGapOptions = {},
): void {
  const strict = options.strict ?? isStrictRuntimeContractsEnabled();
  const diagnostic = recordRuntimeDiagnostic({
    code: 'RUNTIME_CONTRACT_GAP',
    kind: 'contract-gap',
    message: `${scope} required runtime source ${route}: ${reason}`,
    scope,
    route,
    reason,
    strict,
    ...options.context,
  });

  if (strict) {
    throw new Error(`Runtime contract unavailable for ${scope}; missing runtime source ${route} (${reason})`);
  }

  const logger = options.logger ?? (typeof console !== 'undefined' ? console : undefined);
  if (logger && typeof logger.warn === 'function') {
    logger.warn('[NeoNEI Runtime]', diagnostic);
  }
}
