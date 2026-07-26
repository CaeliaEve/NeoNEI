/** Current runtime artifact/read probe ABI catalog. */

export const CURRENT_RUNTIME_ARTIFACT_STATUS = Object.freeze({
  present: 'present',
  missing: 'missing',
  invalid: 'invalid',
} as const);

export type CurrentRuntimeArtifactProbeStatus =
  typeof CURRENT_RUNTIME_ARTIFACT_STATUS[keyof typeof CURRENT_RUNTIME_ARTIFACT_STATUS];

export type CurrentRuntimeArtifactReadKind = 'file' | 'json' | 'text';

export const CURRENT_RUNTIME_ARTIFACT_PATHS = Object.freeze({
  distManifest: 'manifest.json',
  browserAtlasIndex: 'textures/browser-atlas-index.json',
  browserLayoutIndex: 'browser/item-catalog.json',
  uiFamilyCensus: 'rust/ui-pack/ui_family_census.json',
  uiTemplateCatalog: 'rust/ui-pack/ui_template_catalog.json',
  uiTemplateBindingIndex: 'rust/ui-pack/ui_template_binding_index.json',
  uiPayloadIndex: 'recipes/ui-payload-index.json',
} as const);

export type CurrentRuntimeArtifactPathKey = keyof typeof CURRENT_RUNTIME_ARTIFACT_PATHS;

export type CurrentRuntimeArtifactProbe = Readonly<{
  status: CurrentRuntimeArtifactProbeStatus;
  kind: CurrentRuntimeArtifactReadKind;
  path: string;
  relativePath: string | null;
  bytes: number | null;
  mtimeMs: number | null;
  error: string | null;
}>;
