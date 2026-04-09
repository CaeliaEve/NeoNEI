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
  }
];

const router = createRouter({
  history: createWebHistory(),
  routes
});

export default router;
