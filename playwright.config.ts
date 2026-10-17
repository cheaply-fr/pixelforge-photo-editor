import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  retries: process.env.CI ? 2 : 0,
  // Each Playwright test owns a browser context (and therefore an isolated
  // IndexedDB draft). Two workers keep the protected gate within its budget on
  // constrained runners while PLAYWRIGHT_WORKERS allows a smaller runner to
  // opt back down without changing the test suite.
  workers: process.env.CI
    ? Number.parseInt(process.env.PLAYWRIGHT_WORKERS || '2', 10)
    : undefined,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { baseURL: 'http://127.0.0.1:4173', trace: 'retain-on-failure' },
  webServer: { command: 'npm run preview -- --port 4173', url: 'http://127.0.0.1:4173', reuseExistingServer: !process.env.CI },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
});
