/** Current runtime artifact/read probe ABI catalog. */

export const CURRENT_RUNTIME_ARTIFACT_STATUS = Object.freeze({
  present: 'present',
  missing: 'missing',
  invalid: 'invalid',
} as const);

export type CurrentRuntimeArtifactProbeStatus =
  typeof CURRENT_RUNTIME_ARTIFACT_STATUS[keyof typeof CURRENT_RUNTIME_ARTIFACT_STATUS];

export type CurrentRuntimeArtifactReadKind = 'file' | 'json' | 'text';

export type CurrentRuntimeArtifactProbe = Readonly<{
  status: CurrentRuntimeArtifactProbeStatus;
  kind: CurrentRuntimeArtifactReadKind;
  path: string;
  relativePath: string | null;
  bytes: number | null;
  mtimeMs: number | null;
  error: string | null;
}>;
