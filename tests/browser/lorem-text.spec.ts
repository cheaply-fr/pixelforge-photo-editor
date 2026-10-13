import { test, expect } from '@playwright/test';
import { downloadedProject } from './project-file';

test.beforeEach(async ({ page }) => {
  await page.route('https://marketplace.cheaply.fr/marketplace/api/photoeditor**', (route) => route.fulfill({ json: { authenticated: false } }));
});

test('Type menu inserts an editable Lorem Ipsum text layer and persists it', async ({ page }) => {
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await page.getByRole('button', { name: 'Type', exact: true }).click();
  await expect(page.getByRole('menuitem', { name: 'Paste Lorem Ipsum', exact: true })).toBeEnabled();
  await page.getByRole('menuitem', { name: 'Paste Lorem Ipsum', exact: true }).click();
  await expect(page.locator('footer')).toContainText('Editable Lorem Ipsum text layer added');
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Download project file', exact: true }).click();
  const project = await downloadedProject((await (await pending).path())!);
  const active = project.history[project.index].layers.find((layer: { id: string }) => layer.id === project.history[project.index].active) as Record<string, unknown>;
  expect(active.kind).toBe('text');
  expect(active.text).toContain('Lorem ipsum dolor sit amet');
  expect(active.boxWidth).toBeGreaterThan(0);
  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator('footer')).toContainText(/Saved document restored|Saved on this device/);
});
