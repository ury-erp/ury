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

// Check for existing Frappe session on startup
fetch("/api/method/frappe.auth.get_logged_user")
  .then(res => res.ok ? res.json() : Promise.reject())
  .then(data => {
    if (data.message && data.message !== "Guest") {
      authState.isLoggedIn = true;
    }
  })
  .catch(() => {
    // Not logged in — stay on login page
  });

// Configure route guards
router.beforeEach((to, from, next) => {
  try {
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
  } catch (err) {
    console.error('Navigation guard error:', err);
    next({ name: 'Login' });
  }
});

app.mount("#app");