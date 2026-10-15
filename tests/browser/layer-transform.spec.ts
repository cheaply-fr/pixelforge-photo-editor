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

test('Layer Transform presets rotate and flip the active layer without baking its source', async ({ page }) => {
  const names = [
    'Transform → Rotate 90° Clockwise',
    'Transform → Rotate 90° Counterclockwise',
    'Transform → Rotate 180°',
    'Transform → Flip Horizontal',
    'Transform → Flip Vertical',
  ];
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  for (const name of names) await expect(page.getByRole('menuitem', { name, exact: true })).toBeEnabled();
  await page.getByRole('menuitem', { name: names[0], exact: true }).click();
  await expect(page.getByText('Layer rotate 90° clockwise applied', { exact: true })).toBeVisible();
  const rotated = await project(page);
  const rotatedLayer = rotated.history[rotated.index].layers.at(-1)!;
  expect(rotatedLayer.matrix).not.toEqual([1, 0, 0, 1, 0, 0]);
  expect(rotatedLayer.asset).toBeTruthy();

  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  const reloaded = await project(page);
  expect(reloaded.history[reloaded.index].layers.at(-1)!.matrix).toEqual(rotatedLayer.matrix);

  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: names[3], exact: true }).click();
  await expect(page.getByText('Layer flip horizontal applied', { exact: true })).toBeVisible();
  const flipped = await project(page);
  expect(flipped.history[flipped.index].layers.at(-1)!.matrix).not.toEqual(rotatedLayer.matrix);
  expect(flipped.history[flipped.index].layers.at(-1)!.asset).toBe(rotatedLayer.asset);

  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Undo/ }).click();
  const undone = await project(page);
  expect(undone.history[undone.index].layers.at(-1)!.matrix).toEqual(rotatedLayer.matrix);
});

test('Layer Transform presets reject a locked active layer without changing history', async ({ page }) => {
  await page.getByRole('button', { name: 'Layer', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Lock Layers…', exact: true }).click();
  await expect(page.getByText('Selected layers locked', { exact: true })).toBeVisible();
  const locked = await project(page);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Transform → Flip Vertical', exact: true }).click();
  await expect(page.getByText('Unlock this layer before transforming it', { exact: true })).toBeVisible();
  const after = await project(page);
  expect(after.history.length).toBe(locked.history.length);
  expect(after.history[after.index].layers.at(-1)!.matrix).toEqual(locked.history[locked.index].layers.at(-1)!.matrix);
});
