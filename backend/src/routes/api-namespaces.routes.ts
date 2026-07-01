import type { Application, RequestHandler } from 'express';
import { resolveAccelerationCompilerAuthority } from '../services/acceleration-runtime-compiler-authority.service';
import { getApiNamespacePlan, mountApiNamespaces, type ApiNamespaceTier } from './api-namespace-registry';

type RegisterApiNamespacesOptions = {
  publicRuntimeOnly: boolean;
};

const tagApiTier = (tier: ApiNamespaceTier): RequestHandler => (
  _req,
  res,
  next,
) => {
  res.setHeader('x-neonei-api-tier', tier);
  next();
};

export function registerApiNamespaces(app: Application, options: RegisterApiNamespacesOptions): void {
  const externalRuntimeAuthority = resolveAccelerationCompilerAuthority() === 'external-runtime';
  mountApiNamespaces(
    app,
    getApiNamespacePlan({
      publicRuntimeOnly: options.publicRuntimeOnly,
      externalRuntimeAuthority,
    }),
    tagApiTier,
  );
}
