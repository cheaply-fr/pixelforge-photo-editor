import { test, expect, type Page } from '@playwright/test';

// The version label must come from the build itself (baked by vite.config.ts)
// and agree with the /release.json and readiness artifacts of the same build.
// No release routes are mocked here: this is the real preview build.
test.use({ serviceWorkers: 'block' });

// 0.1.<run> on a main deploy; -pr.<n>, -ci[.<run>] or -dev builds otherwise.
const VERSION = /^\d+\.\d+\.\d+(?:-(?:dev|pr\.\d+|ci(?:\.\d+)?)(?:\+[0-9a-f]{7})?)?$/;

test.beforeEach(async ({ page }) => {
  await page.route('https://marketplace.cheaply.fr/marketplace/api/photoeditor**', (route) =>
    route.fulfill({ json: { authenticated: false } }),
  );
});

async function servedRelease(page: Page) {
  const [release, ready, health] = await Promise.all(
    ['/release.json', '/api/readyz.json', '/api/readyz.json?probe=1'].map(async (path) => {
      const response = await page.request.get(path);
      expect(response.ok(), path).toBe(true);
      return response.json();
    }),
  );
  expect(release.application).toBe('pixelforge-photo-editor');
  expect(release.version).toMatch(VERSION);
  expect(release.commit).toMatch(/^[a-f0-9]{40}$/);
  expect(ready).toMatchObject({ ready: true, version: release.version, commit: release.commit });
  expect(health.version).toBe(release.version);
  return release as { version: string; commit: string; channel?: string };
}

test('the top bar shows the baked build version, matching /release.json', async ({ page }) => {
  const release = await servedRelease(page);
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  const status = page.locator('header.topbar').getByTestId('release-status');
  await expect(status).toHaveAttribute('aria-label', `v${release.version}. Server online`);
  const label = status.locator('.release-status-version');
  await expect(label).toHaveText(`v${release.version}`);
  await expect(label).toBeVisible();
  const box = (await label.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  await expect(status).toHaveAttribute('title', new RegExp(`${release.commit}$`));
  // A local or PR preview build is clearly not a production release.
  if (release.channel !== 'release') expect(release.version).toMatch(/-(?:dev|pr\.\d+|ci)/);
});

test('the baked version stays visible offline, without release metadata', async ({ page }) => {
  const release = await servedRelease(page);
  await page.route('**/release.json**', (route) => route.abort());
  await page.route('**/api/readyz.json**', (route) => route.abort());
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  const status = page.getByTestId('release-status');
  await expect(status).toHaveAttribute('aria-label', `v${release.version}. Offline · local editing`);
  await expect(status.locator('.release-status-version')).toHaveText(`v${release.version}`);
});

test('a newer deploy keeps the running version in the label and names the new one in the notice', async ({ page }) => {
  const release = await servedRelease(page);
  const application = 'pixelforge-photo-editor';
  const next = { application, version: '0.1.99999', commit: 'f'.repeat(40) };
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  const status = page.getByTestId('release-status');
  await expect(status).toHaveAttribute('aria-label', `v${release.version}. Server online`);

  await page.route('**/release.json**', (route) => route.fulfill({ json: next }));
  await page.route('**/api/readyz.json**', (route) => route.fulfill({ json: { ready: true, ...next } }));
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  const notice = page.getByTestId('update-notice');
  await expect(notice).toContainText('New version available (v0.1.99999)');
  await expect(status).toHaveAttribute('aria-label', `v${release.version}. Server online`);
  await expect(status.locator('.release-status-version')).toHaveText(`v${release.version}`);
});
