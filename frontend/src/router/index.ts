import { createRouter, createWebHistory } from 'vue-router';
import type { RouteRecordRaw } from 'vue-router';
import { legacyWorkspaceLocation } from './workspace.ts';

const routes: RouteRecordRaw[] = [
  { path: '/offline', name: 'offline', component: () => import('../views/OfflinePage.vue') },
  { path: '/materials', name: 'materials', component: () => import('../views/IndustryPage.vue') },
  { path: '/ore-groups', name: 'ores', component: () => import('../views/OrePage.vue') },
  { path: '/ore/:id', name: 'ore', component: () => import('../views/OrePage.vue') },
  { path: '/material/:id', name: 'material', component: () => import('../views/IndustryPage.vue') },
  { path: '/circuits', name: 'circuits', component: () => import('../views/IndustryPage.vue') },
  { path: '/circuit/:id', name: 'circuit', component: () => import('../views/IndustryPage.vue') },
  { path: '/bees', name: 'bees', component: () => import('../views/GeneticsPage.vue') },
  { path: '/bee/:id', name: 'bee', component: () => import('../views/GeneticsPage.vue') },
  { path: '/trees', name: 'trees', component: () => import('../views/GeneticsPage.vue') },
  { path: '/tree/:id', name: 'tree', component: () => import('../views/GeneticsPage.vue') },
  { path: '/butterflies', name: 'butterflies', component: () => import('../views/GeneticsPage.vue') },
  { path: '/butterfly/:id', name: 'butterfly', component: () => import('../views/GeneticsPage.vue') },
  { path: '/flowers', name: 'flowers', component: () => import('../views/GeneticsPage.vue') },
  { path: '/genetic-database', name: 'genetic-database', component: () => import('../views/GeneticsDatabasePage.vue') },
  { path: '/tool-materials', name: 'tool-materials', component: () => import('../views/ToolMaterialsPage.vue') },
  { path: '/villager-trades', name: 'villager-trades', component: () => import('../views/VillagerTradesPage.vue') },
  { path: '/flower/:id', name: 'flower', component: () => import('../views/GeneticsPage.vue') },
  { path: '/structures', name: 'structures', component: () => import('../views/StructurePage.vue') },
  { path: '/structure/:id', name: 'structure', component: () => import('../views/StructurePage.vue') },
  { path: '/aspects', name: 'aspects', component: () => import('../views/MagicPage.vue') },
  { path: '/lexicon', name: 'lexicon', component: () => import('../views/LexiconPage.vue') },
  { path: '/mobs', name: 'mobs', component: () => import('../views/MobDropsPage.vue') },
  { path: '/infernal-drops', name: 'infernal-drops', component: () => import('../views/InfernalDropsPage.vue') },
  { path: '/draconic-reactor', name: 'draconic-reactor', component: () => import('../views/DraconicReactorPage.vue') },
  { path: '/bee-tree', name: 'bee-tree', component: () => import('../views/BeeTreePage.vue') },
  { path: '/underground-fluids', name: 'underground-fluids', component: () => import('../views/UndergroundFluidsPage.vue') },
  { path: '/gt-minerals', name: 'gt-minerals', component: () => import('../views/GtMineralsPage.vue') },
  { path: '/bartworks-ores', name: 'bartworks-ores', component: () => import('../views/BartworksOresPage.vue') },
  { path: '/quests', name: 'quests', component: () => import('../views/QuestsPage.vue') },
  { path: '/furnace-fuels', name: 'furnace-fuels', component: () => import('../views/FurnaceFuelsPage.vue') },
  { path: '/projectblue', name: 'projectblue', component: () => import('../views/ProjectBluePage.vue') },
  { path: '/fireworks', name: 'fireworks', component: () => import('../views/FireworksPage.vue') },
  { path: '/lathe', name: 'lathe', component: () => import('../views/LathePage.vue') },
  { path: '/forestry-info', name: 'forestry-info', component: () => import('../views/ForestryInfoPage.vue') },
  {path:'/information',name:'information',component:()=>import('../views/InformationPage.vue')},
  {path:'/usage-queries',name:'usage-queries',component:()=>import('../views/UsageQueriesPage.vue')},
  {path:'/diagrams',name:'diagrams',component:()=>import('../views/DiagramsPage.vue')},
  {path:'/forge-registry',name:'forge-registry',component:()=>import('../views/ForgeRegistryPage.vue')},
  {path:'/ender-storage',name:'ender-storage',component:()=>import('../views/EnderStoragePage.vue')},
  { path: '/mob/:entity', name: 'mob-drops', component: () => import('../views/MobDropsPage.vue') },
  { path: '/aspect/:id', name: 'aspect', component: () => import('../views/MagicPage.vue') },
  { path: '/research', name: 'studies', component: () => import('../views/MagicPage.vue') },
  { path: '/research/:id', name: 'research', component: () => import('../views/MagicPage.vue') },
  {
    path: '/recipe/:itemId?',
    name: 'recipe',
    redirect: legacyWorkspaceLocation,
  },
  {
    path: '/entry/:itemId',
    name: 'entry',
    redirect: legacyWorkspaceLocation,
  },
  {
    path: '/recipe-by-id/:recipeId',
    name: 'recipe-by-id',
    redirect: legacyWorkspaceLocation,
  },
  {
    path: '/oracle/:itemId?',
    redirect: legacyWorkspaceLocation,
  },
  {
    path: '/gt-diagrams',
    name: 'gt-diagrams',
    redirect: legacyWorkspaceLocation,
  },
  {
    path: '/forestry-bee-tree',
    name: 'forestry-bee-tree',
    redirect: legacyWorkspaceLocation,
  },
  {
    path: '/runtime-health',
    name: 'runtime-health',
    redirect: legacyWorkspaceLocation,
  },
  {
    path: '/ui-studio',
    name: 'ui-studio',
    redirect: legacyWorkspaceLocation,
  }
];

const router = createRouter({
  history: createWebHistory(),
  routes: [{ path: '/', name: 'home', component: () => import('../views/HomePage.vue'), children: routes }]
});

export default router;
