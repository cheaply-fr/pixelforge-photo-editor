import { test, expect, type Page } from '@playwright/test';
import { downloadedProject } from './project-file';
import { selectTool } from './tool-selection';

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
    history: Array<{ selection?: { mask?: string }; layers: Array<{ asset?: string }> }>;
    index: number;
    assets: Record<string, { url: string; w: number; h: number }>;
  };
};

const alphaStats = async (
  page: Page,
  asset: { url: string; w: number; h: number },
) => page.evaluate(async ({ asset }) => {
  const image = new Image();
  image.src = asset.url;
  await image.decode();
  const canvas = document.createElement('canvas');
  canvas.width = asset.w;
  canvas.height = asset.h;
  const context = canvas.getContext('2d')!;
  context.drawImage(image, 0, 0);
  const data = context.getImageData(0, 0, asset.w, asset.h).data;
  let selected = 0;
  let partial = 0;
  for (let offset = 3; offset < data.length; offset += 4) {
    if (data[offset] > 0) selected += 1;
    if (data[offset] > 0 && data[offset] < 255) partial += 1;
  }
  return { selected, partial };
}, { asset });

test.beforeEach(async ({ page }) => prepare(page));

test('Color Range creates a local soft alpha selection and persists through reload', async ({ page }) => {
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: /^New white document/ }).click();
  await page.getByRole('button', { name: 'Select', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Color Range…', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Color Range' })).toBeVisible();
  await page.getByLabel('Color Range sample color', { exact: true }).fill('#ffffff');
  await page.getByLabel('Color Range fuzziness', { exact: true }).fill('32');
  await page.getByRole('button', { name: 'Apply Color Range', exact: true }).click();
  await expect(page.getByText('Color Range selection created (fuzziness 32)', { exact: true })).toBeVisible();
  let exported = await project(page);
  let frame = exported.history[exported.index];
  expect(frame.selection?.mask).toBeTruthy();
  const stats = await alphaStats(page, exported.assets[frame.selection!.mask!]);
  expect(stats.selected).toBeGreaterThan(0);
  await page.reload();
  exported = await project(page);
  frame = exported.history[exported.index];
  expect(frame.selection?.mask).toBeTruthy();
  expect(await alphaStats(page, exported.assets[frame.selection!.mask!])).toEqual(stats);
});

test('Similar derives from the active selection, composes locally, and round-trips', async ({ page }) => {
  await page.getByRole('button', { name: 'Select', exact: true }).click();
  const similar = page.getByRole('menuitem', { name: 'Similar', exact: true });
  await expect(similar).toBeDisabled();
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: /^New white document/ }).click();
  const canvas = page.getByTestId('editor-canvas');
  const box = (await canvas.boundingBox())!;
  await selectTool(page, 'Select');
  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5, { steps: 3 });
  await page.mouse.up();
  await page.getByRole('button', { name: 'Select', exact: true }).click();
  await expect(page.getByRole('menuitem', { name: 'Similar', exact: true })).toBeEnabled();
  await page.getByRole('menuitem', { name: 'Similar', exact: true }).click();
  await expect(page.getByText(/Similar selection created \(fuzziness /)).toBeVisible();
  const saved = await project(page);
  const frame = saved.history[saved.index];
  expect(frame.selection?.mask).toBeTruthy();
  const stats = await alphaStats(page, saved.assets[frame.selection!.mask!]);
  expect(stats.selected).toBeGreaterThan(0);
  await page.reload();
  const restored = await project(page);
  expect(restored.history[restored.index].selection?.mask).toBeTruthy();
  expect(await alphaStats(page, restored.assets[restored.history[restored.index].selection!.mask!])).toEqual(stats);
});

test('Color Range validates fuzziness and cancellation without mutating selection', async ({ page }) => {
  await page.getByRole('button', { name: 'Select', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Color Range…', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Color Range' });
  await dialog.getByLabel('Color Range fuzziness', { exact: true }).fill('256');
  await expect(dialog.getByRole('button', { name: 'Apply Color Range', exact: true })).toBeDisabled();
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  const exported = await project(page);
  expect(exported.history[exported.index].selection).toBeUndefined();
});

test('Color Range intersects the active geometric selection instead of replacing it', async ({ page }) => {
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: /^New white document/ }).click();
  const canvas = page.getByTestId('editor-canvas');
  const box = (await canvas.boundingBox())!;
  await selectTool(page, 'Select');
  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5, { steps: 3 });
  await page.mouse.up();
  await page.getByLabel('Selection mode', { exact: true }).selectOption('intersect');
  await page.getByRole('button', { name: 'Select', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Color Range…', exact: true }).click();
  await page.getByLabel('Color Range sample color', { exact: true }).fill('#ffffff');
  await page.getByLabel('Color Range fuzziness', { exact: true }).fill('0');
  await page.getByRole('button', { name: 'Apply Color Range', exact: true }).click();
  await expect(page.getByText('Color Range selection created (fuzziness 0)', { exact: true })).toBeVisible();
  const exported = await project(page);
  const frame = exported.history[exported.index];
  expect(frame.selection?.mask).toBeTruthy();
  const asset = exported.assets[frame.selection!.mask!];
  const stats = await alphaStats(page, asset);
  expect(stats.selected).toBeGreaterThan(0);
  expect(stats.selected).toBeLessThan(asset.w * asset.h);
});

test('geometric selection subtracts from a soft Color Range mask and keeps alpha pixels', async ({ page }) => {
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: /^New white document/ }).click();
  await page.getByRole('button', { name: 'Select', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Color Range…', exact: true }).click();
  await page.getByLabel('Color Range sample color', { exact: true }).fill('#f0f0f0');
  await page.getByLabel('Color Range fuzziness', { exact: true }).fill('32');
  await page.getByRole('button', { name: 'Apply Color Range', exact: true }).click();
  await expect(page.getByText('Color Range selection created (fuzziness 32)', { exact: true })).toBeVisible();
  await page.getByLabel('Selection mode', { exact: true }).selectOption('subtract');
  const canvas = page.getByTestId('editor-canvas');
  const box = (await canvas.boundingBox())!;
  await selectTool(page, 'Select');
  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5, { steps: 3 });
  await page.mouse.up();
  const exported = await project(page);
  const frame = exported.history[exported.index];
  expect(frame.selection?.mask).toBeTruthy();
  const stats = await alphaStats(page, exported.assets[frame.selection!.mask!]);
  expect(stats.partial).toBeGreaterThan(0);
});
