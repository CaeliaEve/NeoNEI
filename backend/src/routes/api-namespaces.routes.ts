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
import publishRoutes from './publish.routes';
import runtimeRoutes from './runtime.routes';
import v1Routes from './v1.routes';

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

  app.use('/runtime', tagApiTier('public-runtime'), runtimeRoutes);

  if (!PUBLIC_RUNTIME_ONLY) {
    app.use('/lab', tagApiTier('dev-compat'));
    app.use('/lab/items', itemsRoutes);
    app.use('/lab/patterns', patternsRoutes);
    app.use('/lab/recipes', indexedRecipesRoutes);
    app.use('/lab/recipe-bootstrap', recipeBootstrapRoutes);
    app.use('/lab/publish', publishRoutes);
    app.use('/lab/render-contract', renderContractRoutes);
    app.use('/lab/multiblocks', multiblocksRoutes);
    app.use('/lab/ecosystem', ecosystemRoutes);
    app.use('/lab/gt-diagrams', gtDiagramsRoutes);
    app.use('/lab/forestry-genetics', forestryGeneticsRoutes);
  }

  app.use('/api', tagApiTier('legacy-compat'));
  if (!PUBLIC_RUNTIME_ONLY) {
    app.use('/api/items', itemsRoutes);
    app.use('/api/patterns', patternsRoutes);
    app.use('/api/recipes-indexed', indexedRecipesRoutes);
    app.use('/api/multiblocks', multiblocksRoutes);
    app.use('/api/ecosystem', ecosystemRoutes);
    app.use('/api/gt-diagrams', gtDiagramsRoutes);
    app.use('/api/forestry-genetics', forestryGeneticsRoutes);
    app.use('/api/render-contract', renderContractRoutes);
    app.use('/api/recipe-bootstrap', recipeBootstrapRoutes);
  }
  app.use('/api/publish', publishRoutes);
  app.use('/api/v1', v1Routes);
}
