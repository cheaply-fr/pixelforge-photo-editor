import { expect, test, type Page } from '@playwright/test';
import { highlight, openEditor, openSample, shoot } from './helpers';

test('release-status', async ({ page }) => {
  await openEditor(page);
  await openSample(page, 'landscape');
  const status = page.getByTestId('release-status');
  await expect(status).toContainText(/Server online|Server degraded|Offline/);
  await highlight(status);
  const header = (await page.locator('header').first().boundingBox())!;
  const box = (await status.boundingBox())!;
  await page.waitForTimeout(250);
  await page.screenshot({
    path: 'help/img/release-status.jpg', type: 'jpeg', quality: 86, animations: 'disabled',
    clip: { x: Math.max(0, box.x - 420), y: header.y, width: Math.min(1440 - Math.max(0, box.x - 420), box.width + 700), height: header.height },
  });
});

/**
 * The editor with the analytics notice still unanswered. Not openEditor: that
 * answers the notice up front. The analytics script is never loaded (nothing
 * is clicked, so nothing is sent).
 */
async function openWithConsentBanner(page: Page, size?: { w: number; h: number }) {
  await page.route('https://marketplace.cheaply.fr/**', (route) => route.fulfill({ json: { authenticated: false } }));
  await page.route(/googletagmanager\.com|google-analytics\.com/, (route) => route.abort());
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await openSample(page, 'landscape', size);
  const banner = page.getByRole('region', { name: 'Analytics consent' });
  await expect(banner).toBeVisible();
  await expect(banner.getByRole('button', { name: 'Allow', exact: true })).toBeInViewport();
  return banner;
}

test('analytics-consent-banner', async ({ page }) => {
  const banner = await openWithConsentBanner(page);
  const box = (await banner.boundingBox())!;
  await page.waitForTimeout(250);
  const top = Math.max(0, box.y - 120);
  await page.screenshot({
    path: 'help/img/analytics-consent-banner.jpg', type: 'jpeg', quality: 86, animations: 'disabled',
    clip: { x: 0, y: top, width: Math.min(1440, box.x + box.width + 360), height: Math.min(900 - top, box.y + box.height + 60 - top) },
  });
});

test('analytics-consent-banner-mobile @mobile', async ({ page }) => {
  await openWithConsentBanner(page, { w: 1200, h: 900 });
  await shoot(page, 'analytics-consent-banner-mobile');
});

test('pixel-budget', async ({ page }) => {
  await openEditor(page);
  await openSample(page, 'city');
  const budget = page.getByText(/^Pixel budget /).first();
  await expect(budget).toBeVisible();
  await page.locator('[data-sidebar-section="layers"]').scrollIntoViewIfNeeded();
  await highlight(budget);
  await shoot(page, 'pixel-budget', page.locator('[data-sidebar-section="layers"]'));
});
