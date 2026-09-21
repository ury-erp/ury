import './index.css';
import { createApp, reactive } from "vue";
import App from "./App.vue";

import router from './router';

const app = createApp(App);

// Plugins
app.use(router);

// Global Properties,
// components can inject this via inject: ["$auth"]
const auth = reactive({
	async login(usr, pwd) {
		const res = await fetch("/api/method/login", {
			method: "POST",
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
			body: new URLSearchParams({ usr, pwd }),
		});
		if (!res.ok) {
			return null;
		}
		return await res.json();
	},
	async logout() {
		await fetch("/api/method/logout", { method: "POST" });
	},
});
app.provide("$auth", auth);

// Configure route gaurds
router.beforeEach(async (to, from, next) => {
	next();
});

app.mount("#app");
