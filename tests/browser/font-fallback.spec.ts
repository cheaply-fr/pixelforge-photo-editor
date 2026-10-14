import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(document.fonts, 'check', {
      configurable: true,
      value: () => false,
    });
  });
  await page.route(
    'https://marketplace.cheaply.fr/marketplace/api/photoeditor**',
    (route) => route.fulfill({ json: { authenticated: false } }),
  );
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute(
    'aria-busy',
    'false',
  );
});

test('Type tool discloses browser font fallback without changing the editable preference', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'Type', exact: true }).click();
  await page
    .getByRole('menuitem', { name: 'Manage Missing Fonts', exact: true })
    .click();
  const dialog = page.getByRole('dialog', { name: 'Manage Missing Fonts' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByTestId('font-status-Arial')).toHaveText(
    /Fallback active/,
  );
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();

  await page.getByRole('button', { name: 'Text tool', exact: true }).click();
  await expect(page.getByTestId('font-fallback-warning')).toContainText(
    'browser fallback rendering is active',
  );
  await expect(page.getByLabel('Text tool font', { exact: true })).toHaveValue(
    'Arial',
  );
  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute(
    'aria-busy',
    'false',
  );
  await page.getByRole('button', { name: 'Text tool', exact: true }).click();
  await expect(page.getByTestId('font-fallback-warning')).toBeVisible();
  await expect(page.getByLabel('Text tool font', { exact: true })).toHaveValue(
    'Arial',
  );
});
