import path from 'path';
import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';

// Separate from vite.config.js deliberately: that config's dev-server proxy
// (proxyOptions.js) resolves ../../../sites/common_site_config.json, which
// only exists inside a real bench checkout -- loading it from an isolated
// git worktree (as CI or a plain `yarn test` here would) fails before a
// single test can even run. This config only needs the plugin + alias, not
// the dev-server proxy, so it can't break just because a bench isn't present.
export default defineConfig({
	plugins: [vue()],
	resolve: {
		alias: {
			'@': path.resolve(__dirname, 'src'),
		},
	},
	test: {
		environment: 'jsdom',
	},
});
