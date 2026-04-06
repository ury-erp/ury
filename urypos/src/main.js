import './index.css';
import { createApp } from "vue";
import App from "./App.vue";

import { useAuthStore } from "@/stores/Auth.js";
import router from './router';
import { createPinia } from 'pinia';
import NotificationModal from './components/NotificationModal.vue';

// ── Sprint 5: offline support ─────────────────────────────────────────────────
import { useOfflineStore } from '@/stores/Offline.js';
// ─────────────────────────────────────────────────────────────────────────────

const pinia = createPinia();
const app = createApp(App);

app.use(router);
app.use(pinia);

// ── Sprint 5: initialise offline store ────────────────────────────────────────
// Must run after pinia is installed on the app so stores are available,
// and before the router guard below so isOnline state is set before any
// navigation fires.
const offline = useOfflineStore();
offline.init();
// ─────────────────────────────────────────────────────────────────────────────

router.beforeEach((to, from, next) => {
  const auth = useAuthStore();
  const isAuthenticated = auth.userAuth;

  if (to.name !== 'Login' && !isAuthenticated) {
    next({ name: 'Login' });
  } else if (to.name === 'Login' && isAuthenticated) {
    next({ name: 'Table' });
  } else {
    next();
  }
});

app.mount("#app");
app.component('NotificationModal', NotificationModal);

// ── Sprint 5: register service worker ────────────────────────────────────────
// Runs after app.mount() so the SW registration does not block first paint.
// The SW file lives at urypos/public/ury-sw.js which Vite copies verbatim to
// the build output, making it available at /urypos/ury-sw.js.
// Scope is restricted to /urypos/ so the SW only intercepts requests that
// belong to this SPA and does not interfere with the Frappe desk or other apps.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/urypos/ury-sw.js', { scope: '/urypos/' })
      .then((registration) => {
        console.log('[URY] Service worker registered, scope:', registration.scope);

        // When a new SW version is waiting, activate it immediately on next
        // navigation rather than waiting for all tabs to close.
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (!newWorker) return;
          newWorker.addEventListener('statechange', () => {
            if (
              newWorker.state === 'installed' &&
              navigator.serviceWorker.controller
            ) {
              console.log('[URY] New service worker installed — will activate on next load.');
            }
          });
        });
      })
      .catch((err) => {
        // Non-fatal — the app works fully online without a SW.
        console.warn('[URY] Service worker registration failed:', err);
      });
  });
}
// ─────────────────────────────────────────────────────────────────────────────
