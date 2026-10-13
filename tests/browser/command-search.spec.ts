import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('https://marketplace.cheaply.fr/marketplace/api/photoeditor**', (route) => route.fulfill({ json: { authenticated: false } }));
});

test('Edit command search finds and runs a menu command on desktop and mobile', async ({ page }) => {
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  const canvas = page.getByTestId('editor-canvas');
  const initialWidth = await canvas.getAttribute('width');
  const initialHeight = await canvas.getAttribute('height');
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Search/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Search commands' });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Search commands').fill('rotate right');
  await expect(dialog.getByRole('button', { name: /Rotate right/ })).toBeEnabled();
  await dialog.getByRole('button', { name: /Rotate right/ }).click();
  await expect(canvas).toHaveAttribute('width', initialHeight!);
  await expect(canvas).toHaveAttribute('height', initialWidth!);
  await expect(page.locator('footer')).toContainText('Transform applied to document');
  await page.keyboard.press('ControlOrMeta+F');
  await expect(page.getByRole('dialog', { name: 'Search commands' })).toBeVisible();
});
