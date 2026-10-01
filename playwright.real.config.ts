import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e-real',
  outputDir: './test-results/playwright-real',
  testIgnore: '**/._*',
  timeout: 60000,
  workers: 1,
  use: {
    baseURL: process.env.R1_WEB_URL || 'http://127.0.0.1:4176',
    trace: 'off',
    screenshot: 'only-on-failure',
    actionTimeout: 10000,
  },
  webServer: process.env.R1_WEB_URL
    ? undefined
    : {
        command:
          'R1_PREVIEW_PORT=4176 R1_READ_DELAY_MS=700 node scripts/serve-r1-preview.mjs',
        url: 'http://127.0.0.1:4176',
        reuseExistingServer: !process.env.CI,
        timeout: 60000,
      },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
      },
    },
  ],
})
