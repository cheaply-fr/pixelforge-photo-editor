import { test, expect } from '@playwright/test';
import { downloadedProject } from './project-file';

test.beforeEach(async ({ page }) => {
  await page.route('https://marketplace.cheaply.fr/marketplace/api/photoeditor**', (route) => route.fulfill({ json: { authenticated: false } }));
});

async function project(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: 'File', exact: true }).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Download project file', exact: true }).click();
  const download = await pending;
  return downloadedProject((await download.path())!);
}

test('Edit Fade blends the previous raster edit with a bounded opacity and remains undoable', async ({ page }) => {
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await page.getByLabel('Drawing color', { exact: true }).fill('#ff0000');
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Fill/ }).click();
  await expect(page.locator('footer')).toContainText('Layer filled', { timeout: 10000 });
  const before = await project(page);
  const activeBefore = before.history[before.index].layers.find((layer: { id: string }) => layer.id === before.history[before.index].active);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(page.getByRole('menuitem', { name: /^Fade/ })).toBeEnabled();
  page.once('dialog', (dialog) => { expect(dialog.message()).toContain('Fade opacity'); void dialog.accept('50'); });
  await page.getByRole('menuitem', { name: /^Fade/ }).click();
  await expect(page.locator('footer')).toContainText('Fade applied at 50%', { timeout: 10000 });
  const after = await project(page);
  const activeAfter = after.history[after.index].layers.find((layer: { id: string }) => layer.id === after.history[after.index].active);
  expect(after.history.length).toBeGreaterThan(before.history.length);
  expect(activeAfter?.asset).not.toBe(activeBefore?.asset);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Undo/ }).click();
  const undone = await project(page);
  const activeUndone = undone.history[undone.index].layers.find((layer: { id: string }) => layer.id === undone.history[undone.index].active);
  expect(activeUndone?.asset).toBe(activeBefore?.asset);
});
