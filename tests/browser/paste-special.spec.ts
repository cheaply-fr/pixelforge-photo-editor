import { test, expect, type Page } from '@playwright/test';
import { downloadedProject } from './project-file';

test.beforeEach(async ({ page }) => {
  await page.route(
    'https://marketplace.cheaply.fr/marketplace/api/photoeditor**',
    (route) => route.fulfill({ json: { authenticated: false } }),
  );
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
});

async function downloadProject(page: Page) {
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Download project file', exact: true }).click();
  const path = await (await pending).path();
  if (!path) throw new Error('Project download path unavailable');
  return downloadedProject(path);
}

test('Edit > Paste Special exposes placement options and preserves a disabled selection mode', async ({ page }) => {
  await page.keyboard.press('Control+c');
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  const command = page.getByRole('menuitem', { name: 'Paste Special…', exact: true });
  await expect(command).toBeEnabled();
  await command.click();
  const dialog = page.getByRole('dialog', { name: 'Paste Special' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel('Paste into Selection')).toBeDisabled();
  await dialog.getByLabel('Paste at Center').check();
  await dialog.getByRole('button', { name: 'Paste Layer', exact: true }).click();
  await expect(page.getByText('Layer pasted at canvas centre', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Layers 2 \/ 32/ })).toBeVisible();
});

test('Paste Special > Paste into Selection creates a nondestructive mask and round-trips', async ({ page }) => {
  await page.keyboard.press('Control+a');
  await expect(page.getByText('Entire canvas selected', { exact: true })).toBeVisible();
  await page.keyboard.press('Control+c');
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Paste Special…', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Paste Special' });
  await dialog.getByLabel('Paste into Selection').check();
  await dialog.getByRole('button', { name: 'Paste Layer', exact: true }).click();
  await expect(page.getByText('Layer pasted into the selection with a nondestructive mask', { exact: true })).toBeVisible();

  const project = await downloadProject(page) as unknown as {
    history: Array<{ layers: Array<{ mask?: string; maskEnabled?: boolean }> }>;
    index: number;
  };
  const pasted = project.history[project.index].layers.at(-1);
  expect(pasted?.mask).toBeTruthy();
  expect(pasted?.maskEnabled).toBe(true);
});
