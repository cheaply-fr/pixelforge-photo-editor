import { defineConfig, devices } from '@playwright/test';
// Port, server reuse and output directory come from the environment so
// several worktrees (or runs) do not test each other's preview server or
// wipe each other's results. See playwright.settings.mjs.
import { playwrightServerSettings } from './playwright.settings.mjs';

const settings = playwrightServerSettings(process.env);

export default defineConfig({
  testDir: './tests/browser',
  outputDir: settings.outputDir,
  retries: process.env.CI ? 2 : 0,
  // Each Playwright test owns a browser context (and therefore an isolated
  // IndexedDB draft). Two workers keep the protected gate within its budget on
  // constrained runners while PLAYWRIGHT_WORKERS allows a smaller runner to
  // opt back down without changing the test suite.
  workers: process.env.CI
    ? Number.parseInt(process.env.PLAYWRIGHT_WORKERS || '2', 10)
    : undefined,
  reporter: [['list'], ['html', { open: 'never', outputFolder: settings.reportDir }]],
  use: {
    baseURL: settings.baseURL,
    trace: 'retain-on-failure',
    // The properties sidebar auto-scrolls to the section a tool/menu click
    // targets. With reduced motion that reveal is an instant jump committed
    // with the click, so specs that read element geometry right after a click
    // stay deterministic. sidebar-autoscroll.spec.ts opts back into motion to
    // cover the animated path (docs/sidebar-autoscroll-contract.md).
    contextOptions: { reducedMotion: 'reduce' },
    // CI builds carry a GA measurement id, so without a stored choice every
    // page would open with the analytics consent banner over part of the
    // editor, unlike local builds. Each context starts as a visitor who
    // already answered it ("No thanks"); analytics-consent-banner.spec.ts
    // covers the banner itself (docs/analytics.md).
    storageState: {
      cookies: [],
      origins: [
        {
          origin: new URL(settings.baseURL).origin,
          localStorage: [{ name: 'cheaply.analytics.consent.v1', value: 'denied' }],
        },
      ],
    },
  },
  webServer: settings.webServer,
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
});
