import { createRouter, createWebHistory } from 'vue-router';
import type { RouteRecordRaw } from 'vue-router';

const routes: RouteRecordRaw[] = [
  { path: '/offline', name: 'offline', component: () => import('../views/OfflinePage.vue') },
  { path: '/materials', name: 'materials', component: () => import('../views/IndustryPage.vue') },
  { path: '/material/:id', name: 'material', component: () => import('../views/IndustryPage.vue') },
  { path: '/circuits', name: 'circuits', component: () => import('../views/IndustryPage.vue') },
  { path: '/circuit/:id', name: 'circuit', component: () => import('../views/IndustryPage.vue') },
  { path: '/bees', name: 'bees', component: () => import('../views/GeneticsPage.vue') },
  { path: '/bee/:id', name: 'bee', component: () => import('../views/GeneticsPage.vue') },
  { path: '/trees', name: 'trees', component: () => import('../views/GeneticsPage.vue') },
  { path: '/tree/:id', name: 'tree', component: () => import('../views/GeneticsPage.vue') },
  { path: '/structures', name: 'structures', component: () => import('../views/StructurePage.vue') },
  { path: '/structure/:id', name: 'structure', component: () => import('../views/StructurePage.vue') },
  { path: '/aspects', name: 'aspects', component: () => import('../views/MagicPage.vue') },
  { path: '/aspect/:id', name: 'aspect', component: () => import('../views/MagicPage.vue') },
  { path: '/research', name: 'studies', component: () => import('../views/MagicPage.vue') },
  { path: '/research/:id', name: 'research', component: () => import('../views/MagicPage.vue') },
  {
    path: '/',
    name: 'home',
    component: () => import('../views/HomePage.vue')
  },
  {
    path: '/recipe/:itemId?',
    name: 'recipe',
    component: () => import('../views/RecipeView.vue'),
    props: true
  },
  {
    // Elysium catalog links use /entry/:id. Keep that public URL compatible
    // with the optimize UI so an item always opens the legacy recipe screen.
    path: '/entry/:itemId',
    name: 'entry',
    redirect: (to) => ({
      name: 'recipe',
      params: { itemId: to.params.itemId },
      query: to.query,
      hash: to.hash,
    }),
  },
  {
    path: '/recipe-by-id/:recipeId',
    name: 'recipe-by-id',
    component: () => import('../views/RecipeByIdView.vue'),
  },
  {
    path: '/oracle/:itemId?',
    redirect: (to) => {
      const rawItemId = to.params.itemId;
      const itemId = Array.isArray(rawItemId) ? rawItemId[0] : rawItemId;
      return {
        name: 'recipe',
        params: itemId ? { itemId } : {},
        query: to.query,
        hash: to.hash,
      };
    }
  },
  {
    path: '/gt-diagrams',
    name: 'gt-diagrams',
    component: () => import('../views/GTDiagramsView.vue'),
  },
  {
    path: '/forestry-bee-tree',
    name: 'forestry-bee-tree',
    component: () => import('../views/ForestryBeeTreeView.vue'),
  },
  {
    path: '/runtime-health',
    name: 'runtime-health',
    component: () => import('../views/RuntimeHealthView.vue'),
  },
  {
    path: '/ui-studio',
    name: 'ui-studio',
    component: () => import('../views/UiStudioView.vue'),
  }
];

const router = createRouter({
  history: createWebHistory(),
  routes
});

export default router;
