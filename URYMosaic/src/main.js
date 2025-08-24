//Import the service with extension (@/services/auth.js).
//Provide $auth before the router guard runs.
//Use $auth.isLoggedIn in the guard (not a bare auth).

import "./index.css";
import { createApp } from "vue";
import App from "./App.vue";
import router from "./router";
import $auth from "@/auth.js";   // <-- new

const app = createApp(App);

// make $auth available everywhere
app.config.globalProperties.$auth = $auth; // this.$auth
app.provide("$auth", $auth);               // inject("$auth")

// route guard
router.beforeEach((to, from, next) => {
  const requiresAuth = to.matched.some(r => !r.meta.isLoginPage);
  if (requiresAuth && !$auth.isLoggedIn) {
    return next({ name: "Login", query: { route: to.path } });
  }
  if (!requiresAuth && $auth.isLoggedIn) {
    return next({ name: "Home" });
  }
  return next();
});

app.use(router);
app.mount("#app");
