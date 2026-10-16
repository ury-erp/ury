import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
    dedupe: ['react', 'react-dom'],
  },
  server: {
    fs: {
      allow: ['..'],
    },
  },
  build: {
    outDir: '../ury/public/serve',
    emptyOutDir: true,
  },
  test: {
    // Two vitest projects share this config's plugins/aliases:
    // the app suite and the operations suite (mocked APIs).
    projects: [
      {
        test: {
          name: 'unit',
          environment: 'jsdom',
          globals: true,
          setupFiles: './src/test/setup.ts',
          exclude: ['**/node_modules/**', '**/src/operations/**'],
        },
      },
      {
        test: {
          name: 'operations',
          environment: 'jsdom',
          globals: true,
          setupFiles: './src/operations/__tests__/setup.ts',
          include: ['**/src/operations/**/*.test.{ts,tsx}'],
        },
      },
    ],
  },
})
