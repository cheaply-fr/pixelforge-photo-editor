import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('https://marketplace.cheaply.fr/marketplace/api/photoeditor**', (route) => route.fulfill({ json: { authenticated: false } }));
});

test('Toggle Last State switches between the current and immediately previous editable frame', async ({ page }) => {
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: 'New transparent document', exact: true }).click();
  await expect(page.getByTestId('editor-canvas')).toHaveAttribute('width', '1200');
  await page.getByRole('button', { name: 'Image', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Rotate right', exact: true }).click();
  await expect(page.getByTestId('editor-canvas')).toHaveAttribute('width', '800');
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(page.getByRole('menuitem', { name: /^Toggle Last State/ })).toBeEnabled();
  await page.getByRole('menuitem', { name: /^Toggle Last State/ }).click();
  await expect(page.getByTestId('editor-canvas')).toHaveAttribute('width', '1200');
  await expect(page.locator('footer')).toContainText('Toggled the last editable state');
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Toggle Last State/ }).click();
  await expect(page.getByTestId('editor-canvas')).toHaveAttribute('width', '800');
});
