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

test('Toolbar settings persist compact or comfortable category spacing', async ({ page }) => {
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Toolbar…', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Toolbar' });
  await expect(dialog.getByLabel('Category spacing')).toHaveValue('compact');
  await dialog.getByLabel('Category spacing').selectOption('comfortable');
  await dialog.getByRole('button', { name: 'Apply', exact: true }).click();
  const palette = page.getByTestId('tool-palette');
  await expect(palette).toHaveAttribute('data-toolbar-density', 'comfortable');
  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await expect(page.getByTestId('tool-palette')).toHaveAttribute('data-toolbar-density', 'comfortable');
});

test('Toolbar settings hide unused categories and preserve the compact palette after reload', async ({ page }) => {
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Toolbar…', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Toolbar' });
  await expect(dialog.getByLabel('Measure category', { exact: true })).toBeChecked();
  await dialog.getByLabel('Measure category', { exact: true }).uncheck();
  await dialog.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Measure tools' })).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Navigate tools' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await expect(page.getByRole('region', { name: 'Measure tools' })).toHaveCount(0);
});

test('Toolbar settings persist category ordering', async ({ page }) => {
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Toolbar…', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Toolbar' });
  await dialog.getByRole('button', { name: 'Move Measure category up', exact: true }).click();
  await dialog.getByRole('button', { name: 'Apply', exact: true }).click();
  const firstCategory = page.getByTestId('tool-palette').locator(':scope > .tool-category').first();
  await expect(firstCategory).toHaveAttribute('aria-label', 'Measure tools');
  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await expect(page.getByTestId('tool-palette').locator(':scope > .tool-category').first()).toHaveAttribute('aria-label', 'Measure tools');
});

test('Toolbar settings persist individual tool ordering without duplicating slots', async ({ page }) => {
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Toolbar…', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Toolbar' });
  const drawTools = dialog.locator('details.toolbar-tool-group').nth(9);
  await drawTools.locator('summary').click();
  const directSelect = drawTools.getByRole('button', { name: /Move Direct Select tool up/ });
  await directSelect.click();
  await directSelect.click();
  await directSelect.click();
  await dialog.getByRole('button', { name: 'Apply', exact: true }).click();
  const draw = page.getByRole('region', { name: 'Draw & Type tools' });
  await expect(draw.locator('button').first()).toHaveAttribute('data-tool-id', 'direct-select');
  const ids = await draw.locator('button').evaluateAll((buttons) => buttons.map((button) => button.getAttribute('data-tool-id')));
  expect(new Set(ids).size).toBe(ids.length);
  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await expect(page.getByRole('region', { name: 'Draw & Type tools' }).locator('button').first()).toHaveAttribute('data-tool-id', 'direct-select');
});


test('Toolbar settings can reset columns, spacing, categories and tool order', async ({ page }) => {
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Toolbar…', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Toolbar' });
  await dialog.getByLabel('Tool columns').selectOption('3');
  await dialog.getByLabel('Category spacing').selectOption('comfortable');
  await dialog.getByLabel('Measure category', { exact: true }).uncheck();
  await dialog.getByRole('button', { name: 'Reset defaults', exact: true }).click();
  await expect(dialog.getByLabel('Tool columns')).toHaveValue('auto');
  await expect(dialog.getByLabel('Category spacing')).toHaveValue('compact');
  await expect(dialog.getByLabel('Measure category', { exact: true })).toBeChecked();
  await dialog.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(page.getByTestId('tool-palette')).toHaveAttribute('data-toolbar-density', 'compact');
  await expect(page.getByRole('region', { name: 'Measure tools' })).toBeVisible();
});
