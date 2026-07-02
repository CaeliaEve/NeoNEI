import type { Application, RequestHandler } from 'express';
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
  mountApiNamespaces(
    app,
    getApiNamespacePlan({
      publicRuntimeOnly: options.publicRuntimeOnly,
    }),
    tagApiTier,
  );
}
