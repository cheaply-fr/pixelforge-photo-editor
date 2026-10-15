import { test, expect } from '@playwright/test';
import { downloadedProject } from './project-file';
import { selectTool } from './tool-selection';

test.beforeEach(async ({ page }) => {
  await page.route('https://marketplace.cheaply.fr/marketplace/api/photoeditor**', (route) => route.fulfill({ json: { authenticated: false } }));
});

test('Edit > Define Pattern saves a local Pattern Stamp preset and reloads it', async ({ page }) => {
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await selectTool(page, 'Pattern Stamp');
  page.once('dialog', (dialog) => dialog.accept('Dots texture'));
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Define Pattern…', exact: true }).click();
  await expect(page.locator('footer')).toContainText('Pattern preset “Dots texture” saved on this device');
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Download project file', exact: true }).click();
  const project = await downloadedProject((await (await pending).path())!);
  expect(project.settings.customPatternPresets).toHaveLength(1);
  expect(project.settings.customPatternPresets?.[0]?.label).toBe('Dots texture');
  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await selectTool(page, 'Pattern Stamp');
  await expect(page.getByLabel('Saved pattern', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Saved pattern', { exact: true }).locator('option')).toContainText(['Dots texture']);
});

test('Edit > Define Pattern rejects an empty name without creating a preset', async ({ page }) => {
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  page.once('dialog', (dialog) => dialog.accept('   '));
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Define Pattern…', exact: true }).click();
  await expect(page.locator('footer')).toContainText('Pattern preset name cannot be empty');
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Download project file', exact: true }).click();
  const project = await downloadedProject((await (await pending).path())!);
  expect(project.settings.customPatternPresets ?? []).toHaveLength(0);
});
