import './index.css';
import { createApp, reactive } from "vue";
import App from "./App.vue";

import { useAuthStore } from "@/stores/Auth.js";
import router from './router';
import { createPinia } from 'pinia'
import NotificationModal from './components/NotificationModal.vue';
import { initI18n, i18nPlugin } from './i18n';



const pinia = createPinia()
const app = createApp(App);

app.use(router);
app.use(pinia)
app.use(i18nPlugin)


router.beforeEach((to, from, next) => {
	const auth = useAuthStore();
	const isAuthenticated = auth.userAuth

	if (to.name !== 'Login' && !isAuthenticated) {
		next({ name: 'Login' });
	} else if (to.name === 'Login' && isAuthenticated) {
		next({ name: 'Table' });
	} else {
		next();
	}
});

app.component('NotificationModal', NotificationModal);

// Resolve the locale (and set <html lang/dir>) before mounting, so an RTL
// language never renders a frame of LTR layout.
initI18n().then(() => {
	app.mount("#app");
});

