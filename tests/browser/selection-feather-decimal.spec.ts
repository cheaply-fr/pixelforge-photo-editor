import { selectTool } from './tool-selection';
import { downloadedProject } from './project-file';
import { test, expect, type Page } from '@playwright/test';

// Decimal selection feather radii (for example 1.2 px) are accepted by
// Select > Modify > Feather, Select and Mask and the Layers panel slider,
// stored as-is, and rendered with a fractional blur.

type Project = {
  history: Array<{
    layers: Array<{ mask?: string }>;
    selection?: { feather: number };
    previousSelection?: { feather: number };
  }>;
  index: number;
  assets: Record<string, { url: string; w: number; h: number }>;
};

const prepare = async (page: Page) => {
  await page.route(
    'https://marketplace.cheaply.fr/marketplace/api/photoeditor**',
    (route) => route.fulfill({ json: { authenticated: false } }),
  );
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await expect(page.getByRole('status', { name: 'Draft save status' })).toHaveText(
    'Saved on this device',
  );
};

const project = async (page: Page): Promise<Project> => {
  await page.getByRole('button', { name: 'File', exact: true }).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Download project file', exact: true }).click();
  const download = await pending;
  return (await downloadedProject((await download.path())!)) as Project;
};

const drag = async (page: Page, start: [number, number], end: [number, number]) => {
  const canvas = page.getByTestId('editor-canvas');
  await canvas.scrollIntoViewIfNeeded();
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width * start[0], box.y + box.height * start[1]);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * end[0], box.y + box.height * end[1], { steps: 6 });
  await page.mouse.up();
  await expect(canvas).toHaveAttribute('data-rendering', 'false');
};

const featherMenu = async (page: Page, value: string) => {
  await page.getByRole('button', { name: 'Select', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Feather…', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Feather Selection' });
  await expect(dialog).toBeVisible();
  await page.getByLabel('Selection feather radius (px)', { exact: true }).fill(value);
  return dialog;
};

/**
 * Softness of the mask's middle row: Σ min(a, 255 − a). A hard edge scores 0;
 * a wider blur scores more.
 */
const edgeSoftness = async (page: Page, asset: { url: string; w: number; h: number }) =>
  page.evaluate(async ({ asset }) => {
    const image = new Image();
    image.src = asset.url;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = asset.w;
    canvas.height = asset.h;
    const context = canvas.getContext('2d')!;
    context.drawImage(image, 0, 0);
    const row = context.getImageData(0, Math.floor(asset.h / 2), asset.w, 1).data;
    let softness = 0;
    for (let offset = 3; offset < row.length; offset += 4)
      softness += Math.min(row[offset], 255 - row[offset]);
    return softness;
  }, { asset });

async function maskSoftness(page: Page, feather: string) {
  const dialog = await featherMenu(page, feather);
  await dialog.getByRole('button', { name: 'Apply feather', exact: true }).click();
  await expect(page.getByText(`Selection feather set to ${feather.replace(',', '.')} px`, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Mask from selection', exact: true }).click();
  await expect(page.getByTestId('editor-canvas')).toHaveAttribute('data-rendering', 'false');
  const saved = await project(page);
  const frame = saved.history[saved.index];
  expect(frame.previousSelection?.feather).toBe(Number(feather.replace(',', '.')));
  return edgeSoftness(page, saved.assets[frame.layers[0].mask!]);
}

async function undo(page: Page) {
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Undo/ }).click();
}

test.beforeEach(async ({ page }) => prepare(page));

test('Feather 1.2 is accepted, stored, rendered between 1 and 2 px, and survives reload', async ({ page }) => {
  // Several project downloads and reloads; allow for slower runners.
  test.slow();
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: /^New white document/ }).click();
  await selectTool(page, 'Select');
  await drag(page, [0.25, 0.2], [0.75, 0.8]);

  const one = await maskSoftness(page, '1');
  await undo(page);
  const two = await maskSoftness(page, '2');
  await undo(page);
  const decimal = await maskSoftness(page, '1.2');
  expect(one).toBeGreaterThan(0);
  expect(decimal).toBeGreaterThan(one);
  expect(two).toBeGreaterThan(decimal);

  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  const saved = await project(page);
  const frame = saved.history[saved.index];
  expect(frame.previousSelection?.feather).toBe(1.2);
  expect(await edgeSoftness(page, saved.assets[frame.layers[0].mask!])).toBe(decimal);
});

test('Feather accepts a decimal comma, rejects out-of-range decimals, and undo restores the previous radius', async ({ page }) => {
  await selectTool(page, 'Select');
  await drag(page, [0.25, 0.25], [0.55, 0.55]);
  let dialog = await featherMenu(page, '1000.5');
  await expect(dialog.getByRole('button', { name: 'Apply feather', exact: true })).toBeDisabled();
  await expect(page.getByLabel('Selection feather radius (px)', { exact: true })).toHaveAttribute('aria-invalid', 'true');
  await page.getByLabel('Selection feather radius (px)', { exact: true }).fill('2,5');
  await expect(dialog.getByRole('button', { name: 'Apply feather', exact: true })).toBeEnabled();
  await dialog.getByRole('button', { name: 'Apply feather', exact: true }).click();
  await expect(page.getByText('Selection feather set to 2.5 px', { exact: true })).toBeVisible();
  let saved = await project(page);
  expect(saved.history[saved.index].selection?.feather).toBe(2.5);

  dialog = await featherMenu(page, '0.7');
  await dialog.getByRole('button', { name: 'Apply feather', exact: true }).click();
  await expect(page.getByText('Selection feather set to 0.7 px', { exact: true })).toBeVisible();
  // The Layers panel slider reflects and edits tenths of a pixel.
  await expect(page.getByText('Feather 0.7 px')).toBeVisible();
  await undo(page);
  saved = await project(page);
  expect(saved.history[saved.index].selection?.feather).toBe(2.5);
  await page.getByLabel('Selection feather', { exact: true }).fill('3.4');
  await expect(page.getByText('Selection feather set to 3.4 px', { exact: true })).toBeVisible();
  saved = await project(page);
  expect(saved.history[saved.index].selection?.feather).toBe(3.4);
  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  saved = await project(page);
  expect(saved.history[saved.index].selection?.feather).toBe(3.4);
});

test('Select and Mask accepts a decimal feather radius', async ({ page }) => {
  await selectTool(page, 'Select');
  await drag(page, [0.25, 0.25], [0.55, 0.55]);
  await page.getByRole('button', { name: 'Select', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Select and Mask/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Select and Mask' });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Select and Mask feather (px)', { exact: true }).fill('1,2');
  await dialog.getByRole('button', { name: 'Apply Select and Mask', exact: true }).click();
  await expect(page.getByText('Select and Mask applied (smooth 2 px, feather 1.2 px)', { exact: true })).toBeVisible();
  const saved = await project(page);
  expect(saved.history[saved.index].selection?.feather).toBe(1.2);
});
