import path from 'path';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import vue from '@vitejs/plugin-vue';
import proxyOptions from './proxyOptions';

// https://vitejs.dev/config/
export default defineConfig({
	plugins: [
		vue(),
		VitePWA({
			registerType: 'autoUpdate',
			injectRegister: null,
			strategies: 'generateSW',
			filename: 'urypos-sw.js',
			manifest: {
				name: 'URY POS (Vue)',
				short_name: 'URYPOS',
				description: 'URY POS System',
				theme_color: '#ffffff',
				background_color: '#ffffff',
				display: 'standalone',
				start_url: '/urypos', // Assuming this is the route
				scope: '/urypos',
				icons: [
					{
						src: '/pwa-192x192.png',
						sizes: '192x192',
						type: 'image/png'
					},
					{
						src: '/pwa-512x512.png',
						sizes: '512x512',
						type: 'image/png'
					}
				]
			},
			workbox: {
				navigateFallback: '/urypos/index.html',
				globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
				modifyURLPrefix: {
					'': '/urypos/'
				}
			},
			outDir: '../ury/urypos/public',
		})
	],
	server: {
		port: 8080,
		proxy: proxyOptions
	},
	resolve: {
		alias: {
			'@': path.resolve(__dirname, 'src')
		}
	},
	build: {
		outDir: '../ury/urypos/public',
		emptyOutDir: true,
		target: 'es2015',
	},
});
