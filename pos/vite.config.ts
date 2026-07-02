/// <reference types="vitest" />
import { defineConfig, type PluginOption } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'
import { visualizer } from 'rollup-plugin-visualizer'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    visualizer({
      filename: resolve(__dirname, '../bundle-analysis/stats.html'),
      open: false,
      gzipSize: true,
      brotliSize: true,
    }) as PluginOption,
  ],
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
    },
  },
  build: {
    outDir: "../ury/public/pos",
    emptyOutDir: true,
    // Target modern browsers for smaller bundles
    target: 'es2020',
    // Enable minification with terser for better compression
    minify: 'esbuild',
    // CSS code splitting for per-component CSS
    cssCodeSplit: true,
    // Source maps for production debugging (hidden = not exposed to browser)
    sourcemap: 'hidden',
    rollupOptions: {
      output: {
        // Manual chunk splitting for optimal caching and loading
        manualChunks: (id) => {
          // React core — changes rarely, long cache
          if (id.includes('node_modules/react/') || id.includes('node_modules/react-dom/')) {
            return 'react-vendor';
          }
          // React Router — separate from React core
          if (id.includes('node_modules/react-router-dom') || id.includes('node_modules/@remix-run/router')) {
            return 'router';
          }
          // Zustand state management
          if (id.includes('node_modules/zustand/')) {
            return 'zustand';
          }
          // recharts — large charting library, lazy loaded but separate chunk
          if (id.includes('node_modules/recharts/')) {
            return 'recharts';
          }
          // D3 — recharts dependency, separate for tree-shaking
          if (id.includes('node_modules/d3-') || id.includes('node_modules/d3/')) {
            return 'd3-vendor';
          }
          // jsPDF + autotable — printing only, separate chunk
          if (id.includes('node_modules/jspdf') || id.includes('node_modules/jspdf-autotable')) {
            return 'pdf-vendor';
          }
          // html2canvas — used only for printing
          if (id.includes('node_modules/html2canvas/')) {
            return 'html2canvas';
          }
          // lucide-react icons
          if (id.includes('node_modules/lucide-react/')) {
            return 'lucide';
          }
          // Frappe SDK
          if (id.includes('node_modules/frappe-js-sdk/')) {
            return 'frappe-sdk';
          }
          // DOMPurify — security utility
          if (id.includes('node_modules/dompurify/')) {
            return 'dompurify';
          }
          // Axios — HTTP client
          if (id.includes('node_modules/axios/')) {
            return 'axios';
          }
          // QZ Tray — printer integration, only used at print time
          if (id.includes('node_modules/qz-tray/')) {
            return 'qz-tray';
          }
          // jsrsasign — cryptographic signing, heavy dependency
          if (id.includes('node_modules/jsrsasign/')) {
            return 'jsrsasign';
          }
          // react-toastify — notifications
          if (id.includes('node_modules/react-toastify/')) {
            return 'toastify';
          }
          // class-variance-authority + clsx + tailwind-merge — UI utilities
          if (
            id.includes('node_modules/class-variance-authority/') ||
            id.includes('node_modules/clsx/') ||
            id.includes('node_modules/tailwind-merge/')
          ) {
            return 'ui-utils';
          }
          // Other vendor deps that don't match specific categories
          if (id.includes('node_modules/')) {
            return 'vendor';
          }
        },
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    css: true,
  },
})
