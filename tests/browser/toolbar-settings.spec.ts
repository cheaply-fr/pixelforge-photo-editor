import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('https://marketplace.cheaply.fr/marketplace/api/photoeditor**', (route) => route.fulfill({ json: { authenticated: false } }));
});

test('Toolbar settings persist a two or three column preference without empty slots', async ({ page }) => {
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  const menuItem = page.getByRole('menuitem', { name: 'Toolbar…', exact: true });
  await expect(menuItem).toBeEnabled();
  await menuItem.click();
  const dialog = page.getByRole('dialog', { name: 'Toolbar' });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Tool columns').selectOption('3');
  await dialog.getByRole('button', { name: 'Apply', exact: true }).click();
  const palette = page.getByTestId('tool-palette');
  await expect(palette).toHaveAttribute('data-toolbar-columns', '3');
  await expect(page.locator('footer')).toContainText('Toolbar set to 3 columns');
  await page.reload();
  await expect(page.getByTestId('tool-palette')).toHaveAttribute('data-toolbar-columns', '3');
});
