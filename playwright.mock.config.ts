import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e-mock',
  outputDir: './test-results/playwright-mock',
  testIgnore: '**/._*',
  timeout: 60000,
  workers: 1,
  use: { baseURL: 'http://127.0.0.1:4209', screenshot: 'only-on-failure' },
  webServer: {
    command:
      'VITE_DATA_MODE=mock node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 4209 --strictPort',
    url: 'http://127.0.0.1:4209',
    reuseExistingServer: !process.env.CI,
    timeout: 60000,
  },
  projects: [{ name: 'mock-chromium', use: { ...devices['Desktop Chrome'] } }],
})
