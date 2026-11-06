import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      injectRegister: false, // we register manually in main.tsx for control
      manifest: false, // URY is served inside Frappe; no standalone PWA manifest
      injectManifest: {
        globPatterns: ['**/*.{js,css,ico,png,svg,webp,woff2,html}'],
        globDirectory: resolve(__dirname, '../ury/public/pos'),
        swDest: resolve(__dirname, '../ury/public/pos/sw.js'),
        injectionPoint: 'self.__WB_MANIFEST',
        modifyURLPrefix: {
          '': '/assets/ury/pos/',
        },
      },

      devOptions: {
        enabled: false, // do not inject manifest in dev
      },
    }),
  ],
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
    },
    dedupe: ['react', 'react-dom'],
  },
  server: {
    fs: {
      allow: ['..'],
    },
  },
  build: {
    outDir: "../ury/public/pos",
    emptyOutDir: true,
  },
})
