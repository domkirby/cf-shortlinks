import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';

const routes: RouteRecordRaw[] = [
  { path: '/', redirect: '/links' },
  { path: '/links', name: 'links', component: () => import('./views/LinksView.vue') },
  {
    path: '/links/:slug/stats',
    name: 'link-stats',
    component: () => import('./views/LinkStatsView.vue'),
    props: true,
  },
  { path: '/stats', name: 'stats', component: () => import('./views/StatsView.vue') },
  { path: '/tokens', name: 'tokens', component: () => import('./views/TokensView.vue') },
  { path: '/admins', name: 'admins', component: () => import('./views/AdminsView.vue') },
  { path: '/themes', name: 'themes', component: () => import('./views/ThemesView.vue') },
  { path: '/:pathMatch(.*)*', redirect: '/links' },
];

export const router = createRouter({
  history: createWebHistory(),
  routes,
});
