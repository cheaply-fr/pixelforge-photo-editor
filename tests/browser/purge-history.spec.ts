import { test, expect } from '@playwright/test';
import { downloadedProject } from './project-file';

test.beforeEach(async ({ page }) => {
  await page.route('https://marketplace.cheaply.fr/marketplace/api/photoeditor**', (route) => route.fulfill({ json: { authenticated: false } }));
});

test('Purge Undo History keeps the current document and clears prior snapshots', async ({ page }) => {
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await page.getByRole('button', { name: 'Image', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Rotate right', exact: true }).click();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(page.getByRole('menuitem', { name: 'Purge Undo History…', exact: true })).toBeEnabled();
  await page.getByRole('menuitem', { name: 'Purge Undo History…', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Purge Undo History' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Purge history', exact: true }).click();
  await expect(page.locator('footer')).toContainText('Undo history purged; current document retained');
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(page.getByRole('menuitem', { name: /^Undo/ })).toBeDisabled();
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Download project file', exact: true }).click();
  const project = await downloadedProject((await (await pending).path())!);
  expect(project.history).toHaveLength(1);
  expect(project.history[0].w).toBe(960);
  expect(project.history[0].h).toBe(1440);
});
