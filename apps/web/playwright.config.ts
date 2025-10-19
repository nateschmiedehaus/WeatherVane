import { defineConfig, devices } from '@playwright/test';

const port = Number(process.env.PLAYWRIGHT_PORT ?? 3131);
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${port}`;

export default defineConfig({
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
    baseURL,
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
        baseURL,
        viewport: { width: 1440, height: 900 },
        ignoreHTTPSErrors: true,
      },
    },
    {
      name: 'webkit-tablet',
      use: {
        ...devices['iPad Pro 11'],
        baseURL,
        ignoreHTTPSErrors: true,
      },
    },
  ],
  webServer: {
    command: `npm run dev -- --hostname 127.0.0.1 --port ${port}`,
    cwd: './apps/web',
    timeout: 120_000,
    reuseExistingServer: !process.env.CI,
    url: baseURL,
  },
});
