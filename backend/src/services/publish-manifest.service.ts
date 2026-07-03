import fs from 'fs';
import path from 'path';
import { PUBLISH_OUTPUT_DIR } from '../config/runtime-paths';
import { getAccelerationDatabaseManager, type DatabaseManager } from '../models/database';
import {
  buildPublishBundleManifestRelativePath,
  type PublishStaticBundleManifest,
} from './publish-payload.service';
import {
  PUBLISH_MANIFEST_PROBE_DESCRIPTORS,
  PUBLISH_MANIFEST_PROBE_STATUS,
  PUBLISH_MANIFEST_STATUS,
  type PublishManifestProbeName,
  type PublishManifestProbeStatus,
  type PublishManifestStatus,
} from './publish-manifest-abi';

export type PublishManifestProbe = Readonly<{
  name: PublishManifestProbeName;
  status: PublishManifestProbeStatus;
  required: true;
  path: string | null;
  value: string | null;
  message: string | null;
}>;

export type PublishManifestProbeSummary = Readonly<{
  status: PublishManifestStatus;
  probes: Readonly<Record<PublishManifestProbeName, PublishManifestProbe>>;
  missing: readonly PublishManifestProbeName[];
  invalid: readonly PublishManifestProbeName[];
  stale: readonly PublishManifestProbeName[];
  errors: readonly string[];
}>;

export interface PublicRuntimeManifest {
  version: 1;
  status: PublishManifestStatus;
  probes: PublishManifestProbeSummary;
  sourceSignature: string;
  compiledAt: string | null;
  publishRevision: string | null;
  publishCompiledAt: string | null;
  browserLayoutKey: string | null;
  runtimeCacheKey: string;
  publishBundle: PublishStaticBundleManifest | null;
}

export interface PublishManifestServiceOptions {
  databaseManager?: DatabaseManager;
}

type CompilerStateRow = {
  state_key: string;
  state_value: string;
  updated_at: string | null;
};

type AccelerationDatabase = ReturnType<DatabaseManager['getDatabase']>;

type PublishManifestDatabaseRead = Readonly<{
  db: AccelerationDatabase | null;
  probe: PublishManifestProbe;
}>;

type PublishBundleManifestRead = Readonly<{
  value: PublishStaticBundleManifest | null;
  probe: PublishManifestProbe;
}>;

type PublishManifestProbeDraft = Partial<Record<PublishManifestProbeName, PublishManifestProbe>>;

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function errorCode(error: unknown): string | null {
  return error && typeof error === 'object' && 'code' in error
    ? `${(error as { code?: unknown }).code ?? ''}` || null
    : null;
}

function asString(value: unknown): string | null {
  const text = `${value ?? ''}`.trim();
  return text || null;
}

function createPublishManifestProbe(args: {
  name: PublishManifestProbeName;
  status: PublishManifestProbeStatus;
  path?: string | null;
  value?: string | null;
  message?: string | null;
}): PublishManifestProbe {
  return Object.freeze({
    name: args.name,
    status: args.status,
    required: true,
    path: args.path ?? null,
    value: args.value ?? null,
    message: args.message ?? null,
  });
}

function missingPublishManifestProbe(
  name: PublishManifestProbeName,
  message: string = `publish manifest probe is missing: ${name}`,
): PublishManifestProbe {
  return createPublishManifestProbe({
    name,
    status: PUBLISH_MANIFEST_PROBE_STATUS.missing,
    message,
  });
}

function summarizePublishManifestProbes(draft: PublishManifestProbeDraft): PublishManifestProbeSummary {
  const probes = {} as Record<PublishManifestProbeName, PublishManifestProbe>;
  for (const descriptor of PUBLISH_MANIFEST_PROBE_DESCRIPTORS) {
    probes[descriptor.name] = draft[descriptor.name] ?? missingPublishManifestProbe(descriptor.name);
  }

  const values = Object.values(probes);
  const invalid = values
    .filter((probe) => probe.status === PUBLISH_MANIFEST_PROBE_STATUS.invalid)
    .map((probe) => probe.name);
  const missing = values
    .filter((probe) => probe.status === PUBLISH_MANIFEST_PROBE_STATUS.missing)
    .map((probe) => probe.name);
  const stale = values
    .filter((probe) => probe.status === PUBLISH_MANIFEST_PROBE_STATUS.stale)
    .map((probe) => probe.name);
  const status = invalid.length > 0 || missing.length > 0
    ? PUBLISH_MANIFEST_STATUS.blocked
    : stale.length > 0
      ? PUBLISH_MANIFEST_STATUS.stale
      : PUBLISH_MANIFEST_STATUS.ready;

  return Object.freeze({
    status,
    probes: Object.freeze(probes),
    missing: Object.freeze(missing),
    invalid: Object.freeze(invalid),
    stale: Object.freeze(stale),
    errors: Object.freeze(values
      .filter((probe) => probe.message)
      .map((probe) => `${probe.name}: ${probe.message}`)),
  });
}

function readCompilerStateValue(
  rows: readonly CompilerStateRow[],
  stateKey: string,
): string | null {
  return asString(rows.find((row) => row.state_key === stateKey)?.state_value);
}

export class PublishManifestService {
  private databaseManager: DatabaseManager;
  private cache: { expiresAt: number; value: PublicRuntimeManifest } | null = null;
  private readonly cacheTtlMs = Number(process.env.PUBLIC_MANIFEST_CACHE_TTL_MS || 10_000);

  constructor(options: PublishManifestServiceOptions = {}) {
    this.databaseManager = options.databaseManager ?? getAccelerationDatabaseManager();
  }

  private getAccelerationDatabase(): PublishManifestDatabaseRead {
    try {
      return Object.freeze({
        db: this.databaseManager.getDatabase(),
        probe: createPublishManifestProbe({
          name: 'database',
          status: PUBLISH_MANIFEST_PROBE_STATUS.ready,
          value: 'connected',
        }),
      });
    } catch (error) {
      return Object.freeze({
        db: null,
        probe: createPublishManifestProbe({
          name: 'database',
          status: PUBLISH_MANIFEST_PROBE_STATUS.invalid,
          message: describeError(error),
        }),
      });
    }
  }

  private readPublishBundleManifest(sourceSignature: string): PublishBundleManifestRead {
    const normalizedSignature = `${sourceSignature ?? ''}`.trim();
    if (!normalizedSignature) {
      return Object.freeze({
        value: null,
        probe: missingPublishManifestProbe(
          'publishBundle',
          'source signature is required before reading publish bundle manifest',
        ),
      });
    }

    const manifestPath = path.join(
      PUBLISH_OUTPUT_DIR,
      normalizedSignature,
      buildPublishBundleManifestRelativePath(),
    );
    try {
      const stats = fs.statSync(manifestPath);
      if (!stats.isFile()) {
        return Object.freeze({
          value: null,
          probe: createPublishManifestProbe({
            name: 'publishBundle',
            status: PUBLISH_MANIFEST_PROBE_STATUS.invalid,
            path: manifestPath,
            message: `publish bundle manifest path is not a file: ${manifestPath}`,
          }),
        });
      }
      const parsed = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as PublishStaticBundleManifest;
      if (parsed?.sourceSignature !== normalizedSignature) {
        return Object.freeze({
          value: null,
          probe: createPublishManifestProbe({
            name: 'publishBundle',
            status: PUBLISH_MANIFEST_PROBE_STATUS.invalid,
            path: manifestPath,
            message: `publish bundle source signature mismatch: expected ${normalizedSignature}, got ${parsed?.sourceSignature ?? 'missing'}`,
          }),
        });
      }
      if (!asString(parsed?.identity?.contentHash)) {
        return Object.freeze({
          value: null,
          probe: createPublishManifestProbe({
            name: 'publishBundle',
            status: PUBLISH_MANIFEST_PROBE_STATUS.invalid,
            path: manifestPath,
            message: 'publish bundle identity contentHash is required',
          }),
        });
      }
      return Object.freeze({
        value: parsed,
        probe: createPublishManifestProbe({
          name: 'publishBundle',
          status: PUBLISH_MANIFEST_PROBE_STATUS.ready,
          path: manifestPath,
          value: normalizedSignature,
        }),
      });
    } catch (error) {
      const missing = errorCode(error) === 'ENOENT';
      return Object.freeze({
        value: null,
        probe: createPublishManifestProbe({
          name: 'publishBundle',
          status: missing
            ? PUBLISH_MANIFEST_PROBE_STATUS.missing
            : PUBLISH_MANIFEST_PROBE_STATUS.invalid,
          path: manifestPath,
          message: missing
            ? `publish bundle manifest is missing: ${manifestPath}`
            : describeError(error),
        }),
      });
    }
  }

  private createBlockedRuntimeManifest(probeDraft: PublishManifestProbeDraft): PublicRuntimeManifest {
    const probes = summarizePublishManifestProbes({
      ...probeDraft,
      runtimeCacheKey: probeDraft.runtimeCacheKey ?? missingPublishManifestProbe(
        'runtimeCacheKey',
        'runtime cache key is unavailable while publish manifest inputs are blocked',
      ),
    });
    return Object.freeze({
      version: 1,
      status: probes.status,
      probes,
      sourceSignature: '',
      compiledAt: null,
      publishRevision: null,
      publishCompiledAt: null,
      browserLayoutKey: null,
      runtimeCacheKey: '',
      publishBundle: null,
    });
  }

  getRuntimeManifest(): PublicRuntimeManifest {
    const now = Date.now();
    if (this.cache && this.cache.expiresAt > now) {
      return this.cache.value;
    }

    const probeDraft: PublishManifestProbeDraft = {};
    const databaseRead = this.getAccelerationDatabase();
    probeDraft.database = databaseRead.probe;
    const db = databaseRead.db;
    if (!db) {
      const fallback = this.createBlockedRuntimeManifest(probeDraft);
      this.cache = {
        value: fallback,
        expiresAt: now + this.cacheTtlMs,
      };
      return fallback;
    }

    const rows = db.prepare(`
      SELECT state_key, state_value, updated_at
      FROM compiler_state
      WHERE state_key IN (
        'source_signature',
        'publish_payload_revision',
        'publish_payload_compiled_at',
        'publish_payload_browser_layout_key',
        'browser_layout_source',
        'item_browser_groups_count',
        'browser_default_entries_count'
      )
    `).all() as CompilerStateRow[];

    const sourceSignatureRow = rows.find((row) => row.state_key === 'source_signature');
    const sourceSignature = asString(sourceSignatureRow?.state_value) ?? '';
    probeDraft.sourceSignature = sourceSignature
      ? createPublishManifestProbe({
        name: 'sourceSignature',
        status: PUBLISH_MANIFEST_PROBE_STATUS.ready,
        value: sourceSignature,
      })
      : missingPublishManifestProbe('sourceSignature', 'compiler_state.source_signature is required');

    const publishRevision = readCompilerStateValue(rows, 'publish_payload_revision');
    probeDraft.publishRevision = publishRevision
      ? createPublishManifestProbe({
        name: 'publishRevision',
        status: PUBLISH_MANIFEST_PROBE_STATUS.ready,
        value: publishRevision,
      })
      : missingPublishManifestProbe('publishRevision', 'compiler_state.publish_payload_revision is required');

    const publishCompiledAt = readCompilerStateValue(rows, 'publish_payload_compiled_at');
    probeDraft.publishCompiledAt = publishCompiledAt
      ? createPublishManifestProbe({
        name: 'publishCompiledAt',
        status: PUBLISH_MANIFEST_PROBE_STATUS.ready,
        value: publishCompiledAt,
      })
      : missingPublishManifestProbe('publishCompiledAt', 'compiler_state.publish_payload_compiled_at is required');

    const browserLayoutSource = readCompilerStateValue(rows, 'browser_layout_source');
    const itemBrowserGroupsCount = readCompilerStateValue(rows, 'item_browser_groups_count');
    const browserDefaultEntriesCount = readCompilerStateValue(rows, 'browser_default_entries_count');
    const browserLayoutUpdatedAt = asString(rows.find((row) => row.state_key === 'browser_layout_source')?.updated_at);
    const missingBrowserLayoutParts = [
      browserLayoutSource ? null : 'browser_layout_source',
      itemBrowserGroupsCount ? null : 'item_browser_groups_count',
      browserDefaultEntriesCount ? null : 'browser_default_entries_count',
      browserLayoutUpdatedAt ? null : 'browser_layout_source.updated_at',
    ].filter((value): value is string => Boolean(value));
    const browserLayoutKey = missingBrowserLayoutParts.length === 0
      ? [
        browserLayoutSource,
        itemBrowserGroupsCount,
        browserDefaultEntriesCount,
        browserLayoutUpdatedAt,
      ].join('::')
      : null;
    probeDraft.browserLayoutKey = browserLayoutKey
      ? createPublishManifestProbe({
        name: 'browserLayoutKey',
        status: PUBLISH_MANIFEST_PROBE_STATUS.ready,
        value: browserLayoutKey,
      })
      : missingPublishManifestProbe(
        'browserLayoutKey',
        `browser layout compiler_state rows are incomplete: ${missingBrowserLayoutParts.join(', ')}`,
      );

    const publishBundleRead = this.readPublishBundleManifest(sourceSignature);
    const publishBundle = publishBundleRead.value;
    probeDraft.publishBundle = publishBundleRead.probe;
    const publishedBrowserLayoutKey = readCompilerStateValue(rows, 'publish_payload_browser_layout_key');
    const publishIsOlderThanBrowserLayout = Boolean(
      publishBundle
        && browserLayoutKey
        && publishedBrowserLayoutKey
        && publishedBrowserLayoutKey !== browserLayoutKey,
    );
    if (publishIsOlderThanBrowserLayout) {
      probeDraft.publishBundle = createPublishManifestProbe({
        name: 'publishBundle',
        status: PUBLISH_MANIFEST_PROBE_STATUS.stale,
        path: publishBundleRead.probe.path,
        value: sourceSignature,
        message: `publish bundle browser layout key is stale: expected ${browserLayoutKey}, got ${publishedBrowserLayoutKey}`,
      });
    }

    const publishIdentityKey = asString(publishBundle?.identity?.contentHash);
    const blockedBeforeRuntimeCacheKey = Object.values(probeDraft)
      .some((probe) => probe?.status === PUBLISH_MANIFEST_PROBE_STATUS.invalid
        || probe?.status === PUBLISH_MANIFEST_PROBE_STATUS.missing);
    const staleBeforeRuntimeCacheKey = Object.values(probeDraft)
      .some((probe) => probe?.status === PUBLISH_MANIFEST_PROBE_STATUS.stale);
    const runtimeCacheKey = !blockedBeforeRuntimeCacheKey && !staleBeforeRuntimeCacheKey && publishIdentityKey
      ? [
        sourceSignature,
        publishRevision,
        publishCompiledAt,
        browserLayoutKey,
        publishIdentityKey,
      ].join('::')
      : '';
    probeDraft.runtimeCacheKey = runtimeCacheKey
      ? createPublishManifestProbe({
        name: 'runtimeCacheKey',
        status: PUBLISH_MANIFEST_PROBE_STATUS.ready,
        value: runtimeCacheKey,
      })
      : createPublishManifestProbe({
        name: 'runtimeCacheKey',
        status: staleBeforeRuntimeCacheKey
          ? PUBLISH_MANIFEST_PROBE_STATUS.stale
          : PUBLISH_MANIFEST_PROBE_STATUS.missing,
        message: staleBeforeRuntimeCacheKey
          ? 'runtime cache key is withheld while publish bundle is stale'
          : 'runtime cache key requires database, source signature, publish metadata, browser layout, and bundle identity',
      });
    const probes = summarizePublishManifestProbes(probeDraft);
    const manifest: PublicRuntimeManifest = {
      version: 1,
      status: probes.status,
      probes,
      sourceSignature,
      compiledAt: sourceSignatureRow?.updated_at ?? null,
      publishRevision,
      publishCompiledAt,
      browserLayoutKey,
      runtimeCacheKey,
      publishBundle: probes.status === PUBLISH_MANIFEST_STATUS.ready ? publishBundle : null,
    };

    this.cache = {
      value: manifest,
      expiresAt: now + this.cacheTtlMs,
    };
    return manifest;
  }

  invalidate(): void {
    this.cache = null;
  }

  getSourceSignature(): string {
    return this.getRuntimeManifest().sourceSignature;
  }
}

let publishManifestService: PublishManifestService | null = null;

export function getPublishManifestService(): PublishManifestService {
  if (!publishManifestService) {
    publishManifestService = new PublishManifestService();
  }
  return publishManifestService;
}
