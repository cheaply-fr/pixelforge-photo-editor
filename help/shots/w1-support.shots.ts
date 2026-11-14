import { expect, test } from '@playwright/test';
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

test('pixel-budget', async ({ page }) => {
  await openEditor(page);
  await openSample(page, 'city');
  const budget = page.getByText(/^Pixel budget /).first();
  await expect(budget).toBeVisible();
  await page.locator('[data-sidebar-section="layers"]').scrollIntoViewIfNeeded();
  await highlight(budget);
  await shoot(page, 'pixel-budget', page.locator('[data-sidebar-section="layers"]'));
});
