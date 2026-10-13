import { test, expect } from '@playwright/test';
import { downloadedProject } from './project-file';

test.beforeEach(async ({ page }) => {
  await page.route('https://marketplace.cheaply.fr/marketplace/api/photoeditor**', (route) => route.fulfill({ json: { authenticated: false } }));
});

test('Image > Calculations applies a local blend mode with one undoable commit', async ({ page }) => {
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  page.on('dialog', async (dialog) => {
    if (dialog.message().includes('blend mode')) await dialog.accept('screen');
    else await dialog.accept('60');
  });
  await page.getByRole('button', { name: 'Image', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Calculations…', exact: true }).click();
  await expect(page.locator('footer')).toContainText('Calculations applied screen at 60%');
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(page.getByRole('menuitem', { name: /^Undo/ })).toBeEnabled();
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Download project file', exact: true }).click();
  const project = await downloadedProject((await (await pending).path())!);
  expect(project.history.length).toBeGreaterThanOrEqual(2);
  expect(project.history.at(-1)?.layers[0]?.kind).toBe('raster');
});

test('Image > Calculations rejects unsupported modes without changing history', async ({ page }) => {
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  page.once('dialog', (dialog) => dialog.accept('vivid'));
  await page.getByRole('button', { name: 'Image', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Calculations…', exact: true }).click();
  await expect(page.locator('footer')).toContainText('Calculations mode must be one of');
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(page.getByRole('menuitem', { name: /^Undo/ })).toBeDisabled();
});
