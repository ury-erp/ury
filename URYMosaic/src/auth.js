//Purpose: provide a single $auth object app can import anywhere (no globals, no load-order issues)
// src/services/auth.js
import { reactive, computed } from "vue";

const state = reactive({
  user: window.frappe?.session_user || "Guest",
  token: window.frappe?.csrf_token || undefined,
});

const isLoggedIn = computed(() => state.user && state.user !== "Guest");

async function login(username, password) {
  const res = await fetch("/api/method/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ usr: username, pwd: password }),
  });
  if (!res.ok) throw new Error(await res.text());
  state.user = window.frappe?.session_user || username;
  state.token = window.frappe?.csrf_token;
}

async function logout() {
  await fetch("/api/method/logout", { method: "POST", credentials: "include" });
  state.user = "Guest";
  state.token = undefined;
}

const $auth = {
  state,
  get user() { return state.user; },
  get token() { return state.token; },
  get isLoggedIn() { return isLoggedIn.value; },
  login,
  logout,
};

export default $auth;
