import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
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

test('Menus hides disabled roadmap entries and persists the workspace preference', async ({
  page,
}) => {
  const edit = page.getByRole('button', { name: 'Edit', exact: true });
  const plugins = page.getByRole('button', { name: 'Plugins', exact: true });
  await plugins.click();
  await expect(
    page.getByRole('menuitem', { name: 'No plugins installed', exact: true }),
  ).toBeVisible();
  await page.keyboard.press('Escape');
  await edit.click();
  await page.getByRole('menuitem', { name: 'Menus…', exact: true }).click();

  const dialog = page.getByRole('dialog', { name: 'Menus' });
  await expect(dialog).toBeVisible();
  await dialog
    .getByLabel('Show disabled roadmap commands', { exact: true })
    .uncheck();
  await dialog
    .getByRole('button', { name: 'Apply menu settings', exact: true })
    .click();

  await plugins.click();
  await expect(
    page.getByRole('menuitem', { name: 'No plugins installed', exact: true }),
  ).toHaveCount(0);
  await page.keyboard.press('Escape');
  await edit.click();
  await expect(
    page.getByRole('menuitem', { name: 'Menus…', exact: true }),
  ).toBeVisible();
  await page.keyboard.press('Escape');
  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute(
    'aria-busy',
    'false',
  );
  await plugins.click();
  await expect(
    page.getByRole('menuitem', { name: 'No plugins installed', exact: true }),
  ).toHaveCount(0);

  await page.keyboard.press('Escape');
  await edit.click();
  await page.getByRole('menuitem', { name: 'Menus…', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'Menus' })
    .getByLabel('Show disabled roadmap commands', { exact: true })
    .check();
  await page
    .getByRole('dialog', { name: 'Menus' })
    .getByRole('button', { name: 'Apply menu settings', exact: true })
    .click();
  await plugins.click();
  await expect(
    page.getByRole('menuitem', { name: 'No plugins installed', exact: true }),
  ).toBeVisible();
});
