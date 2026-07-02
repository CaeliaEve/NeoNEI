import {
  isPortableRuntimePath,
  normalizeRuntimePath,
  readCurrentRuntimeJson,
  resolveDistDataRuntimeFile,
  type CurrentRuntimeArtifact,
  type CurrentRuntimeJsonRecord,
} from './current-runtime-artifact-index.service';
import type { CurrentRuntimeSnapshot } from './current-runtime-snapshot.service';
import {
  countNativeUiExportAbiReportViolations,
  validateNativeUiExportAbiReport,
} from './native-ui-pack-abi';
import {
  NATIVE_UI_EXPORT_ABI_PROOF_SPEC,
  NATIVE_UI_PROOF_LOGICAL_NAMES,
  NATIVE_UI_PROOF_REPORT_FIELDS,
  NATIVE_UI_PROOF_STATUS,
  NATIVE_UI_RUNTIME_PROOF_POLICY,
  NATIVE_UI_RUNTIME_PROOF_SCHEMA_VERSION,
  UI_PACK_ABI_PROOF_SPEC,
  UI_PACK_REQUIRED_ARTIFACTS,
  type NativeUiProofSpec,
  type NativeUiProofStatus,
} from './native-ui-runtime-proof-abi';

type JsonRecord = CurrentRuntimeJsonRecord;

export type NativeUiProofReportSummary = Readonly<{
  logicalName: NativeUiProofSpec['logicalName'];
  displayName: string;
  path: string;
  declared: boolean;
  present: boolean;
  bytes: number | null;
  mtimeMs: number | null;
  schemaVersion: string | null;
  status: NativeUiProofStatus;
  reportStatus: string | null;
  blocked: readonly string[];
  counts: Readonly<Record<string, number | null>>;
}>;

export type NativeUiRuntimeProofSummary = Readonly<{
  schemaVersion: typeof NATIVE_UI_RUNTIME_PROOF_SCHEMA_VERSION;
  status: NativeUiProofStatus;
  policy: Readonly<{
    legacyFallback: typeof NATIVE_UI_RUNTIME_PROOF_POLICY.legacyFallback;
    missingProof: typeof NATIVE_UI_RUNTIME_PROOF_POLICY.missingProof;
    invalidProof: typeof NATIVE_UI_RUNTIME_PROOF_POLICY.invalidProof;
    reportPlane: typeof NATIVE_UI_RUNTIME_PROOF_POLICY.reportPlane;
  }>;
  reports: Readonly<{
    nativeUiExportAbi: NativeUiProofReportSummary;
    uiPackAbi: NativeUiProofReportSummary;
  }>;
  checks: Readonly<{
    nativeUiExportAbiReportOk: boolean;
    uiPackAbiReportOk: boolean;
    allReportsDeclared: boolean;
    allReportsPresent: boolean;
    legacyFallbackForbidden: boolean;
  }>;
  counts: Readonly<{
    layouts: number | null;
    slots: number | null;
    uiPackArtifacts: number | null;
    uiPackArtifactBytes: number | null;
    violationCount: number;
  }>;
  missing: readonly string[];
  blocked: readonly string[];
}>;

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : null;
}

function asString(value: unknown): string | null {
  const text = `${value ?? ''}`.trim();
  return text || null;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((entry) => `${entry ?? ''}`.trim()).filter(Boolean) : [];
}

function asNumber(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function recordValuePath(record: JsonRecord | null, keys: readonly string[]): string | null {
  if (!record) return null;
  for (const key of keys) {
    const value = record[key];
    if (isPortableRuntimePath(value)) {
      return normalizeRuntimePath(value);
    }
  }
  return null;
}

function collectManifestPaths(value: unknown, output: Set<string>): void {
  if (isPortableRuntimePath(value)) {
    output.add(normalizeRuntimePath(value));
    return;
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      const entryRecord = asRecord(entry);
      if (entryRecord) {
        collectManifestPaths(entryRecord.path, output);
      } else {
        collectManifestPaths(entry, output);
      }
    }
    return;
  }
  const record = asRecord(value);
  if (!record) return;
  for (const entry of Object.values(record)) {
    collectManifestPaths(entry, output);
  }
}

function manifestDeclaresPath(manifest: JsonRecord | null, relativePath: string): boolean {
  if (!manifest || !isPortableRuntimePath(relativePath)) return false;
  const normalized = normalizeRuntimePath(relativePath);
  const declared = new Set<string>();
  collectManifestPaths(asRecord(manifest.entrypoints), declared);
  collectManifestPaths(manifest.files, declared);
  return declared.has(normalized);
}

function resolveReportPath(
  spec: NativeUiProofSpec,
  distManifest: JsonRecord | null,
  runtimeManifest: JsonRecord | null,
): string {
  const runtimeEntrypoint = recordValuePath(asRecord(runtimeManifest?.entrypoints), spec.candidateKeys);
  if (runtimeEntrypoint) return runtimeEntrypoint;

  const runtimeFile = recordValuePath(asRecord(runtimeManifest?.files), spec.candidateKeys);
  if (runtimeFile) return runtimeFile;

  const distFile = recordValuePath(asRecord(distManifest?.files), spec.candidateKeys);
  if (distFile) return distFile;

  return spec.defaultPath;
}

function getDeclaredArtifact(
  snapshot: CurrentRuntimeSnapshot | null,
  relativePath: string,
): CurrentRuntimeArtifact | null {
  if (!snapshot || !isPortableRuntimePath(relativePath)) return null;
  const normalized = normalizeRuntimePath(relativePath);
  if (!snapshot.declaredFiles.includes(normalized)) return null;
  return snapshot.artifactsByPath[normalized] ?? null;
}

function readDeclaredReport(
  snapshot: CurrentRuntimeSnapshot | null,
  relativePath: string,
): JsonRecord | null {
  const artifact = getDeclaredArtifact(snapshot, relativePath);
  if (!artifact) return null;
  return readCurrentRuntimeJson(resolveDistDataRuntimeFile(artifact.relativePath));
}

function pushIf(condition: boolean, output: string[], message: string): void {
  if (condition) output.push(message);
}

function reportArtifacts(report: JsonRecord | null): JsonRecord[] {
  const artifacts = report?.[NATIVE_UI_PROOF_REPORT_FIELDS.artifacts];
  return Array.isArray(artifacts)
    ? artifacts.map(asRecord).filter((entry): entry is JsonRecord => Boolean(entry))
    : [];
}

function artifactByLogicalName(report: JsonRecord): Map<string, JsonRecord> {
  const artifacts = reportArtifacts(report);
  return new Map(artifacts.map((artifact) => [asString(artifact[NATIVE_UI_PROOF_REPORT_FIELDS.logicalName]) ?? '', artifact]));
}

function countUiPackArtifactBytes(report: JsonRecord | null): number | null {
  if (!report || !Array.isArray(report[NATIVE_UI_PROOF_REPORT_FIELDS.artifacts])) return null;
  let total = 0;
  for (const artifact of reportArtifacts(report)) {
    total += asNumber(artifact[NATIVE_UI_PROOF_REPORT_FIELDS.bytes]) ?? 0;
  }
  return total;
}

function validateUiPackAbiReport(report: JsonRecord | null): string[] {
  const blocked: string[] = [];
  pushIf(!report, blocked, 'native UI pack ABI report is missing or unreadable');
  if (!report) return blocked;
  const policy = asRecord(report[NATIVE_UI_PROOF_REPORT_FIELDS.policy]);

  pushIf(
    asString(report[NATIVE_UI_PROOF_REPORT_FIELDS.schemaVersion]) !== UI_PACK_ABI_PROOF_SPEC.expectedSchemaVersion,
    blocked,
    'native UI pack ABI report schema mismatch',
  );
  pushIf(
    asString(report[NATIVE_UI_PROOF_REPORT_FIELDS.status]) !== NATIVE_UI_PROOF_STATUS.ok,
    blocked,
    'native UI pack ABI report status is not ok',
  );
  pushIf(
    asString(policy?.[NATIVE_UI_PROOF_REPORT_FIELDS.legacyFallback])
      !== NATIVE_UI_RUNTIME_PROOF_POLICY.legacyFallback,
    blocked,
    'native UI pack ABI report must forbid legacy fallback',
  );
  pushIf(
    asStringArray(report[NATIVE_UI_PROOF_REPORT_FIELDS.missingRequiredArtifacts]).length > 0,
    blocked,
    'native UI pack ABI missing required artifacts',
  );
  pushIf(
    asStringArray(report[NATIVE_UI_PROOF_REPORT_FIELDS.sectionViolations]).length > 0,
    blocked,
    'native UI pack ABI section violations are present',
  );

  const artifacts = artifactByLogicalName(report);
  for (const expected of UI_PACK_REQUIRED_ARTIFACTS) {
    const artifact = artifacts.get(expected.logicalName) ?? null;
    pushIf(!artifact, blocked, `native UI pack ABI missing artifact ${expected.logicalName}`);
    if (!artifact) continue;
    pushIf(
      asString(artifact[NATIVE_UI_PROOF_REPORT_FIELDS.artifactStatus])
        !== NATIVE_UI_PROOF_REPORT_FIELDS.artifactPresentStatus,
      blocked,
      `native UI pack ABI artifact is not present: ${expected.logicalName}`,
    );
    pushIf(
      asString(artifact[NATIVE_UI_PROOF_REPORT_FIELDS.envelopeSchema]) !== expected.envelopeSchema,
      blocked,
      `native UI pack ABI envelope schema mismatch: ${expected.logicalName}`,
    );
    pushIf(
      asString(artifact[NATIVE_UI_PROOF_REPORT_FIELDS.payloadMagic]) !== expected.payloadMagic,
      blocked,
      `native UI pack ABI payload magic mismatch: ${expected.logicalName}`,
    );
    pushIf(
      asNumber(artifact[NATIVE_UI_PROOF_REPORT_FIELDS.version]) !== expected.version,
      blocked,
      `native UI pack ABI payload version mismatch: ${expected.logicalName}`,
    );
  }
  return blocked;
}

function buildReportSummary(
  spec: NativeUiProofSpec,
  distManifest: JsonRecord | null,
  snapshot: CurrentRuntimeSnapshot | null,
): NativeUiProofReportSummary {
  const path = resolveReportPath(spec, distManifest, snapshot?.manifest ?? null);
  const portablePath = isPortableRuntimePath(path) ? normalizeRuntimePath(path) : '';
  const artifact = portablePath ? getDeclaredArtifact(snapshot, portablePath) : null;
  const declared = Boolean(
    portablePath
      && (snapshot?.declaredFiles.includes(portablePath) || manifestDeclaresPath(snapshot?.manifest ?? null, portablePath)),
  );
  const report = portablePath ? readDeclaredReport(snapshot, portablePath) : null;
  const baseBlocked: string[] = [];
  pushIf(!portablePath, baseBlocked, `${spec.displayName} path is not portable`);
  pushIf(!declared, baseBlocked, `${spec.displayName} is not declared by the runtime manifest`);
  pushIf(!artifact, baseBlocked, `${spec.displayName} artifact is missing`);
  const reportBlocked = spec.logicalName === NATIVE_UI_PROOF_LOGICAL_NAMES.nativeUiExportAbi
    ? validateNativeUiExportAbiReport(report)
    : validateUiPackAbiReport(report);
  const blocked = Object.freeze([...baseBlocked, ...reportBlocked]);
  const status: NativeUiProofStatus = !artifact || !declared
    ? NATIVE_UI_PROOF_STATUS.missing
    : blocked.length === 0 ? NATIVE_UI_PROOF_STATUS.ok : NATIVE_UI_PROOF_STATUS.blocked;

  return Object.freeze({
    logicalName: spec.logicalName,
    displayName: spec.displayName,
    path: portablePath || path,
    declared,
    present: Boolean(artifact && report),
    bytes: artifact?.bytes ?? null,
    mtimeMs: artifact?.mtimeMs ?? null,
    schemaVersion: asString(report?.[NATIVE_UI_PROOF_REPORT_FIELDS.schemaVersion]),
    status,
    reportStatus: asString(report?.[NATIVE_UI_PROOF_REPORT_FIELDS.status]),
    blocked,
    counts: Object.freeze({
      layouts: asNumber(report?.[NATIVE_UI_PROOF_REPORT_FIELDS.layoutCount]),
      slots: asNumber(report?.[NATIVE_UI_PROOF_REPORT_FIELDS.slotCount]),
      rects: asNumber(report?.[NATIVE_UI_PROOF_REPORT_FIELDS.rectCount]),
      primitives: asNumber(report?.[NATIVE_UI_PROOF_REPORT_FIELDS.primitiveCount]),
      missingSurfaces: asNumber(report?.[NATIVE_UI_PROOF_REPORT_FIELDS.missingSurfaceCount]),
      slotBoundsViolations: asNumber(report?.[NATIVE_UI_PROOF_REPORT_FIELDS.slotBoundsViolationCount]),
      rectBoundsViolations: asNumber(report?.[NATIVE_UI_PROOF_REPORT_FIELDS.rectBoundsViolationCount]),
      primitiveBoundsViolations: asNumber(report?.[NATIVE_UI_PROOF_REPORT_FIELDS.primitiveBoundsViolationCount]),
      backgroundBoundsViolations: asNumber(report?.[NATIVE_UI_PROOF_REPORT_FIELDS.backgroundBoundsViolationCount]),
      coordinateContractViolations: asNumber(report?.[NATIVE_UI_PROOF_REPORT_FIELDS.coordinateContractViolationCount]),
      interactionContractViolations: asNumber(report?.[NATIVE_UI_PROOF_REPORT_FIELDS.interactionContractViolationCount]),
      artifacts: report ? reportArtifacts(report).length : null,
      artifactBytes: countUiPackArtifactBytes(report),
      violations: spec.logicalName === NATIVE_UI_PROOF_LOGICAL_NAMES.nativeUiExportAbi
        ? countNativeUiExportAbiReportViolations(report)
        : asStringArray(report?.[NATIVE_UI_PROOF_REPORT_FIELDS.missingRequiredArtifacts]).length
          + asStringArray(report?.[NATIVE_UI_PROOF_REPORT_FIELDS.sectionViolations]).length,
    }),
  });
}

function mergeStatus(reports: readonly NativeUiProofReportSummary[]): NativeUiProofStatus {
  if (reports.some((report) => report.status === NATIVE_UI_PROOF_STATUS.blocked)) {
    return NATIVE_UI_PROOF_STATUS.blocked;
  }
  if (reports.some((report) => report.status === NATIVE_UI_PROOF_STATUS.missing)) {
    return NATIVE_UI_PROOF_STATUS.missing;
  }
  return NATIVE_UI_PROOF_STATUS.ok;
}

export function getNativeUiRuntimeProofSummary(
  distManifest: JsonRecord | null,
  snapshot: CurrentRuntimeSnapshot | null,
): NativeUiRuntimeProofSummary {
  const nativeUiExportAbi = buildReportSummary(NATIVE_UI_EXPORT_ABI_PROOF_SPEC, distManifest, snapshot);
  const uiPackAbi = buildReportSummary(UI_PACK_ABI_PROOF_SPEC, distManifest, snapshot);
  const reports = Object.freeze({ nativeUiExportAbi, uiPackAbi });
  const reportList = [nativeUiExportAbi, uiPackAbi] as const;
  const missing = reportList
    .filter((report) => report.status === NATIVE_UI_PROOF_STATUS.missing)
    .map((report) => report.logicalName);
  const blocked = reportList.flatMap((report) => report.blocked);
  const legacyFallbackForbidden = reportList.every((report) => (
    !report.present || report.blocked.every((reason) => !reason.includes('legacy fallback'))
  ));
  const status = mergeStatus(reportList);

  return Object.freeze({
    schemaVersion: NATIVE_UI_RUNTIME_PROOF_SCHEMA_VERSION,
    status,
    policy: NATIVE_UI_RUNTIME_PROOF_POLICY,
    reports,
    checks: Object.freeze({
      nativeUiExportAbiReportOk: nativeUiExportAbi.status === NATIVE_UI_PROOF_STATUS.ok,
      uiPackAbiReportOk: uiPackAbi.status === NATIVE_UI_PROOF_STATUS.ok,
      allReportsDeclared: reportList.every((report) => report.declared),
      allReportsPresent: reportList.every((report) => report.present),
      legacyFallbackForbidden,
    }),
    counts: Object.freeze({
      layouts: nativeUiExportAbi.counts.layouts,
      slots: nativeUiExportAbi.counts.slots,
      uiPackArtifacts: uiPackAbi.counts.artifacts,
      uiPackArtifactBytes: uiPackAbi.counts.artifactBytes,
      violationCount: reportList.reduce((total, report) => total + (report.counts.violations ?? 0), 0),
    }),
    missing: Object.freeze(missing),
    blocked: Object.freeze(blocked),
  });
}
