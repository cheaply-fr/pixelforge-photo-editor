import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('https://marketplace.cheaply.fr/marketplace/api/photoeditor**', (route) => route.fulfill({ json: { authenticated: false } }));
});

test('Keyboard Shortcuts lists active shortcuts and filters them on desktop and mobile', async ({ page }) => {
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  const menuItem = page.getByRole('menuitem', { name: 'Keyboard Shortcuts…', exact: true });
  await expect(menuItem).toBeEnabled();
  await menuItem.click();
  const dialog = page.getByRole('dialog', { name: 'Keyboard Shortcuts' });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('[aria-label="Keyboard shortcuts list"]')).toBeVisible();
  await expect(dialog.locator('kbd').filter({ hasText: 'Ctrl+Z' })).toBeVisible();
  await dialog.getByLabel('Filter keyboard shortcuts').fill('redo');
  await expect(dialog.getByLabel('Keyboard shortcuts list').getByText('Redo', { exact: true })).toBeVisible();
  await expect(dialog.getByLabel('Keyboard shortcuts list').getByText('Undo', { exact: true })).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(dialog).toBeHidden();
});

test('Keyboard Shortcuts can persist a custom tool binding and activate it after reload', async ({ page }) => {
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Keyboard Shortcuts…', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Keyboard Shortcuts' });
  await dialog.getByLabel('Brush custom shortcut', { exact: true }).fill('9');
  await dialog.getByRole('button', { name: 'Apply', exact: true }).click();
  await page.keyboard.press('9');
  await expect(page.getByRole('button', { name: 'Brush tool', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await page.keyboard.press('9');
  await expect(page.getByRole('button', { name: 'Brush tool', exact: true })).toHaveAttribute('aria-pressed', 'true');
});

test('Keyboard Shortcuts accepts a modifier chord and restores it after reload', async ({ page }) => {
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Keyboard Shortcuts…', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Keyboard Shortcuts' });
  await dialog.getByLabel('Brush custom shortcut', { exact: true }).fill('shift+q');
  await dialog.getByRole('button', { name: 'Apply', exact: true }).click();
  await page.keyboard.press('Shift+q');
  await expect(page.getByRole('button', { name: 'Brush tool', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await page.keyboard.press('Shift+q');
  await expect(page.getByRole('button', { name: 'Brush tool', exact: true })).toHaveAttribute('aria-pressed', 'true');
});

test('Keyboard Shortcuts can persist and invoke a custom menu command chord', async ({ page }) => {
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  const zoom = page.getByLabel('Zoom', { exact: true });
  await expect(zoom).toHaveValue('72');
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Keyboard Shortcuts…', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Keyboard Shortcuts' });
  await dialog.getByLabel('Zoom in custom command shortcut', { exact: true }).fill('shift+9');
  await dialog.getByRole('button', { name: 'Apply', exact: true }).click();
  await page.keyboard.press('Shift+9');
  await expect(zoom).toHaveValue('82');
  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await expect(page.getByLabel('Zoom', { exact: true })).toHaveValue('82');
  await page.keyboard.press('Shift+9');
  await expect(page.getByLabel('Zoom', { exact: true })).toHaveValue('92');
});
