import fs from 'fs';
import path from 'path';
import { PUBLISH_OUTPUT_DIR } from '../config/runtime-paths';
import { getAccelerationDatabaseManager, type DatabaseManager } from '../models/database';
import { buildPublishBundleManifestRelativePath, type PublishStaticBundleManifest } from './publish-payload.service';

export interface PublishReleaseSummary {
  sourceSignature: string;
  active: boolean;
  compiledAt: string | null;
  revision: string | null;
  contentHash: string | null;
  assetCount: number | null;
  totalBytes: number | null;
  bestCompressedBytes: number | null;
  compressionRatio: number | null;
  warningCount: number;
  warnings: string[];
  recipeCoverage: PublishStaticBundleManifest['recipeCoverage'] | null;
  manifestPath: string;
  buildReportPath: string | null;
  mtimeMs: number;
}

export interface PublishRollbackResult {
  activated: PublishReleaseSummary;
  previousSourceSignature: string | null;
}

type BuildReport = {
  bytes?: {
    uncompressed?: number;
    bestCompressed?: number;
    compressionRatio?: number | null;
  };
  warnings?: string[];
};

type CompilerStateRow = { state_value?: string | null };

function safeReadJson<T>(filePath: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
  } catch {
    return null;
  }
}

function getActiveSourceSignature(databaseManager: DatabaseManager): string | null {
  try {
    const db = databaseManager.getDatabase();
    const row = db.prepare("SELECT state_value FROM compiler_state WHERE state_key = 'source_signature'").get() as CompilerStateRow | undefined;
    return `${row?.state_value ?? ''}`.trim() || null;
  } catch {
    return null;
  }
}

export class PublishReleaseService {
  private databaseManager: DatabaseManager;
  private publishOutputDir: string;

  constructor(options: { databaseManager?: DatabaseManager; publishOutputDir?: string } = {}) {
    this.databaseManager = options.databaseManager ?? getAccelerationDatabaseManager();
    this.publishOutputDir = options.publishOutputDir ?? PUBLISH_OUTPUT_DIR;
  }

  listReleases(): PublishReleaseSummary[] {
    if (!fs.existsSync(this.publishOutputDir)) return [];
    const activeSourceSignature = getActiveSourceSignature(this.databaseManager);
    return fs.readdirSync(this.publishOutputDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => this.readRelease(entry.name, activeSourceSignature))
      .filter((entry): entry is PublishReleaseSummary => Boolean(entry))
      .sort((left, right) => Number(right.active) - Number(left.active) || right.mtimeMs - left.mtimeMs);
  }

  getRelease(sourceSignature: string): PublishReleaseSummary | null {
    return this.readRelease(sourceSignature, getActiveSourceSignature(this.databaseManager));
  }

  activateRelease(sourceSignature: string): PublishRollbackResult {
    const release = this.getRelease(sourceSignature);
    if (!release) {
      throw new Error(`Publish release not found: ${sourceSignature}`);
    }
    const manifest = safeReadJson<PublishStaticBundleManifest>(release.manifestPath);
    if (!manifest || manifest.sourceSignature !== release.sourceSignature) {
      throw new Error(`Publish release manifest is invalid: ${sourceSignature}`);
    }

    const previousSourceSignature = getActiveSourceSignature(this.databaseManager);
    const db = this.databaseManager.getDatabase();
    const upsertState = db.prepare(`
      INSERT INTO compiler_state (state_key, state_value, updated_at)
      VALUES (@state_key, @state_value, CURRENT_TIMESTAMP)
      ON CONFLICT(state_key) DO UPDATE SET
        state_value = excluded.state_value,
        updated_at = CURRENT_TIMESTAMP
    `);

    const tx = db.transaction(() => {
      upsertState.run({ state_key: 'source_signature', state_value: manifest.sourceSignature });
      upsertState.run({ state_key: 'publish_payload_revision', state_value: manifest.revision });
      upsertState.run({ state_key: 'publish_payload_compiled_at', state_value: manifest.compiledAt });
      upsertState.run({ state_key: 'publish_payload_signature', state_value: manifest.identity?.contentHash ?? '' });
      upsertState.run({ state_key: 'publish_payloads_count', state_value: String(manifest.identity?.assetCount ?? 0) });
      upsertState.run({ state_key: 'publish_rollback_previous_source_signature', state_value: previousSourceSignature ?? '' });
      upsertState.run({ state_key: 'publish_rollback_activated_at', state_value: new Date().toISOString() });
    });
    tx();

    return {
      activated: { ...release, active: true },
      previousSourceSignature,
    };
  }

  private readRelease(sourceSignature: string, activeSourceSignature: string | null): PublishReleaseSummary | null {
    const normalized = `${sourceSignature ?? ''}`.trim();
    if (!normalized) return null;
    const releaseDir = path.join(this.publishOutputDir, normalized);
    const manifestPath = path.join(releaseDir, buildPublishBundleManifestRelativePath());
    if (!fs.existsSync(manifestPath)) return null;
    const manifest = safeReadJson<PublishStaticBundleManifest>(manifestPath);
    if (!manifest?.sourceSignature) return null;
    const manifestStats = fs.statSync(manifestPath);
    const buildReportPath = path.join(releaseDir, 'build-report.json');
    const buildReport = fs.existsSync(buildReportPath) ? safeReadJson<BuildReport>(buildReportPath) : null;
    const warnings = Array.isArray(buildReport?.warnings) ? buildReport.warnings : [];
    return {
      sourceSignature: manifest.sourceSignature,
      active: manifest.sourceSignature === activeSourceSignature,
      compiledAt: manifest.compiledAt ?? null,
      revision: manifest.revision ?? null,
      contentHash: manifest.identity?.contentHash ?? null,
      assetCount: manifest.identity?.assetCount ?? null,
      totalBytes: buildReport?.bytes?.uncompressed ?? manifest.identity?.totalBytes ?? null,
      bestCompressedBytes: buildReport?.bytes?.bestCompressed ?? null,
      compressionRatio: buildReport?.bytes?.compressionRatio ?? null,
      warningCount: warnings.length,
      warnings,
      recipeCoverage: manifest.recipeCoverage ?? null,
      manifestPath,
      buildReportPath: fs.existsSync(buildReportPath) ? buildReportPath : null,
      mtimeMs: manifestStats.mtimeMs,
    };
  }
}

let publishReleaseService: PublishReleaseService | null = null;

export function getPublishReleaseService(): PublishReleaseService {
  if (!publishReleaseService) {
    publishReleaseService = new PublishReleaseService();
  }
  return publishReleaseService;
}
