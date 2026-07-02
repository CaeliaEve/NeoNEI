import fs from 'fs';
import { resolveDistDataRuntimeFile } from './current-runtime-artifact-index.service';
import {
  CURRENT_RUNTIME_REPORT_ERRORS,
  CURRENT_RUNTIME_REPORT_JSON_SUFFIX_PATTERN,
  CURRENT_RUNTIME_REPORT_SLUG_PATTERN,
  CURRENT_RUNTIME_REPORTS,
  type CurrentRuntimeReportSlug,
} from './current-runtime-report-registry-abi';
import { badRequest, notFound } from '../utils/http';

export type { CurrentRuntimeReportSlug } from './current-runtime-report-registry-abi';

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
    .replace(CURRENT_RUNTIME_REPORT_JSON_SUFFIX_PATTERN, '')
    .trim();
  if (!normalized) throw badRequest(CURRENT_RUNTIME_REPORT_ERRORS.reportNameRequired);
  if (!CURRENT_RUNTIME_REPORT_SLUG_PATTERN.test(normalized)) {
    throw badRequest(CURRENT_RUNTIME_REPORT_ERRORS.invalidReportSlug);
  }
  if (!hasCurrentRuntimeReport(normalized)) {
    throw notFound(CURRENT_RUNTIME_REPORT_ERRORS.reportNotAllowed);
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
    throw notFound(CURRENT_RUNTIME_REPORT_ERRORS.reportNotFound);
  }
  return Object.freeze({
    slug,
    relativePath,
    absolutePath,
    bytes: stat.size,
    mtimeMs: stat.mtimeMs,
  });
}
