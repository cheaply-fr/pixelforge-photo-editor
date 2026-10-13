import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('https://marketplace.cheaply.fr/marketplace/api/photoeditor**', (route) => route.fulfill({ json: { authenticated: false } }));
});

test('Keyboard Shortcuts lists active shortcuts and filters them on desktop and mobile', async ({ page }) => {
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  const menuItem = page.getByRole('menuitem', { name: 'Keyboard Shortcuts…', exact: true });
  await expect(menuItem).toBeEnabled();
  await menuItem.click();
  const dialog = page.getByRole('dialog', { name: 'Keyboard Shortcuts' });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('[aria-label="Keyboard shortcuts list"]')).toBeVisible();
  await expect(dialog.locator('kbd').filter({ hasText: 'Ctrl+Z' })).toBeVisible();
  await dialog.getByLabel('Filter keyboard shortcuts').fill('redo');
  await expect(dialog.getByText('Redo', { exact: true })).toBeVisible();
  await expect(dialog.getByText('Undo', { exact: true })).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(dialog).toBeHidden();
});
