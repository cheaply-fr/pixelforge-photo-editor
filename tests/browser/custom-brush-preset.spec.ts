import { test, expect } from '@playwright/test';
import { downloadedProject } from './project-file';
import { selectTool } from './tool-selection';

test.beforeEach(async ({ page }) => {
  await page.route('https://marketplace.cheaply.fr/marketplace/api/photoeditor**', (route) => route.fulfill({ json: { authenticated: false } }));
});

test('Edit > Define Brush Preset saves settings in an anonymous project and reloads them', async ({ page }) => {
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await selectTool(page, 'Brush');
  const buildUp = page.getByLabel('Build-up', { exact: true });
  const wetEdges = page.getByLabel('Wet edges', { exact: true });
  await wetEdges.fill('48');
  await expect(wetEdges).toHaveValue('48');
  await buildUp.fill('64');
  await expect(buildUp).toHaveValue('64');
  page.once('dialog', (dialog) => dialog.accept('Studio ink'));
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Define Brush Preset…', exact: true }).click();
  await expect(page.locator('footer')).toContainText('Brush preset “Studio ink” saved on this device');
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Download project file', exact: true }).click();
  const project = await downloadedProject((await (await pending).path())!);
  const presets = project.settings.customBrushPresets;
  expect(presets).toHaveLength(1);
  expect(presets?.[0]?.label).toBe('Studio ink');
  expect(presets?.[0]?.size).toBeGreaterThan(0);
  expect(presets?.[0]?.brushWetEdges).toBe(48);
  expect(presets?.[0]?.brushBuildUp).toBe(64);
  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await selectTool(page, 'Brush');
  await expect(page.getByLabel('Saved brush preset', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Saved brush preset', { exact: true }).locator('option')).toContainText(['Studio ink']);
});

test('Edit > Define Brush Preset rejects an empty name without creating a preset', async ({ page }) => {
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  page.once('dialog', (dialog) => dialog.accept('   '));
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Define Brush Preset…', exact: true }).click();
  await expect(page.locator('footer')).toContainText('Brush preset name cannot be empty');
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Download project file', exact: true }).click();
  const project = await downloadedProject((await (await pending).path())!);
  expect(project.settings.customBrushPresets ?? []).toHaveLength(0);
});
