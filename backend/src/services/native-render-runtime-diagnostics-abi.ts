/**
 * Native render runtime diagnostics ABI catalog.
 *
 * The diagnostics service reports compiler/runtime capture readiness through
 * these explicit tokens instead of owning schema, status, check, or field
 * strings inline. New runtime report contracts must extend this catalog first.
 */

export const NATIVE_RENDER_RUNTIME_DIAGNOSTICS_SCHEMA = 'neonei/native-render-runtime-diagnostics/current';

export const NATIVE_RENDER_RUNTIME_DIAGNOSTIC_STATUS = Object.freeze({
  ok: 'ok',
  degraded: 'degraded',
  missing: 'missing',
} as const);

export type NativeRenderRuntimeDiagnosticStatus =
  typeof NATIVE_RENDER_RUNTIME_DIAGNOSTIC_STATUS[keyof typeof NATIVE_RENDER_RUNTIME_DIAGNOSTIC_STATUS];

export const NATIVE_RENDER_RUNTIME_MANIFEST_KEYS = Object.freeze({
  nativeRenderIndex: 'nativeRenderIndex',
} as const);

export type NativeRenderRuntimeManifestKey =
  typeof NATIVE_RENDER_RUNTIME_MANIFEST_KEYS[keyof typeof NATIVE_RENDER_RUNTIME_MANIFEST_KEYS];

export const NATIVE_RENDER_RUNTIME_CHECKS = Object.freeze({
  manifestPresent: 'manifestPresent',
  manifestDeclaresNativeRenderIndex: 'manifestDeclaresNativeRenderIndex',
  nativeRenderIndexPresent: 'nativeRenderIndexPresent',
  rendererIndexPresent: 'rendererIndexPresent',
  captureGateReady: 'captureGateReady',
} as const);

export type NativeRenderRuntimeCheckName =
  typeof NATIVE_RENDER_RUNTIME_CHECKS[keyof typeof NATIVE_RENDER_RUNTIME_CHECKS];

export type NativeRenderRuntimeChecks = Readonly<Record<NativeRenderRuntimeCheckName, boolean>>;

export const NATIVE_RENDER_RUNTIME_COUNT_FIELDS = Object.freeze({
  textureSprites: 'textureSprites',
  itemRenderers: 'itemRenderers',
  shaderItems: 'shaderItems',
  framebufferCaptures: 'framebufferCaptures',
  itemRendererByItemId: 'itemRendererByItemId',
  shaderByItemId: 'shaderByItemId',
  spriteByIconName: 'spriteByIconName',
} as const);

export type NativeRenderRuntimeCountField =
  typeof NATIVE_RENDER_RUNTIME_COUNT_FIELDS[keyof typeof NATIVE_RENDER_RUNTIME_COUNT_FIELDS];

export type NativeRenderRuntimeCounts = Readonly<Record<NativeRenderRuntimeCountField, number>>;

export const NATIVE_RENDER_RUNTIME_VALIDATION_FIELDS = Object.freeze({
  status: 'status',
  shaderItemsNeedingCapture: 'shaderItemsNeedingCapture',
  framebufferCaptures: 'framebufferCaptures',
  summary: 'summary',
} as const);

export type NativeRenderRuntimeValidation = Readonly<{
  [NATIVE_RENDER_RUNTIME_VALIDATION_FIELDS.status]: string | null;
  [NATIVE_RENDER_RUNTIME_VALIDATION_FIELDS.shaderItemsNeedingCapture]: number;
  [NATIVE_RENDER_RUNTIME_VALIDATION_FIELDS.framebufferCaptures]: number;
  [NATIVE_RENDER_RUNTIME_VALIDATION_FIELDS.summary]: string | null;
}>;

export const NATIVE_RENDER_RUNTIME_BLOCKED_STATUS = 'blocked';
