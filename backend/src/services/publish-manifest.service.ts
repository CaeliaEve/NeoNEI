import fs from 'fs';
import path from 'path';
import { PUBLISH_OUTPUT_DIR } from '../config/runtime-paths';
import { getAccelerationDatabaseManager, type DatabaseManager } from '../models/database';
import {
  buildPublishBundleManifestRelativePath,
  type PublishStaticBundleManifest,
} from './publish-payload.service';

export interface PublicRuntimeManifest {
  version: 1;
  sourceSignature: string;
  compiledAt: string | null;
  publishRevision: string | null;
  publishCompiledAt: string | null;
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

export class PublishManifestService {
  private databaseManager: DatabaseManager;
  private cache: { expiresAt: number; value: PublicRuntimeManifest } | null = null;
  private readonly cacheTtlMs = Number(process.env.PUBLIC_MANIFEST_CACHE_TTL_MS || 10_000);

  constructor(options: PublishManifestServiceOptions = {}) {
    this.databaseManager = options.databaseManager ?? getAccelerationDatabaseManager();
  }

  private getAccelerationDatabase() {
    try {
      return this.databaseManager.getDatabase();
    } catch {
      return null;
    }
  }

  private readPublishBundleManifest(sourceSignature: string): PublishStaticBundleManifest | null {
    const normalizedSignature = `${sourceSignature ?? ''}`.trim();
    if (!normalizedSignature) {
      return null;
    }

    const manifestPath = path.join(
      PUBLISH_OUTPUT_DIR,
      normalizedSignature,
      buildPublishBundleManifestRelativePath(),
    );
    if (!fs.existsSync(manifestPath)) {
      return null;
    }

    try {
      const parsed = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as PublishStaticBundleManifest;
      if (parsed?.sourceSignature !== normalizedSignature) {
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  }

  getRuntimeManifest(): PublicRuntimeManifest {
    const now = Date.now();
    if (this.cache && this.cache.expiresAt > now) {
      return this.cache.value;
    }

    const db = this.getAccelerationDatabase();
    if (!db) {
      const fallback: PublicRuntimeManifest = {
        version: 1,
        sourceSignature: 'bootstrap-missing',
        compiledAt: null,
        publishRevision: null,
        publishCompiledAt: null,
        runtimeCacheKey: 'bootstrap-missing::publish-revision-missing::publish-compiled-at-missing',
        publishBundle: null,
      };
      this.cache = {
        value: fallback,
        expiresAt: now + this.cacheTtlMs,
      };
      return fallback;
    }

    const rows = db.prepare(`
      SELECT state_key, state_value, updated_at
      FROM compiler_state
      WHERE state_key IN ('source_signature', 'publish_payload_revision', 'publish_payload_compiled_at')
    `).all() as CompilerStateRow[];

    const sourceSignatureRow = rows.find((row) => row.state_key === 'source_signature');
    const publishRevisionRow = rows.find((row) => row.state_key === 'publish_payload_revision');
    const publishCompiledAtRow = rows.find((row) => row.state_key === 'publish_payload_compiled_at');
    const sourceSignature = `${sourceSignatureRow?.state_value ?? ''}`.trim() || 'source-signature-missing';
    const publishRevision = `${publishRevisionRow?.state_value ?? ''}`.trim() || null;
    const publishCompiledAt = `${publishCompiledAtRow?.state_value ?? ''}`.trim() || null;
    const publishBundle = this.readPublishBundleManifest(sourceSignature);
    const manifest: PublicRuntimeManifest = {
      version: 1,
      sourceSignature,
      compiledAt: sourceSignatureRow?.updated_at ?? null,
      publishRevision,
      publishCompiledAt,
      runtimeCacheKey: [sourceSignature, publishRevision ?? 'publish-revision-missing', publishCompiledAt ?? 'publish-compiled-at-missing'].join('::'),
      publishBundle,
    };

    this.cache = {
      value: manifest,
      expiresAt: now + this.cacheTtlMs,
    };
    return manifest;
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
