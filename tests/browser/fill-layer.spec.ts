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
    history: Array<{ layers: Array<{ kind: string; fillColor?: string; asset?: string }> }>;
    index: number;
    assets: Record<string, { url: string; w: number; h: number }>;
  };
};

test.beforeEach(async ({ page }) => prepare(page));

test('creates an editable solid fill layer and round-trips its color metadata', async ({ page }) => {
  await page.getByRole('button', { name: 'Layer', exact: true }).click();
  await page.getByRole('menuitem', { name: 'New Fill Layer…', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'New Solid Fill Layer' });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Fill layer colour', { exact: true }).fill('#12abef');
  await dialog.getByRole('button', { name: 'Create Fill Layer', exact: true }).click();
  await expect(page.getByText('Solid fill layer added (#12abef)', { exact: true })).toBeVisible();

  const saved = await project(page);
  const layer = saved.history[saved.index].layers.at(-1)!;
  expect(layer.kind).toBe('raster');
  expect(layer.fillColor).toBe('#12abef');
  expect(layer.asset).toBeTruthy();
  expect(saved.assets[layer.asset!]).toBeTruthy();
  const pixel = await page.getByTestId('editor-canvas').evaluate((canvas) => {
    const context = (canvas as HTMLCanvasElement).getContext('2d')!;
    const sample = context.getImageData(Math.floor((canvas as HTMLCanvasElement).width / 2), Math.floor((canvas as HTMLCanvasElement).height / 2), 1, 1).data;
    return Array.from(sample);
  });
  expect(pixel[0]).toBeGreaterThan(0);
  expect(pixel[1]).toBeGreaterThan(80);
  expect(pixel[2]).toBeGreaterThan(180);
  await page.getByLabel('Fill layer colour', { exact: true }).fill('#efab12');
  await expect(page.getByText('Layer updated', { exact: true })).toBeVisible();
  const recolored = await project(page);
  expect(recolored.history[recolored.index].layers.at(-1)!.fillColor).toBe('#efab12');

  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Undo/ }).click();
  const undone = await project(page);
  expect(undone.history[undone.index].layers.at(-1)?.fillColor).toBe('#12abef');
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Redo/ }).click();
  const redone = await project(page);
  expect(redone.history[redone.index].layers.at(-1)!.fillColor).toBe('#efab12');

  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  const restored = await project(page);
  expect(restored.history[restored.index].layers.at(-1)!.fillColor).toBe('#efab12');
});

test('canceling the fill dialog leaves the layer stack unchanged', async ({ page }) => {
  const before = await project(page);
  await page.getByRole('button', { name: 'Layer', exact: true }).click();
  await page.getByRole('menuitem', { name: 'New Fill Layer…', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'New Solid Fill Layer' });
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  const after = await project(page);
  expect(after.history[after.index].layers.length).toBe(before.history[before.index].layers.length);
});
