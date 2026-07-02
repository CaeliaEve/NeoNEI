import fs from 'fs';
import { resolveDistDataRuntimeFile } from './current-runtime-artifact-index.service';
import {
  CURRENT_RUNTIME_REPORT_ERRORS,
  CURRENT_RUNTIME_REPORT_JSON_SUFFIX_PATTERN,
  CURRENT_RUNTIME_REPORT_SLUG_PATTERN,
  CURRENT_RUNTIME_REPORTS_BY_SLUG,
  type CurrentRuntimeReportCachePolicy,
  type CurrentRuntimeReportCatalogEntry,
  type CurrentRuntimeReportContentType,
  type CurrentRuntimeReportPlane,
  type CurrentRuntimeReportSlug,
} from './current-runtime-report-registry-abi';
import { badRequest, notFound } from '../utils/http';

export type { CurrentRuntimeReportSlug } from './current-runtime-report-registry-abi';

export type CurrentRuntimeReportDescriptor = Readonly<{
  report: CurrentRuntimeReportCatalogEntry;
  slug: CurrentRuntimeReportSlug;
  relativePath: string;
  absolutePath: string;
  plane: CurrentRuntimeReportPlane;
  contentType: CurrentRuntimeReportContentType;
  cachePolicy: CurrentRuntimeReportCachePolicy;
  bytes: number;
  mtimeMs: number;
}>;

function getCurrentRuntimeReportDescriptor(slug: string): CurrentRuntimeReportCatalogEntry | null {
  const descriptor = CURRENT_RUNTIME_REPORTS_BY_SLUG[slug as CurrentRuntimeReportSlug];
  return descriptor?.slug === slug ? descriptor : null;
}

function normalizeCurrentRuntimeReportSlug(reportName: string | undefined): CurrentRuntimeReportCatalogEntry {
  const normalized = `${reportName ?? ''}`
    .trim()
    .replace(CURRENT_RUNTIME_REPORT_JSON_SUFFIX_PATTERN, '')
    .trim();
  if (!normalized) throw badRequest(CURRENT_RUNTIME_REPORT_ERRORS.reportNameRequired);
  if (!CURRENT_RUNTIME_REPORT_SLUG_PATTERN.test(normalized)) {
    throw badRequest(CURRENT_RUNTIME_REPORT_ERRORS.invalidReportSlug);
  }
  const descriptor = getCurrentRuntimeReportDescriptor(normalized);
  if (!descriptor) {
    throw notFound(CURRENT_RUNTIME_REPORT_ERRORS.reportNotAllowed);
  }
  return descriptor;
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
  const descriptor = normalizeCurrentRuntimeReportSlug(reportName);
  const absolutePath = resolveDistDataRuntimeFile(descriptor.path);
  const stat = statReportFile(absolutePath);
  if (!stat) {
    throw notFound(CURRENT_RUNTIME_REPORT_ERRORS.reportNotFound);
  }
  return Object.freeze({
    report: descriptor,
    slug: descriptor.slug,
    relativePath: descriptor.path,
    absolutePath,
    plane: descriptor.plane,
    contentType: descriptor.contentType,
    cachePolicy: descriptor.cachePolicy,
    bytes: stat.size,
    mtimeMs: stat.mtimeMs,
  });
}
