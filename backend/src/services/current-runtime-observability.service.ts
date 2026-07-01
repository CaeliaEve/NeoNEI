import { type CurrentRuntimeApiContext } from './current-runtime-api.service';

type JsonRecord = Record<string, unknown>;

function asString(value: unknown): string | null {
  const text = `${value ?? ''}`.trim();
  return text || null;
}

export function getCurrentRuntimeDiagnosticsHealth(context: CurrentRuntimeApiContext): JsonRecord {
  const { health, snapshot } = context;
  const runtimeFiles = snapshot ? Object.keys(snapshot.artifactsByPath).length : health.files.declared;
  return Object.freeze({
    runtimeId: context.meta.runtimeId,
    schema: asString(snapshot?.manifest.schema) ?? 'neonei/runtime/current',
    schemaRevision: snapshot?.runtimeSchemaRevision,
    integrityOk: health.status !== 'blocked' && health.files.missing.length === 0,
    packCount: runtimeFiles,
    atlasCount: health.counts.browserAtlasItems,
    missingTextures: health.coverage.semanticAtlasMissing,
    missingAnimations: health.coverage.staticWhenExpectedAnimated,
    generatedAt: health.generatedAt,
    sourceExportName: health.distData.source,
    warnings: health.validation.warnings,
    checks: Object.freeze({
      manifest: snapshot ? 'ok' : 'missing',
      assets: health.files.missing.length === 0 ? 'ok' : 'missing',
      reports: 'ok',
    }),
    health,
  });
}

export function getCurrentRuntimeDiagnosticsSummary(context: CurrentRuntimeApiContext): JsonRecord {
  const { health } = context;
  return Object.freeze({
    runtimeId: context.meta.runtimeId,
    counts: Object.freeze({
      items: health.counts.items,
      groups: health.counts.browserGroups,
      recipes: health.counts.recipes,
      atlasItems: health.counts.browserAtlasItems,
      animatedTextures: health.counts.animatedBrowserAtlasItems ?? health.counts.animationTableItems,
    }),
    warnings: health.validation.warnings,
    coverage: health.coverage,
  });
}

export function getCurrentRuntimeNativeSurfaceMetrics(context: CurrentRuntimeApiContext): JsonRecord {
  return Object.freeze({
    nativeRender: context.health.nativeRender,
    runtimeHealth: context.health,
  });
}
