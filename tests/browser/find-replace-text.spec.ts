import { test, expect } from '@playwright/test';
import { downloadedProject } from './project-file';

test.beforeEach(async ({ page }) => {
  await page.route('https://marketplace.cheaply.fr/marketplace/api/photoeditor**', (route) => route.fulfill({ json: { authenticated: false } }));
});

test('Edit menu replaces matching editable text and keeps it in the project', async ({ page }) => {
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await page.getByRole('button', { name: 'Type', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Paste Lorem Ipsum', exact: true }).click();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(page.getByRole('menuitem', { name: 'Find and Replace Text…', exact: true })).toBeEnabled();
  await page.getByRole('menuitem', { name: 'Find and Replace Text…', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Find and Replace Text' })).toBeVisible();
  const dialog = page.getByRole('dialog', { name: 'Find and Replace Text' });
  await dialog.getByLabel('Find text').fill('lorem');
  await dialog.getByLabel('Replace text').fill('PixelForge');
  await dialog.getByRole('button', { name: 'Replace all', exact: true }).click();
  await expect(page.locator('footer')).toContainText('Replaced 1 match across 1 text layer');
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Download project file', exact: true }).click();
  const project = await downloadedProject((await (await pending).path())!);
  const active = project.history[project.index].layers.find((layer: { id: string }) => layer.id === project.history[project.index].active) as Record<string, unknown>;
  expect(active.kind).toBe('text');
  expect(active.text).toContain('PixelForge ipsum');
  expect(active.text).not.toContain('Lorem ipsum');
});
