import { test, expect, type Page } from '@playwright/test';
import { downloadedProject } from './project-file';

const prepare = async (page: Page) => {
  await page.route('https://marketplace.cheaply.fr/marketplace/api/photoeditor**', (route) => route.fulfill({ json: { authenticated: false } }));
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
};
const project = async (page: Page) => {
  await page.getByRole('button', { name: 'File', exact: true }).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Download project file', exact: true }).click();
  const download = await pending;
  return await downloadedProject((await download.path())!) as { history: Array<{ selection?: { mask?: string } }>; index: number; assets: Record<string, { url: string; w: number; h: number }> };
};
const alphaCount = async (page: Page, asset: { url: string; w: number; h: number }) => page.evaluate(async ({ asset }) => {
  const image = new Image(); image.src = asset.url; await image.decode(); const canvas = document.createElement('canvas'); canvas.width = asset.w; canvas.height = asset.h; const context = canvas.getContext('2d')!; context.drawImage(image, 0, 0); const data = context.getImageData(0, 0, asset.w, asset.h).data; let selected = 0; for (let i = 3; i < data.length; i += 4) if (data[i] > 0) selected += 1; return selected;
}, { asset });

test.beforeEach(async ({ page }) => prepare(page));

test('Focus Area creates a local selection and round-trips through reload', async ({ page }) => {
  await page.getByRole('button', { name: 'Select', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Focus Area…', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Focus Area' });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Focus Area threshold', { exact: true }).fill('16');
  await dialog.getByLabel('Focus Area softness', { exact: true }).fill('20');
  await dialog.getByRole('button', { name: 'Apply Focus Area', exact: true }).click();
  await expect(page.getByText('Focus Area selection created (threshold 16, softness 20)', { exact: true })).toBeVisible();
  let saved = await project(page); const frame = saved.history[saved.index]; expect(frame.selection?.mask).toBeTruthy();
  const selected = await alphaCount(page, saved.assets[frame.selection!.mask!]); expect(selected).toBeGreaterThan(0);
  await page.reload(); saved = await project(page); const restored = saved.history[saved.index]; expect(restored.selection?.mask).toBeTruthy();
  expect(await alphaCount(page, saved.assets[restored.selection!.mask!])).toBe(selected);
});

test('Focus Area validates and cancels without mutating the document', async ({ page }) => {
  await page.getByRole('button', { name: 'Select', exact: true }).click(); await page.getByRole('menuitem', { name: 'Focus Area…', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Focus Area' }); await dialog.getByLabel('Focus Area threshold', { exact: true }).fill('256');
  await expect(dialog.getByRole('button', { name: 'Apply Focus Area', exact: true })).toBeDisabled(); await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  const saved = await project(page); expect(saved.history[saved.index].selection).toBeUndefined();
});
