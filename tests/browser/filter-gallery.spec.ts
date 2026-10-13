import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('https://marketplace.cheaply.fr/marketplace/api/photoeditor**', (route) => route.fulfill({ json: { authenticated: false } }));
});

test('Filter Gallery searches local presets and keeps the chosen effect editable on desktop and mobile', async ({ page }) => {
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await page.getByRole('button', { name: 'Filter', exact: true }).click();
  const menuItem = page.getByRole('menuitem', { name: 'Filter Gallery…', exact: true });
  await expect(menuItem).toBeEnabled();
  await menuItem.click();
  const dialog = page.getByRole('dialog', { name: 'Filter Gallery' });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Filter gallery search').fill('mono');
  await expect(dialog.getByRole('button', { name: 'Apply Mono filter' })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Apply Vivid filter' })).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Apply Mono filter' }).click();
  await expect(page.locator('footer')).toContainText('Mono applied to selected layer; remains editable');
  await expect(page.getByLabel('Filter effect', { exact: true })).toHaveValue('none');
});
