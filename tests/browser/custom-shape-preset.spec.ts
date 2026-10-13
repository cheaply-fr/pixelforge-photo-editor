import { test, expect } from '@playwright/test';
import { downloadedProject } from './project-file';
import { selectTool } from './tool-selection';

test.beforeEach(async ({ page }) => {
  await page.route('https://marketplace.cheaply.fr/marketplace/api/photoeditor**', (route) => route.fulfill({ json: { authenticated: false } }));
});

test('Edit > Define Custom Shape saves a local shape preset and reloads it', async ({ page }) => {
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await selectTool(page, 'Shape');
  page.once('dialog', (dialog) => dialog.accept('Badge shape'));
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Define Custom Shape…', exact: true }).click();
  await expect(page.locator('footer')).toContainText('Shape preset “Badge shape” saved on this device');
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Download project file', exact: true }).click();
  const project = await downloadedProject((await (await pending).path())!);
  expect(project.settings.customShapePresets).toHaveLength(1);
  expect(project.settings.customShapePresets?.[0]?.label).toBe('Badge shape');
  expect(project.settings.customShapePresets?.[0]?.kind).toBe('rectangle');
  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await selectTool(page, 'Shape');
  await expect(page.getByLabel('Saved shape preset', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Saved shape preset', { exact: true }).locator('option')).toContainText(['Badge shape']);
});

test('Edit > Define Custom Shape rejects an empty name without creating a preset', async ({ page }) => {
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  page.once('dialog', (dialog) => dialog.accept('   '));
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Define Custom Shape…', exact: true }).click();
  await expect(page.locator('footer')).toContainText('Custom shape name cannot be empty');
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Download project file', exact: true }).click();
  const project = await downloadedProject((await (await pending).path())!);
  expect(project.settings.customShapePresets ?? []).toHaveLength(0);
});
