import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route(
    'https://marketplace.cheaply.fr/marketplace/api/photoeditor**',
    (route) => route.fulfill({ json: { authenticated: false } }),
  );
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
});

test('Image Analysis opens a non-destructive rendered histogram with channel controls', async ({ page }) => {
  await page.getByRole('button', { name: 'Image', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Analysis', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Histogram' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('Visible pixels', { exact: true })).toBeVisible();
  await expect(dialog.getByLabel('Histogram channel', { exact: true })).toHaveValue('luminance');
  await dialog.getByLabel('Histogram channel', { exact: true }).selectOption('red');
  await expect(dialog).toHaveAttribute('aria-labelledby', 'histogram-title');
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});

