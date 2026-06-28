import type { Application, RequestHandler } from 'express';
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
import { resolveAccelerationCompilerAuthority } from '../services/acceleration-runtime-compiler-authority.service';

type RegisterApiNamespacesOptions = {
  publicRuntimeOnly: boolean;
};

const tagApiTier = (tier: 'public-runtime' | 'dev-compat' | 'legacy-compat'): RequestHandler => (
  _req,
  res,
  next,
) => {
  res.setHeader('x-neonei-api-tier', tier);
  next();
};

export function registerApiNamespaces(app: Application, options: RegisterApiNamespacesOptions): void {
  const { publicRuntimeOnly: PUBLIC_RUNTIME_ONLY } = options;
  const externalRuntimeAuthority = resolveAccelerationCompilerAuthority() === 'external-runtime';
  const exposeLegacyApiNamespace = !PUBLIC_RUNTIME_ONLY && !externalRuntimeAuthority;

  app.use('/runtime', tagApiTier('public-runtime'), runtimeRoutes);

  if (!PUBLIC_RUNTIME_ONLY) {
    app.use('/lab', tagApiTier('dev-compat'));
    app.use('/lab/items', itemsRoutes);
    app.use('/lab/patterns', patternsRoutes);
    app.use('/lab/recipes', indexedRecipesRoutes);
    app.use('/lab/recipe-bootstrap', recipeBootstrapRoutes);
    app.use('/lab/publish', labPublishRoutes);
    app.use('/lab/render-contract', renderContractRoutes);
    app.use('/lab/multiblocks', multiblocksRoutes);
    app.use('/lab/ecosystem', ecosystemRoutes);
    app.use('/lab/gt-diagrams', gtDiagramsRoutes);
    app.use('/lab/forestry-genetics', forestryGeneticsRoutes);
  }

  app.use('/api', tagApiTier('public-runtime'), currentApiRoutes);

  if (exposeLegacyApiNamespace) {
    app.use('/api/items', tagApiTier('legacy-compat'), itemsRoutes);
    app.use('/api/patterns', tagApiTier('legacy-compat'), patternsRoutes);
    app.use('/api/recipes-indexed', tagApiTier('legacy-compat'), indexedRecipesRoutes);
    app.use('/api/multiblocks', tagApiTier('legacy-compat'), multiblocksRoutes);
    app.use('/api/ecosystem', tagApiTier('legacy-compat'), ecosystemRoutes);
    app.use('/api/gt-diagrams', tagApiTier('legacy-compat'), gtDiagramsRoutes);
    app.use('/api/forestry-genetics', tagApiTier('legacy-compat'), forestryGeneticsRoutes);
    app.use('/api/render-contract', tagApiTier('legacy-compat'), renderContractRoutes);
    app.use('/api/recipe-bootstrap', tagApiTier('legacy-compat'), recipeBootstrapRoutes);
  }
  app.use('/api/publish', tagApiTier('public-runtime'), publicPublishRoutes);
  app.use('/api/v1', tagApiTier('public-runtime'), v1Routes);
}
