import { test, expect, type Page } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route(
    'https://marketplace.cheaply.fr/marketplace/api/photoeditor**',
    (route) => route.fulfill({ json: { authenticated: false } }),
  );
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await page.evaluate(() => window.localStorage.removeItem('pixelforge.actions.v1'));
});

async function openActions(page: Page) {
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Action recipes…' }).click();
  await expect(page.getByTestId('actions-dialog')).toBeVisible();
}

test('records an allow-listed filter command, persists it, and replays it', async ({ page }) => {
  await openActions(page);
  await page.getByLabel('Recipe name').fill('Web finish');
  await page.getByTestId('start-action-recording').click();
  await expect(page.getByTestId('actions-recording')).toContainText('Web finish');
  await page.getByRole('button', { name: 'Close action recipes' }).click();

  await page.getByRole('button', { name: 'Filter', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Vivid', exact: true }).click();
  await expect(page.getByLabel('Draft save status')).toHaveText('Saved on this device');

  await openActions(page);
  await page.getByRole('button', { name: 'Stop recording' }).click();
  await expect(page.getByText('Web finish', { exact: true })).toBeVisible();
  await expect(page.getByText('1 step', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(page.locator('footer > span').first()).toContainText('replayed');

  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await openActions(page);
  await expect(page.getByText('Web finish', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page.getByText('Web finish', { exact: true })).toHaveCount(0);
});

test('closes the recipe surface without changing the document', async ({ page }) => {
  const before = await page.getByTestId('editor-canvas').getAttribute('width');
  await openActions(page);
  await page.getByRole('button', { name: 'Close action recipes' }).click();
  await expect(page.getByTestId('actions-dialog')).toHaveCount(0);
  await expect(page.getByTestId('editor-canvas')).toHaveAttribute('width', before || '');
});
