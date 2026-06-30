import fs from 'fs';
import { resolveDistDataRuntimeFile } from './current-runtime-snapshot.service';
import { badRequest, notFound } from '../utils/http';

const CURRENT_RUNTIME_REPORTS = Object.freeze({
  'compile-report': 'rust/integrity.json',
  'missing-texture-report': 'rust/missing-texture-report.json',
  'suspicious-texture-report': 'rust/suspicious-texture-report.json',
  'atlas-report': 'textures/atlas-manifest.json',
  'performance-budget-report': 'rust/size-report.json',
  'api-contract-report': 'validation/report.json',
  'deployment-report': 'rust/deployment-report.json',
  'semantic-validation-report': 'rust/semantic-validation-report.json',
} as const);

export type CurrentRuntimeReportSlug = keyof typeof CURRENT_RUNTIME_REPORTS;

export type CurrentRuntimeReportDescriptor = Readonly<{
  slug: CurrentRuntimeReportSlug;
  relativePath: string;
  absolutePath: string;
  bytes: number;
  mtimeMs: number;
}>;

function hasCurrentRuntimeReport(slug: string): slug is CurrentRuntimeReportSlug {
  return Object.prototype.hasOwnProperty.call(CURRENT_RUNTIME_REPORTS, slug);
}

function normalizeCurrentRuntimeReportSlug(reportName: string | undefined): CurrentRuntimeReportSlug {
  const normalized = `${reportName ?? ''}`
    .trim()
    .replace(/\.json$/i, '')
    .trim();
  if (!normalized) throw badRequest('reportName is required');
  if (!/^[a-z0-9-]+$/i.test(normalized)) {
    throw badRequest('reportName must be a simple report slug');
  }
  if (!hasCurrentRuntimeReport(normalized)) {
    throw notFound('Runtime report is not allowed');
  }
  return normalized;
}

function statReportFile(absolutePath: string): fs.Stats | null {
  try {
    const stat = fs.statSync(absolutePath);
    return stat.isFile() ? stat : null;
  } catch {
    return null;
  }
}

export function resolveCurrentRuntimeReport(reportName: string | undefined): CurrentRuntimeReportDescriptor {
  const slug = normalizeCurrentRuntimeReportSlug(reportName);
  const relativePath = CURRENT_RUNTIME_REPORTS[slug];
  const absolutePath = resolveDistDataRuntimeFile(relativePath);
  const stat = statReportFile(absolutePath);
  if (!stat) {
    throw notFound('Runtime report not found');
  }
  return Object.freeze({
    slug,
    relativePath,
    absolutePath,
    bytes: stat.size,
    mtimeMs: stat.mtimeMs,
  });
}
