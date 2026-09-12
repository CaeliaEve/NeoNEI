import { createRouter, createWebHistory } from 'vue-router';
import CatalogPage from '../views/CatalogPage.vue';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'home', component: CatalogPage },
    { path: '/offline', name: 'offline', component: () => import('../views/OfflinePage.vue') },
    { path: '/entry/:itemId', name: 'entry', component: CatalogPage },
    { path: '/recipe/:recipeId', name: 'recipe', component: CatalogPage },
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
  ],
});

router.beforeEach((to, from) => {
  if (from.query.offline === '1' && to.query.catalog && to.query.catalog === from.query.catalog && to.query.offline === undefined) {
    return { path: to.path, query: { ...to.query, offline: '1' }, hash: to.hash };
  }
});

export default router;
