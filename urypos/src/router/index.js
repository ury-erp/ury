import { createRouter, createWebHistory } from "vue-router";
import authRoutes from './auth';
import { useAuthStore } from "@/stores/Auth.js";
import Table from "../components/Table.vue";
import Customer from "../components/Customer.vue";
import Menu from "../components/Menu.vue";
import Cart from "../components/Cart.vue";
import recentOrder from "../components/recentOrder.vue";
import Login from "../components/Login.vue";
import posOpen from "../components/posOpening.vue";
import posClose from "../components/posClosing.vue";



const routes = [
  {
    path: "/",
    name: "Table",
    component: Table,
  },
  {
    path: "/Table",
    name: "Table",
    component: Table,
  },
  {
    path: "/Customer",
    name: "Customer",
    component: Customer,
  },
  {
    path: "/Menu",
    name: "Menu",
    component: Menu,
  },
  {
    path: "/Cart",
    name: "Cart",
    component: Cart,
  },
  {
    path: "/recentOrder",
    name: "recentOrder",
    component: recentOrder,
  },
  {
    path: "/PosOpen",
    name: "posOpen",
    component: posOpen,
  },
  {
    path: "/PosClose",
    name: "posClose",
    component: posClose
    ,
  },  
  ...authRoutes,
];

export const router = createRouter({
  history: createWebHistory('/urypos/'),
  routes,
});



export default router;



