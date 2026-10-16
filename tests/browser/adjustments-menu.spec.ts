import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route(
    'https://marketplace.cheaply.fr/marketplace/api/photoeditor**',
    (route) => route.fulfill({ json: { authenticated: false } }),
  );
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
});

test('Image Adjustments opens a keyboard-accessible family chooser', async ({ page }) => {
  await page.getByRole('button', { name: 'Image', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Adjustments', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Adjustments' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: /^Levels…/ })).toBeVisible();
  await dialog.getByRole('button', { name: /^Hue\/Saturation…/ }).click();
  await expect(page.getByText('Hue/Saturation controls are available in Adjust selected layer', { exact: true })).toBeVisible();
  await expect(dialog).toBeHidden();
});
