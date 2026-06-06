import { createRouter, createWebHistory } from 'vue-router';
import type { RouteRecordRaw } from 'vue-router';

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'home',
    component: () => import('../views/HomePage.vue')
  },
  {
    path: '/recipe/:itemId',
    name: 'recipe',
    component: () => import('../views/RecipeView.vue'),
    props: true
  },
  {
    path: '/oracle/:itemId?',
    name: 'recipe-oracle',
    component: () => import('../views/RecipeOracleView.vue'),
    props: true
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
  }
];

const router = createRouter({
  history: createWebHistory(),
  routes
});

export default router;
