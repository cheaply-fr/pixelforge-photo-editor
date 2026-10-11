import { test, expect, type Page } from '@playwright/test';
import { downloadedProject } from './project-file';

const prepare = async (page: Page) => {
  await page.route(
    'https://marketplace.cheaply.fr/marketplace/api/photoeditor**',
    (route) => route.fulfill({ json: { authenticated: false } }),
  );
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
};

const project = async (page: Page) => {
  await page.getByRole('button', { name: 'File', exact: true }).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Download project file', exact: true }).click();
  const download = await pending;
  return await downloadedProject((await download.path())!) as {
    history: Array<{
      layers: Array<{ asset?: string; matrix: number[] }>;
    }>;
    index: number;
  };
};

test.beforeEach(async ({ page }) => prepare(page));

test('Free Transform is enabled for the active layer, preserves source assets, and survives reload/undo', async ({ page }) => {
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  const command = page.getByRole('menuitem', { name: /^Free Transform/ });
  await expect(command).toBeEnabled();
  await command.click();
  const dialog = page.getByRole('dialog', { name: 'Free Transform' });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Horizontal offset (px)').fill('80');
  await dialog.getByLabel('Width scale (%)').fill('125');
  await dialog.getByLabel('Rotation (degrees)').fill('15');
  await dialog.getByRole('button', { name: 'Apply free transform', exact: true }).click();
  await expect(page.getByText('Free transform applied', { exact: true })).toBeVisible();

  const changed = await project(page);
  const changedFrame = changed.history[changed.index];
  const changedLayer = changedFrame.layers.at(-1)!;
  expect(changedLayer.matrix).not.toEqual([1, 0, 0, 1, 0, 0]);
  expect(changedLayer.asset).toBeTruthy();

  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  const reloaded = await project(page);
  expect(reloaded.history[reloaded.index].layers.at(-1)!.matrix).toEqual(changedLayer.matrix);

  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Undo/ }).click();
  const undone = await project(page);
  expect(undone.history[undone.index].layers.at(-1)!.matrix).toEqual([1, 0, 0, 1, 0, 0]);
});

test('Free Transform rejects malformed values without mutating the draft', async ({ page }) => {
  const before = await project(page);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Free Transform/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Free Transform' });
  await dialog.getByLabel('Width scale (%)').fill('0');
  await expect(dialog.getByRole('button', { name: 'Apply free transform', exact: true })).toBeDisabled();
  await page.keyboard.press('Escape');
  const after = await project(page);
  expect(after.history[after.index].layers.at(-1)!.matrix).toEqual(
    before.history[before.index].layers.at(-1)!.matrix,
  );
});
