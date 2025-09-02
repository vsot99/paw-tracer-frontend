// src/router/index.js
import { createRouter, createWebHistory } from 'vue-router';

import {useApplicationStore} from '@/stores/application.js';

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: () => import('../views/HomeView.vue')
    },
    {
      path: '/signin',
      name: 'signin',
      component: () => import('../views/SigninView.vue')
    },
    {
      path: '/logout',
      name: 'logout',
      component: () => import('../views/LogoutView.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/test',
      name: 'test',
      component:()=> import('../views/TestView.vue')
    },
    {
      path: '/signup',
      name: 'signup',
      component:()=> import('../views/SignupView.vue')
    },
    {
      path: '/profile',
      name: 'profile',
      component:()=> import('../views/ProfileView.vue'),
      meta: {requiresAuth: true}
    },
    { path: '/pets/new',
      name: 'addPet',
      component: () => import('@/views/AddPetView.vue'),
      meta: {requiresAuth: true}
    },
    {
      path: '/pets/:id',
      name: 'petDetails',
      component: () => import('@/views/PetDetailsView.vue'),
      meta: {requiresAuth: true}
    },
    {
      path: '/search',
      name: 'search',
      component: () => import('../views/SearchView.vue')
    },
    { path: '/lost/:id',
      name: 'lostReport',
      component: () => import('../views/LostPetReportView.vue') }
    ,
    { path: '/found/:id',
      name: 'foundReport',
      component: () => import('../views/FoundPetReportView.vue')
    },
    {
      path: '/lost-reports/:id/sighting/new',
      name: 'sighting-create',
      component: () => import('../views/CreateSightingReportView.vue'),
      props: true
    },
    {
      path: '/lost/new',
      name: 'lost-report-create',
      component: () => import('@/views/CreateLostPetReportView.vue'),
      meta: { requiresAuth: true }, // προαιρετικό
    },
    {
      path: '/found/new',
      name: 'found-report-create',
      component: () => import('@/views/CreateFoundPetReportView.vue'),
      meta: { requiresAuth: true }, // προαιρετικό
    }



  ]
});

router.beforeEach((to, from, next) => {
  const { isAuthenticated } = useApplicationStore();
  const requiresAuth = to.matched.some((record) => record.meta.requiresAuth);

  if (requiresAuth && !isAuthenticated) {
    console.log('user not authenticated. redirecting to /login');
    next('/login');
  } else {
    next();
  }
});

export default router;
