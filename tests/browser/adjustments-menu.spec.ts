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

test('menu wording matches what the commands do', async ({ page }) => {
  // Hue/Saturation's controls are Hue, Saturation and Brightness.
  await page.getByRole('button', { name: 'Image', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Adjustments', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Adjustments' });
  await expect(dialog.getByRole('button', { name: /^Hue\/Saturation…/ })).toContainText('Adjust hue, saturation and brightness.');
  await expect(dialog).not.toContainText('lightness');
  await dialog.getByRole('button', { name: /^Hue\/Saturation…/ }).click();
  await expect(page.getByLabel('Brightness', { exact: true }).first()).toBeVisible();
  // Duplicate Layer runs at once, so it has no ellipsis and opens no dialog.
  const before = await page.getByRole('button', { name: /^Select layer / }).count();
  await page.getByRole('button', { name: 'Layer', exact: true }).click();
  await expect(page.getByRole('menuitem', { name: 'Duplicate Layer…' })).toHaveCount(0);
  await page.getByRole('menuitem', { name: /^Duplicate Layer$|^Duplicate Layer Ctrl\+J$/ }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Select layer / })).toHaveCount(before + 1);
});
