import path from 'path'
import { configDefaults, defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@config': path.resolve(__dirname, './config/index.ts'),
    },
  },
  test: {
    environment: 'jsdom',
    include: ['tests/unit/**/*.test.ts'],
    exclude: [
      ...configDefaults.exclude,
      '**/._*',
      'tests/e2e/**',
      'packages/**',
      'services/**',
      'tests/integration/**',
    ],
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
  },
})
