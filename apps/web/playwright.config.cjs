const { defineConfig, devices } = require('playwright/test');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const exportDir = path.join(__dirname, 'playwright-export');
const defaultBaseUrl = (process.env.PLAYWRIGHT_BASE_URL ?? pathToFileURL(exportDir).href).replace(/\/?$/, '/');

module.exports = defineConfig({
  testDir: './playwright',
  timeout: 90_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: false,
  reporter: [
    ['list'],
    ['html', { outputFolder: './playwright-report', open: 'never' }],
  ],
  use: {
    baseURL: defaultBaseUrl,
    headless: true,
    viewport: { width: 1440, height: 900 },
    ignoreHTTPSErrors: true,
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium-desktop',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: defaultBaseUrl,
        viewport: { width: 1440, height: 900 },
        ignoreHTTPSErrors: true,
      },
    },
    {
      name: 'webkit-tablet',
      use: {
        ...devices['iPad Pro 11'],
        baseURL: defaultBaseUrl,
        ignoreHTTPSErrors: true,
      },
    },
  ],
});
