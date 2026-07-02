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

export type RouteHandlerValidationOptions<TDescriptor extends RouteDescriptor, THandler> = Readonly<{
  label: string;
  descriptors: readonly TDescriptor[];
  handlers: Readonly<Record<string, THandler>>;
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

export function validateAndFreezeRouteHandlers<TDescriptor extends RouteDescriptor, THandler>(
  options: RouteHandlerValidationOptions<TDescriptor, THandler>,
): Readonly<Record<TDescriptor['key'], THandler>> {
  const expectedKeys = new Set(options.descriptors.map((descriptor) => descriptor.key));
  const projectedHandlers: Record<string, THandler> = {};

  for (const [key, handler] of Object.entries(options.handlers)) {
    if (!expectedKeys.has(key)) {
      throw new Error(`Unknown ${options.label} route handler: ${key}`);
    }
    if (typeof handler !== 'function') {
      throw new Error(`${options.label} route handler must be a function: ${key}`);
    }
  }

  for (const descriptor of options.descriptors) {
    const handler = options.handlers[descriptor.key];
    if (typeof handler !== 'function') {
      throw new Error(`Missing ${options.label} route handler: ${descriptor.key}`);
    }
    projectedHandlers[descriptor.key] = handler;
  }

  return Object.freeze(projectedHandlers) as Readonly<Record<TDescriptor['key'], THandler>>;
}
