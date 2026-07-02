import type { Application, RequestHandler, Router } from 'express';
import patternsRoutes from './patterns.routes';
import renderContractRoutes from './render-contract.routes';
import { labPublishRoutes, publicPublishRoutes } from './publish.routes';
import runtimeRoutes from './runtime.routes';
import v1Routes from './v1.routes';
import currentApiRoutes from './current-api.routes';

export type ApiNamespaceTier = 'public-runtime' | 'dev-compat';
export type ApiNamespaceHandler = RequestHandler | Router;

export type ApiNamespaceDefinition = Readonly<{
  key: string;
  mountPath: string;
  tier: ApiNamespaceTier;
  handler?: ApiNamespaceHandler;
}>;

export type ApiNamespacePlanInput = Readonly<{
  publicRuntimeOnly: boolean;
}>;

export type ApiTierTagger = (tier: ApiNamespaceTier) => RequestHandler;

export const PUBLIC_RUNTIME_ROOT_NAMESPACE: ApiNamespaceDefinition = Object.freeze({
  key: 'runtimeRoot',
  mountPath: '/runtime',
  tier: 'public-runtime',
  handler: runtimeRoutes,
});

export const CURRENT_API_NAMESPACE: ApiNamespaceDefinition = Object.freeze({
  key: 'currentApi',
  mountPath: '/api',
  tier: 'public-runtime',
  handler: currentApiRoutes,
});

export const PUBLIC_RUNTIME_TAIL_NAMESPACES: readonly ApiNamespaceDefinition[] = Object.freeze([
  Object.freeze({ key: 'publicPublish', mountPath: '/api/publish', tier: 'public-runtime', handler: publicPublishRoutes }),
  Object.freeze({ key: 'v1Runtime', mountPath: '/api/v1', tier: 'public-runtime', handler: v1Routes }),
]);

export const DEV_COMPAT_NAMESPACES: readonly ApiNamespaceDefinition[] = Object.freeze([
  Object.freeze({ key: 'labRoot', mountPath: '/lab', tier: 'dev-compat' }),
  Object.freeze({ key: 'labPatterns', mountPath: '/lab/patterns', tier: 'dev-compat', handler: patternsRoutes }),
  Object.freeze({ key: 'labPublish', mountPath: '/lab/publish', tier: 'dev-compat', handler: labPublishRoutes }),
  Object.freeze({ key: 'labRenderContract', mountPath: '/lab/render-contract', tier: 'dev-compat', handler: renderContractRoutes }),
]);

export function getApiNamespacePlan(input: ApiNamespacePlanInput): readonly ApiNamespaceDefinition[] {
  const namespaces: ApiNamespaceDefinition[] = [PUBLIC_RUNTIME_ROOT_NAMESPACE];
  if (!input.publicRuntimeOnly) {
    namespaces.push(...DEV_COMPAT_NAMESPACES);
  }

  namespaces.push(CURRENT_API_NAMESPACE);

  namespaces.push(...PUBLIC_RUNTIME_TAIL_NAMESPACES);
  return Object.freeze(namespaces);
}

export function mountApiNamespace(
  app: Application,
  namespace: ApiNamespaceDefinition,
  tagApiTier: ApiTierTagger,
): void {
  const tag = tagApiTier(namespace.tier);
  if (namespace.handler) {
    app.use(namespace.mountPath, tag, namespace.handler);
    return;
  }
  app.use(namespace.mountPath, tag);
}

export function mountApiNamespaces(
  app: Application,
  namespaces: readonly ApiNamespaceDefinition[],
  tagApiTier: ApiTierTagger,
): void {
  for (const namespace of namespaces) {
    mountApiNamespace(app, namespace, tagApiTier);
  }
}
