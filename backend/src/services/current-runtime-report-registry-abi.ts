import { NATIVE_UI_RUNTIME_PROOF_REPORTS } from './native-ui-runtime-proof-abi';

/** DebugFS report registry ABI catalog for current runtime diagnostics. */

export const CURRENT_RUNTIME_REPORT_REGISTRY_SCHEMA = 'neonei/debugfs/current-runtime-report-registry' as const;
export const CURRENT_RUNTIME_REPORT_REGISTRY_SCHEMA_REVISION = 1 as const;
export const CURRENT_RUNTIME_REPORT_REGISTRY_MODULE = 'current-runtime-report-registry' as const;
export const CURRENT_RUNTIME_REPORT_PLANE = 'debugfs' as const;
export const CURRENT_RUNTIME_REPORT_CONTENT_TYPE = 'application/json' as const;
export const CURRENT_RUNTIME_REPORT_CACHE_POLICY = 'no-store' as const;

export type CurrentRuntimeReportPlane = typeof CURRENT_RUNTIME_REPORT_PLANE;
export type CurrentRuntimeReportContentType = typeof CURRENT_RUNTIME_REPORT_CONTENT_TYPE;
export type CurrentRuntimeReportCachePolicy = typeof CURRENT_RUNTIME_REPORT_CACHE_POLICY;

export type CurrentRuntimeReportCatalogDescriptor = Readonly<{
  slug: string;
  path: string;
  plane: CurrentRuntimeReportPlane;
  contentType: CurrentRuntimeReportContentType;
  cachePolicy: CurrentRuntimeReportCachePolicy;
  capability: string;
  description: string;
}>;

function reportDescriptor<TSlug extends string>(
  slug: TSlug,
  path: string,
  capability: string,
  description: string,
): Readonly<{
  slug: TSlug;
  path: string;
  plane: CurrentRuntimeReportPlane;
  contentType: CurrentRuntimeReportContentType;
  cachePolicy: CurrentRuntimeReportCachePolicy;
  capability: string;
  description: string;
}> {
  return Object.freeze({
    slug,
    path,
    plane: CURRENT_RUNTIME_REPORT_PLANE,
    contentType: CURRENT_RUNTIME_REPORT_CONTENT_TYPE,
    cachePolicy: CURRENT_RUNTIME_REPORT_CACHE_POLICY,
    capability,
    description,
  });
}

export const CURRENT_RUNTIME_REPORT_DESCRIPTORS = Object.freeze([
  reportDescriptor(
    'compile-report',
    'rust/integrity.json',
    'runtime.compile.integrity',
    'Compiler integrity and artifact inventory report.',
  ),
  reportDescriptor(
    'missing-texture-report',
    'rust/missing-texture-report.json',
    'runtime.textures.missing',
    'Missing texture diagnostics for the current runtime.',
  ),
  reportDescriptor(
    'suspicious-texture-report',
    'rust/suspicious-texture-report.json',
    'runtime.textures.suspicious',
    'Suspicious texture diagnostics for the current runtime.',
  ),
  reportDescriptor(
    'atlas-report',
    'textures/atlas-manifest.json',
    'runtime.textures.atlas',
    'Texture atlas manifest emitted by the compiler.',
  ),
  reportDescriptor(
    'performance-budget-report',
    'rust/size-report.json',
    'runtime.performance.budget',
    'Compiled runtime size and performance budget report.',
  ),
  reportDescriptor(
    'api-contract-report',
    'validation/report.json',
    'runtime.api.contract',
    'Runtime API contract validation report.',
  ),
  reportDescriptor(
    'deployment-report',
    'rust/deployment-report.json',
    'runtime.deployment',
    'Runtime deployment artifact report.',
  ),
  reportDescriptor(
    'semantic-validation-report',
    'rust/semantic-validation-report.json',
    'runtime.semantic.validation',
    'Runtime semantic validation report.',
  ),
  reportDescriptor(
    NATIVE_UI_RUNTIME_PROOF_REPORTS.nativeUiExportAbi.slug,
    NATIVE_UI_RUNTIME_PROOF_REPORTS.nativeUiExportAbi.path,
    'runtime.native-ui.export-abi',
    'Native UI export ABI proof report.',
  ),
  reportDescriptor(
    NATIVE_UI_RUNTIME_PROOF_REPORTS.uiPackAbi.slug,
    NATIVE_UI_RUNTIME_PROOF_REPORTS.uiPackAbi.path,
    'runtime.native-ui.pack-abi',
    'Native UI pack ABI proof report.',
  ),
] as const satisfies readonly CurrentRuntimeReportCatalogDescriptor[]);

export type CurrentRuntimeReportCatalogEntry = (typeof CURRENT_RUNTIME_REPORT_DESCRIPTORS)[number];
export type CurrentRuntimeReportSlug = CurrentRuntimeReportCatalogEntry['slug'];

export const CURRENT_RUNTIME_REPORTS_BY_SLUG = Object.freeze(
  CURRENT_RUNTIME_REPORT_DESCRIPTORS.reduce(
    (catalog, descriptor) => {
      catalog[descriptor.slug] = descriptor;
      return catalog;
    },
    {} as Record<CurrentRuntimeReportSlug, CurrentRuntimeReportCatalogEntry>,
  ),
);
export const CURRENT_RUNTIME_REPORT_JSON_SUFFIX_PATTERN = /\.json$/i;
export const CURRENT_RUNTIME_REPORT_SLUG_PATTERN = /^[a-z0-9-]+$/i;

export const CURRENT_RUNTIME_REPORT_ERRORS = Object.freeze({
  reportNameRequired: 'reportName is required',
  invalidReportSlug: 'reportName must be a simple report slug',
  reportNotAllowed: 'Runtime report is not allowed',
  reportNotFound: 'Runtime report not found',
} as const);
