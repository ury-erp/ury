/**
 * ⚠️ DEPRECATED — This POS v1 app (Vue 3 + Pinia) is deprecated as of December 2025.
 * It has been replaced by POS v2 (React + Zustand) located in the /pos directory.
 * No new features or bug fixes will be applied to this codebase.
 * Please migrate to POS v2: /pos
 */

console.warn(
  '[URY POS v1] DEPRECATED: This app is no longer maintained. ' +
  'Please use POS v2 at /pos instead.'
);

import './index.css';
import { createApp, reactive } from "vue";
import App from "./App.vue";

import { useAuthStore } from "@/stores/Auth.js";
import router from './router';
import { createPinia } from 'pinia'
import NotificationModal from './components/NotificationModal.vue';



const pinia = createPinia()
const app = createApp(App);

app.use(router);
app.use(pinia)


router.beforeEach((to, from, next) => {
        const auth = useAuthStore();
        const isAuthenticated = auth.userAuth === true || auth.userAuth === "true"

        if (to.name !== 'Login' && !isAuthenticated) {
                next({ name: 'Login' });
        } else if (to.name === 'Login' && isAuthenticated) {
                next({ name: 'Table' });
        } else {
                next();
        }
});

app.component('NotificationModal', NotificationModal);
app.mount("#app");

