import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('https://marketplace.cheaply.fr/marketplace/api/photoeditor**', (route) => route.fulfill({ json: { authenticated: false } }));
});

test('Check Spelling reports bounded local hints without uploading text', async ({ page }) => {
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await page.getByRole('button', { name: 'Type', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Paste Lorem Ipsum', exact: true }).click();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Find and Replace Text…', exact: true }).click();
  const replace = page.getByRole('dialog', { name: 'Find and Replace Text' });
  await replace.getByLabel('Find text').fill('Lorem');
  await replace.getByLabel('Replace text').fill('wrld');
  await replace.getByRole('button', { name: 'Replace all', exact: true }).click();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  const menuItem = page.getByRole('menuitem', { name: 'Check Spelling…', exact: true });
  await expect(menuItem).toBeEnabled();
  await menuItem.click();
  const dialog = page.getByRole('dialog', { name: 'Check Spelling' });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('code')).toContainText('wrld');
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
});
