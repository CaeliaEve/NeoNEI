export type RouteDescriptor = Readonly<{
  key: string;
  method: string;
  path: string;
  plane?: string;
}>;

export type RouteDescriptorValidationOptions<TDescriptor extends RouteDescriptor> = Readonly<{
  label: string;
  descriptors: readonly TDescriptor[];
  expectedKeys: readonly string[];
  allowedMethods: readonly string[];
  allowedPlanes?: readonly string[];
}>;

export function validateAndFreezeRouteDescriptors<TDescriptor extends RouteDescriptor>(
  options: RouteDescriptorValidationOptions<TDescriptor>,
): readonly TDescriptor[] {
  const expectedKeys = new Set(options.expectedKeys);
  const allowedMethods = new Set(options.allowedMethods);
  const allowedPlanes = options.allowedPlanes ? new Set(options.allowedPlanes) : null;
  const seenKeys = new Set<string>();
  const seenRouteSignatures = new Set<string>();

  for (const descriptor of options.descriptors) {
    if (!descriptor) {
      throw new Error(`${options.label} route descriptor must not be null`);
    }
    if (!expectedKeys.has(descriptor.key)) {
      throw new Error(`Unknown ${options.label} route descriptor: ${descriptor.key}`);
    }
    if (!seenKeys.add(descriptor.key)) {
      throw new Error(`Duplicate ${options.label} route descriptor: ${descriptor.key}`);
    }
    if (!allowedMethods.has(descriptor.method)) {
      throw new Error(`Invalid ${options.label} route method for ${descriptor.key}: ${descriptor.method}`);
    }
    if (!descriptor.path || !descriptor.path.startsWith('/')) {
      throw new Error(`${options.label} route path must be absolute: ${descriptor.key}`);
    }
    const routeSignature = `${descriptor.method} ${descriptor.path}`;
    if (!seenRouteSignatures.add(routeSignature)) {
      throw new Error(`Duplicate ${options.label} route signature: ${routeSignature}`);
    }
    if (allowedPlanes) {
      if (!descriptor.plane || !allowedPlanes.has(descriptor.plane)) {
        throw new Error(`Invalid ${options.label} route plane for ${descriptor.key}: ${descriptor.plane}`);
      }
    }
  }

  for (const key of options.expectedKeys) {
    if (!seenKeys.has(key)) {
      throw new Error(`Missing ${options.label} route descriptor: ${key}`);
    }
  }

  return Object.freeze(options.descriptors.map((descriptor) => Object.freeze({ ...descriptor }) as TDescriptor));
}
