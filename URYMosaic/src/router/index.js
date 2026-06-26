import { createRouter, createWebHistory } from "vue-router";
import Home from "../views/Home.vue";
import authRoutes from './auth';

const routes = [
  {
    path: "/",
    name: "Home",
    component: Home,
    meta: { isLoginPage: false },
  },
  ...authRoutes,
];

const router = createRouter({
  history: createWebHistory("/URYMosaic/"),
  routes,
});

export default router;