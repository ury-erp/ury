import './index.css';
import { createApp, reactive } from "vue";
import App from "./App.vue";

import router from './router';
import { initI18n, i18nPlugin } from './i18n';

const app = createApp(App);

// Plugins
app.use(router);
app.use(i18nPlugin);

// Global Properties,
// components can inject this

// Configure route gaurds
router.beforeEach(async (to, from, next) => {
	next();
});

// Resolve the locale (and set <html lang/dir>) before mounting, so an RTL
// language never renders a frame of LTR layout.
initI18n().then(() => {
	app.mount("#app");
});
