import { createRouter, createWebHistory } from 'vue-router';
import type { RouteRecordRaw } from 'vue-router';

const routes: RouteRecordRaw[] = [
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
