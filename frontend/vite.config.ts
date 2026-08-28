/// <reference types="vitest" />
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    environmentOptions: {
      jsdom: {
        url: 'http://localhost/ury/',
      },
    },
    setupFiles: './src/test/setup.ts',
  },
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
    proxy: {
      '/api': { target: 'http://ury.localhost:8002', changeOrigin: true },
      '/app': { target: 'http://ury.localhost:8002', changeOrigin: true },
      '/assets': { target: 'http://ury.localhost:8002', changeOrigin: true },
      '/files': { target: 'http://ury.localhost:8002', changeOrigin: true },
    },
  },
  build: {
    outDir: "../ury/public/ury",
    emptyOutDir: true,
  },
})
