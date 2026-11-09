import { test, expect, type Page } from '@playwright/test';

// Keep the status contract test independent of the production offline shell.
test.use({ serviceWorkers: 'block' });

const application = 'pixelforge-photo-editor';
// Mocked metadata names the commit of the build under test, so it describes
// this tab's own build (a different commit would be a newer deploy, which
// release-version.spec.ts and the update-notice test cover).
let commit = '';

async function waitForEditor(page: Page) {
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
}

/** Version baked into the build under test (it writes the same one to /release.json). */
async function bakedVersion(page: Page): Promise<string> {
  const response = await page.request.get('/release.json');
  expect(response.ok()).toBe(true);
  const { version } = await response.json();
  expect(typeof version).toBe('string');
  return version;
}

async function expectVisibleState(page: Page, state: string) {
  const status = page.getByTestId('release-status');
  const visibleState = status.getByText(state, { exact: true });
  await expect(visibleState).toBeVisible();
  const bounds = await visibleState.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
}

test.beforeEach(async ({ page }) => {
  const response = await page.request.get('/release.json');
  commit = (await response.json()).commit;
  expect(commit).toMatch(/^[a-f0-9]{40}$/);
  await page.route(
    'https://marketplace.cheaply.fr/marketplace/api/photoeditor**',
    (route) => route.fulfill({ json: { authenticated: false } }),
  );
});

test('shows the release version and matching server health', async ({ page }) => {
  await page.route('**/release.json**', (route) =>
    route.fulfill({ json: { application, version: '9.4.2', commit } }),
  );
  await page.route('**/api/readyz.json**', (route) =>
    route.fulfill({ json: { ready: true, application, version: '9.4.2', commit } }),
  );
  await waitForEditor(page);
  const status = page.getByTestId('release-status');
  await expect(status).toHaveAttribute('aria-label', 'v9.4.2. Server online');
  await expect(page.locator('header.topbar').getByTestId('release-status')).toBeVisible();
  await expect(status.locator('xpath=..')).toHaveClass(/top-actions/);
  await expect(status).toContainText('v9.4.2');
  await expectVisibleState(page, 'Server online');
});

test('shows degraded health when release and readiness commits disagree', async ({ page }) => {
  await page.route('**/release.json**', (route) =>
    route.fulfill({ json: { application, version: '9.4.2', commit } }),
  );
  await page.route('**/api/readyz.json**', (route) =>
    route.fulfill({ json: { ready: true, application, version: '9.4.2', commit: commit === 'b'.repeat(40) ? 'c'.repeat(40) : 'b'.repeat(40) } }),
  );
  await waitForEditor(page);
  await expect(page.getByTestId('release-status')).toHaveAttribute(
    'aria-label', 'v9.4.2. Server degraded',
  );
  await expectVisibleState(page, 'Server degraded');
});

test('falls back to baked version and local editing when metadata is unavailable', async ({ page }) => {
  const version = await bakedVersion(page);
  await page.route('**/release.json**', (route) => route.abort());
  await page.route('**/api/readyz.json**', (route) => route.abort());
  await waitForEditor(page);
  await expect(page.getByTestId('release-status')).toHaveAttribute(
    'aria-label', `v${version}. Offline · local editing`,
  );
  await expectVisibleState(page, 'Offline · local editing');
});

test('polling recovers offline health when the server becomes available', async ({ page }) => {
  const version = await bakedVersion(page);
  await page.clock.install();
  let online = false;
  let probes = 0;
  await page.route('**/release.json**', (route) => {
    probes += 1;
    return online
      ? route.fulfill({ json: { application, version: '9.4.2', commit } })
      : route.abort();
  });
  await page.route('**/api/readyz.json**', (route) => online
    ? route.fulfill({ json: { ready: true, application, version: '9.4.2', commit } })
    : route.abort());
  await waitForEditor(page);
  await expect(page.getByTestId('release-status')).toHaveAttribute(
    'aria-label', `v${version}. Offline · local editing`,
  );
  online = true;
  await page.clock.fastForward(30_000);
  await expect(page.getByTestId('release-status')).toHaveAttribute(
    'aria-label', 'v9.4.2. Server online',
  );
  expect(probes).toBeGreaterThanOrEqual(2);
  await expectVisibleState(page, 'Server online');
});
