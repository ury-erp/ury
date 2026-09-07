import './index.css';
import { createApp, reactive } from "vue";
import App from "./App.vue";

import router from './router';
import { mountLanguageSwitcher, startDomI18n } from '@ury/core/i18n';
import russianTranslations from './i18n/ru.json';
import kazakhTranslations from './i18n/kk.json';

startDomI18n({ ru: russianTranslations, kk: kazakhTranslations });
mountLanguageSwitcher();

const app = createApp(App);

// Plugins
app.use(router);

// Global Properties,
// components can inject this

// Configure route gaurds
router.beforeEach(async (to, from, next) => {
	next();
});

app.mount("#app");
