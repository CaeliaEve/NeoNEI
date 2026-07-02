import type { Application, RequestHandler, Router } from 'express';
import itemsRoutes from './items.routes';
import patternsRoutes from './patterns.routes';
import indexedRecipesRoutes from './recipes-indexed.routes';
import multiblocksRoutes from './multiblocks.routes';
import ecosystemRoutes from './ecosystem.routes';
import gtDiagramsRoutes from './gt-diagrams.routes';
import forestryGeneticsRoutes from './forestry-genetics.routes';
import renderContractRoutes from './render-contract.routes';
import recipeBootstrapRoutes from './recipe-bootstrap.routes';
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
  Object.freeze({ key: 'labItems', mountPath: '/lab/items', tier: 'dev-compat', handler: itemsRoutes }),
  Object.freeze({ key: 'labPatterns', mountPath: '/lab/patterns', tier: 'dev-compat', handler: patternsRoutes }),
  Object.freeze({ key: 'labRecipes', mountPath: '/lab/recipes', tier: 'dev-compat', handler: indexedRecipesRoutes }),
  Object.freeze({ key: 'labRecipeBootstrap', mountPath: '/lab/recipe-bootstrap', tier: 'dev-compat', handler: recipeBootstrapRoutes }),
  Object.freeze({ key: 'labPublish', mountPath: '/lab/publish', tier: 'dev-compat', handler: labPublishRoutes }),
  Object.freeze({ key: 'labRenderContract', mountPath: '/lab/render-contract', tier: 'dev-compat', handler: renderContractRoutes }),
  Object.freeze({ key: 'labMultiblocks', mountPath: '/lab/multiblocks', tier: 'dev-compat', handler: multiblocksRoutes }),
  Object.freeze({ key: 'labEcosystem', mountPath: '/lab/ecosystem', tier: 'dev-compat', handler: ecosystemRoutes }),
  Object.freeze({ key: 'labGtDiagrams', mountPath: '/lab/gt-diagrams', tier: 'dev-compat', handler: gtDiagramsRoutes }),
  Object.freeze({ key: 'labForestryGenetics', mountPath: '/lab/forestry-genetics', tier: 'dev-compat', handler: forestryGeneticsRoutes }),
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
