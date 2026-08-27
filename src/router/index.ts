import { createRouter, createWebHistory } from 'vue-router'

import MainLayout from '../layouts/MainLayout.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      component: MainLayout,
      children: [
        {
          path: '',
          name: 'news',
          component: () => import('../views/NewsView.vue'),
        },
        {
          path: 'monitor',
          name: 'monitor',
          component: () => import('../views/MonitorView.vue'),
        },
        {
          path: 'tools',
          name: 'tools',
          component: () => import('../views/ToolsView.vue'),
        },
        {
          path: 'settings',
          name: 'settings',
          component: () => import('../views/SettingsView.vue'),
        },
        {
          // 404 兜底:未知深链仍走 MainLayout 布局,渲染 NotFoundView
          path: '/:pathMatch(.*)*',
          name: 'not-found',
          component: () => import('../views/NotFoundView.vue'),
        },
      ],
    },
  ],
})

export { router }
