import './index.css';
import { createApp, reactive } from "vue";
import App from "./App.vue";

import router from './router';

const app = createApp(App);

// Plugins
app.use(router);

// Auth state shared between router guard and components
const authState = reactive({ isLoggedIn: false });
app.provide('authState', authState);
window.__uryAuthState = authState;

// Configure route guards
router.beforeEach(async (to, from, next) => {
        if (to.matched.some((record) => !record.meta.isLoginPage)) {
                // This route requires auth, check if logged in
                if (!authState.isLoggedIn) {
                        next({ name: 'Login', query: { route: to.path } });
                } else {
                        next();
                }
        } else {
                if (authState.isLoggedIn) {
                        next({ name: 'Home' });
                } else {
                        next();
                }
        }
});

app.mount("#app");
