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
	const isAuthenticated = auth.userAuth

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

