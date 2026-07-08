import { createRouter, createWebHistory } from "vue-router";
import authRoutes from "./auth";
import ProductionDashboard from "../components/production/ProductionDashboard.vue";
import KOT from "../components/kot.vue";

const routes = [
  {
    path: "/",
    name: "Dashboard",
    component: ProductionDashboard,
  },

  {
    path: "/:production",
    name: "KOT",
    component: KOT,
    props: true,
  },

  ...authRoutes,
];

const router = createRouter({
  history: createWebHistory("/URYMosaic/"),
  routes,
});

export default router;