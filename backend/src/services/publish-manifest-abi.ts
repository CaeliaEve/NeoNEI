export const PUBLISH_MANIFEST_STATUS = Object.freeze({
  ready: 'ready',
  blocked: 'blocked',
  stale: 'stale',
} as const);

export type PublishManifestStatus =
  typeof PUBLISH_MANIFEST_STATUS[keyof typeof PUBLISH_MANIFEST_STATUS];

export const PUBLISH_MANIFEST_PROBE_STATUS = Object.freeze({
  ready: 'ready',
  missing: 'missing',
  invalid: 'invalid',
  stale: 'stale',
} as const);

export type PublishManifestProbeStatus =
  typeof PUBLISH_MANIFEST_PROBE_STATUS[keyof typeof PUBLISH_MANIFEST_PROBE_STATUS];

export type PublishManifestProbeName =
  | 'database'
  | 'sourceSignature'
  | 'publishRevision'
  | 'publishCompiledAt'
  | 'browserLayoutKey'
  | 'publishBundle'
  | 'runtimeCacheKey';

export type PublishManifestProbeDescriptor = Readonly<{
  name: PublishManifestProbeName;
  required: true;
  description: string;
}>;

const PUBLISH_MANIFEST_PROBE_NAMES = Object.freeze([
  'database',
  'sourceSignature',
  'publishRevision',
  'publishCompiledAt',
  'browserLayoutKey',
  'publishBundle',
  'runtimeCacheKey',
] as const satisfies readonly PublishManifestProbeName[]);

function publishManifestProbeDescriptor(
  name: PublishManifestProbeName,
  description: string,
): PublishManifestProbeDescriptor {
  return Object.freeze({
    name,
    required: true,
    description,
  });
}

function validateAndFreezePublishManifestProbeDescriptors(
  descriptors: readonly PublishManifestProbeDescriptor[],
): readonly PublishManifestProbeDescriptor[] {
  const expected = new Set<PublishManifestProbeName>(PUBLISH_MANIFEST_PROBE_NAMES);
  const seen = new Set<PublishManifestProbeName>();

  for (const descriptor of descriptors) {
    if (!descriptor) {
      throw new Error('publish manifest probe descriptor must not be null');
    }
    if (!expected.has(descriptor.name)) {
      throw new Error(`Unknown publish manifest probe descriptor: ${descriptor.name}`);
    }
    if (!seen.add(descriptor.name)) {
      throw new Error(`Duplicate publish manifest probe descriptor: ${descriptor.name}`);
    }
    if (descriptor.required !== true) {
      throw new Error(`publish manifest probe descriptor must be required: ${descriptor.name}`);
    }
    if (!descriptor.description.trim()) {
      throw new Error(`publish manifest probe descriptor description is required: ${descriptor.name}`);
    }
  }

  for (const name of PUBLISH_MANIFEST_PROBE_NAMES) {
    if (!seen.has(name)) {
      throw new Error(`Missing publish manifest probe descriptor: ${name}`);
    }
  }

  return Object.freeze(descriptors.map((descriptor) => Object.freeze({ ...descriptor })));
}

export const PUBLISH_MANIFEST_PROBE_DESCRIPTORS = validateAndFreezePublishManifestProbeDescriptors([
  publishManifestProbeDescriptor('database', 'Acceleration database containing compiler state rows.'),
  publishManifestProbeDescriptor('sourceSignature', 'Compiler source signature for the active runtime.'),
  publishManifestProbeDescriptor('publishRevision', 'Publish payload revision recorded by the compiler.'),
  publishManifestProbeDescriptor('publishCompiledAt', 'Publish payload compilation timestamp.'),
  publishManifestProbeDescriptor('browserLayoutKey', 'Browser layout identity bound to the publish payload.'),
  publishManifestProbeDescriptor('publishBundle', 'Immutable publish bundle manifest under the source signature root.'),
  publishManifestProbeDescriptor('runtimeCacheKey', 'Runtime cache key derived from ready publish manifest inputs.'),
] as const);
