import { NATIVE_UI_RUNTIME_PROOF_REPORTS } from './native-ui-runtime-proof-abi';

/** DebugFS report registry ABI catalog for current runtime diagnostics. */

export const CURRENT_RUNTIME_REPORTS = Object.freeze({
  'compile-report': 'rust/integrity.json',
  'missing-texture-report': 'rust/missing-texture-report.json',
  'suspicious-texture-report': 'rust/suspicious-texture-report.json',
  'atlas-report': 'textures/atlas-manifest.json',
  'performance-budget-report': 'rust/size-report.json',
  'api-contract-report': 'validation/report.json',
  'deployment-report': 'rust/deployment-report.json',
  'semantic-validation-report': 'rust/semantic-validation-report.json',
  [NATIVE_UI_RUNTIME_PROOF_REPORTS.nativeUiExportAbi.slug]: NATIVE_UI_RUNTIME_PROOF_REPORTS.nativeUiExportAbi.path,
  [NATIVE_UI_RUNTIME_PROOF_REPORTS.uiPackAbi.slug]: NATIVE_UI_RUNTIME_PROOF_REPORTS.uiPackAbi.path,
} as const);

export type CurrentRuntimeReportSlug = keyof typeof CURRENT_RUNTIME_REPORTS;

export const CURRENT_RUNTIME_REPORT_JSON_SUFFIX_PATTERN = /\.json$/i;
export const CURRENT_RUNTIME_REPORT_SLUG_PATTERN = /^[a-z0-9-]+$/i;

export const CURRENT_RUNTIME_REPORT_ERRORS = Object.freeze({
  reportNameRequired: 'reportName is required',
  invalidReportSlug: 'reportName must be a simple report slug',
  reportNotAllowed: 'Runtime report is not allowed',
  reportNotFound: 'Runtime report not found',
} as const);
