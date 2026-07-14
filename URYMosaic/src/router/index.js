import { createRouter, createWebHistory } from "vue-router";
import Home from "../views/Home.vue";
import authRoutes from './auth';
import KOT from '../components/kot.vue';

const routes = [
  {
	path: "/",
	name: "KOT",
	component: KOT,
  },  
  ...authRoutes,
];

const router = createRouter({
  base: "/URYMosaic/",
  history: createWebHistory(),
  routes,
});

export default router;
